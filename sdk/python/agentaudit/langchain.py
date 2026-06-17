"""
LangChain callback handler for AgentAudit.

Drop the handler into any LangChain chain, LLM, tool, or agent and every step
is automatically audited with trace propagation. Guardrails block violations
before output reaches the next link.

Example::

    from agentaudit import AgentAuditCallbackHandler
    from langchain_openai import ChatOpenAI

    handler = AgentAuditCallbackHandler(
        api_key="aa_your_key_here",
        agent_id="uuid-of-your-agent",
        guard=True,
    )

    llm = ChatOpenAI(callbacks=[handler])
    llm.invoke("What is the weather?")

    # Inspect the distributed trace after execution
    print(handler.trace_id)

The handler uses ``langchain_core`` APIs and works with LangChain >=0.2.0.
Install it with the optional dependency::

    pip install agentaudit-client[langchain]
"""

from __future__ import annotations

import uuid
from typing import Any, Dict, List, Optional

from agentaudit import AgentAudit, GuardrailResult


try:
    from langchain_core.callbacks import BaseCallbackHandler
    from langchain_core.outputs import LLMResult
except ImportError as exc:
    raise ImportError(
        "The LangChain callback handler requires langchain-core. "
        "Install it with: pip install agentaudit-client[langchain]"
    ) from exc


__all__ = ["AgentAuditCallbackHandler"]


class ComplianceViolation(Exception):
    """Raised when an output is blocked by a real-time guardrail."""

    def __init__(self, message: str, violations: List[str], severity: str = "critical"):
        super().__init__(message)
        self.violations = violations
        self.severity = severity


