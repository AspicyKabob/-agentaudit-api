# AgentAudit LangChain Integration

Drop-in callback handler for automatic audit logging with LangChain.

## Installation

```bash
pip install agentaudit[langchain]
```

## Usage

```python
from langchain.callbacks import AgentAuditCallbackHandler
from langchain.llms import OpenAI

# Create the handler
handler = AgentAuditCallbackHandler(
    api_key="aa_your_key_here",
    agent_id="your-agent-uuid"
)

# Pass to any LangChain component
llm = OpenAI(callbacks=[handler])
chain = LLMChain(llm=llm, prompt=prompt, callbacks=[handler])
agent = AgentExecutor.from_llm_and_tools(llm, tools, callbacks=[handler])

# All actions are automatically logged!
```

## What Gets Logged

- `llm_start` / `llm_end`: Prompts and responses with token usage
- `tool_start` / `tool_end`: Tool inputs and outputs
- `chain_start` / `chain_end`: Chain inputs and outputs
- `agent_action` / `agent_finish`: Agent decisions and final answers

## Configuration

| Parameter | Required | Description |
|-----------|----------|-------------|
| `api_key` | Yes | Your AgentAudit API key |
| `agent_id` | No | Associate logs with a specific agent |
| `base_url` | No | Custom API endpoint (default: production) |

## License

MIT
