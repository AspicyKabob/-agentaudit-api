"""
AutoGPT Integration for AgentAudit

Provides a decorator and context manager for automatically logging
AutoGPT agent actions and enforcing real-time guardrails.

Example (guardrails enabled):
    from agentaudit_autogpt import guard

    @guard(api_key="aa_your_key_here", agent_name="MyAutoGPT")
    def run_agent(task: str) -> str:
        # Your AutoGPT logic here
        return agent.run(task)

    # If output violates a rule, raises ComplianceViolation before returning.

Example (logging only):
    from agentaudit_autogpt import AutoGPTLogger

    logger = AutoGPTLogger(api_key="aa_your_key_here", agent_name="MyAutoGPT")

    with logger.trace() as t:
        result = agent.run("Research topic X")
        t.log_action("run", prompt="Research topic X", response=result)
        # All actions share the same trace_id
"""

import uuid
import functools
from typing import Any, Callable, Dict, List, Optional
from agentaudit import AgentAudit


class ComplianceViolation(Exception):
    """Raised when an AutoGPT output violates a compliance rule."""

    def __init__(self, message: str, violations: list, severity: str = "critical"):
        super().__init__(message)
        self.violations = violations
        self.severity = severity


class AutoGPTLogger:
    """
    Logger for AutoGPT that manages distributed traces and optionally
    enforces guardrails on every action.

    Usage:
        logger = AutoGPTLogger(api_key="aa_key", agent_name="MyAutoGPT", guard=True)

        # Start a trace
        trace = logger.start_trace()

        # Log individual actions
        trace.log_action("think", prompt="What should I do?", response="Research topic")
        trace.log_action("execute", prompt="Search web", response="Found 3 results")
        trace.log_action("write_file", prompt="Save report", response="File saved")

        # Finish trace (runs guardrail if guard=True)
        result = trace.finish(response="Final output")
    """

    def __init__(
        self,
        api_key: str,
        agent_name: Optional[str] = None,
        base_url: str = "https://api.agentaudit.io/api/v1",
        guard: bool = True,
    ):
        self.client = AgentAudit(api_key=api_key, base_url=base_url)
        self.agent_name = agent_name or "autogpt"
        self.guard = guard

    def start_trace(self, metadata: Optional[Dict[str, Any]] = None) -> "AutoGPTTrace":
        """Start a new distributed trace and return a trace context."""
        return AutoGPTTrace(self, metadata)

    def trace(self, metadata: Optional[Dict[str, Any]] = None) -> "AutoGPTTrace":
        """Context manager alias for start_trace()."""
        return self.start_trace(metadata)


class AutoGPTTrace:
    """
    Represents a single AutoGPT execution trace.

    Automatically generates trace_id and manages parent_span_id linking
    so the full agent run can be visualized in the Trace Visualizer.
    """

    def __init__(self, logger: AutoGPTLogger, metadata: Optional[Dict[str, Any]] = None):
        self.logger = logger
        self.trace_id = str(uuid.uuid4())
        self._root_span_id: Optional[str] = None
        self._current_span_id: Optional[str] = None

        # Log trace start
        log = self.logger.client.log(
            action="autogpt_trace_start",
            trace_id=self.trace_id,
            metadata={
                "agent": self.logger.agent_name,
                **(metadata or {}),
            }
        )
        self._root_span_id = log.id
        self._current_span_id = log.id

    def log_action(
        self,
        action: str,
        prompt: Optional[str] = None,
        response: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Log an individual action within the trace."""
        meta = {"agent": self.logger.agent_name, "event": action}
        if metadata:
            meta.update(metadata)

        log = self.logger.client.log(
            action=f"autogpt_{action}",
            trace_id=self.trace_id,
            parent_span_id=self._current_span_id,
            prompt=prompt,
            response=response,
            metadata=meta,
        )
        self._current_span_id = log.id

    def guard(
        self,
        action: str,
        prompt: Optional[str] = None,
        response: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Run guardrail on an action. Raises ComplianceViolation if blocked."""
        meta = {"agent": self.logger.agent_name, "event": action}
        if metadata:
            meta.update(metadata)

        result = self.logger.client.guardrail(
            action=f"autogpt_{action}",
            trace_id=self.trace_id,
            parent_span_id=self._current_span_id,
            prompt=prompt,
            response=response,
            metadata=meta,
        )

        if not result.allowed:
            raise ComplianceViolation(
                message=f"Blocked by AgentAudit guardrail: {result.violations}",
                violations=result.violations,
                severity=result.severity,
            )

        self._current_span_id = result.audit_log_id

    def finish(
        self,
        response: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Finish the trace. If guard=True, runs guardrail on final output."""
        meta = {"agent": self.logger.agent_name, "event": "trace_end"}
        if metadata:
            meta.update(metadata)

        if self.logger.guard:
            result = self.logger.client.guardrail(
                action="autogpt_trace_end",
                trace_id=self.trace_id,
                parent_span_id=self._root_span_id,
                response=response,
                metadata=meta,
            )
            if not result.allowed:
                raise ComplianceViolation(
                    message=f"Blocked by AgentAudit guardrail: {result.violations}",
                    violations=result.violations,
                    severity=result.severity,
                )
        else:
            self.logger.client.log(
                action="autogpt_trace_end",
                trace_id=self.trace_id,
                parent_span_id=self._root_span_id,
                response=response,
                metadata=meta,
            )

        return response or ""

    def __enter__(self) -> "AutoGPTTrace":
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        if exc_type is None:
            self.finish()


def guard(
    api_key: str,
    agent_name: Optional[str] = None,
    base_url: str = "https://api.agentaudit.io/api/v1",
    guard: bool = True,
) -> Callable:
    """
    Decorator that wraps an AutoGPT function with audit logging and guardrails.

    Usage:
        @guard(api_key="aa_key", agent_name="MyAutoGPT")
        def run_agent(task: str) -> str:
            return agent.run(task)

    The decorator:
    1. Starts a trace before the function runs
    2. Logs the function input
    3. Runs the function
    4. Logs the function output
    5. If guard=True, checks output against compliance rules
    6. Raises ComplianceViolation if blocked
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            logger = AutoGPTLogger(api_key=api_key, agent_name=agent_name, base_url=base_url, guard=guard)
            trace = logger.start_trace(metadata={"function": func.__name__})

            # Log input
            input_str = str(kwargs) if kwargs else str(args[0]) if args else ""
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
