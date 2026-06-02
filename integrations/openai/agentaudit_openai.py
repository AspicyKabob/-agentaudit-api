"""
OpenAI Integration for AgentAudit

Wraps the OpenAI client to automatically log all completions, chat completions,
and embeddings. Optionally enforces real-time guardrails on outputs.

Supports distributed tracing via trace_id and parent_span_id.

Example (guardrails enabled):
    from agentaudit_openai import AuditOpenAI

    client = AuditOpenAI(
        openai_api_key="sk-...",
        agentaudit_api_key="aa_your_key_here",
        agent_id="uuid-of-your-agent",
        guard=True  # default
    )

    response = client.chat.completions.create(
        model="gpt-4",
        messages=[{"role": "user", "content": "Hello!"}]
    )
    # If output violates a rule, raises ComplianceViolation

Example (logging only):
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


class ComplianceViolation(Exception):
    """Raised when an OpenAI output violates a compliance rule."""

    def __init__(self, message: str, violations: list, severity: str = "critical"):
        super().__init__(message)
        self.violations = violations
        self.severity = severity


class AuditOpenAI:
    """
    Wrapper around the OpenAI client that automatically submits audit logs
    and optionally enforces guardrails on every completion.

    Usage:
        client = AuditOpenAI(
            openai_api_key="sk-...",
            agentaudit_api_key="aa_key",
            agent_id="uuid",
            guard=True
        )

        response = client.chat.completions.create(model="gpt-4", messages=[...])
    """

    def __init__(
        self,
        openai_api_key: str,
        agentaudit_api_key: str,
        agent_id: Optional[str] = None,
        base_url: str = "https://api.agentaudit.io/api/v1",
        guard: bool = True,
    ):
        self.client = OpenAI(api_key=openai_api_key)
        self.agent_id = agent_id
        self.base_url = base_url.rstrip("/")
        self.guard = guard

        # Trace state
        self._trace_id: Optional[str] = None
        self._root_span_id: Optional[str] = None
        self._current_span_id: Optional[str] = None

        import requests
        self.session = requests.Session()
        self.session.headers.update({
            "X-API-Key": agentaudit_api_key,
            "Content-Type": "application/json"
        })

    def _start_trace(self, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Start a new distributed trace."""
        self._trace_id = str(uuid.uuid4())
        log = self._submit_log(
            action="openai_trace_start",
            metadata=metadata,
            trace_id=self._trace_id,
        )
        self._root_span_id = log.get("id") if log else None
        self._current_span_id = self._root_span_id

    def _submit_log(
        self,
        action: str,
        prompt: Optional[str] = None,
        response: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        trace_id: Optional[str] = None,
        parent_span_id: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Submit an audit log to the AgentAudit API."""
        payload: Dict[str, Any] = {"action": action}

        if self.agent_id:
            payload["agentId"] = self.agent_id
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

        try:
            resp = self.session.post(
                f"{self.base_url}/audit-logs",
                json=payload,
                timeout=5,
            )
            resp.raise_for_status()
            return resp.json()
        except Exception:
            return None

    def _submit_guardrail(
        self,
        action: str,
        prompt: Optional[str] = None,
        response: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        trace_id: Optional[str] = None,
        parent_span_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Submit via guardrail endpoint and return result dict."""
        payload: Dict[str, Any] = {
            "action": action,
            "checkType": "realtime",
        }

        if self.agent_id:
            payload["agentId"] = self.agent_id
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

        try:
            resp = self.session.post(
                f"{self.base_url}/audit-logs",
                json=payload,
                timeout=5,
            )
            resp.raise_for_status()
            data = resp.json()
            flags = data.get("complianceFlags", [])
            severity = "critical" if any("CRITICAL" in f for f in flags) else "warning"
            action_result = "block" if severity == "critical" and flags else ("flag" if flags else "allow")
            return {
                "allowed": action_result != "block",
                "action": action_result,
                "violations": flags,
                "severity": severity,
                "auditLogId": data.get("id"),
            }
        except Exception as e:
            return {"allowed": True, "action": "allow", "violations": [], "severity": "warning", "error": str(e)}

    def _maybe_raise(self, result: Dict[str, Any], action: str) -> None:
        """Raise ComplianceViolation when guard=True and result is blocked."""
        if self.guard and not result.get("allowed", True):
            raise ComplianceViolation(
                message=f"Blocked by AgentAudit guardrail: {result.get('violations', [])}",
                violations=result.get("violations", []),
                severity=result.get("severity", "critical"),
            )

    def chat_completions_create(self, model: str, messages: List[Dict[str, str]], **kwargs) -> Any:
        """
        Wraps openai.chat.completions.create with audit logging and guardrails.

        Usage:
            response = client.chat_completions_create(
                model="gpt-4",
                messages=[{"role": "user", "content": "Hello!"}]
            )
        """
        if not self._trace_id:
            self._start_trace(metadata={"model": model, "type": "chat"})

        # Log input
        prompt_text = "\n".join([f"{m['role']}: {m['content']}" for m in messages])
        log = self._submit_log(
            action="openai_chat_start",
            prompt=prompt_text,
            metadata={"model": model, "type": "chat", "event": "chat_start"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        if log:
            self._current_span_id = log.get("id")

        # Call OpenAI
        response = self.client.chat.completions.create(
            model=model,
            messages=messages,
            **kwargs
        )

        # Log output
        output_text = response.choices[0].message.content if response.choices else ""
        token_usage = response.usage.model_dump() if response.usage else {}

        if self.guard:
            result = self._submit_guardrail(
                action="openai_chat_end",
                response=output_text,
                metadata={"model": model, "type": "chat", "token_usage": token_usage, "event": "chat_end"},
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )
            self._maybe_raise(result, action="openai_chat_end")
        else:
            self._submit_log(
                action="openai_chat_end",
                response=output_text,
                metadata={"model": model, "type": "chat", "token_usage": token_usage, "event": "chat_end"},
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )

        return response

    def completions_create(self, model: str, prompt: str, **kwargs) -> Any:
        """
        Wraps openai.completions.create with audit logging and guardrails.

        Usage:
            response = client.completions_create(
                model="gpt-3.5-turbo-instruct",
                prompt="Hello!"
            )
        """
        if not self._trace_id:
            self._start_trace(metadata={"model": model, "type": "completion"})

        # Log input
        log = self._submit_log(
            action="openai_completion_start",
            prompt=prompt,
            metadata={"model": model, "type": "completion", "event": "completion_start"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        if log:
            self._current_span_id = log.get("id")

        # Call OpenAI
        response = self.client.completions.create(
            model=model,
            prompt=prompt,
            **kwargs
        )

        # Log output
        output_text = response.choices[0].text if response.choices else ""
        token_usage = response.usage.model_dump() if response.usage else {}

        if self.guard:
            result = self._submit_guardrail(
                action="openai_completion_end",
                response=output_text,
                metadata={"model": model, "type": "completion", "token_usage": token_usage, "event": "completion_end"},
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )
            self._maybe_raise(result, action="openai_completion_end")
        else:
            self._submit_log(
                action="openai_completion_end",
                response=output_text,
                metadata={"model": model, "type": "completion", "token_usage": token_usage, "event": "completion_end"},
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )

        return response

    def embeddings_create(self, input: List[str], model: str = "text-embedding-ada-002", **kwargs) -> Any:
        """
        Wraps openai.embeddings.create with audit logging.

        Note: Guardrails are not applied to embeddings as they are
        low-risk vector outputs.

        Usage:
            response = client.embeddings_create(
                input=["Hello world"],
                model="text-embedding-ada-002"
            )
        """
        if not self._trace_id:
            self._start_trace(metadata={"model": model, "type": "embedding"})

        # Log input
        log = self._submit_log(
            action="openai_embedding_start",
            prompt=str(input),
            metadata={"model": model, "type": "embedding", "event": "embedding_start"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        if log:
            self._current_span_id = log.get("id")

        # Call OpenAI
        response = self.client.embeddings.create(
            input=input,
            model=model,
            **kwargs
        )

        # Log output (no guardrail for embeddings)
        self._submit_log(
            action="openai_embedding_end",
            metadata={"model": model, "type": "embedding", "event": "embedding_end"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )

        return response
