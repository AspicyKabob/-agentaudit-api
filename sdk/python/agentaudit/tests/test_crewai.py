"""Tests for the AgentAudit CrewAI integration."""

from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest


def _make_observer(guard: bool = False):
    from agentaudit.crewai import AgentAuditObserver

    observer = AgentAuditObserver(
        api_key="aa_test_key",
        crew_name="Research Crew",
        guard=guard,
    )
    observer._client = MagicMock()
    observer._client.log.return_value = MagicMock(id="log-1")
    observer._client.guardrail.return_value = MagicMock(
        allowed=True,
        action="allow",
        violations=[],
        severity="warning",
        audit_log_id="guard-log-1",
    )
    return observer


def _crew():
    return SimpleNamespace(
        name="Research Crew",
        agents=[SimpleNamespace(role="researcher"), SimpleNamespace(role="writer")],
        tasks=[SimpleNamespace(id="t1"), SimpleNamespace(id="t2")],
    )


def test_crew_lifecycle_logs_trace_chain():
    observer = _make_observer(guard=False)
    crew = _crew()

    observer.on_crew_start(crew)
    observer.on_task_start(crew.tasks[0])
    observer.on_task_end(crew.tasks[0], output="Task output")
    observer.on_crew_end(crew, output="Crew output")

    actions = [call.kwargs["action"] for call in observer._client.log.call_args_list]
    assert actions == [
        "crewai_crew_start",
        "crewai_task_start",
        "crewai_task_end",
        "crewai_crew_end",
    ]
    # All events share the same trace and reset afterwards.
    trace_ids = {call.kwargs["trace_id"] for call in observer._client.log.call_args_list}
    assert len(trace_ids) == 1
    assert observer.trace_id is None


def test_guard_mode_calls_guardrail_for_outputs():
    observer = _make_observer(guard=True)
    crew = _crew()

    observer.on_crew_start(crew)
    observer.on_task_end(crew.tasks[0], output="safe output")
    observer.on_crew_end(crew, output="safe crew output")

    guard_actions = [c.kwargs["action"] for c in observer._client.guardrail.call_args_list]
    assert guard_actions == ["crewai_task_end", "crewai_crew_end"]


def test_blocked_task_raises_violation():
    from agentaudit.crewai import ComplianceViolationCrewAI

    observer = _make_observer(guard=True)
    observer._client.guardrail.return_value = MagicMock(
        allowed=False,
        action="block",
        violations=["CRITICAL_pii_detect_Block SSNs"],
        severity="critical",
        audit_log_id=None,
    )

    observer.on_crew_start(_crew())
    with pytest.raises(ComplianceViolationCrewAI) as exc:
        observer.on_task_end(SimpleNamespace(id="t1"), output="My SSN is 123-45-6789")
    assert exc.value.violations == ["CRITICAL_pii_detect_Block SSNs"]


def test_lazy_import_from_package():
    from agentaudit import AgentAuditObserver, ComplianceViolationCrewAI

    assert AgentAuditObserver is not None
    assert ComplianceViolationCrewAI is not None
