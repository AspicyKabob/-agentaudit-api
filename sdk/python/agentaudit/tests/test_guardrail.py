"""Tests for guardrail parsing — the server's enforcementAction is authoritative."""

from unittest.mock import MagicMock

import pytest

from agentaudit import AgentAudit, AgentAuditAsync, _parse_guardrail_result


def _client_returning(data):
    client = AgentAudit(api_key="aa_test_key", agent_id="agent-123")
    resp = MagicMock()
    resp.json.return_value = data
    client._request = MagicMock(return_value=resp)
    return client


def test_block_overrides_flags_and_severity():
    """enforcementAction=block => allowed False even when flags look benign."""
    client = _client_returning(
        {
            "id": "log-1",
            "enforcementAction": "block",
            "complianceFlags": ["pii_detected"],  # not CRITICAL => severity "warning"
        }
    )
    result = client.guardrail(action="prompt_submitted", response="x")

    assert result.allowed is False
    assert result.action == "block"
    assert result.severity == "warning"
    assert result.violations == ["pii_detected"]
    assert result.audit_log_id == "log-1"


def test_flag_is_allowed():
    client = _client_returning(
        {
            "id": "log-2",
            "enforcementAction": "flag",
            "complianceFlags": ["CRITICAL_pii_detect_SSN"],
        }
    )
    result = client.guardrail(action="prompt_submitted", response="x")

    assert result.allowed is True
    assert result.action == "flag"
    # severity is for display only and must not change the decision
    assert result.severity == "critical"


def test_allow_is_allowed():
    client = _client_returning(
        {"id": "log-3", "enforcementAction": "allow", "complianceFlags": []}
    )
    result = client.guardrail(action="prompt_submitted", response="x")

    assert result.allowed is True
    assert result.action == "allow"


def test_log_action_is_allowed():
    client = _client_returning(
        {"id": "log-4", "enforcementAction": "log", "complianceFlags": ["pii_detected"]}
    )
    result = client.guardrail(action="prompt_submitted", response="x")

    assert result.allowed is True
    assert result.action == "log"


def test_fallback_when_enforcement_action_absent():
    """Older servers omit enforcementAction => derive from flags as last resort."""
    blocked = _parse_guardrail_result(
        {"id": "old-1", "complianceFlags": ["CRITICAL_pii_detect_SSN"]}
    )
    assert blocked.action == "block"
    assert blocked.allowed is False

    flagged = _parse_guardrail_result(
        {"id": "old-2", "complianceFlags": ["pii_detected"]}
    )
    assert flagged.action == "flag"
    assert flagged.allowed is True

    clean = _parse_guardrail_result({"id": "old-3", "complianceFlags": []})
    assert clean.action == "allow"
    assert clean.allowed is True


@pytest.mark.asyncio
async def test_async_block_matches_sync():
    """Async client shares the same parsing and agrees on block => not allowed."""
    audit = AgentAuditAsync(api_key="aa_test_key", agent_id="agent-123")
    resp = MagicMock()
    resp.json.return_value = {
        "id": "log-5",
        "enforcementAction": "block",
        "complianceFlags": [],
    }
    audit._client._request = MagicMock(return_value=resp)

    result = await audit.guardrail(action="prompt_submitted", response="x")

    assert result.allowed is False
    assert result.action == "block"
