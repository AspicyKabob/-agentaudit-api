"""
LangChain Callback Handler for AgentAudit

Automatically logs all LLM calls, tool executions, and chain runs.
Optionally enforces real-time guardrails — blocking outputs with compliance
violations before delivery.

Supports distributed tracing via trace_id and parent_span_id.

Example (logging only):
    from langchain.callbacks import AgentAuditCallbackHandler
    
    audit_handler = AgentAuditCallbackHandler(
        api_key="aa_your_key_here",
        agent_id="uuid-of-your-agent",
        guard=False
    )
    
    llm = OpenAI(callbacks=[audit_handler])
    llm.predict("What is the weather?")

Example (guardrails enabled):
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
import requests


class ComplianceViolation(Exception):
    """Raised when a LangChain output violates a compliance rule.

    Attributes:
        violations (list): The compliance flag strings that triggered the block.
        severity (str): 'warning' or 'critical'.
        action (str): The action that was blocked.
    """

    def __init__(self, message: str, violations: list, severity: str = "critical", action: str = ""):
        super().__init__(message)
        self.violations = violations
        self.severity = severity
        self.action = action


class AgentAuditCallbackHandler(BaseCallbackHandler):
    """
    LangChain callback handler that automatically submits audit logs
    and optionally enforces real-time guardrails on every LLM call,
    tool execution, and chain run.

    Trace Tracking
    --------------
    When ``guard=True`` the handler generates a trace ID in ``on_chain_start``
    (or ``on_llm_start`` for single LLM calls) and propagates it to every
    subsequent event with ``parent_span_id`` linking so the full chain can
    be queried later via ``GET /trace/:traceId`` or ``GET /audit-logs/:id/chain``.
    """

    def __init__(
        self,
        api_key: str,
        agent_id: Optional[str] = None,
        base_url: str = "https://api.agentaudit.io/api/v1",
        guard: bool = True,
    ):
        super().__init__()
        self.api_key = api_key
        self.agent_id = agent_id
        self.base_url = base_url.rstrip("/")
        self.guard = guard

        # Trace state
        self._trace_id: Optional[str] = None
        self._root_span_id: Optional[str] = None
        self._current_span_id: Optional[str] = None

        self.session = requests.Session()
        self.session.headers.update({
            "X-API-Key": api_key,
            "Content-Type": "application/json"
        })

    @property
    def trace_id(self) -> Optional[str]:
        """The active trace ID for the current chain execution."""
        return self._trace_id

    def _maybe_raise(self, result: Dict[str, Any], action: str) -> None:
        """Raise ComplianceViolation when guard=True and result is blocked."""
        if self.guard and not result.get("allowed", True):
            raise ComplianceViolation(
                message=f"Blocked by AgentAudit guardrail: {result.get('violations', [])}",
                violations=result.get("violations", []),
                severity=result.get("severity", "critical"),
                action=action,
            )

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
            # If API fails, allow through but log the error
            return {"allowed": True, "action": "allow", "violations": [], "severity": "warning", "error": str(e)}

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
            prompt="\n".join(prompts),
            metadata={"model": serialized.get("id", ["unknown"])[-1], "event": "llm_start"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        if log:
            self._current_span_id = log.get("id")

    def on_llm_end(
        self,
        response: LLMResult,
        **kwargs: Any,
    ) -> None:
        generations = response.generations
        outputs = []
        for gen_list in generations:
            for gen in gen_list:
                outputs.append(gen.text)

        token_usage = response.llm_output.get("token_usage", {}) if response.llm_output else {}
        output_text = "\n".join(outputs)

        if self.guard:
            result = self._submit_guardrail(
                action="llm_end",
                response=output_text,
                metadata={"token_usage": token_usage, "event": "llm_end"},
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )
            self._maybe_raise(result, action="llm_end")
        else:
            self._submit_log(
                action="llm_end",
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
            prompt=input_str,
            metadata={"tool": serialized.get("name", "unknown"), "event": "tool_start"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        if log:
            self._current_span_id = log.get("id")

    def on_tool_end(
        self,
        output: str,
        **kwargs: Any,
    ) -> None:
        output_text = str(output)

        if self.guard:
            result = self._submit_guardrail(
                action="tool_end",
                response=output_text,
                metadata={"event": "tool_end"},
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )
            self._maybe_raise(result, action="tool_end")
        else:
            self._submit_log(
                action="tool_end",
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
            prompt=str(inputs),
            metadata={"chain": serialized.get("name", "unknown"), "event": "chain_start"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        if log:
            self._current_span_id = log.get("id")

    def on_chain_end(
        self,
        outputs: Dict[str, Any],
        **kwargs: Any,
    ) -> None:
        output_text = str(outputs)

        if self.guard:
            result = self._submit_guardrail(
                action="chain_end",
                response=output_text,
                metadata={"event": "chain_end"},
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )
            self._maybe_raise(result, action="chain_end")
        else:
            self._submit_log(
                action="chain_end",
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
            prompt=action.log,
            metadata={"tool": action.tool, "tool_input": str(action.tool_input), "event": "agent_action"},
            trace_id=self._trace_id,
            parent_span_id=self._current_span_id,
        )
        if log:
            self._current_span_id = log.get("id")

    def on_agent_finish(
        self,
        finish: AgentFinish,
        **kwargs: Any,
    ) -> None:
        output_text = finish.return_values.get("output", "")

        if self.guard:
            result = self._submit_guardrail(
                action="agent_finish",
                response=output_text,
                metadata={"log": finish.log, "event": "agent_finish"},
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )
            self._maybe_raise(result, action="agent_finish")
        else:
            self._submit_log(
                action="agent_finish",
                response=output_text,
                metadata={"log": finish.log, "event": "agent_finish"},
                trace_id=self._trace_id,
                parent_span_id=self._current_span_id,
            )
