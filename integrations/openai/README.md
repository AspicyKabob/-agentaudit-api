# AgentAudit OpenAI Integration

Real-time guardrails and automatic audit logging for OpenAI API calls.

## Installation

```bash
pip install agentaudit-client openai
```

## Usage — Guardrails Enabled (Default)

The wrapper **enforces guardrails** on every completion and chat completion.
If a compliance violation is detected, a `ComplianceViolation` is raised and the
output is blocked before delivery.

```python
from agentaudit_openai import AuditOpenAI

# Create wrapper with guardrails enabled (default)
client = AuditOpenAI(
    openai_api_key="sk-...",
    agentaudit_api_key="aa_your_key_here",
    agent_id="uuid-of-your-agent",
    guard=True   # default
)

# Chat completions — guarded automatically
response = client.chat_completions_create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}]
)
# If output violates a rule, ComplianceViolation is raised
```

## Usage — Logging Only (No Guarding)

Set `guard=False` to log all calls without blocking violations.

```python
client = AuditOpenAI(
    openai_api_key="sk-...",
    agentaudit_api_key="aa_key",
    agent_id="uuid",
    guard=False
)
```

## Distributed Tracing

Every API call generates a `trace_id` and propagates `parent_span_id` linking
so the full conversation can be queried later.

```python
response = client.chat_completions_create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello!"}]
)

print(client.trace_id)  # "trace-uuid-123"
```

Query the trace:
```bash
curl https://api.agentaudit.io/api/v1/audit-logs/trace/<trace_id> \
  -H "Authorization: Bearer <jwt>"
```

## Handling Guardrail Violations

Catch `ComplianceViolation` to inspect what was blocked:

```python
from agentaudit_openai import ComplianceViolation

try:
    response = client.chat_completions_create(
        model="gpt-4",
        messages=[{"role": "user", "content": "My SSN is 123-45-6789"}]
    )
except ComplianceViolation as e:
    print(f"Blocked: {e.violations}")
    print(f"Severity: {e.severity}")
```

## What Gets Logged

- `openai_trace_start`: Trace root
- `openai_chat_start` / `openai_chat_end`: Chat completion inputs/outputs
- `openai_completion_start` / `openai_completion_end`: Completion inputs/outputs
- `openai_embedding_start` / `openai_embedding_end`: Embedding calls (no guardrail)

## Configuration

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `openai_api_key` | Yes | — | Your OpenAI API key |
| `agentaudit_api_key` | Yes | — | Your AgentAudit API key |
| `agent_id` | No | None | Associate logs with a specific agent |
| `base_url` | No | `https://api.agentaudit.io/api/v1` | Custom API endpoint |
| `guard` | No | `True` | Enable real-time guardrails |

## License

MIT
