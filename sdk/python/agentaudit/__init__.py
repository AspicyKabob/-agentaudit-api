"""
AgentAudit Python SDK — Production-ready audit logging for AI agents.
"""

from __future__ import annotations

import os
import time
import logging
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


logger = logging.getLogger("agentaudit")


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------

class AgentAuditError(Exception):
    """Base exception for all AgentAudit SDK errors."""


class AuthenticationError(AgentAuditError):
    """Raised when API key is invalid or missing."""


class RateLimitError(AgentAuditError):
    """Raised when rate limit is exceeded."""


class ServerError(AgentAuditError):
    """Raised when the AgentAudit server returns 5xx."""


class TimeoutError(AgentAuditError):
    """Raised when the request times out."""


class ValidationError(AgentAuditError):
    """Raised when the request payload is invalid (4xx, not 401/429)."""


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class AuditLog:
    """Represents an audit log entry."""

    id: str
    action: str
    agent_id: Optional[str]
    prompt: Optional[str]
    response: Optional[str]
    metadata: Optional[Dict[str, Any]]
    compliance_flags: List[str]
    created_at: str


@dataclass
class Agent:
    """Represents a registered agent."""

    id: str
    name: str
    type: str
    description: Optional[str] = None
    config: Optional[Dict[str, Any]] = None
    created_at: str = ""
    updated_at: str = ""


@dataclass
class Policy:
    """Represents a reusable compliance policy."""

    id: str
    name: str
    is_active: bool
    source_pack_id: Optional[str] = None
    description: Optional[str] = None
    rules: Optional[List[Dict[str, Any]]] = None
    agents: Optional[List[Dict[str, Any]]] = None
    created_at: Optional[str] = None


@dataclass
class AgentPolicy:
    """Represents a policy assignment to an agent."""

    id: str
    agent_id: str
    policy_id: str
    created_at: str = ""


@dataclass
class ComplianceRule:
    """Represents a compliance rule."""

    id: str
    name: str
    rule_type: str
    condition: Dict[str, Any]
    severity: str
    is_active: bool
    policy_id: Optional[str] = None
    pack_id: Optional[str] = None
    created_at: str = ""


@dataclass
class GuardrailResult:
    """Result of a compliance guardrail check."""

    allowed: bool
    action: str
    violations: List[str]
    severity: str
    audit_log_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Retry policy
# ---------------------------------------------------------------------------

_DEFAULT_RETRY_TOTAL = 3
_DEFAULT_RETRY_BACKOFF = 1.0
_DEFAULT_RETRY_BACKOFF_MAX = 30.0
_DEFAULT_TIMEOUT = 10.0


def _make_retry(
    total: int = _DEFAULT_RETRY_TOTAL,
    backoff_factor: float = _DEFAULT_RETRY_BACKOFF,
    backoff_max: float = _DEFAULT_RETRY_BACKOFF_MAX,
) -> Retry:
    """Build a ``urllib3.Retry`` policy that retries on 429, 502, 503, 504."""
    return Retry(
        total=total,
        backoff_factor=backoff_factor,
        status_forcelist=[429, 502, 503, 504],
        allowed_methods=["HEAD", "GET", "POST"],
        raise_on_status=False,
        respect_retry_after_header=True,
    )


# ---------------------------------------------------------------------------
# AgentAudit client
# ---------------------------------------------------------------------------

