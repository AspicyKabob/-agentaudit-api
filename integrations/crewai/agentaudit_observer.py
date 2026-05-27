"""
CrewAI Observer Integration for AgentAudit

Automatically logs CrewAI task executions, agent actions, and crew outputs.
Optionally enforces real-time guardrails — blocking outputs with compliance violations
before they are delivered.

Agent-to-Agent Audit Trails
---------------------------
Every crew execution is tracked as a distributed trace.  Each ``on_crew_start``
generates a unique ``traceId``.  All subsequent events (task starts/ends, agent
actions, crew end) share that traceId and set ``parentSpanId`` so the full
agent chain can be reconstructed with ``GET /trace/:traceId`` or
``GET /audit-logs/:id/chain``.

Example (logging only):
    from crewai import Crew, Agent, Task
    from agentaudit_crewai import AgentAuditObserver

    observer = AgentAuditObserver(
        api_key="aa_your_key_here",
        crew_name="Research Crew",
        guard=False
    )

    crew = Crew(
        agents=[researcher, writer],
        tasks=[research_task, write_task],
        callbacks=[observer]
    )

    result = crew.kickoff()
    # All tasks, agent actions, and outputs are automatically logged!
    # Trace ID is available at observer.trace_id after crew starts.

Example (guardrails enabled — default):
    observer = AgentAuditObserver(
        api_key="aa_your_key_here",
        crew_name="Research Crew",
        guard=True   # default
    )

    crew = Crew(
        agents=[researcher, writer],
        tasks=[research_task, write_task],
        callbacks=[observer]
    )

    result = crew.kickoff()
    # If any task output violates a compliance rule (PII, forbidden keywords, etc.),
    # a ComplianceViolation is raised and the crew halts immediately.
"""

import uuid
from typing import Any, Dict, Optional
from agentaudit import AgentAudit


class ComplianceViolation(Exception):
    """Raised when a CrewAI task or crew output violates a compliance rule.

    Attributes:
        violations (list): The compliance flag strings that triggered the block.
        severity (str): 'warning' or 'critical'.
        task_id (str): The CrewAI task id that was blocked (if applicable).
    """

    def __init__(self, message: str, violations: list, severity: str = "critical", task_id: str = ""):
        super().__init__(message)
        self.violations = violations
        self.severity = severity
        self.task_id = task_id


