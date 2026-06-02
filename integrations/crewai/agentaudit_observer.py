"""
CrewAI Observer Integration for AgentAudit

Automatically logs CrewAI task executions, agent actions, and crew outputs.
Optionally enforces real-time guardrails — blocking outputs with compliance
violations before they are delivered.

Agent-to-Agent Audit Trails
---------------------------
Every crew execution is tracked as a distributed trace. Each ``on_crew_start``
generates a unique ``traceId``. All subsequent events share that traceId and set
``parentSpanId`` so the full agent chain can be reconstructed with
``GET /trace/:traceId`` or ``GET /audit-logs/:id/chain``.

Example (logging only)::

    from crewai import Crew, Agent, Task
    from agentaudit_crewai import AgentAuditObserver

    observer = AgentAuditObserver(
        api_key="aa_your_key_here",
        crew_name="Research Crew",
        guard=False,
    )

    crew = Crew(
        agents=[researcher, writer],
        tasks=[research_task, write_task],
        callbacks=[observer],
    )

    result = crew.kickoff()

Example (guardrails enabled — default)::

    observer = AgentAuditObserver(
        api_key="aa_your_key_here",
        crew_name="Research Crew",
        guard=True,   # default
    )

    crew = Crew(
        agents=[researcher, writer],
        tasks=[research_task, write_task],
        callbacks=[observer],
    )

    result = crew.kickoff()
    # If any task output violates a rule, ComplianceViolation is raised
"""

import uuid
from typing import Any, Dict, Optional

from integrations.base import BaseIntegration, ComplianceViolation

__all__ = ["AgentAuditObserver", "ComplianceViolation"]


class AgentAuditObserver(BaseIntegration):
    """
    CrewAI observer that automatically submits audit logs for task
    executions and crew outputs.

    When ``guard=True`` (the default) ``on_task_end`` and ``on_crew_end``
    call the guardrail endpoint instead of plain ``log()``. If the API
    returns ``allowed=False`` a :class:`ComplianceViolation` is raised so
    the crew halts before the violating output is delivered.

    Trace Tracking
    --------------
    Each crew execution is a trace. The traceId is generated in
    ``on_crew_start`` and propagated to every subsequent event.  ``parentSpanId``
    links child events (tasks, agent actions) to their parent so the full chain
    can be queried later.
    """

    def __init__(
        self,
        api_key: str,
        crew_name: Optional[str] = None,
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
        self.crew_name = crew_name or "unnamed-crew"

    def on_crew_start(self, crew: Any, **kwargs: Any) -> None:
        """Called when a crew starts working.

        Generates a new traceId and logs the crew start as the root span.
        """
        self._trace_id = str(uuid.uuid4())
        self.crew_name = getattr(crew, "name", self.crew_name)
        agents = [getattr(a, "role", "unknown") for a in getattr(crew, "agents", [])]

        log = self._submit_log(
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
        self._root_span_id = log.get("id") if log else None
        self._current_span_id = self._root_span_id

    def on_task_start(self, task: Any, **kwargs: Any) -> None:
        """Called when a task starts executing."""
        task_id = getattr(task, "id", "unknown")
        log = self._submit_log(
            action="crewai_task_start",
            agent_id=self.crew_name,
            prompt=getattr(task, "description", ""),
            metadata={"task_id": task_id, "crew": self.crew_name, "event": "task_start"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        self._update_span(log.get("id") if log else None)

    def on_task_end(self, task: Any, output: Any, **kwargs: Any) -> None:
        """Called when a task ends.

        If ``guard=True`` and the output is blocked, raises
        :class:`ComplianceViolation` so the crew halts.
        """
        task_id = getattr(task, "id", "unknown")
        output_text = str(output)

        meta = {
            "task_id": task_id,
            "crew": self.crew_name,
            "event": "task_end",
        }

        if self.guard:
            result = self._submit_guardrail(
                action="crewai_task_end",
                agent_id=self.crew_name,
                response=output_text,
                metadata=meta,
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )
            self._maybe_raise(result, action="crewai_task_end")
            self._update_span(result.get("audit_log_id"))
        else:
            log = self._submit_log(
                action="crewai_task_end",
                agent_id=self.crew_name,
                response=output_text,
                metadata=meta,
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )
            self._update_span(log.get("id") if log else None)

    def on_agent_action(
        self,
        agent_action: Any,
        task: Any,
        **kwargs: Any,
    ) -> None:
        """Called when an agent performs an action inside a task."""
        task_id = getattr(task, "id", "unknown")
        log = self._submit_log(
            action="crewai_agent_action",
            agent_id=self.crew_name,
            prompt=getattr(agent_action, "thought", ""),
            metadata={"task_id": task_id, "crew": self.crew_name, "event": "agent_action"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        self._update_span(log.get("id") if log else None)

    def on_crew_end(self, crew: Any, output: Any, **kwargs: Any) -> None:
        """Called when the entire crew finishes.

        If ``guard=True`` and the final output is blocked, raises
        :class:`ComplianceViolation`.
        """
        output_text = str(output)
        meta = {
            "crew": self.crew_name,
            "event": "crew_end",
            "task_count": len(getattr(crew, "tasks", [])),
        }

        if self.guard:
            result = self._submit_guardrail(
                action="crewai_crew_end",
                agent_id=self.crew_name,
                response=output_text,
                metadata=meta,
                trace_id=self._trace_id,
                parent_span_id=self._root_span_id,
            )
            self._maybe_raise(result, action="crewai_crew_end")
        else:
            self._submit_log(
                action="crewai_crew_end",
                agent_id=self.crew_name,
                response=output_text,
                metadata=meta,
                trace_id=self._trace_id,
                parent_span_id=self._root_span_id,
            )

        # Clean up trace state so the next crew gets a fresh trace
        self._reset_trace()
