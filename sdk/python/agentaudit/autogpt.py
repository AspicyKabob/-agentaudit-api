"""
AutoGPT integration for AgentAudit Python SDK.

Provides a decorator and context manager for automatically logging AutoGPT
agent actions and enforcing real-time guardrails.

Example (decorator)::

    from agentaudit import AgentAuditAutoGPT, ComplianceViolationAutoGPT

    @AgentAuditAutoGPT.guard(api_key="aa_your_key_here", agent_name="MyAutoGPT")
    def run_agent(task: str) -> str:
        return agent.run(task)

Example (context manager)::

    logger = AgentAuditAutoGPT(
        api_key="aa_your_key_here",
        agent_name="MyAutoGPT",
        guard=False,
    )

    with logger.trace() as trace:
        result = agent.run("Research topic X")
        trace.log_action("run", prompt="Research topic X", response=result)
"""

from __future__ import annotations

import functools
import uuid
from typing import Any, Callable, Dict, Optional

from agentaudit import AgentAudit, GuardrailResult


__all__ = ["AgentAuditAutoGPT", "AgentAuditAutoGPTTrace", "ComplianceViolationAutoGPT"]


class ComplianceViolationAutoGPT(Exception):
    """Raised when an AutoGPT action is blocked by a real-time guardrail."""

    def __init__(self, message: str, violations: list, severity: str = "critical"):
        super().__init__(message)
        self.violations = violations
        self.severity = severity


class AgentAuditAutoGPT:
    """
    Logger for AutoGPT that manages distributed traces and optionally
    enforces guardrails on every action.
    """

    def __init__(
        self,
        api_key: str,
        agent_name: Optional[str] = None,
        base_url: str = "https://agentaudit-api-production.up.railway.app/api/v1",
        guard: bool = True,
        fail_open: bool = True,
    ):
        self._client = AgentAudit(api_key=api_key, base_url=base_url, agent_id=agent_name)
        self.agent_name = agent_name or "autogpt"
        self._guard = guard
        self._fail_open = fail_open

    def start_trace(self, metadata: Optional[Dict[str, Any]] = None) -> "AgentAuditAutoGPTTrace":
        """Start a new distributed trace and return a trace context."""
        return AgentAuditAutoGPTTrace(self, metadata)

    def trace(self, metadata: Optional[Dict[str, Any]] = None) -> "AgentAuditAutoGPTTrace":
        """Context manager alias for :meth:`start_trace`."""
        return self.start_trace(metadata)

    @classmethod
    def guard(
        cls,
        api_key: str,
        agent_name: Optional[str] = None,
        base_url: str = "https://agentaudit-api-production.up.railway.app/api/v1",
        guard: bool = True,
        fail_open: bool = True,
    ) -> Callable:
        """
        Decorator that wraps an AutoGPT function with audit logging and guardrails.
        """
        def decorator(func: Callable) -> Callable:
            @functools.wraps(func)
            def wrapper(*args: Any, **kwargs: Any) -> Any:
                logger = cls(
                    api_key=api_key,
                    agent_name=agent_name,
                    base_url=base_url,
                    guard=guard,
                    fail_open=fail_open,
                )
                trace = logger.start_trace(metadata={"function": func.__name__})

                input_str = str(kwargs) if kwargs else (str(args[0]) if args else "")
                trace.log_action("function_start", prompt=input_str)

                result = func(*args, **kwargs)
                output_str = str(result)

                if guard:
                    trace.guard("function_end", response=output_str)
                else:
                    trace.log_action("function_end", response=output_str)

                trace.finish(response=output_str)
                return result

            return wrapper
        return decorator


class AgentAuditAutoGPTTrace:
    """
    Represents a single AutoGPT execution trace.
    """

    def __init__(
        self,
        logger: AgentAuditAutoGPT,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.logger = logger
        self.trace_id = str(uuid.uuid4())
        self._root_span_id: Optional[str] = None
        self._current_span_id: Optional[str] = None

        log = logger._client.log(
            action="autogpt_trace_start",
            agent_id=logger.agent_name,
            trace_id=self.trace_id,
            metadata={"agent": logger.agent_name, **(metadata or {})},
        )
        if log is not None:
            self._root_span_id = log.id
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

        log = self.logger._client.log(
            action=f"autogpt_{action}",
            agent_id=self.logger.agent_name,
            trace_id=self.trace_id,
            parent_span_id=self._current_span_id,
            prompt=prompt,
            response=response,
            metadata=meta,
        )
        if log is not None:
            self._current_span_id = log.id

    def guard(
        self,
        action: str,
        prompt: Optional[str] = None,
        response: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Run guardrail on an action. Raises ComplianceViolationAutoGPT if blocked."""
        meta: Dict[str, Any] = {"agent": self.logger.agent_name, "event": action}
        if metadata:
            meta.update(metadata)

        result = self.logger._client.guardrail(
            action=f"autogpt_{action}",
            agent_id=self.logger.agent_name,
            trace_id=self.trace_id,
            parent_span_id=self._current_span_id,
            prompt=prompt,
            response=response,
            metadata=meta,
        )
        if not result.allowed:
            raise ComplianceViolationAutoGPT(
                message=f"Blocked by AgentAudit guardrail ({action}): {result.violations}",
                violations=result.violations,
                severity=result.severity,
            )
        self._current_span_id = result.audit_log_id or self._current_span_id

    def finish(
        self,
        response: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Finish the trace. If guard=True, runs guardrail on final output."""
        meta: Dict[str, Any] = {"agent": self.logger.agent_name, "event": "trace_end"}
        if metadata:
            meta.update(metadata)

        if self.logger._guard:
            result = self.logger._client.guardrail(
                action="autogpt_trace_end",
                agent_id=self.logger.agent_name,
                trace_id=self.trace_id,
                parent_span_id=self._root_span_id,
                response=response,
                metadata=meta,
            )
            if not result.allowed:
                raise ComplianceViolationAutoGPT(
                    message=f"Blocked by AgentAudit guardrail (trace_end): {result.violations}",
                    violations=result.violations,
                    severity=result.severity,
                )
        else:
            self.logger._client.log(
                action="autogpt_trace_end",
                agent_id=self.logger.agent_name,
                trace_id=self.trace_id,
                parent_span_id=self._root_span_id,
                response=response,
                metadata=meta,
            )

        return response or ""

    def __enter__(self) -> "AgentAuditAutoGPTTrace":
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> bool:
        try:
            self.finish()
        except Exception:
            pass
        return False
