"""
Shared base for all AgentAudit Python integrations.

Provides:
- A reusable ``BaseIntegration`` class that wraps the ``AgentAudit`` SDK client
- Consistent, safe error handling that **always warns** when the API is unreachable
- Configurable ``fail_open`` behaviour (default ``True`` so guard errors don't crash the app)
- Trace state helpers used by LangChain, OpenAI, and any future integration

Usage::

    class MyIntegration(BaseIntegration):
        def my_method(self, text: str) -> str:
            log = self._submit_log(
                action="my_event",
                response=text,
            )
            self._update_span(log.id)
            return text

If the AgentAudit API is down or misconfigured a :class:`IntegrationWarning`
is emitted to the parent application's log output.
"""

from __future__ import annotations

import warnings
from typing import Any, Dict, Optional
from agentaudit import AgentAudit


class IntegrationWarning(UserWarning):
    """Warning emitted when an integration cannot reach the AgentAudit API."""


class ComplianceViolation(Exception):
    """Raised when an output is blocked by a real-time guardrail.

    Attributes:
        violations: The compliance flag strings that triggered the block.
        severity: ``'warning'`` or ``'critical'``.
    """

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
        When ``True`` the integration raises :class:`ComplianceViolation` for
        blocked outputs.  When ``False`` events are only logged.
    fail_open:
        When ``True`` (default) a guardrail *failure* — e.g. the AgentAudit API
        is unreachable or times out — is treated as ``allowed``.  When ``False``
        the exception is re-raised so the caller can decide what to do.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://api.agentaudit.io/api/v1",
        guard: bool = True,
        fail_open: bool = True,
    ):
        self.client = AgentAudit(api_key=api_key, base_url=base_url)
        self.guard = guard
        self.fail_open = fail_open

        # Trace state
        self._trace_id: Optional[str] = None
        self._root_span_id: Optional[str] = None
        self._current_span_id: Optional[str] = None

    # ------------------------------------------------------------------
    # Trace helpers
    # ------------------------------------------------------------------

    @property
    def trace_id(self) -> Optional[str]:
        """The active trace ID for the current execution."""
        return self._trace_id

    def _reset_trace(self) -> None:
        """Reset all trace state.  Call this at the end of a chain / crew."""
        self._trace_id = None
        self._root_span_id = None
        self._current_span_id = None

    def _update_span(self, span_id: Optional[str]) -> None:
        """Update the current span ID so the next child gets linked."""
        if span_id is not None:
            self._current_span_id = span_id

    # ------------------------------------------------------------------
    # Submissions
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

        Returns ``None`` on failure *after* emitting a :class:`IntegrationWarning`.
        """
        try:
            log = self.client.log(
                action=action,
                agent_id=agent_id,
                prompt=prompt,
                response=response,
                metadata=metadata,
                trace_id=trace_id,
                parent_span_id=parent_span_id,
            )
            return {"id": log.id} if log else None
        except Exception as exc:
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
        - ``fail_open=True`` → returns ``{"allowed": True}`` after warning.
        - ``fail_open=False`` → re-raises the original exception.
        """
        try:
            result = self.client.guardrail(
                action=action,
                agent_id=agent_id,
                prompt=prompt,
                response=response,
                metadata=metadata,
                trace_id=trace_id,
                parent_span_id=parent_span_id,
            )
            # Normalise to a plain dict so callers don't couple to SDK internals
            return {
                "allowed": result.allowed,
                "action": result.action,
                "violations": result.violations,
                "severity": result.severity,
                "audit_log_id": result.audit_log_id,
            }
        except Exception as exc:
            self._warn_api_failure("guardrail", exc)
            if self.fail_open:
                return {"allowed": True, "action": "allow", "violations": [], "severity": "warning"}
            raise

    def _maybe_raise(self, result: Dict[str, Any], action: str) -> None:
        """Raise :class:`ComplianceViolation` when guard is active and output was blocked."""
        if self.guard and not result.get("allowed", True):
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
            f"fail_open={self.fail_open} → guard will {'PASS' if self.fail_open else 'RAISE'}.",
            IntegrationWarning,
            stacklevel=3,
        )
