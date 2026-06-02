"""
LangChain Callback Handler for AgentAudit

Automatically logs all LLM calls, tool executions, and chain runs.
Optionally enforces real-time guardrails — blocking outputs with compliance
violations before delivery.

Supports distributed tracing via ``trace_id`` and ``parent_span_id``.

Example (logging only)::

    from langchain.callbacks import AgentAuditCallbackHandler

    audit_handler = AgentAuditCallbackHandler(
        api_key="aa_your_key_here",
        agent_id="uuid-of-your-agent",
        guard=False
    )

    llm = OpenAI(callbacks=[audit_handler])
    llm.predict("What is the weather?")

Example (guardrails enabled)::

    audit_handler = AgentAuditCallbackHandler(
        api_key="aa_your_key_here",
        agent_id="uuid-of-your-agent",
        guard=True  # default
    )

    llm = OpenAI(callbacks=[audit_handler])
    llm.predict("What is the weather?")
    # If output violates a rule, raises ComplianceViolation
"""

import uuid
from typing import Any, Dict, List, Optional

from langchain.callbacks.base import BaseCallbackHandler
from langchain.schema import AgentAction, AgentFinish, LLMResult

from integrations.base import BaseIntegration, ComplianceViolation

__all__ = ["AgentAuditCallbackHandler", "ComplianceViolation"]


class AgentAuditCallbackHandler(BaseIntegration, BaseCallbackHandler):
    """
    LangChain callback handler that automatically submits audit logs
    and optionally enforces real-time guardrails on every LLM call,
    tool execution, and chain run.

    Trace Tracking
    --------------
    When ``guard=True`` the handler generates a trace ID in
    ``on_chain_start`` (or ``on_llm_start`` for single LLM calls) and
    propagates it to every subsequent event with ``parent_span_id``
    linking so the full chain can be queried later via
    ``GET /trace/:traceId`` or ``GET /audit-logs/:id/chain``.
    """

    def __init__(
        self,
        api_key: str,
        agent_id: Optional[str] = None,
        base_url: str = "https://api.agentaudit.io/api/v1",
        guard: bool = True,
        fail_open: bool = True,
    ):
        # BaseIntegration handles client, guard, fail_open, trace state
        BaseIntegration.__init__(self, api_key=api_key, base_url=base_url, guard=guard, fail_open=fail_open)
        BaseCallbackHandler.__init__(self)
        self.agent_id = agent_id

    def _start_trace(self, metadata: Optional[Dict[str, Any]] = None) -> None:
        """Start a new distributed trace."""
        self._trace_id = str(uuid.uuid4())
        log = self._submit_log(
            action="langchain_trace_start",
            metadata=metadata,
            trace_id=self._trace_id,
        )
        self._root_span_id = log.get("id") if log else None
        self._current_span_id = self._root_span_id

    # ------------------------------------------------------------------
    # LangChain callbacks
    # ------------------------------------------------------------------

    def on_llm_start(
        self,
        serialized: Dict[str, Any],
        prompts: List[str],
        **kwargs: Any,
    ) -> None:
        if not self._trace_id:
            self._start_trace(metadata={"model": serialized.get("id", ["unknown"])[-1]})

        log = self._submit_log(
            action="llm_start",
            agent_id=self.agent_id,
            prompt="\n".join(prompts),
            metadata={"model": serialized.get("id", ["unknown"])[-1], "event": "llm_start"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        self._update_span(log.get("id") if log else None)

    def on_llm_end(
        self,
        response: LLMResult,
        **kwargs: Any,
    ) -> None:
        outputs = [gen.text for gen_list in response.generations for gen in gen_list]
        output_text = "\n".join(outputs)
        token_usage = response.llm_output.get("token_usage", {}) if response.llm_output else {}

        if self.guard:
            result = self._submit_guardrail(
                action="llm_end",
                agent_id=self.agent_id,
                response=output_text,
                metadata={"token_usage": token_usage, "event": "llm_end"},
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )
            self._maybe_raise(result, action="llm_end")
        else:
            self._submit_log(
                action="llm_end",
                agent_id=self.agent_id,
                response=output_text,
                metadata={"token_usage": token_usage, "event": "llm_end"},
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )

    def on_tool_start(
        self,
        serialized: Dict[str, Any],
        input_str: str,
        **kwargs: Any,
    ) -> None:
        if not self._trace_id:
            self._start_trace()

        log = self._submit_log(
            action="tool_start",
            agent_id=self.agent_id,
            prompt=input_str,
            metadata={"tool": serialized.get("name", "unknown"), "event": "tool_start"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        self._update_span(log.get("id") if log else None)

    def on_tool_end(
        self,
        output: str,
        **kwargs: Any,
    ) -> None:
        output_text = str(output)

        if self.guard:
            result = self._submit_guardrail(
                action="tool_end",
                agent_id=self.agent_id,
                response=output_text,
                metadata={"event": "tool_end"},
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )
            self._maybe_raise(result, action="tool_end")
        else:
            self._submit_log(
                action="tool_end",
                agent_id=self.agent_id,
                response=output_text,
                metadata={"event": "tool_end"},
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )

    def on_chain_start(
        self,
        serialized: Dict[str, Any],
        inputs: Dict[str, Any],
        **kwargs: Any,
    ) -> None:
        if not self._trace_id:
            self._start_trace(metadata={"chain": serialized.get("name", "unknown")})

        log = self._submit_log(
            action="chain_start",
            agent_id=self.agent_id,
            prompt=str(inputs),
            metadata={"chain": serialized.get("name", "unknown"), "event": "chain_start"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        self._update_span(log.get("id") if log else None)

    def on_chain_end(
        self,
        outputs: Dict[str, Any],
        **kwargs: Any,
    ) -> None:
        output_text = str(outputs)

        if self.guard:
            result = self._submit_guardrail(
                action="chain_end",
                agent_id=self.agent_id,
                response=output_text,
                metadata={"event": "chain_end"},
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )
            self._maybe_raise(result, action="chain_end")
        else:
            self._submit_log(
                action="chain_end",
                agent_id=self.agent_id,
                response=output_text,
                metadata={"event": "chain_end"},
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )

    def on_agent_action(
        self,
        action: AgentAction,
        **kwargs: Any,
    ) -> None:
        if not self._trace_id:
            self._start_trace()

        log = self._submit_log(
            action="agent_action",
            agent_id=self.agent_id,
            prompt=action.log,
            metadata={"tool": action.tool, "tool_input": str(action.tool_input), "event": "agent_action"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        self._update_span(log.get("id") if log else None)

    def on_agent_finish(
        self,
        finish: AgentFinish,
        **kwargs: Any,
    ) -> None:
        output_text = finish.return_values.get("output", "")

        if self.guard:
            result = self._submit_guardrail(
                action="agent_finish",
                agent_id=self.agent_id,
                response=output_text,
                metadata={"log": finish.log, "event": "agent_finish"},
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )
            self._maybe_raise(result, action="agent_finish")
        else:
            self._submit_log(
                action="agent_finish",
                agent_id=self.agent_id,
                response=output_text,
                metadata={"log": finish.log, "event": "agent_finish"},
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )
