"""
OpenAI Integration for AgentAudit

Wraps the OpenAI client to automatically log all completions, chat completions,
and embeddings. Optionally enforces real-time guardrails on outputs.

Supports distributed tracing via ``trace_id`` and ``parent_span_id``.

Example (guardrails enabled)::

    from agentaudit_openai import AuditOpenAI

    client = AuditOpenAI(
        openai_api_key="sk-...",
        agentaudit_api_key="aa_your_key_here",
        agent_id="uuid-of-your-agent",
        guard=True  # default
    )

    response = client.chat_completions_create(
        model="gpt-4",
        messages=[{"role": "user", "content": "Hello!"}]
    )
    # If output violates a rule, raises ComplianceViolation

Example (logging only)::

    client = AuditOpenAI(
        openai_api_key="sk-...",
        agentaudit_api_key="aa_your_key_here",
        agent_id="uuid-of-your-agent",
        guard=False
    )

    # All calls are logged but never blocked
"""

import uuid
from typing import Any, Dict, List, Optional

import openai
from openai import OpenAI

from integrations.base import BaseIntegration, ComplianceViolation

__all__ = ["AuditOpenAI", "ComplianceViolation"]


class AuditOpenAI(BaseIntegration):
    """
    Wrapper around the OpenAI client that automatically submits audit logs
    and optionally enforces guardrails on every completion.

    Usage::

        client = AuditOpenAI(
            openai_api_key="sk-...",
            agentaudit_api_key="aa_key",
            agent_id="uuid",
            guard=True
        )

        response = client.chat_completions_create(
            model="gpt-4",
            messages=[{"role": "user", "content": "Hello!"}]
        )
    """

    def __init__(
        self,
        openai_api_key: str,
        agentaudit_api_key: str,
        agent_id: Optional[str] = None,
        base_url: str = "https://api.agentaudit.io/api/v1",
        guard: bool = True,
        fail_open: bool = True,
    ):
        super().__init__(
            api_key=agentaudit_api_key,
            base_url=base_url,
            guard=guard,
            fail_open=fail_open,
        )
        self.openai_client = OpenAI(api_key=openai_api_key)
        self.agent_id = agent_id

    def _start_trace(self, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Start a new distributed trace."""
        self._trace_id = str(uuid.uuid4())
        log = self._submit_log(
            action="openai_trace_start",
            agent_id=self.agent_id,
            metadata=metadata,
            trace_id=self._trace_id,
        )
        self._root_span_id = log.get("id") if log else None
        self._current_span_id = self._root_span_id

    def chat_completions_create(
        self, model: str, messages: List[Dict[str, str]], **kwargs
    ) -> Any:
        """
        Wrap ``openai.chat.completions.create`` with audit logging and guardrails.

        Usage::

            response = client.chat_completions_create(
                model="gpt-4",
                messages=[{"role": "user", "content": "Hello!"}]
            )
        """
        if not self._trace_id:
            self._start_trace(metadata={"model": model, "type": "chat"})

        prompt_text = "\n".join([f"{m['role']}: {m['content']}" for m in messages])
        log = self._submit_log(
            action="openai_chat_start",
            agent_id=self.agent_id,
            prompt=prompt_text,
            metadata={"model": model, "type": "chat", "event": "chat_start"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        self._update_span(log.get("id") if log else None)

        response = self.openai_client.chat.completions.create(
            model=model, messages=messages, **kwargs
        )

        output_text = response.choices[0].message.content if response.choices else ""
        token_usage = response.usage.model_dump() if response.usage else {}

        if self.guard:
            result = self._submit_guardrail(
                action="openai_chat_end",
                agent_id=self.agent_id,
                response=output_text,
                metadata={"model": model, "type": "chat", "token_usage": token_usage, "event": "chat_end"},
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )
            self._maybe_raise(result, action="openai_chat_end")
        else:
            self._submit_log(
                action="openai_chat_end",
                agent_id=self.agent_id,
                response=output_text,
                metadata={"model": model, "type": "chat", "token_usage": token_usage, "event": "chat_end"},
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )

        return response

    def completions_create(self, model: str, prompt: str, **kwargs) -> Any:
        """
        Wrap ``openai.completions.create`` with audit logging and guardrails.

        Usage::

            response = client.completions_create(
                model="gpt-3.5-turbo-instruct",
                prompt="Hello!"
            )
        """
        if not self._trace_id:
            self._start_trace(metadata={"model": model, "type": "completion"})

        log = self._submit_log(
            action="openai_completion_start",
            agent_id=self.agent_id,
            prompt=prompt,
            metadata={"model": model, "type": "completion", "event": "completion_start"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        self._update_span(log.get("id") if log else None)

        response = self.openai_client.completions.create(
            model=model, prompt=prompt, **kwargs
        )

        output_text = response.choices[0].text if response.choices else ""
        token_usage = response.usage.model_dump() if response.usage else {}

        if self.guard:
            result = self._submit_guardrail(
                action="openai_completion_end",
                agent_id=self.agent_id,
                response=output_text,
                metadata={"model": model, "type": "completion", "token_usage": token_usage, "event": "completion_end"},
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )
            self._maybe_raise(result, action="openai_completion_end")
        else:
            self._submit_log(
                action="openai_completion_end",
                agent_id=self.agent_id,
                response=output_text,
                metadata={"model": model, "type": "completion", "token_usage": token_usage, "event": "completion_end"},
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )

        return response

    def embeddings_create(
        self, input: List[str], model: str = "text-embedding-ada-002", **kwargs
    ) -> Any:
        """
        Wrap ``openai.embeddings.create`` with audit logging.

        .. note::

            Guardrails are not applied to embeddings — they are low-risk
            vector outputs.

        Usage::

            response = client.embeddings_create(
                input=["Hello world"],
                model="text-embedding-ada-002"
            )
        """
        if not self._trace_id:
            self._start_trace(metadata={"model": model, "type": "embedding"})

        log = self._submit_log(
            action="openai_embedding_start",
            agent_id=self.agent_id,
            prompt=str(input),
            metadata={"model": model, "type": "embedding", "event": "embedding_start"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        self._update_span(log.get("id") if log else None)

        response = self.openai_client.embeddings.create(
            input=input, model=model, **kwargs
        )

        self._submit_log(
            action="openai_embedding_end",
            agent_id=self.agent_id,
            metadata={"model": model, "type": "embedding", "event": "embedding_end"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )

        return response
