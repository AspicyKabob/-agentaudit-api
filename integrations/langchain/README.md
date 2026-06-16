# AgentAudit LangChain Integration

Real-time guardrails and automatic audit logging for LangChain agents, chains, and tools.

## Installation

```bash
pip install agentaudit-client[langchain]
```

This installs the Python SDK with `langchain-core>=0.2.0`.

## Usage — Guardrails Enabled (Default)

By default the callback handler **enforces guardrails** on every LLM call, tool execution, and chain run.
If a compliance violation is detected (PII, forbidden keywords, etc.), a `ComplianceViolation`
is raised and the chain halts before the output is delivered.

```python
from agentaudit import AgentAuditCallbackHandler
from langchain_openai import ChatOpenAI

handler = AgentAuditCallbackHandler(
    api_key="aa_your_key_here",
    agent_id="uuid-of-your-agent",
    guard=True   # default
)

llm = ChatOpenAI(model="gpt-4o", callbacks=[handler])
llm.invoke("What is the weather?")
# Automatically logged + guarded
```

## Usage — Logging Only (No Guarding)

Set `guard=False` to log all events without blocking violations.

```python
handler = AgentAuditCallbackHandler(
    api_key="aa_your_key_here",
    agent_id="uuid-of-your-agent",
    guard=False
)
```

## Distributed Tracing

The handler generates a trace ID on the first callback (`on_chain_start` or `on_llm_start`)
and propagates it to every subsequent event with `parent_span_id` linking so the full chain can
be queried later via the API.

```python
from agentaudit import AgentAuditCallbackHandler
from langchain_openai import ChatOpenAI

handler = AgentAuditCallbackHandler(api_key="aa_key", agent_id="uuid", guard=True)
llm = ChatOpenAI(model="gpt-4o", callbacks=[handler])

llm.invoke("What is the weather?")
print(handler.trace_id)  # "trace-uuid-123"
```

Query the trace:
```bash
curl https://api.agentaudit.io/api/v1/audit-logs/trace/<trace_id> \
  -H "Authorization: Bearer <jwt>"
```

## Handling Guardrail Violations

Catch `ComplianceViolation` to inspect what was blocked:

```python
from agentaudit import ComplianceViolation
from langchain_openai import ChatOpenAI

handler = AgentAuditCallbackHandler(api_key="aa_key", agent_id="uuid", guard=True)
llm = ChatOpenAI(model="gpt-4o", callbacks=[handler])

try:
    result = llm.invoke("User: My SSN is 123-45-6789")
except ComplianceViolation as e:
    print(f"Blocked: {e.violations}")
    print(f"Severity: {e.severity}")
```

## TypeScript / JavaScript

The TypeScript SDK also ships a LangChain callback handler as an optional peer dependency:

```bash
npm install agentaudit-client @langchain/core
```

```typescript
import { AgentAuditCallbackHandler } from 'agentaudit-client/langchain';
import { ChatOpenAI } from '@langchain/openai';

const handler = new AgentAuditCallbackHandler(
  { apiKey: 'aa_your_key_here', agentId: 'uuid-of-your-agent' },
  { guard: true }
);

const llm = new ChatOpenAI({ model: 'gpt-4o', callbacks: [handler.asHandler()] });
await llm.invoke('What is the weather?');
console.log(handler.trace_id);
```

## What Gets Logged

- `llm_start` / `llm_end`: Prompts and responses with token usage
- `tool_start` / `tool_end`: Tool inputs and outputs
- `chain_start` / `chain_end`: Chain inputs and outputs
- `agent_action` / `agent_finish`: Agent decisions and final answers
- `langchain_trace_start`: Distributed trace root

## Configuration

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `api_key` | Yes | — | Your AgentAudit API key |
| `agent_id` | No | None | Associate logs with a specific agent |
| `base_url` | No | `https://api.agentaudit.io/api/v1` | Custom API endpoint |
| `guard` | No | `True` | Enable real-time guardrails |

## License

MIT
