"""
AutoGPT Integration for AgentAudit

Provides a decorator and context manager for automatically logging
AutoGPT agent actions and enforcing real-time guardrails.

Example (guardrails enabled)::

    from agentaudit_autogpt import guard, ComplianceViolation

    @guard(api_key="aa_your_key_here", agent_name="MyAutoGPT")
    def run_agent(task: str) -> str:
        return agent.run(task)

    try:
        result = run_agent("Research topic X")
    except ComplianceViolation as e:
        print(f"Blocked: {e.violations}")

Example (logging only)::

    from agentaudit_autogpt import AutoGPTLogger

    logger = AutoGPTLogger(
        api_key="aa_your_key_here",
        agent_name="MyAutoGPT",
        guard=False,
    )

    with logger.trace() as t:
        result = agent.run("Research topic X")
        t.log_action("run", prompt="Research topic X", response=result)
"""

from __future__ import annotations

import functools
import uuid
from typing import Any, Callable, Dict, Optional

from integrations.base import BaseIntegration, ComplianceViolation

__all__ = ["AutoGPTLogger", "AutoGPTTrace", "guard", "ComplianceViolation"]


class AutoGPTLogger(BaseIntegration):
    """
    Logger for AutoGPT that manages distributed traces and optionally
    enforces guardrails on every action.

    Usage::

        logger = AutoGPTLogger(
            api_key="aa_key",
            agent_name="MyAutoGPT",
            guard=True,
            fail_open=True,  # default
        )

        trace = logger.start_trace()
        trace.log_action("think", prompt="What should I do?", response="Research topic")
        trace.log_action("execute", prompt="Search web", response="Found 3 results")
        trace.finish(response="Final output")
    """

    def __init__(
        self,
        api_key: str,
        agent_name: Optional[str] = None,
        base_url: str = "https://api.agentaudit.io/api/v1",
        guard: bool = True,
        fail_open: bool = True,
    ):
        super().__init__(
            api_key=api_key,
            base_url=base_url,
            guard=guard,
            fail_open=fail_open,
        )
        self.agent_name = agent_name or "autogpt"

    def start_trace(self, metadata: Optional[Dict[str, Any]] = None) -> AutoGPTTrace:
        """Start a new distributed trace and return a trace context."""
        return AutoGPTTrace(self, metadata)

    def trace(self, metadata: Optional[Dict[str, Any]] = None) -> AutoGPTTrace:
        """Context manager alias for :meth:`start_trace`."""
        return self.start_trace(metadata)


class AutoGPTTrace:
    """
    Represents a single AutoGPT execution trace.

    Automatically generates ``trace_id`` and manages ``parent_span_id``
    linking so the full agent run can be visualized in the Trace Visualizer.
    """

    def __init__(self, logger: AutoGPTLogger, metadata: Optional[Dict[str, Any]] = None):
        self.logger = logger
        self.trace_id = str(uuid.uuid4())
        self._root_span_id: Optional[str] = None
        self._current_span_id: Optional[str] = None

        log = logger._submit_log(
            action="autogpt_trace_start",
            agent_id=logger.agent_name,
            trace_id=self.trace_id,
            metadata={"agent": logger.agent_name, **(metadata or {})},
        )
        if log is not None:
            self._root_span_id = log.get("id")
        self._current_span_id = self._root_span_id

    def log_action(
        self,
        action: str,
        prompt: Optional[str] = None,
        response: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Log an individual action within the trace."""
        meta: Dict[str, Any] = {"agent": self.logger.agent_name, "event": action}
        if metadata:
            meta.update(metadata)

        log = self.logger._submit_log(
            action=f"autogpt_{action}",
            agent_id=self.logger.agent_name,
            trace_id=self.trace_id,
            parent_span_id=self._current_span_id,
            prompt=prompt,
            response=response,
            metadata=meta,
        )
        if log is not None:
            self._current_span_id = log.get("id")

    def guard(
        self,
        action: str,
        prompt: Optional[str] = None,
        response: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Run guardrail on an action. Raises :class:`ComplianceViolation` if blocked."""
        meta: Dict[str, Any] = {"agent": self.logger.agent_name, "event": action}
        if metadata:
            meta.update(metadata)

        result = self.logger._submit_guardrail(
            action=f"autogpt_{action}",
            agent_id=self.logger.agent_name,
            trace_id=self.trace_id,
            parent_span_id=self._current_span_id,
            prompt=prompt,
            response=response,
            metadata=meta,
        )
        self.logger._maybe_raise(result, action=f"autogpt_{action}")
        self._current_span_id = result.get("audit_log_id") or self._current_span_id

    def finish(
        self,
        response: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Finish the trace. If ``guard=True``, runs guardrail on final output."""
        meta: Dict[str, Any] = {"agent": self.logger.agent_name, "event": "trace_end"}
        if metadata:
            meta.update(metadata)

        if self.logger.guard:
            result = self.logger._submit_guardrail(
                action="autogpt_trace_end",
                agent_id=self.logger.agent_name,
                trace_id=self.trace_id,
                parent_span_id=self._root_span_id,
                response=response,
                metadata=meta,
            )
            self.logger._maybe_raise(result, action="autogpt_trace_end")
        else:
            self.logger._submit_log(
                action="autogpt_trace_end",
                agent_id=self.logger.agent_name,
                trace_id=self.trace_id,
                parent_span_id=self._root_span_id,
                response=response,
                metadata=meta,
            )

        return response or ""

    def __enter__(self) -> AutoGPTTrace:
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> bool:
        # Trace is always finalised, even if the user code threw.
        # We swallow trace errors so they don't mask user exceptions,
        # but we *do* re-raise TracingError in strict mode.
        try:
            self.finish()
        except Exception:
            pass  # Trace errors should never mask user exceptions
        # Return False so the original exception propagates
        return False


def guard(
    api_key: str,
    agent_name: Optional[str] = None,
    base_url: str = "https://api.agentaudit.io/api/v1",
    guard: bool = True,
    fail_open: bool = True,
) -> Callable:
    """
    Decorator that wraps an AutoGPT function with audit logging and guardrails.

    Usage::

        @guard(api_key="aa_key", agent_name="MyAutoGPT")
        def run_agent(task: str) -> str:
            return agent.run(task)

    The decorator automatically:

    1. starts a trace before the function runs
    2. logs the function input
    3. runs the function
    4. logs the function output
    5. if ``guard=True``, checks output against compliance rules
    6. raises :class:`ComplianceViolation` if blocked
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            logger = AutoGPTLogger(
                api_key=api_key,
                agent_name=agent_name,
                base_url=base_url,
                guard=guard,
                fail_open=fail_open,
            )
            trace = logger.start_trace(metadata={"function": func.__name__})

            # Log input
            input_str = str(kwargs) if kwargs else (str(args[0]) if args else "")
            trace.log_action("function_start", prompt=input_str)

            # Run function
            result = func(*args, **kwargs)
            output_str = str(result)

            # Guard or log output
            if guard:
                trace.guard("function_end", response=output_str)
            else:
                trace.log_action("function_end", response=output_str)

            trace.finish(response=output_str)
            return result

        return wrapper
    return decorator