class AgentAuditCallbackHandler(BaseCallbackHandler):
    """
    LangChain callback handler that submits audit logs and optionally enforces
    real-time guardrails on every LLM call, tool execution, and chain run.

    The handler is stateful per instance: start a fresh instance for each
    independent trace to avoid leaking ``trace_id`` across runs.
    """

    def __init__(
        self,
        api_key: str,
        agent_id: Optional[str] = None,
        base_url: str = "https://agentaudit-api-production.up.railway.app/api/v1",
        guard: bool = True,
        fail_open: bool = True,
    ):
        super().__init__()
        self._client = AgentAudit(api_key=api_key, base_url=base_url, agent_id=agent_id)
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
        """Start a new distributed trace."""
        self._trace_id = str(uuid.uuid4())
        log = self._client.log(
            action="langchain_trace_start",
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
        """Submit a guardrail check when guarding, otherwise a plain audit log."""
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
            return result
        self._client.log(
            action=action,
            prompt=prompt,
            response=response,
            metadata=metadata,
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        return None

    # ------------------------------------------------------------------
    # LLM lifecycle
    # ------------------------------------------------------------------

    def on_llm_start(
        self,
        serialized: Dict[str, Any],
        prompts: List[str],
        **kwargs: Any,
    ) -> None:
        if not self._trace_id:
            self._start_trace(metadata={"model": _extract_model(serialized)})

        log = self._client.log(
            action="llm_start",
            prompt="\n".join(prompts),
            metadata={"model": _extract_model(serialized), "event": "llm_start"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        self._update_span(log.id)

    def on_chat_model_start(
        self,
        serialized: Dict[str, Any],
        messages: List[List[Any]],
        **kwargs: Any,
    ) -> None:
        if not self._trace_id:
            self._start_trace(metadata={"model": _extract_model(serialized)})

        # Render messages to a compact string without forcing heavy deps
        prompt = _stringify_messages(messages)
        log = self._client.log(
            action="llm_start",
            prompt=prompt,
            metadata={"model": _extract_model(serialized), "event": "chat_model_start"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        self._update_span(log.id)

    def on_llm_end(
        self,
        response: LLMResult,
        **kwargs: Any,
    ) -> None:
        outputs = [gen.text for gen_list in response.generations for gen in gen_list]
        output_text = "\n".join(outputs)
        token_usage = _extract_token_usage(response)

        self._guard_or_log(
            action="llm_end",
            prompt=None,
            response=output_text,
            metadata={"token_usage": token_usage, "event": "llm_end"},
        )

    def on_llm_error(
        self,
        error: BaseException,
        **kwargs: Any,
    ) -> None:
        self._client.log(
            action="llm_error",
            response=str(error),
            metadata={"event": "llm_error"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )

    # ------------------------------------------------------------------
    # Chain lifecycle
    # ------------------------------------------------------------------

    def on_chain_start(
        self,
        serialized: Dict[str, Any],
        inputs: Dict[str, Any],
        **kwargs: Any,
    ) -> None:
        if not self._trace_id:
            self._start_trace(metadata={"chain": serialized.get("name", "unknown")})

        log = self._client.log(
            action="chain_start",
            prompt=str(inputs),
            metadata={"chain": serialized.get("name", "unknown"), "event": "chain_start"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        self._update_span(log.id)

    def on_chain_end(
        self,
        outputs: Dict[str, Any],
        **kwargs: Any,
    ) -> None:
        self._guard_or_log(
            action="chain_end",
            response=str(outputs),
            metadata={"event": "chain_end"},
        )

    def on_chain_error(
        self,
        error: BaseException,
        **kwargs: Any,
    ) -> None:
        self._client.log(
            action="chain_error",
            response=str(error),
            metadata={"event": "chain_error"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )

    # ------------------------------------------------------------------
    # Tool lifecycle
    # ------------------------------------------------------------------

    def on_tool_start(
        self,
        serialized: Dict[str, Any],
        input_str: str,
        **kwargs: Any,
    ) -> None:
        if not self._trace_id:
            self._start_trace()

        log = self._client.log(
            action="tool_start",
            prompt=input_str,
            metadata={"tool": serialized.get("name", "unknown"), "event": "tool_start"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        self._update_span(log.id)

    def on_tool_end(
        self,
        output: Any,
        **kwargs: Any,
    ) -> None:
        self._guard_or_log(
            action="tool_end",
            response=str(output),
            metadata={"event": "tool_end"},
        )

    def on_tool_error(
        self,
        error: BaseException,
        **kwargs: Any,
    ) -> None:
        self._client.log(
            action="tool_error",
            response=str(error),
            metadata={"event": "tool_error"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )

    # ------------------------------------------------------------------
    # Agent lifecycle
    # ------------------------------------------------------------------

    def on_agent_action(
        self,
        action: Any,
        **kwargs: Any,
    ) -> None:
        if not self._trace_id:
            self._start_trace()

        log = self._client.log(
            action="agent_action",
            prompt=getattr(action, "log", ""),
            metadata={
                "tool": getattr(action, "tool", "unknown"),
                "tool_input": str(getattr(action, "tool_input", "")),
                "event": "agent_action",
            },
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        self._update_span(log.id)

    def on_agent_finish(
        self,
        finish: Any,
        **kwargs: Any,
    ) -> None:
        output_text = ""
        if hasattr(finish, "return_values"):
            output_text = str(finish.return_values.get("output", ""))

        metadata: Dict[str, Any] = {"event": "agent_finish"}
        if hasattr(finish, "log"):
            metadata["log"] = finish.log

        self._guard_or_log(
            action="agent_finish",
            response=output_text,
            metadata=metadata,
        )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _extract_model(serialized: Dict[str, Any]) -> str:
    """Best-effort extraction of the model name from serialized kwargs."""
    model = serialized.get("kwargs", {}).get("model")
    if isinstance(model, str):
        return model
    id_path = serialized.get("id", [])
    if isinstance(id_path, list) and id_path:
        return id_path[-1]
    return "unknown"


def _stringify_messages(messages: List[List[Any]]) -> str:
    """Convert LangChain message objects to a compact string."""
    lines: List[str] = []
    for conversation in messages:
        for message in conversation:
            if isinstance(message, str):
                lines.append(message)
            elif hasattr(message, "content"):
                role = getattr(message, "type", "message")
                lines.append(f"{role}: {message.content}")
            else:
                lines.append(str(message))
    return "\n".join(lines)


def _extract_token_usage(response: LLMResult) -> Dict[str, Any]:
    """Extract token usage from LLMResult, preferring standardized metadata."""
    # Prefer modern AIMessage.usage_metadata
    try:
        generation = response.generations[0][0]
        message = getattr(generation, "message", None)
        if message is not None:
            usage_metadata = getattr(message, "usage_metadata", None)
            if isinstance(usage_metadata, dict):
                return {
                    "prompt_tokens": usage_metadata.get("input_tokens", 0),
                    "completion_tokens": usage_metadata.get("output_tokens", 0),
                    "total_tokens": usage_metadata.get("total_tokens", 0),
                }
    except (IndexError, AttributeError):
        pass

    # Fall back to legacy llm_output token_usage
    llm_output = response.llm_output or {}
    token_usage = llm_output.get("token_usage", {})
    if isinstance(token_usage, dict):
        return {
            "prompt_tokens": token_usage.get("prompt_tokens", 0),
            "completion_tokens": token_usage.get("completion_tokens", 0),
            "total_tokens": token_usage.get("total_tokens", 0),
        }

    # Some providers place usage directly on llm_output
    if isinstance(llm_output, dict):
        return {
            "prompt_tokens": llm_output.get("prompt_tokens", 0),
            "completion_tokens": llm_output.get("completion_tokens", 0),
            "total_tokens": llm_output.get("total_tokens", 0),
        }

    return {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
    }