class AgentAuditObserver:
    """
    CrewAI observer that automatically submits audit logs
    for task executions and crew outputs.

    When ``guard=True`` (the default) ``on_task_end`` and ``on_crew_end``
    call the ``guardrail()`` endpoint instead of plain ``log()``.  If the
    API returns ``allowed=False`` a :class:`ComplianceViolation` is raised
    so the crew halts before the violating output is delivered.

    Trace Tracking
    --------------
    Each crew execution is a trace.  The traceId is generated in
    ``on_crew_start`` and propagated to every subsequent event.
    ``parentSpanId`` links child events (tasks, agent actions) to their
    parent so the full chain can be queried later.
    """

    def __init__(
        self,
        api_key: str,
        crew_name: Optional[str] = None,
        base_url: str = "https://api.agentaudit.io/api/v1",
        guard: bool = True,
    ):
        self.client = AgentAudit(api_key=api_key, base_url=base_url)
        self.crew_name = crew_name or "unnamed-crew"
        self.guard = guard

        # Trace state
        self._trace_id: Optional[str] = None
        self._root_span_id: Optional[str] = None
        self._current_task_span_id: Optional[str] = None

    @property
    def trace_id(self) -> Optional[str]:
        """The active trace ID for the current crew execution."""
        return self._trace_id

    def _maybe_raise(self, result, task_id: str = "") -> None:
        """Raise ComplianceViolation when guard=True and result is blocked."""
        if self.guard and not result.allowed:
            raise ComplianceViolation(
                message=f"Blocked by AgentAudit guardrail: {result.violations}",
                violations=result.violations,
                severity=result.severity,
                task_id=task_id,
            )

    def on_crew_start(self, crew: Any, **kwargs: Any) -> None:
        """Called when a crew starts working.

        Generates a new traceId and logs the crew start as the root span.
        """
        self._trace_id = str(uuid.uuid4())
        self.crew_name = getattr(crew, 'name', self.crew_name)
        agents = [getattr(a, 'role', 'unknown') for a in getattr(crew, 'agents', [])]

        log = self.client.log(
            action="crewai_crew_start",
            trace_id=self._trace_id,
            metadata={
                "crew": self.crew_name,
                "agents": agents,
                "task_count": len(getattr(crew, 'tasks', [])),
                "event": "crew_start"
            }
        )
        self._root_span_id = log.id

    def on_task_start(self, task: Any, **kwargs: Any) -> None:
        """Called when a task starts executing.

        Logs the task start as a child of the crew root span.
        """
        task_id = getattr(task, 'id', 'unknown')
        description = getattr(task, 'description', '')

        log = self.client.log(
            action="crewai_task_start",
            trace_id=self._trace_id,
            parent_span_id=self._root_span_id,
            prompt=description,
            metadata={
                "crew": self.crew_name,
                "task_id": task_id,
                "expected_output": getattr(task, 'expected_output', ''),
                "event": "task_start"
            }
        )
        self._current_task_span_id = log.id

    def on_agent_action(self, agent: Any, action: str, **kwargs: Any) -> None:
        """Called when an agent performs an action.

        Logged as a child of the current task span.
        """
        agent_role = getattr(agent, 'role', 'unknown')

        self.client.log(
            action="crewai_agent_action",
            trace_id=self._trace_id,
            parent_span_id=self._current_task_span_id,
            prompt=action,
            metadata={
                "crew": self.crew_name,
                "agent_role": agent_role,
                "agent_goal": getattr(agent, 'goal', ''),
                "event": "agent_action"
            }
        )

    def on_task_end(self, task: Any, output: str, **kwargs: Any) -> None:
        """Called when a task completes.

        If ``guard=True`` the output is sent through the real-time guardrail
        endpoint.  When violations are found a :class:`ComplianceViolation` is
        raised so the crew halts before the output is delivered.

        Logged as a child of the current task span.
        """
        task_id = getattr(task, 'id', 'unknown')

        if self.guard:
            result = self.client.guardrail(
                action="crewai_task_end",
                trace_id=self._trace_id,
                parent_span_id=self._current_task_span_id,
                prompt=getattr(task, 'description', ''),
                response=output,
                metadata={
                    "crew": self.crew_name,
                    "task_id": task_id,
                    "event": "task_end"
                }
            )
            self._maybe_raise(result, task_id=task_id)
        else:
            self.client.log(
                action="crewai_task_end",
                trace_id=self._trace_id,
                parent_span_id=self._current_task_span_id,
                prompt=getattr(task, 'description', ''),
                response=output,
                metadata={
                    "crew": self.crew_name,
                    "task_id": task_id,
                    "event": "task_end"
                }
            )

    def on_crew_end(self, crew: Any, output: str, **kwargs: Any) -> None:
        """Called when a crew finishes all tasks.

        If ``guard=True`` the final output is sent through the real-time
        guardrail endpoint and a :class:`ComplianceViolation` is raised when
        violations are detected.

        Logged as a child of the crew root span.
        """
        if self.guard:
            result = self.client.guardrail(
                action="crewai_crew_end",
                trace_id=self._trace_id,
                parent_span_id=self._root_span_id,
                response=output,
                metadata={
                    "crew": self.crew_name,
                    "event": "crew_end"
                }
            )
            self._maybe_raise(result)
        else:
            self.client.log(
                action="crewai_crew_end",
                trace_id=self._trace_id,
                parent_span_id=self._root_span_id,
                response=output,
                metadata={
                    "crew": self.crew_name,
                    "event": "crew_end"
                }
            )
