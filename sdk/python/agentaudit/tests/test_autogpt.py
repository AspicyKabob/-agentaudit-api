"""Tests for the AgentAudit AutoGPT integration."""

from unittest.mock import MagicMock

import pytest


def _make_logger(guard: bool = False):
    from agentaudit.autogpt import AgentAuditAutoGPT

    logger = AgentAuditAutoGPT(
        api_key="aa_test_key",
        agent_name="MyAutoGPT",
        guard=guard,
    )
    logger._client = MagicMock()
    logger._client.log.return_value = MagicMock(id="log-1")
    logger._client.guardrail.return_value = MagicMock(
        allowed=True,
        action="allow",
        violations=[],
        severity="warning",
        audit_log_id="guard-log-1",
    )
    return logger


def test_trace_logs_start_and_actions():
    logger = _make_logger()

    with logger.trace(metadata={"function": "run_agent"}) as trace:
        trace.log_action("think", prompt="What should I do?", response="Research topic")
        trace.log_action("execute", prompt="Search web", response="Found 3 results")

    assert trace.trace_id is not None
    assert logger._client.log.call_count == 4
    calls = [call.kwargs for call in logger._client.log.call_args_list]
    assert calls[0]["action"] == "autogpt_trace_start"
    assert calls[1]["action"] == "autogpt_think"
    assert calls[1]["prompt"] == "What should I do?"
    assert calls[2]["action"] == "autogpt_execute"
    assert calls[3]["action"] == "autogpt_trace_end"


def test_trace_finish_logs_end_without_guard():
    logger = _make_logger(guard=False)

    trace = logger.start_trace()
    trace.log_action("run", response="result")
    trace.finish(response="final result")

    calls = [call.kwargs for call in logger._client.log.call_args_list]
    assert calls[-1]["action"] == "autogpt_trace_end"
    assert calls[-1]["response"] == "final result"


def test_trace_finish_runs_guardrail_when_guarding():
    logger = _make_logger(guard=True)
    trace = logger.start_trace()
    trace.finish(response="final result")

    logger._client.guardrail.assert_called_once()
    call = logger._client.guardrail.call_args
    assert call.kwargs["action"] == "autogpt_trace_end"
    assert call.kwargs["response"] == "final result"


def test_trace_guard_raises_on_block():
    from agentaudit.autogpt import ComplianceViolationAutoGPT

    logger = _make_logger(guard=True)
    logger._client.guardrail.return_value = MagicMock(
        allowed=False,
        action="block",
        violations=["CRITICAL_pii_detect_SSN"],
        severity="critical",
        audit_log_id=None,
    )

    trace = logger.start_trace()
    with pytest.raises(ComplianceViolationAutoGPT):
        trace.guard("function_end", response="My SSN is 123-45-6789")


def test_decorator_logs_function_start_and_end():
    from unittest.mock import patch, MagicMock
    from agentaudit.autogpt import AgentAuditAutoGPT

    mock_client = MagicMock()
    mock_client.log.return_value = MagicMock(id="log-1")
    mock_client.guardrail.return_value = MagicMock(
        allowed=True,
        action="allow",
        violations=[],
        severity="warning",
        audit_log_id="guard-log-1",
    )

    mock_agent_audit_class = MagicMock(return_value=mock_client)

    with patch("agentaudit.autogpt.AgentAudit", mock_agent_audit_class):
        @AgentAuditAutoGPT.guard(api_key="aa_test_key", agent_name="MyAutoGPT", guard=False)
        def run_agent(task: str) -> str:
            return f"Done: {task}"

        result = run_agent("Research topic X")

    assert result == "Done: Research topic X"
    assert mock_client.log.call_count >= 3
    calls = [call.kwargs for call in mock_client.log.call_args_list]
    assert calls[0]["action"] == "autogpt_trace_start"
    assert calls[-1]["action"] == "autogpt_trace_end"


def test_lazy_import_from_package():
    from agentaudit import AgentAuditAutoGPT, AgentAuditAutoGPTTrace, ComplianceViolationAutoGPT
    assert AgentAuditAutoGPT is not None
    assert AgentAuditAutoGPTTrace is not None
    assert ComplianceViolationAutoGPT is not None
