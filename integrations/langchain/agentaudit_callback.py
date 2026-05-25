"""
LangChain Callback Handler for AgentAudit

Automatically logs all LLM calls, tool executions, and chain runs to AgentAudit.

Example:
    from langchain.callbacks import AgentAuditCallbackHandler
    
    audit_handler = AgentAuditCallbackHandler(
        api_key="aa_your_key_here",
        agent_id="uuid-of-your-agent"
    )
    
    llm = OpenAI(callbacks=[audit_handler])
    llm.predict("What is the weather?")
    # Automatically logged to AgentAudit
"""

from typing import Any, Dict, List, Optional, Union
from langchain.callbacks.base import BaseCallbackHandler
from langchain.schema import AgentAction, AgentFinish, LLMResult
import requests


class AgentAuditCallbackHandler(BaseCallbackHandler):
    """
    LangChain callback handler that automatically submits audit logs
    for every LLM call, tool execution, and chain run.
    """
    
    def __init__(
        self,
        api_key: str,
        agent_id: Optional[str] = None,
        base_url: str = "https://api.agentaudit.io/api/v1"
    ):
        super().__init__()
        self.api_key = api_key
        self.agent_id = agent_id
        self.base_url = base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update({
            "X-API-Key": api_key,
            "Content-Type": "application/json"
        })
    
    def on_llm_start(
        self,
        serialized: Dict[str, Any],
        prompts: List[str],
        **kwargs: Any
    ) -> None:
        """Called when LLM starts processing."""
        self._submit_log(
            action="llm_start",
            prompt="\n".join(prompts),
            metadata={
                "model": serialized.get("id", ["unknown"])[-1],
                "event": "llm_start"
            }
        )
    
    def on_llm_end(
        self,
        response: LLMResult,
        **kwargs: Any
    ) -> None:
        """Called when LLM finishes processing."""
        generations = response.generations
        outputs = []
        for gen_list in generations:
            for gen in gen_list:
                outputs.append(gen.text)
        
        token_usage = response.llm_output.get("token_usage", {}) if response.llm_output else {}
        
        self._submit_log(
            action="llm_end",
            response="\n".join(outputs),
            metadata={
                "token_usage": token_usage,
                "event": "llm_end"
            }
        )
    
    def on_tool_start(
        self,
        serialized: Dict[str, Any],
        input_str: str,
        **kwargs: Any
    ) -> None:
        """Called when a tool starts executing."""
        self._submit_log(
            action="tool_start",
            prompt=input_str,
            metadata={
                "tool": serialized.get("name", "unknown"),
                "event": "tool_start"
            }
        )
    
    def on_tool_end(
        self,
        output: str,
        **kwargs: Any
    ) -> None:
        """Called when a tool finishes executing."""
        self._submit_log(
            action="tool_end",
            response=str(output),
            metadata={"event": "tool_end"}
        )
    
    def on_chain_start(
        self,
        serialized: Dict[str, Any],
        inputs: Dict[str, Any],
        **kwargs: Any
    ) -> None:
        """Called when a chain starts."""
        self._submit_log(
            action="chain_start",
            prompt=str(inputs),
            metadata={
                "chain": serialized.get("name", "unknown"),
                "event": "chain_start"
            }
        )
    
    def on_chain_end(
        self,
        outputs: Dict[str, Any],
        **kwargs: Any
    ) -> None:
        """Called when a chain ends."""
        self._submit_log(
            action="chain_end",
            response=str(outputs),
            metadata={"event": "chain_end"}
        )
    
    def on_agent_action(
        self,
        action: AgentAction,
        **kwargs: Any
    ) -> None:
        """Called when an agent takes an action."""
        self._submit_log(
            action="agent_action",
            prompt=action.log,
            metadata={
                "tool": action.tool,
                "tool_input": str(action.tool_input),
                "event": "agent_action"
            }
        )
    
    def on_agent_finish(
        self,
        finish: AgentFinish,
        **kwargs: Any
    ) -> None:
        """Called when an agent finishes."""
        self._submit_log(
            action="agent_finish",
            response=finish.return_values.get("output", ""),
            metadata={
                "log": finish.log,
                "event": "agent_finish"
            }
        )
    
    def _submit_log(
        self,
        action: str,
        prompt: Optional[str] = None,
        response: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> None:
        """Submit a log to the AgentAudit API."""
        payload: Dict[str, Any] = {
            "action": action,
        }
        
        if self.agent_id:
            payload["agentId"] = self.agent_id
        if prompt is not None:
            payload["prompt"] = prompt
        if response is not None:
            payload["response"] = response
        if metadata is not None:
            payload["metadata"] = metadata
        
        try:
            self.session.post(
                f"{self.base_url}/audit-logs",
                json=payload,
                timeout=5
            )
        except Exception:
            # Fail silently — don't break the agent's workflow
            pass
