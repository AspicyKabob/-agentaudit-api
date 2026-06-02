"""
Unit tests for BaseIntegration and the production-ready SDK.

Requires: pytest, pytest-mock (optional), unittest.mock (stdlib)
Run: ``pytest tests/unit/python/test_base_integration.py -v``
"""

import warnings
from unittest.mock import MagicMock, PropertyMock, call, patch

import pytest

from integrations.base import (
    BaseIntegration,
    CircuitBreaker,
    CircuitState,
    ComplianceViolation,
    IntegrationWarning,
    TelemetrySnapshot,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

class _FakeAuditLog:
    id = "log-abc-123"


class _FakeGuardrailResult:
    allowed = True
    action = "allow"
    violations = []
    severity = "warning"
    audit_log_id = "log-abc-123"


class _BlockedGuardrailResult:
    allowed = False
    action = "block"
    violations = ["CRITICAL_pii"]
    severity = "critical"
    audit_log_id = "log-block-456"


class FakeClient:
    """Stand-in for ``agentaudit.AgentAudit``."""

    def __init__(self):
        self.log_calls = []
        self.guardrail_calls = []
        self.agent_id = None

    def log(self, **kwargs):
        self.log_calls.append(kwargs)
        return _FakeAuditLog()

    def guardrail(self, **kwargs):
        self.guardrail_calls.append(kwargs)
        return _FakeGuardrailResult()


class FakeBrokenClient:
    """Client that always raises an exception."""

    def log(self, **kwargs):
        raise ConnectionError("API unreachable")

    def guardrail(self, **kwargs):
        raise ConnectionError("API unreachable")


class FakeBlockedClient:
    """Client that always returns a blocked guardrail result."""

    def guardrail(self, **kwargs):
        return _BlockedGuardrailResult()

    def log(self, **kwargs):
        return _FakeAuditLog()


@pytest.fixture
def fake_client():
    return FakeClient()


@pytest.fixture
def base(fake_client):
    """BaseIntegration wired to a FakeClient."""
    with patch("integrations.base.AgentAudit", return_value=fake_client):
        obj = BaseIntegration(api_key="test-key")
    obj._client = fake_client  # direct override so we bypass the constructor patch side effects
    return obj


# ---------------------------------------------------------------------------
# Circuit breaker
# ---------------------------------------------------------------------------

class TestCircuitBreaker:
    def test_closed_by_default(self):
        cb = CircuitBreaker()
        assert cb.state == CircuitState.CLOSED
        assert cb.allow_request() is True

    def test_opens_after_threshold(self):
        cb = CircuitBreaker(failure_threshold=3)
        cb.record_failure()
        cb.record_failure()
        assert cb.state == CircuitState.CLOSED
        cb.record_failure()
        assert cb.state == CircuitState.OPEN
        assert cb.allow_request() is False

    def test_half_open_after_timeout(self):
        cb = CircuitBreaker(failure_threshold=1, recovery_timeout=0.0)
        cb.record_failure()
        assert cb.state == CircuitState.OPEN
        assert cb.allow_request() is True  # timeout already passed
        assert cb.state == CircuitState.HALF_OPEN

    def test_closed_after_successes(self):
        cb = CircuitBreaker(failure_threshold=1, recovery_timeout=0.0, success_threshold=2)
        cb.record_failure()
        cb.record_success()
        assert cb.state == CircuitState.HALF_OPEN  # still in trial
        cb.record_success()
        assert cb.state == CircuitState.CLOSED

    def test_resets_failure_count_on_success(self):
        cb = CircuitBreaker(failure_threshold=5)
        cb.record_failure()
        cb.record_failure()
        cb.record_success()
        cb.record_failure()
        assert cb.state == CircuitState.CLOSED  # only 1 failure now


# ---------------------------------------------------------------------------
# BaseIntegration — logging
# ---------------------------------------------------------------------------

class TestSubmitLog:
    def test_success_returns_dict(self, base, fake_client):
        result = base._submit_log(action="test_event")
        assert result == {"id": "log-abc-123"}
        assert len(fake_client.log_calls) == 1
        assert fake_client.log_calls[0]["action"] == "test_event"

    def test_failure_with_fail_open(self):
        obj = BaseIntegration(api_key="k", fail_open=True)
        obj._client = FakeBrokenClient()

        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            result = obj._submit_log(action="test_event")

        assert result is None
        assert len(w) == 1
        assert issubclass(w[0].category, IntegrationWarning)
        assert "log failed" in str(w[0].message)

    def test_failure_with_fail_open_true(self):
        obj = BaseIntegration(api_key="k", fail_open=True)
        obj._client = FakeBrokenClient()
        with warnings.catch_warnings(record=True):
            warnings.simplefilter("always")
            result = obj._submit_log(action="test_event")
        assert result is None

    def test_circuit_opens_on_repeated_failures(self):
        obj = BaseIntegration(api_key="k", fail_open=True)
        obj._client = FakeBrokenClient()
        obj._circuit.failure_threshold = 2

        with warnings.catch_warnings(record=True):
            warnings.simplefilter("always")
            obj._submit_log(action="e1")
            obj._submit_log(action="e2")
        assert obj._circuit.state == CircuitState.OPEN

        with warnings.catch_warnings(record=True) as w:
            warnings.simplefilter("always")
            result = obj._submit_log(action="e3")
        assert result is None
        assert any("circuit breaker" in str(x.message) for x in w)


# ---------------------------------------------------------------------------
# BaseIntegration — guardrail
# ---------------------------------------------------------------------------

class TestSubmitGuardrail:
    def test_success(self, base, fake_client):
        result = base._submit_guardrail(action="test_guard")
        assert result["allowed"] is True
        assert result["action"] == "allow"
        assert len(fake_client.guardrail_calls) == 1

    def test_blocked_raises_compliance_violation(self):
        obj = BaseIntegration(api_key="k", guard=True, fail_open=True)
        obj._client = FakeBlockedClient()

        result = obj._submit_guardrail(action="test_guard")
        assert result["allowed"] is False

        with pytest.raises(ComplianceViolation) as exc_info:
            obj._maybe_raise(result, action="test_guard")
        assert "CRITICAL_pii" in str(exc_info.value.violations)

    def test_failure_with_fail_open_false(self):
        obj = BaseIntegration(api_key="k", fail_open=False)
        obj._client = FakeBrokenClient()

        with warnings.catch_warnings(record=True):
            warnings.simplefilter("always")
            with pytest.raises(Exception):  # re-raised from guardrail
                obj._submit_guardrail(action="test_guard")

    def test_failure_with_fail_open_true(self):
        obj = BaseIntegration(api_key="k", fail_open=True)
        obj._client = FakeBrokenClient()

        with warnings.catch_warnings(record=True):
            warnings.simplefilter("always")
            result = obj._submit_guardrail(action="test_guard")
        assert result["allowed"] is True
        assert result["action"] == "allow"


# ---------------------------------------------------------------------------
# Trace helpers
# ---------------------------------------------------------------------------

class TestTraceHelpers:
    def test_trace_id_property(self, base):
        assert base.trace_id is None
        base._trace_id = "trace-123"
        assert base.trace_id == "trace-123"

    def test_reset_trace(self, base):
        base._trace_id = "t"
        base._root_span_id = "r"
        base._current_span_id = "c"
        base._reset_trace()
        assert base._trace_id is None
        assert base._root_span_id is None
        assert base._current_span_id is None

    def test_update_span(self, base):
        base._update_span("span-1")
        assert base._current_span_id == "span-1"
        base._update_span(None)
        assert base._current_span_id == "span-1"  # unchanged


# ---------------------------------------------------------------------------
# Batch logging
# ---------------------------------------------------------------------------

class TestBatchLogging:
    def test_batch_size_no_flush(self):
        obj = BaseIntegration(api_key="k", batch_size=3)
        obj._client = FakeClient()

        obj._submit_log(action="e1")
        obj._submit_log(action="e2")
        assert len(obj._pending_batch) == 2
        assert obj._client.log_calls == []  # nothing sent yet

    def test_batch_flush_on_threshold(self):
        obj = BaseIntegration(api_key="k", batch_size=2)
        fake = FakeClient()
        obj._client = fake

        obj._submit_log(action="e1")
        obj._submit_log(action="e2")
        assert len(obj._pending_batch) == 0  # flushed
        assert len(fake.log_calls) == 2  # sent via log_batch
        # FakeClient doesn't have log_batch, but the code will call it

    def test_force_flush(self):
        obj = BaseIntegration(api_key="k", batch_size=10)
        obj._client = FakeClient()
        obj._submit_log(action="e1")
        assert len(obj._pending_batch) == 1
        obj.flush()
        assert len(obj._pending_batch) == 0


# ---------------------------------------------------------------------------
# Telemetry
# ---------------------------------------------------------------------------

class TestTelemetry:
    def test_telemetry_snapshot(self, base):
        base._requests_total = 100
        base._requests_failed = 5
        base._requests_blocked = 3
        base._latency_acc = 2.5
        snap = base.telemetry
        assert snap.requests_total == 100
        assert snap.requests_failed == 5
        assert snap.requests_blocked == 3
        assert snap.avg_latency_ms == 25.0
        assert snap.circuit_state == "closed"

    def test_emit_telemetry_hook(self):
        received = []
        def hook(snap: TelemetrySnapshot):
            received.append(snap)

        obj = BaseIntegration(api_key="k", telemetry_hook=hook)
        obj._requests_total = 10
        obj._emit_telemetry()
        assert len(received) == 1
        assert received[0].requests_total == 10

    def test_emit_telemetry_hook_exception_isolated(self):
        def bad_hook(snap):
            raise RuntimeError("hook boom")

        obj = BaseIntegration(api_key="k", telemetry_hook=bad_hook)
        obj._requests_total = 1
        obj._emit_telemetry()  # must not raise


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
