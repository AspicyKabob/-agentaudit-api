"""
AgentAudit Python SDK
Drop-in audit logging for AI agents.
"""

import requests
from typing import Optional, Dict, Any, List
from dataclasses import dataclass


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
class GuardrailResult:
    """Result of a compliance guardrail check."""
    allowed: bool
    action: str
    violations: List[str]
    severity: str
    audit_log_id: Optional[str] = None


class AgentAudit:
    """
    AgentAudit client for submitting audit logs and managing agents.
    """
    
    def __init__(
        self,
        api_key: str,
        base_url: str = "https://agentaudit-api-production.up.railway.app/api/v1",
        agent_id: Optional[str] = None
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip("/")
        self.agent_id = agent_id
        self.session = requests.Session()
        self.session.headers.update({
            "X-API-Key": api_key,
            "Content-Type": "application/json"
        })
    
    def guardrail(
        self,
        action: str,
        prompt: Optional[str] = None,
        response: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        agent_id: Optional[str] = None
    ) -> GuardrailResult:
        """
        Real-time compliance check. Intercepts agent output before delivery.
        
        Usage:
            result = audit.guardrail(
                action="prompt_submitted",
                prompt=user_input,
                response=agent_output
            )
            if not result.allowed:
                raise ValueError(f"Blocked: {result.violations}")
        """
        payload = {
            "action": action,
            "agentId": agent_id or self.agent_id,
            "checkType": "realtime"
        }
        if prompt:
            payload["prompt"] = prompt
        if response:
            payload["response"] = response
        if metadata:
            payload["metadata"] = metadata
        
        resp = self.session.post(
            f"{self.base_url}/audit-logs",
            json=payload
        )
        resp.raise_for_status()
        data = resp.json()
        
        flags = data.get("complianceFlags", [])
        severity = "critical" if any("PII" in f or "block" in f.lower() for f in flags) else "warning"
        action_result = "block" if severity == "critical" and flags else ("flag" if flags else "allow")
        
        return GuardrailResult(
            allowed=action_result != "block",
            action=action_result,
            violations=flags,
            severity=severity,
            audit_log_id=data.get("id")
        )
    
    def log(
        self,
        action: str,
        prompt: Optional[str] = None,
        response: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        agent_id: Optional[str] = None
    ) -> AuditLog:
        """
        Submit an audit log entry.
        
        Args:
            action: The action performed (e.g., "prompt_submitted", "tool_executed")
            prompt: The input prompt (optional)
            response: The output response (optional)
            metadata: Additional structured data (optional)
            agent_id: Override the default agent ID (optional)
            
        Returns:
            AuditLog: The created audit log entry
        """
        payload = {
            "action": action,
            "agentId": agent_id or self.agent_id,
        }
        
        if prompt is not None:
            payload["prompt"] = prompt
        if response is not None:
            payload["response"] = response
        if metadata is not None:
            payload["metadata"] = metadata
        
        resp = self.session.post(
            f"{self.base_url}/audit-logs",
            json=payload
        )
        resp.raise_for_status()
        data = resp.json()
        
        return AuditLog(
            id=data["id"],
            action=data["action"],
            agent_id=data.get("agentId"),
            prompt=data.get("prompt"),
            response=data.get("response"),
            metadata=data.get("metadata"),
            compliance_flags=data.get("complianceFlags", []),
            created_at=data["createdAt"]
        )
    
    def register_agent(
        self,
        name: str,
        agent_type: str = "custom",
        description: Optional[str] = None,
        config: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Register a new agent and return its ID."""
        payload = {
            "name": name,
            "type": agent_type,
        }
        if description:
            payload["description"] = description
        if config:
            payload["config"] = config
        
        resp = self.session.post(
            f"{self.base_url}/agents",
            json=payload
        )
        resp.raise_for_status()
        return resp.json()
    
    def query_logs(
        self,
        action: Optional[str] = None,
        agent_id: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        page: int = 1,
        limit: int = 20
    ) -> Dict[str, Any]:
        """Query audit logs with filters."""
        params = {"page": page, "limit": limit}
        if action:
            params["action"] = action
        if agent_id:
            params["agentId"] = agent_id
        if start_date:
            params["startDate"] = start_date
        if end_date:
            params["endDate"] = end_date
        
        resp = self.session.get(
            f"{self.base_url}/audit-logs",
            params=params
        )
        resp.raise_for_status()
        return resp.json()
    
    def get_alerts(
        self,
        is_resolved: Optional[bool] = None,
        severity: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Get compliance alerts."""
        params = {}
        if is_resolved is not None:
            params["isResolved"] = str(is_resolved).lower()
        if severity:
            params["severity"] = severity
        
        resp = self.session.get(
            f"{self.base_url}/alerts",
            params=params
        )
        resp.raise_for_status()
        return resp.json()


class AgentAuditCallback:
    """
    Callback-style integration for frameworks that support callbacks.
    Automatically logs all agent actions.
    """
    
    def __init__(self, api_key: str, agent_id: Optional[str] = None):
        self.client = AgentAudit(api_key=api_key, agent_id=agent_id)
    
    def on_action(self, action: str, **kwargs):
        """Log an action with optional prompt/response/metadata."""
        return self.client.log(action=action, **kwargs)
