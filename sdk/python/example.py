import os

from agentaudit import AgentAudit

api_key = os.environ.get("AGENTAUDIT_API_KEY")
if not api_key:
    raise RuntimeError("Set AGENTAUDIT_API_KEY before running this example.")

audit = AgentAudit(api_key=api_key)

result = audit.guardrail(
    action="prompt_submitted",
    prompt="Tell me about John Doe, SSN 123-45-6789",
    response="John Doe is a person"
)

print(f"Allowed: {result.allowed}")
print(f"Action: {result.action}")
print(f"Violations: {result.violations}")

if not result.allowed:
    raise ValueError(f"BLOCKED: {result.violations}")

print(f"ALLOWED: {result.audit_log_id}")
