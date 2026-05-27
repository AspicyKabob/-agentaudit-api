from agentaudit import AgentAudit

audit = AgentAudit(api_key="aa_62123721bb54e38475c748f69efe35d58431a1b0c93ceb9b59df552937e2c606")

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