class AgentAudit:
    """
    Production-ready AgentAudit client.

    Supports retries with exponential backoff, configurable timeouts,
    connection pooling, and structured error handling.

    Parameters
    ----------
    api_key:
        Your AgentAudit API key.
    base_url:
        Custom AgentAudit API endpoint (defaults to production).
    agent_id:
        Default agent ID to attach to every log / guardrail call.
    timeout:
        Request timeout in seconds (default: 10).  Override via
        ``AGENTAUDIT_TIMEOUT`` env var.
    max_retries:
        Maximum retry attempts for transient failures (default: 3).  Override
        via ``AGENTAUDIT_MAX_RETRIES`` env var.
    retry_backoff:
        Initial backoff multiplier in seconds (default: 1.0).  Override via
        ``AGENTAUDIT_RETRY_BACKOFF`` env var.
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://agentaudit-api-production.up.railway.app/api/v1",
        agent_id: Optional[str] = None,
        timeout: Optional[float] = None,
        max_retries: Optional[int] = None,
        retry_backoff: Optional[float] = None,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.agent_id = agent_id

        # Resolve config from kwargs → env → defaults
        self._timeout = float(
            timeout
            if timeout is not None
            else os.getenv("AGENTAUDIT_TIMEOUT", _DEFAULT_TIMEOUT)
        )
        self._max_retries = int(
            max_retries
            if max_retries is not None
            else os.getenv("AGENTAUDIT_MAX_RETRIES", _DEFAULT_RETRY_TOTAL)
        )
        self._retry_backoff = float(
            retry_backoff
            if retry_backoff is not None
            else os.getenv("AGENTAUDIT_RETRY_BACKOFF", _DEFAULT_RETRY_BACKOFF)
        )

        # Configure session with retry adapter
        self.session = requests.Session()
        retry_strategy = _make_retry(
            total=self._max_retries,
            backoff_factor=self._retry_backoff,
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        self.session.mount(self.base_url, adapter)
        self.session.headers.update({
            "X-API-Key": api_key,
            "Content-Type": "application/json",
        })

        logger.debug(
            "AgentAudit client initialised: base_url=%s timeout=%s max_retries=%s",
            self.base_url,
            self._timeout,
            self._max_retries,
        )

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _request(self, method: str, path: str, **kwargs) -> requests.Response:
        """Execute an HTTP request with proper error handling."""
        url = f"{self.base_url}/{path.lstrip('/')}"
        kwargs.setdefault("timeout", self._timeout)

        try:
            resp = self.session.request(method, url, **kwargs)
        except requests.exceptions.Timeout as exc:
            raise TimeoutError(f"AgentAudit request timed out after {self._timeout}s: {exc}") from exc
        except requests.exceptions.ConnectionError as exc:
            raise AgentAuditError(f"Cannot connect to AgentAudit API: {exc}") from exc

        # Map HTTP status codes to typed exceptions
        if resp.status_code == 401:
            raise AuthenticationError("Invalid API key or missing authentication.")
        if resp.status_code == 429:
            raise RateLimitError("Rate limit exceeded. Please retry after the Retry-After header.")
        if 500 <= resp.status_code < 600:
            raise ServerError(f"AgentAudit server error ({resp.status_code}): {resp.text}")
        if 400 <= resp.status_code < 500:
            raise ValidationError(f"Request validation failed ({resp.status_code}): {resp.text}")

        resp.raise_for_status()
        return resp

    # ------------------------------------------------------------------
    # Guardrail
    # ------------------------------------------------------------------

    def guardrail(
        self,
        action: str,
        prompt: Optional[str] = None,
        response: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        agent_id: Optional[str] = None,
        trace_id: Optional[str] = None,
        parent_span_id: Optional[str] = None,
    ) -> GuardrailResult:
        """
        Real-time compliance check.  Intercepts agent output before delivery.

        Retries automatically on 429, 502, 503, 504 with exponential backoff.

        Usage::

            result = audit.guardrail(
                action="prompt_submitted",
                prompt=user_input,
                response=agent_output,
            )
            if not result.allowed:
                raise ValueError(f"Blocked: {result.violations}")
        """
        payload = {
            "action": action,
            "agentId": agent_id or self.agent_id,
            "checkType": "realtime",
        }
        if prompt is not None:
            payload["prompt"] = prompt
        if response is not None:
            payload["response"] = response
        if metadata is not None:
            payload["metadata"] = metadata
        if trace_id is not None:
            payload["traceId"] = trace_id
        if parent_span_id is not None:
            payload["parentSpanId"] = parent_span_id

        resp = self._request("POST", "/audit-logs", json=payload)
        data = resp.json()

        flags = data.get("complianceFlags", [])
        severity = "critical" if any("CRITICAL" in f for f in flags) else "warning"
        action_result = (
            "block" if severity == "critical" and flags else ("flag" if flags else "allow")
        )

        return GuardrailResult(
            allowed=action_result != "block",
            action=action_result,
            violations=flags,
            severity=severity,
            audit_log_id=data.get("id"),
        )

    # ------------------------------------------------------------------
    # Logging
    # ------------------------------------------------------------------

    def log(
        self,
        action: str,
        prompt: Optional[str] = None,
        response: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        agent_id: Optional[str] = None,
        trace_id: Optional[str] = None,
        parent_span_id: Optional[str] = None,
    ) -> AuditLog:
        """Submit an audit log entry.

        Returns the created :class:`AuditLog` object.
        """
        payload = {"action": action, "agentId": agent_id or self.agent_id}

        if prompt is not None:
            payload["prompt"] = prompt
        if response is not None:
            payload["response"] = response
        if metadata is not None:
            payload["metadata"] = metadata
        if trace_id is not None:
            payload["traceId"] = trace_id
        if parent_span_id is not None:
            payload["parentSpanId"] = parent_span_id

        resp = self._request("POST", "/audit-logs", json=payload)
        data = resp.json()

        return AuditLog(
            id=data["id"],
            action=data["action"],
            agent_id=data.get("agentId"),
            prompt=data.get("prompt"),
            response=data.get("response"),
            metadata=data.get("metadata"),
            compliance_flags=data.get("complianceFlags", []),
            created_at=data.get("createdAt"),
        )

    # ------------------------------------------------------------------
    # Batch / bulk operations
    # ------------------------------------------------------------------

    def log_batch(
        self,
        entries: List[Dict[str, Any]],
    ) -> List[AuditLog]:
        """Submit multiple audit logs in a single batch request.

        Each entry must be a dict compatible with the ``log()`` payload.
        The ``agentId`` on each entry falls back to the client's default.

        Usage::

            audit.log_batch([
                {
                    "action": "tool_start",
                    "prompt": "Query",
                    "metadata": {"tool": "search"},
                },
                {
                    "action": "tool_end",
                    "response": "Results",
                    "metadata": {"tool": "search"},
                },
            ])
        """
        if not entries:
            return []

        # Enforce default agent_id per entry
        for entry in entries:
            entry.setdefault("agentId", self.agent_id)

        resp = self._request("POST", "/audit-logs/batch", json=entries)
        data = resp.json()
        return [
            AuditLog(
                id=item["id"],
                action=item["action"],
                agent_id=item.get("agentId"),
                prompt=item.get("prompt"),
                response=item.get("response"),
                metadata=item.get("metadata"),
                compliance_flags=item.get("complianceFlags", []),
                created_at=item.get("createdAt"),
            )
            for item in data.get("data", [])
        ]

    def list_policies(self) -> List[Policy]:
        """List all policies for the organization."""
        resp = self._request("GET", "/policies")
        return [Policy(**item) for item in resp.json()]

    def create_policy(
        self,
        name: str,
        description: Optional[str] = None,
    ) -> Policy:
        """Create an empty compliance policy."""
        payload: Dict[str, Any] = {"name": name}
        if description is not None:
            payload["description"] = description

        resp = self._request("POST", "/policies", json=payload)
        data = resp.json()
        return Policy(**data)

    def get_policy(self, policy_id: str) -> Policy:
        """Get a single policy, including its rules and agent assignments."""
        resp = self._request("GET", f"/policies/{policy_id}")
        return Policy(**resp.json())

    def clone_pack(
        self,
        name: str,
        pack_id: str,
        description: Optional[str] = None,
    ) -> Policy:
        """Clone a pre-built compliance pack into a new policy."""
        payload: Dict[str, Any] = {"name": name, "packId": pack_id}
        if description is not None:
            payload["description"] = description

        resp = self._request("POST", "/policies/clone-pack", json=payload)
        return Policy(**resp.json())

    def assign_policy(self, policy_id: str, agent_id: str) -> AgentPolicy:
        """Assign a policy to an agent."""
        resp = self._request(
            "POST",
            f"/policies/{policy_id}/agents",
            json={"agentId": agent_id},
        )
        return AgentPolicy(**resp.json())

    def remove_policy(self, policy_id: str, agent_id: str) -> Dict[str, Any]:
        """Remove a policy assignment from an agent."""
        resp = self._request(
            "DELETE",
            f"/policies/{policy_id}/agents",
            json={"agentId": agent_id},
        )
        return resp.json()

    # ------------------------------------------------------------------
    # Agent registration
    # ------------------------------------------------------------------

    def register_agent(
        self,
        name: str,
        agent_type: str = "custom",
        description: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Register a new agent and return its metadata."""
        payload = {"name": name, "type": agent_type}
        if description:
            payload["description"] = description
        if config:
            payload["config"] = config

        resp = self._request("POST", "/agents", json=payload)
        return resp.json()

    # ------------------------------------------------------------------
    # Queries
    # ------------------------------------------------------------------

    def query_logs(
        self,
        action: Optional[str] = None,
        agent_id: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        page: int = 1,
        limit: int = 20,
    ) -> Dict[str, Any]:
        """Query audit logs with filters."""
        params: Dict[str, Any] = {"page": page, "limit": limit}
        if action:
            params["action"] = action
        if agent_id:
            params["agentId"] = agent_id
        if start_date:
            params["startDate"] = start_date
        if end_date:
            params["endDate"] = end_date

        resp = self._request("GET", "/audit-logs", params=params)
        return resp.json()

    def get_alerts(
        self,
        is_resolved: Optional[bool] = None,
        severity: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Get compliance alerts."""
        params: Dict[str, Any] = {}
        if is_resolved is not None:
            params["isResolved"] = str(is_resolved).lower()
        if severity:
            params["severity"] = severity

        resp = self._request("GET", "/alerts", params=params)
        return resp.json()

    # ------------------------------------------------------------------
    # Health check
    # ------------------------------------------------------------------

    def health_check(self) -> Dict[str, Any]:
        """Check API connectivity and return status."""
        resp = self._request("GET", "/health")
        return resp.json()


# ---------------------------------------------------------------------------
# Async client
# ---------------------------------------------------------------------------

class AgentAuditAsync:
    """Async variant of :class:`AgentAudit` for non-blocking guardrails.

    Drop-in for ``asyncio`` code bases.

    Usage::

        audit = AgentAuditAsync(api_key="aa_key")
        result = await audit.guardrail(
            action="prompt_submitted",
            prompt=user_input,
            response=agent_output,
        )
    """

    def __init__(
        self,
        api_key: str,
        base_url: str = "https://agentaudit-api-production.up.railway.app/api/v1",
        agent_id: Optional[str] = None,
        timeout: Optional[float] = None,
        max_retries: Optional[int] = None,
        retry_backoff: Optional[float] = None,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.agent_id = agent_id
        self._timeout = float(
            timeout
            if timeout is not None
            else os.getenv("AGENTAUDIT_TIMEOUT", _DEFAULT_TIMEOUT)
        )
        self._max_retries = int(
            max_retries
            if max_retries is not None
            else os.getenv("AGENTAUDIT_MAX_RETRIES", _DEFAULT_RETRY_TOTAL)
        )
        self._retry_backoff = float(
            retry_backoff
            if retry_backoff is not None
            else os.getenv("AGENTAUDIT_RETRY_BACKOFF", _DEFAULT_RETRY_BACKOFF)
        )

        # aiohttp or httpx not required — we delegate to a thread so the SDK
        # itself is zero-dep beyond ``requests``.
        import asyncio
        self._loop = asyncio.get_event_loop()
        self._executor = None  # lazy initialisation
        self._client = AgentAudit(
            api_key=api_key,
            base_url=base_url,
            agent_id=agent_id,
            timeout=self._timeout,
            max_retries=self._max_retries,
            retry_backoff=self._retry_backoff,
        )

    @property
    def _thread_pool(self):
        """Lazy thread-pool executor."""
        if self._executor is None:
            from concurrent.futures import ThreadPoolExecutor
            self._executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="agentaudit_async")
        return self._executor

    async def guardrail(self, **kwargs) -> GuardrailResult:
        """Async guardrail check — runs in a background thread."""
        return await self._loop.run_in_executor(
            self._thread_pool,
            lambda: self._client.guardrail(**kwargs),
        )

    async def log(self, **kwargs) -> AuditLog:
        """Async log submission — runs in a background thread."""
        return await self._loop.run_in_executor(
            self._thread_pool,
            lambda: self._client.log(**kwargs),
        )

    async def log_batch(self, **kwargs) -> List[AuditLog]:
        """Async batch log submission."""
        return await self._loop.run_in_executor(
            self._thread_pool,
            lambda: self._client.log_batch(**kwargs),
        )

    async def health_check(self) -> Dict[str, Any]:
        """Async health check."""
        return await self._loop.run_in_executor(
            self._thread_pool,
            self._client.health_check,
        )

    async def list_policies(self) -> List[Policy]:
        """Async list policies."""
        return await self._loop.run_in_executor(
            self._thread_pool,
            self._client.list_policies,
        )

    async def create_policy(self, **kwargs) -> Policy:
        """Async create policy."""
        return await self._loop.run_in_executor(
            self._thread_pool,
            lambda: self._client.create_policy(**kwargs),
        )

    async def get_policy(self, policy_id: str) -> Policy:
        """Async get policy."""
        return await self._loop.run_in_executor(
            self._thread_pool,
            lambda: self._client.get_policy(policy_id),
        )

    async def clone_pack(self, **kwargs) -> Policy:
        """Async clone pack to policy."""
        return await self._loop.run_in_executor(
            self._thread_pool,
            lambda: self._client.clone_pack(**kwargs),
        )

    async def assign_policy(self, policy_id: str, agent_id: str) -> AgentPolicy:
        """Async assign policy to agent."""
        return await self._loop.run_in_executor(
            self._thread_pool,
            lambda: self._client.assign_policy(policy_id, agent_id),
        )

    async def remove_policy(self, policy_id: str, agent_id: str) -> Dict[str, Any]:
        """Async remove policy from agent."""
        return await self._loop.run_in_executor(
            self._thread_pool,
            lambda: self._client.remove_policy(policy_id, agent_id),
        )


# ---------------------------------------------------------------------------
# Back-compat
# ---------------------------------------------------------------------------

class AgentAuditCallback:
    """Callback-style integration for frameworks that support callbacks."""

    def __init__(self, api_key: str, agent_id: Optional[str] = None):
        self.client = AgentAudit(api_key=api_key, agent_id=agent_id)

    def on_action(self, action: str, **kwargs):
        """Log an action with optional prompt / response / metadata."""
        return self.client.log(action=action, **kwargs)
