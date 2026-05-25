# AgentAudit Python SDK

Official Python SDK for the AgentAudit API — audit logging and compliance monitoring for AI agents.

## Installation

```bash
pip install agentaudit
```

With LangChain support:
```bash
pip install agentaudit[langchain]
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
- **Automatic compliance**: PII detection, keyword matching, rate limiting
- **Agent registration**: Track which agents are performing actions
- **Query and export**: Retrieve audit logs with filters
- **LangChain support**: Drop-in callback handler
- **Type hints**: Full type annotation support

## Documentation

Full API documentation: https://docs.agentaudit.io

## License

MIT
