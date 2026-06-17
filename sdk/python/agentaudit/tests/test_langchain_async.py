"""Tests for the AgentAudit async LangChain callback handler."""

import uuid
from unittest.mock import AsyncMock, MagicMock

import pytest

from agentaudit.langchain import AgentAuditAsyncCallbackHandler


def _make_handler():
    """Create an async handler with a mocked AgentAuditAsync client."""
    handler = AgentAuditAsyncCallbackHandler(
        api_key="aa_test_key",
        agent_id="agent-123",
        guard=False,
    )
    handler._client = MagicMock()
    handler._client.alog = AsyncMock()
    handler._client.alog.return_value = MagicMock(id="log-1")
    handler._client.aguardrail = AsyncMock()
    handler._client.aguardrail.return_value = MagicMock(
        allowed=True,
        action="allow",
        violations=[],
        severity="warning",
    )
    return handler


@pytest.mark.asyncio
async def test_on_llm_start_creates_trace():
    handler = _make_handler()
    await handler.on_llm_start(
        serialized={"id": ["langchain", "llms", "OpenAI"]},
        prompts=["What is the weather?"],
    )

    assert handler.trace_id is not None
    handler._client.alog.assert_awaited()
    call = handler._client.alog.await_args
    assert call.kwargs["action"] == "llm_start"
    assert call.kwargs["prompt"] == "What is the weather?"
    assert call.kwargs["metadata"]["model"] == "OpenAI"


@pytest.mark.asyncio
async def test_on_chat_model_start_creates_trace():
    handler = _make_handler()

    class FakeMessage:
        type = "human"
        content = "Hello"

    await handler.on_chat_model_start(
        serialized={"kwargs": {"model": "gpt-4"}},
        messages=[[FakeMessage()]],
    )

    assert handler.trace_id is not None
    call = handler._client.alog.await_args
    assert call.kwargs["action"] == "llm_start"
    assert call.kwargs["metadata"]["model"] == "gpt-4"


@pytest.mark.asyncio
async def test_on_llm_end_logs_output_and_token_usage():
    handler = _make_handler()
    handler._trace_id = "trace-1"
    handler._current_span_id = "span-1"

    class FakeGeneration:
        text = "It is sunny."

    response = MagicMock()
    response.generations = [[FakeGeneration()]]
    response.llm_output = {"token_usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}}

    await handler.on_llm_end(response)

    handler._client.alog.assert_awaited_once()
    call = handler._client.alog.await_args
    assert call.kwargs["action"] == "llm_end"
    assert call.kwargs["response"] == "It is sunny."
    assert call.kwargs["metadata"]["token_usage"]["total_tokens"] == 15


@pytest.mark.asyncio
async def test_on_chain_start_and_end():
    handler = _make_handler()
    await handler.on_chain_start({"name": "my_chain"}, {"topic": "AI"})
    await handler.on_chain_end({"answer": "42"})

    calls = [call.kwargs["action"] for call in handler._client.alog.await_args_list]
    assert calls == ["langchain_trace_start", "chain_start", "chain_end"]


@pytest.mark.asyncio
async def test_on_chain_end_with_guard_raises_on_block():
    handler = _make_handler()
    handler._guard = True
    handler._trace_id = "trace-1"
    handler._current_span_id = "span-1"
    handler._client.aguardrail.return_value = MagicMock(
        allowed=False,
        action="block",
        violations=["CRITICAL_pii_detect_SSN"],
        severity="critical",
    )

    from agentaudit.langchain import ComplianceViolation

    with pytest.raises(ComplianceViolation):
        await handler.on_chain_end(outputs={"answer": "My SSN is 123-45-6789"})


@pytest.mark.asyncio
async def test_on_tool_start_and_end():
    handler = _make_handler()
    handler._trace_id = "trace-1"
    handler._current_span_id = "span-1"
    handler._client.alog.return_value = MagicMock(id="tool-log")

    await handler.on_tool_start({"name": "search"}, "weather today")
    await handler.on_tool_end("Sunny, 72F")

    assert handler._client.alog.await_count == 2
    calls = [call.kwargs["action"] for call in handler._client.alog.await_args_list]
    assert calls == ["tool_start", "tool_end"]


@pytest.mark.asyncio
async def test_on_llm_error_logs_error():
    handler = _make_handler()
    handler._trace_id = "trace-1"
    handler._current_span_id = "span-1"

    await handler.on_llm_error(ValueError("model failed"))

    call = handler._client.alog.await_args
    assert call.kwargs["action"] == "llm_error"
    assert "model failed" in call.kwargs["response"]
