# AgentAudit AutoGPT Integration

Real-time guardrails and automatic audit logging for AutoGPT agents.

## Installation

```bash
pip install agentaudit-client
```

## Usage — Guardrails Enabled (Default)

The decorator and context manager **enforce guardrails** on every agent action.
If a compliance violation is detected, a `ComplianceViolation` is raised and the agent
halts before the output is delivered.

### Option A: Decorator

```python
from agentaudit_autogpt import guard, ComplianceViolation

@guard(api_key="aa_your_key_here", agent_name="MyAutoGPT")
def run_agent(task: str) -> str:
    # Your AutoGPT logic here
    return agent.run(task)

try:
    result = run_agent("Research topic X")
except ComplianceViolation as e:
    print(f"Blocked: {e.violations}")
    print(f"Severity: {e.severity}")
```

### Option B: Context Manager

```python
from agentaudit_autogpt import AutoGPTLogger

logger = AutoGPTLogger(api_key="aa_your_key_here", agent_name="MyAutoGPT", guard=True)

with logger.trace() as t:
    result = agent.run("Research topic X")
    t.log_action("run", prompt="Research topic X", response=result)
    # All actions share the same trace_id
```

## Usage — Logging Only (No Guarding)

Set `guard=False` to log all events without blocking violations.

```python
logger = AutoGPTLogger(api_key="aa_key", agent_name="MyAutoGPT", guard=False)

with logger.trace() as t:
    result = agent.run("Research topic X")
    t.log_action("run", prompt="Research topic X", response=result)
```

## Distributed Tracing

Every decorated function or trace context generates a unique `trace_id` and
propagates `parent_span_id` linking across all logged actions. Query the full
agent run via the API.

```python
with logger.trace() as t:
    t.log_action("think", prompt="What should I do?", response="Research topic")
    t.log_action("execute", prompt="Search web", response="Found 3 results")
    t.log_action("write_file", prompt="Save report", response="File saved")

print(t.trace_id)  # "trace-uuid-123"
```

Query the trace:
```bash
curl https://api.agentaudit.io/api/v1/audit-logs/trace/<trace_id> \
  -H "Authorization: Bearer <jwt>"
```

## What Gets Logged

- `autogpt_trace_start` / `autogpt_trace_end`: Trace boundaries
- `autogpt_think` / `autogpt_execute` / `autogpt_write_file`: Individual actions
- `autogpt_function_start` / `autogpt_function_end`: Decorated function calls

## Configuration

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `api_key` | Yes | — | Your AgentAudit API key |
| `agent_name` | No | `"autogpt"` | Agent identifier |
| `base_url` | No | `https://api.agentaudit.io/api/v1` | Custom API endpoint |
| `guard` | No | `True` | Enable real-time guardrails |

## License

MIT
