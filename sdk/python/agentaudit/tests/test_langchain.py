"""Tests for the AgentAudit LangChain callback handler."""

import uuid
from unittest.mock import MagicMock, patch

import pytest


def _make_handler():
    """Create a handler with a mocked AgentAudit client."""
    from agentaudit.langchain import AgentAuditCallbackHandler

    handler = AgentAuditCallbackHandler(
        api_key="aa_test_key",
        agent_id="agent-123",
        guard=False,
    )
    handler._client = MagicMock()
    handler._client.log.return_value = MagicMock(id="log-1")
    handler._client.guardrail.return_value = MagicMock(
        allowed=True,
        action="allow",
        violations=[],
        severity="warning",
        audit_log_id=None,
    )
    return handler


def test_on_llm_start_creates_trace():
    handler = _make_handler()

    handler.on_llm_start(
        serialized={"id": ["langchain", "llms", "OpenAI"]},
        prompts=["What is the weather?"],
    )

    assert handler.trace_id is not None
    handler._client.log.assert_called()
    call = handler._client.log.call_args
    assert call.kwargs["action"] == "llm_start"
    assert call.kwargs["prompt"] == "What is the weather?"
    assert call.kwargs["metadata"]["model"] == "OpenAI"


def test_on_chat_model_start_creates_trace():
    handler = _make_handler()

    class FakeMessage:
        type = "human"
        content = "Hello"

    handler.on_chat_model_start(
        serialized={"kwargs": {"model": "gpt-4"}},
        messages=[[FakeMessage()]],
    )

    assert handler.trace_id is not None
    call = handler._client.log.call_args
    assert call.kwargs["action"] == "llm_start"
    assert call.kwargs["metadata"]["model"] == "gpt-4"


def test_on_llm_end_logs_output_and_token_usage():
    handler = _make_handler()
    handler._trace_id = "trace-1"
    handler._current_span_id = "span-1"

    class FakeGeneration:
        text = "It is sunny."

    response = MagicMock()
    response.generations = [[FakeGeneration()]]
    response.llm_output = {"token_usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}}

    handler.on_llm_end(response)

    handler._client.log.assert_called_once()
    call = handler._client.log.call_args
    assert call.kwargs["action"] == "llm_end"
    assert call.kwargs["response"] == "It is sunny."
    assert call.kwargs["metadata"]["token_usage"]["total_tokens"] == 15


def test_on_llm_end_prefers_usage_metadata():
    handler = _make_handler()
    handler._trace_id = "trace-1"
    handler._current_span_id = "span-1"

    class FakeMessage:
        usage_metadata = {"input_tokens": 7, "output_tokens": 3, "total_tokens": 10}

    class FakeGeneration:
        text = "Hi"
        message = FakeMessage()

    response = MagicMock()
    response.generations = [[FakeGeneration()]]
    response.llm_output = {"token_usage": {"prompt_tokens": 100}}

    handler.on_llm_end(response)

    token_usage = handler._client.log.call_args.kwargs["metadata"]["token_usage"]
    assert token_usage["prompt_tokens"] == 7
    assert token_usage["completion_tokens"] == 3
    assert token_usage["total_tokens"] == 10


def test_on_chain_start_creates_trace():
    handler = _make_handler()
    handler.on_chain_start(serialized={"name": "my_chain"}, inputs={"topic": "AI"})

    assert handler.trace_id is not None
    call = handler._client.log.call_args
    assert call.kwargs["action"] == "chain_start"
    assert call.kwargs["metadata"]["chain"] == "my_chain"


def test_on_chain_end_with_guard_raises_on_block():
    handler = _make_handler()
    handler._guard = True
    handler._trace_id = "trace-1"
    handler._current_span_id = "span-1"
    handler._client.guardrail.return_value = MagicMock(
        allowed=False,
        action="block",
        violations=["CRITICAL_pii_detect_SSN"],
        severity="critical",
    )

    from agentaudit.langchain import ComplianceViolation

    with pytest.raises(ComplianceViolation):
        handler.on_chain_end(outputs={"answer": "My SSN is 123-45-6789"})


def test_on_tool_start_and_end():
    handler = _make_handler()
    handler._trace_id = "trace-1"
    handler._current_span_id = "span-1"
    handler._client.log.return_value = MagicMock(id="tool-log")

    handler.on_tool_start(serialized={"name": "search"}, input_str="weather today")
    handler.on_tool_end(output="Sunny, 72F")

    assert handler._client.log.call_count == 2
    calls = [call.kwargs for call in handler._client.log.call_args_list]
    assert calls[0]["action"] == "tool_start"
    assert calls[0]["metadata"]["tool"] == "search"
    assert calls[1]["action"] == "tool_end"
    assert calls[1]["response"] == "Sunny, 72F"


def test_on_llm_error_logs_error():
    handler = _make_handler()
    handler._trace_id = "trace-1"
    handler._current_span_id = "span-1"

    handler.on_llm_error(ValueError("model failed"))

    call = handler._client.log.call_args
    assert call.kwargs["action"] == "llm_error"
    assert "model failed" in call.kwargs["response"]


def test_extract_model_from_kwargs():
    from agentaudit.langchain import _extract_model

    assert _extract_model({"kwargs": {"model": "gpt-4o"}}) == "gpt-4o"


def test_extract_model_from_id_path():
    from agentaudit.langchain import _extract_model

    assert _extract_model({"id": ["langchain", "llms", "OpenAI"]}) == "OpenAI"


def test_extract_token_usage_empty():
    from agentaudit.langchain import _extract_token_usage

    response = MagicMock()
    response.generations = []
    response.llm_output = None
    assert _extract_token_usage(response) == {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
    }
