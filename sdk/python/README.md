# AgentAudit Python SDK

Official Python SDK for the AgentAudit API — audit logging and compliance monitoring for AI agents.

## Installation

```bash
pip install agentaudit-client
```

With LangChain support:
```bash
pip install agentaudit-client[langchain]
```

## Quick Start

```python
from agentaudit import AgentAudit

# Initialize
audit = AgentAudit(api_key="aa_your_key_here")

# Log an agent action
audit.log(
    action="prompt_submitted",
    prompt="What is the weather?",
    response="It is sunny today.",
    metadata={"model": "gpt-4", "tokens": 150}
)
```

## LangChain Integration

```python
from langchain.callbacks import AgentAuditCallbackHandler
from langchain.llms import OpenAI

# Setup audit callback
audit_handler = AgentAuditCallbackHandler(
    api_key="aa_your_key_here",
    agent_id="uuid-of-your-agent"
)

# Use with any LangChain component
llm = OpenAI(callbacks=[audit_handler])
llm.predict("What is the weather?")
# Automatically logged to AgentAudit!
```

## Features

- **Simple logging**: One-line audit log submission
- **Automatic compliance**: PII detection, keyword matching, rate limiting, regex matching, sentiment analysis, custom validators
- **Agent registration**: Track which agents are performing actions
- **Query and export**: Retrieve audit logs with filters
- **LangChain support**: Drop-in callback handler
- **Type hints**: Full type annotation support

## Agent-to-Agent Audit Trails

Track multi-agent conversations and CrewAI workflows with distributed tracing:

```python
import uuid
from agentaudit import AgentAudit

audit = AgentAudit(api_key="aa_your_key_here")

# Start a trace — e.g. when a CrewAI crew begins execution
trace_id = str(uuid.uuid4())

# Log the root event (crew start)
root = audit.log(
    action="crewai_crew_start",
    trace_id=trace_id,
    metadata={"crew": "Research Crew", "task_count": 3}
)

# Log child events (tasks, agent actions) with parent_span_id
audit.log(
    action="crewai_task_start",
    trace_id=trace_id,
    parent_span_id=root.id,
    prompt="Research topic X",
    metadata={"task_id": "task-1"}
)

# Query the full trace later
# (use the HTTP client or dashboard to query by traceId)
```

### CrewAI Integration

The [CrewAI observer](../../integrations/crewai/) automatically manages trace IDs and parent span IDs:

```python
from agentaudit_crewai import AgentAuditObserver

observer = AgentAuditObserver(api_key="aa_key", crew_name="My Crew")
# trace_id is generated automatically in on_crew_start
# every event shares the same trace_id with proper parent_span_id linking
```

## Documentation

Full API documentation: https://docs.agentaudit.io

## License

MIT

---

## Publishing (Maintainers Only)

This package is published automatically via GitHub Actions when you push a version tag:

### Prerequisites
1. Create a [PyPI account](https://pypi.org/account/register/)
2. Generate an API token at [pypi.org/manage/account/token](https://pypi.org/manage/account/token)
3. Add the token to your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `PYPI_API_TOKEN`
   - Value: your PyPI API token (starts with `pypi-`)

### Publish a New Version
```bash
# Update version in sdk/python/setup.py
git add sdk/python/setup.py
git commit -m "chore: bump Python SDK to v1.0.1"
git tag v1.0.1
git push origin v1.0.1
```

The `publish-python.yml` workflow will automatically build and upload to PyPI.
