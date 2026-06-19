"""
CrewAI integration for AgentAudit Python SDK.

Provides :class:`AgentAuditObserver`, a CrewAI callback that automatically
submits audit logs for crew/task/agent events and, when ``guard=True`` (the
default), enforces real-time guardrails — raising :class:`ComplianceViolationCrewAI`
so the crew halts before a violating output is delivered.

Every crew execution is a distributed trace: ``on_crew_start`` generates a
``trace_id`` propagated to all subsequent events, with ``parent_span_id`` linking
child events so the full agent chain can be reconstructed via
``GET /audit-logs/:id/chain``.

Example::

    from crewai import Crew, Agent, Task
    from agentaudit import AgentAuditObserver

    observer = AgentAuditObserver(
        api_key="aa_your_key_here",
        crew_name="Research Crew",
        guard=True,  # default
    )

    crew = Crew(
        agents=[researcher, writer],
        tasks=[research_task, write_task],
        callbacks=[observer],
    )

    result = crew.kickoff()
"""

from __future__ import annotations

import uuid
from typing import Any, Dict, Optional

from agentaudit import AgentAudit


__all__ = ["AgentAuditObserver", "ComplianceViolationCrewAI"]


class ComplianceViolationCrewAI(Exception):
    """Raised when a CrewAI output is blocked by a real-time guardrail."""

    def __init__(self, message: str, violations: list, severity: str = "critical"):
        super().__init__(message)
        self.violations = violations
        self.severity = severity


class AgentAuditObserver:
    """
    CrewAI observer that submits audit logs for task executions and crew
    outputs and optionally enforces guardrails.

    When ``guard=True`` (the default) ``on_task_end`` and ``on_crew_end`` call
    the guardrail endpoint instead of plain logging; if the server returns a
    ``block`` decision a :class:`ComplianceViolationCrewAI` is raised so the
    crew halts before the violating output is delivered.
    """

    def __init__(
        self,
        api_key: str,
        crew_name: Optional[str] = None,
        base_url: str = "https://agentaudit-api-production.up.railway.app/api/v1",
        guard: bool = True,
        fail_open: bool = True,
    ):
        self._client = AgentAudit(api_key=api_key, base_url=base_url, agent_id=crew_name)
        self.crew_name = crew_name or "unnamed-crew"
        self.guard = guard
        self.fail_open = fail_open
        self._trace_id: Optional[str] = None
        self._root_span_id: Optional[str] = None
        self._current_span_id: Optional[str] = None

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _update_span(self, span_id: Optional[str]) -> None:
        if span_id:
            self._current_span_id = span_id

    def _maybe_raise(self, violations: list, severity: str, action: str) -> None:
        raise ComplianceViolationCrewAI(
            message=f"Blocked by AgentAudit guardrail ({action}): {violations}",
            violations=violations,
            severity=severity,
        )

    def _reset_trace(self) -> None:
        self._trace_id = None
        self._root_span_id = None
        self._current_span_id = None

    # ------------------------------------------------------------------
    # CrewAI callbacks
    # ------------------------------------------------------------------

    def on_crew_start(self, crew: Any, **kwargs: Any) -> None:
        """Generate a new trace and log the crew start as the root span."""
        self._trace_id = str(uuid.uuid4())
        self.crew_name = getattr(crew, "name", self.crew_name)
        agents = [getattr(a, "role", "unknown") for a in getattr(crew, "agents", [])]

        log = self._client.log(
            action="crewai_crew_start",
            agent_id=self.crew_name,
            trace_id=self._trace_id,
            metadata={
                "crew": self.crew_name,
                "agents": agents,
                "task_count": len(getattr(crew, "tasks", [])),
                "event": "crew_start",
            },
        )
        self._root_span_id = log.id if log else None
        self._current_span_id = self._root_span_id

    def on_task_start(self, task: Any, **kwargs: Any) -> None:
        """Log the start of a task as a child span."""
        log = self._client.log(
            action="crewai_task_start",
            agent_id=self.crew_name,
            prompt=getattr(task, "description", ""),
            metadata={"task_id": getattr(task, "id", "unknown"), "crew": self.crew_name, "event": "task_start"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        self._update_span(log.id if log else None)

    def on_task_end(self, task: Any, output: Any, **kwargs: Any) -> None:
        """Log (or guard) a task output. Raises if blocked when ``guard=True``."""
        meta = {"task_id": getattr(task, "id", "unknown"), "crew": self.crew_name, "event": "task_end"}
        output_text = str(output)

        if self.guard:
            result = self._client.guardrail(
                action="crewai_task_end",
                agent_id=self.crew_name,
                response=output_text,
                metadata=meta,
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )
            self._update_span(result.audit_log_id)
            if not result.allowed:
                self._maybe_raise(result.violations, result.severity, "crewai_task_end")
        else:
            log = self._client.log(
                action="crewai_task_end",
                agent_id=self.crew_name,
                response=output_text,
                metadata=meta,
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )
            self._update_span(log.id if log else None)

    def on_agent_action(self, agent_action: Any, task: Any, **kwargs: Any) -> None:
        """Log an agent action performed inside a task."""
        log = self._client.log(
            action="crewai_agent_action",
            agent_id=self.crew_name,
            prompt=getattr(agent_action, "thought", ""),
            metadata={"task_id": getattr(task, "id", "unknown"), "crew": self.crew_name, "event": "agent_action"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        self._update_span(log.id if log else None)

    def on_crew_end(self, crew: Any, output: Any, **kwargs: Any) -> None:
        """Log (or guard) the final crew output, then reset trace state."""
        meta = {"crew": self.crew_name, "event": "crew_end", "task_count": len(getattr(crew, "tasks", []))}
        output_text = str(output)

        try:
            if self.guard:
                result = self._client.guardrail(
                    action="crewai_crew_end",
                    agent_id=self.crew_name,
                    response=output_text,
                    metadata=meta,
                    trace_id=self._trace_id,
                    parent_span_id=self._root_span_id,
                )
                if not result.allowed:
                    self._maybe_raise(result.violations, result.severity, "crewai_crew_end")
            else:
                self._client.log(
                    action="crewai_crew_end",
                    agent_id=self.crew_name,
                    response=output_text,
                    metadata=meta,
                    trace_id=self._trace_id,
                    parent_span_id=self._root_span_id,
                )
        finally:
            self._reset_trace()

    @property
    def trace_id(self) -> Optional[str]:
        """The current crew's trace ID (``None`` before ``on_crew_start``)."""
        return self._trace_id
