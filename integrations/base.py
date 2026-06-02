"""
Shared base for all AgentAudit Python integrations.

Provides:
- ``BaseIntegration`` – reusable class wrapping the SDK client
- Consistent, **audible** error handling (warnings on API failures)
- Configurable ``fail_open`` / ``fail_closed`` behaviour
- Batch logging support for high-throughput scenario's
- Circuit-breaker for resilience
- Telemetry hooks for observability

Usage::

    class MyBot(BaseIntegration):
        def generate(self, text: str) -> str:
            log = self._submit_log(action="gen", response=text)
            self._update_span(log.get("id"))
            return text
"""

from __future__ import annotations

import json
import time
import warnings
import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Dict, List, Optional, Tuple

from agentaudit import AgentAudit, AgentAuditAsync

logger = logging.getLogger("agentaudit.integration")

# ---------------------------------------------------------------------------
# Telemetry / circuit-breaker
# ---------------------------------------------------------------------------

class CircuitState(Enum):
    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"


@dataclass
class CircuitBreaker:
    """Thread-safe* circuit breaker for SDK resilience.

    Parameters
    ----------
    failure_threshold:
        Number of consecutive failures before opening the circuit (default: 5).
    recovery_timeout:
        Seconds to wait before testing the API again (default: 30).
    success_threshold:
        Consecutive successes required to close the circuit (default: 2).

    *Python consumers are responsible for external synchronisation if
    calling from multiple threads.
    """

    failure_threshold: int = 5
    recovery_timeout: float = 30.0
    success_threshold: int = 2

    state: CircuitState = field(default=CircuitState.CLOSED, init=False)
    _failure_count: int = field(default=0, init=False, repr=False)
    _success_count: int = field(default=0, init=False, repr=False)
    _last_failure_time: Optional[float] = field(default=None, init=False, repr=False)

    def record_failure(self) -> None:
        """Record an API failure."""
        self._failure_count += 1
        self._success_count = 0
        self._last_failure_time = time.time()
        if self._failure_count >= self.failure_threshold:
            self.state = CircuitState.OPEN
            logger.warning(
                "Circuit breaker OPENED after %d consecutive failures", self._failure_count
            )

    def record_success(self) -> None:
        """Record an API success."""
        self._failure_count = 0
        self._success_count += 1
        if self.state == CircuitState.HALF_OPEN and self._success_count >= self.success_threshold:
            self.state = CircuitState.CLOSED
            logger.info("Circuit breaker CLOSED (recovered) after %d successes", self._success_count)

    def allow_request(self) -> bool:
        """Return ``True`` if the next request should proceed."""
        if self.state == CircuitState.CLOSED:
            return True
        if self.state == CircuitState.OPEN:
            assert self._last_failure_time is not None
            if (time.time() - self._last_failure_time) >= self.recovery_timeout:
                self.state = CircuitState.HALF_OPEN
                logger.info("Circuit breaker HALF_OPEN — one trial request permitted")
                return True
            return False
        # HALF_OPEN — allow exactly one trial request
        return True


@dataclass
class TelemetrySnapshot:
    """Point-in-time telemetry for an integration instance."""

    requests_total: int = 0
    requests_failed: int = 0
    requests_blocked: int = 0
    avg_latency_ms: float = 0.0
    circuit_state: str = CircuitState.CLOSED.value


# ---------------------------------------------------------------------------
# BaseIntegration
# ---------------------------------------------------------------------------

class IntegrationWarning(UserWarning):
    """Warning emitted when an integration cannot reach the AgentAudit API."""


class ComplianceViolation(Exception):
    """Raised when an output is blocked by a real-time guardrail."""

    def __init__(self, message: str, violations: list, severity: str = "critical"):
        super().__init__(message)
        self.violations = violations
        self.severity = severity


