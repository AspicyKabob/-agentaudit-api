"""
OpenAI integration for AgentAudit Python SDK.

Wraps the OpenAI client to automatically log completions, chat completions,
and embeddings. Optionally enforces real-time guardrails on outputs.

Example (guardrails enabled)::

    from agentaudit import AgentAuditOpenAI

    client = AgentAuditOpenAI(
        openai_api_key="sk-...",
        api_key="aa_your_key_here",
        agent_id="uuid-of-your-agent",
        guard=True,  # default
    )

    response = client.chat_completions_create(
        model="gpt-4",
        messages=[{"role": "user", "content": "Hello!"}],
    )

Example (logging only)::

    client = AgentAuditOpenAI(
        openai_api_key="sk-...",
        api_key="aa_key",
        agent_id="uuid-of-your-agent",
        guard=False,
    )
"""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from agentaudit import AgentAudit, GuardrailResult

try:
    import openai
    from openai import OpenAI
except ImportError as exc:
    raise ImportError(
        "The OpenAI integration requires the openai package. "
        "Install it with: pip install agentaudit-client[openai]"
    ) from exc


__all__ = ["AgentAuditOpenAI", "ComplianceViolation"]


class ComplianceViolation(Exception):
    """Raised when an output is blocked by a real-time guardrail."""

    def __init__(self, message: str, violations: List[str], severity: str = "critical"):
        super().__init__(message)
        self.violations = violations
        self.severity = severity


class AgentAuditOpenAI:
    """
    Wrapper around the OpenAI client that automatically submits audit logs
    and optionally enforces guardrails on every completion.
    """

    def __init__(
        self,
        openai_api_key: str,
        api_key: str,
        agent_id: Optional[str] = None,
        base_url: str = "https://agentaudit-api-production.up.railway.app/api/v1",
        guard: bool = True,
        fail_open: bool = True,
    ):
        self._client = AgentAudit(api_key=api_key, base_url=base_url, agent_id=agent_id)
        self._openai = OpenAI(api_key=openai_api_key)
        self._guard = guard
        self._fail_open = fail_open
        self._trace_id: Optional[str] = None
        self._root_span_id: Optional[str] = None
        self._current_span_id: Optional[str] = None

    @property
    def trace_id(self) -> Optional[str]:
        """Active trace ID for the current execution."""
        return self._trace_id

    def _start_trace(self, metadata: Optional[Dict[str, Any]] = None) -> None:
        self._trace_id = str(uuid.uuid4())
        log = self._client.log(
            action="openai_trace_start",
            metadata=metadata,
            trace_id=self._trace_id,
        )
        self._root_span_id = log.id
        self._current_span_id = self._root_span_id

    def _update_span(self, span_id: Optional[str]) -> None:
        if span_id is not None:
            self._current_span_id = span_id

    def _guard_or_log(
        self,
        action: str,
        response: Optional[str] = None,
        prompt: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[GuardrailResult]:
        if self._guard:
            result = self._client.guardrail(
                action=action,
                prompt=prompt,
                response=response,
                metadata=metadata,
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )
            if not result.allowed:
                raise ComplianceViolation(
                    message=f"Blocked by AgentAudit guardrail ({action}): {result.violations}",
                    violations=result.violations,
                    severity=result.severity,
                )
            self._update_span(result.audit_log_id)
            return result
        log = self._client.log(
            action=action,
            prompt=prompt,
            response=response,
            metadata=metadata,
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        self._update_span(log.id)
        return None

    def chat_completions_create(
        self, model: str, messages: List[Dict[str, str]], **kwargs: Any
    ) -> Any:
        """Wrap ``openai.chat.completions.create`` with audit logging and guardrails."""
        if not self._trace_id:
            self._start_trace(metadata={"model": model, "type": "chat"})

        prompt_text = "\n".join(f"{m.get('role', 'user')}: {m.get('content', '')}" for m in messages)
        start_log = self._client.log(
            action="openai_chat_start",
            prompt=prompt_text,
            metadata={"model": model, "type": "chat", "event": "chat_start"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        self._update_span(start_log.id)

        response = self._openai.chat.completions.create(model=model, messages=messages, **kwargs)

        output_text = response.choices[0].message.content if response.choices else ""
        token_usage = response.usage.model_dump() if response.usage else {}

        self._guard_or_log(
            action="openai_chat_end",
            response=output_text,
            metadata={"model": model, "type": "chat", "token_usage": token_usage, "event": "chat_end"},
        )

        return response

    def completions_create(self, model: str, prompt: str, **kwargs: Any) -> Any:
        """Wrap ``openai.completions.create`` with audit logging and guardrails."""
        if not self._trace_id:
            self._start_trace(metadata={"model": model, "type": "completion"})

        start_log = self._client.log(
            action="openai_completion_start",
            prompt=prompt,
            metadata={"model": model, "type": "completion", "event": "completion_start"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        self._update_span(start_log.id)

        response = self._openai.completions.create(model=model, prompt=prompt, **kwargs)

        output_text = response.choices[0].text if response.choices else ""
        token_usage = response.usage.model_dump() if response.usage else {}

        self._guard_or_log(
            action="openai_completion_end",
            response=output_text,
            metadata={"model": model, "type": "completion", "token_usage": token_usage, "event": "completion_end"},
        )

        return response

    def embeddings_create(
        self, input: List[str], model: str = "text-embedding-ada-002", **kwargs: Any
    ) -> Any:
        """Wrap ``openai.embeddings.create`` with audit logging."""
        if not self._trace_id:
            self._start_trace(metadata={"model": model, "type": "embedding"})

        start_log = self._client.log(
            action="openai_embedding_start",
            prompt=str(input),
            metadata={"model": model, "type": "embedding", "event": "embedding_start"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        self._update_span(start_log.id)

        response = self._openai.embeddings.create(input=input, model=model, **kwargs)

        self._client.log(
            action="openai_embedding_end",
            metadata={"model": model, "type": "embedding", "event": "embedding_end"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )

        return response