class BaseIntegration:
    """Reusable base for integrations that speak to the AgentAudit API.

    Parameters
    ----------
    api_key:
        Your AgentAudit API key.
    base_url:
        Custom AgentAudit API endpoint (defaults to production).
    guard:
        When ``True`` (default) blocked outputs raise :class:`ComplianceViolation`.
    fail_open:
        When ``True`` (default) API failures are treated as *allowed* after
        warning.  When ``False`` they are re-raised.
    use_async:
        When ``True`` an :class:`agentaudit.AgentAuditAsync` client is created
        so that :meth:`aguardrail` / :meth:`alog` can be used.
    batch_size:
        Number of log entries to buffer before flushing to the API (default: 1 = no
        buffering).  Increase for high-throughput pipelines (> 100 calls / sec).
    batch_flush_interval_s:
        Maximum seconds to hold buffered logs before flushing (default: 5).
    telemetry_hook:
        Optional callback ``fn(snapshot: TelemetrySnapshot)`` that is called
        after every batched flush so you can expose metrics to Prometheus /
        Datadog / etc.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.agentaudit.io/api/v1",
        guard: bool = True,
        fail_open: bool = True,
        use_async: bool = False,
        batch_size: int = 1,
        batch_flush_interval_s: float = 5.0,
        telemetry_hook: Optional[Callable[[TelemetrySnapshot], None]] = None,
    ):
        self._guard = guard
        self._fail_open = fail_open
        self._batch_size = batch_size
        self._batch_flush_interval_s = batch_flush_interval_s
        self._telemetry_hook = telemetry_hook

        # Client
        if use_async:
            self._client: Any = AgentAuditAsync(api_key=api_key, base_url=base_url)
        else:
            self._client = AgentAudit(api_key=api_key, base_url=base_url)

        # Circuit breaker (shared across all calls)
        self._circuit = CircuitBreaker()

        # Telemetry counters
        self._requests_total: int = 0
        self._requests_failed: int = 0
        self._requests_blocked: int = 0
        self._latency_acc: float = 0.0

        # Batch buffer
        self._pending_batch: List[Dict[str, Any]] = []
        self._last_flush: float = time.time()

        # Trace state
        self._trace_id: Optional[str] = None
        self._root_span_id: Optional[str] = None
        self._current_span_id: Optional[str] = None

    # ------------------------------------------------------------------
    # Trace helpers
    # ------------------------------------------------------------------

    @property
    def trace_id(self) -> Optional[str]:
        """Active trace ID for the current execution."""
        return self._trace_id

    def _reset_trace(self) -> None:
        self._trace_id = None
        self._root_span_id = None
        self._current_span_id = None

    def _update_span(self, span_id: Optional[str]) -> None:
        if span_id is not None:
            self._current_span_id = span_id

    # ------------------------------------------------------------------
    # Telemetry
    # ------------------------------------------------------------------

    def _emit_telemetry(self) -> None:
        """Call the user-supplied telemetry hook with a snapshot."""
        if self._telemetry_hook is None:
            return
        total = max(self._requests_total, 1)
        snap = TelemetrySnapshot(
            requests_total=self._requests_total,
            requests_failed=self._requests_failed,
            requests_blocked=self._requests_blocked,
            avg_latency_ms=round(self._latency_acc / total * 1000, 2),
            circuit_state=self._circuit.state.value,
        )
        try:
            self._telemetry_hook(snap)
        except Exception:
            logger.exception("Telemetry hook raised an exception — ignoring")

    # ------------------------------------------------------------------
    # Batch logic
    # ------------------------------------------------------------------

    def _flush_batch(self, force: bool = False) -> None:
        """Flush the pending batch to the API."""
        if not self._pending_batch:
            return
        if not force and len(self._pending_batch) < self._batch_size:
            if (time.time() - self._last_flush) < self._batch_flush_interval_s:
                return

        batch = self._pending_batch.copy()
        self._pending_batch.clear()
        self._last_flush = time.time()

        try:
            t0 = time.time()
            self._client.log_batch(batch)
            self._latency_acc += time.time() - t0
            self._circuit.record_success()
        except Exception as exc:
            self._circuit.record_failure()
            self._requests_failed += 1
            logger.warning("Batch flush failed: %s", exc)

    def _maybe_flush(self) -> None:
        """Flush if batch threshold or interval is reached."""
        if len(self._pending_batch) >= self._batch_size:
            self._flush_batch(force=True)
        elif (time.time() - self._last_flush) >= self._batch_flush_interval_s:
            self._flush_batch()

    # ------------------------------------------------------------------
    # Core submissions (with circuit breaker, telemetry, batch)
    # ------------------------------------------------------------------

    def _submit_log(
        self,
        action: str,
        agent_id: Optional[str] = None,
        prompt: Optional[str] = None,
        response: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        trace_id: Optional[str] = None,
        parent_span_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Log an audit event via the SDK.

        Returns ``None`` on failure *after* emitting a warning.
        """
        self._requests_total += 1

        # If batching, buffer and return early
        if self._batch_size > 1:
            self._pending_batch.append({
                "action": action,
                "agentId": (agent_id or self._client.agent_id),
                "prompt": prompt,
                "response": response,
                "metadata": metadata,
                "traceId": trace_id,
                "parentSpanId": parent_span_id,
            })
            self._maybe_flush()
            return None  # batched — ID unknown until flush

        # Circuit breaker
        if not self._circuit.allow_request():
            self._warn_circuit_open("log")
            return None

        try:
            t0 = time.time()
            log = self._client.log(
                action=action,
                agent_id=agent_id,
                prompt=prompt,
                response=response,
                metadata=metadata,
                trace_id=trace_id,
                parent_span_id=parent_span_id,
            )
            self._latency_acc += time.time() - t0
            self._circuit.record_success()
            return {"id": log.id}
        except Exception as exc:
            self._circuit.record_failure()
            self._requests_failed += 1
            self._warn_api_failure("log", exc)
            return None

    def _submit_guardrail(
        self,
        action: str,
        agent_id: Optional[str] = None,
        prompt: Optional[str] = None,
        response: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        trace_id: Optional[str] = None,
        parent_span_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Run a real-time guardrail via the SDK.

        On API failure:
        - ``fail_open=True`` → returns ``allowed=True`` after warning.
        - ``fail_open=False`` → re-raises the original exception.
        """
        self._requests_total += 1

        # Circuit breaker
        if not self._circuit.allow_request():
            self._warn_circuit_open("guardrail")
            if self._fail_open:
                return {
                    "allowed": True,
                    "action": "allow",
                    "violations": [],
                    "severity": "warning",
                }
            raise ComplianceViolation(
                message="Guardrail skipped — API circuit breaker is OPEN",
                violations=[],
                severity="critical",
            )

        try:
            t0 = time.time()
            result = self._client.guardrail(
                action=action,
                agent_id=agent_id,
                prompt=prompt,
                response=response,
                metadata=metadata,
                trace_id=trace_id,
                parent_span_id=parent_span_id,
            )
            self._latency_acc += time.time() - t0
            self._circuit.record_success()

            if not result.allowed:
                self._requests_blocked += 1

            return {
                "allowed": result.allowed,
                "action": result.action,
                "violations": result.violations,
                "severity": result.severity,
                "audit_log_id": result.audit_log_id,
            }
        except Exception as exc:
            self._circuit.record_failure()
            self._requests_failed += 1
            self._warn_api_failure("guardrail", exc)
            if self._fail_open:
                return {
                    "allowed": True,
                    "action": "allow",
                    "violations": [],
                    "severity": "warning",
                }
            raise

    def _maybe_raise(self, result: Dict[str, Any], action: str) -> None:
        """Raise ``ComplianceViolation`` when guard is active and output was blocked."""
        if self._guard and not result.get("allowed", True):
            raise ComplianceViolation(
                message=f"Blocked by AgentAudit guardrail ({action}): {result.get('violations', [])}",
                violations=result.get("violations", []),
                severity=result.get("severity", "critical"),
            )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _warn_api_failure(self, op: str, exc: Exception) -> None:
        """Emit a visible warning so silent failures are discoverable."""
        warnings.warn(
            f"AgentAudit {op} failed: {exc}. "
            f"Check your API key, network, and base_url. "
            f"fail_open={self._fail_open} → guard will {'PASS' if self._fail_open else 'RAISE'}. "
            f"Circuit: {self._circuit.state.value}.",
            IntegrationWarning,
            stacklevel=3,
        )

    def _warn_circuit_open(self, op: str) -> None:
        """Warn when the circuit breaker is open."""
        warnings.warn(
            f"AgentAudit {op} skipped: circuit breaker is OPEN. "
            f"API calls paused; will retry automatically after timeout.",
            IntegrationWarning,
            stacklevel=3,
        )

    # ------------------------------------------------------------------
    # Public control methods
    # ------------------------------------------------------------------

    def flush(self) -> None:
        """Force-flush any pending batched logs.  Call before process exit."""
        self._flush_batch(force=True)
        self._emit_telemetry()

    @property
    def telemetry(self) -> TelemetrySnapshot:
        """Current telemetry snapshot."""
        total = max(self._requests_total, 1)
        return TelemetrySnapshot(
            requests_total=self._requests_total,
            requests_failed=self._requests_failed,
            requests_blocked=self._requests_blocked,
            avg_latency_ms=round(self._latency_acc / total * 1000, 2),
            circuit_state=self._circuit.state.value,
        )
