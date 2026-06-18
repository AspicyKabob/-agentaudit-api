"""Tests for the AgentAudit OpenAI wrapper."""

from unittest.mock import MagicMock

import pytest


def _make_client(guard: bool = False):
    from agentaudit.openai import AgentAuditOpenAI

    client = AgentAuditOpenAI(
        openai_api_key="sk-test",
        api_key="aa_test_key",
        agent_id="agent-123",
        guard=guard,
    )
    client._client = MagicMock()
    client._openai = MagicMock()
    client._client.log.return_value = MagicMock(id="log-1")
    client._client.guardrail.return_value = MagicMock(
        allowed=True,
        action="allow",
        violations=[],
        severity="warning",
        audit_log_id="guard-log-1",
    )
    return client


def _make_chat_response(content: str = "It is sunny."):
    response = MagicMock()
    choice = MagicMock()
    choice.message.content = content
    response.choices = [choice]
    usage = MagicMock()
    usage.model_dump.return_value = {
        "prompt_tokens": 10,
        "completion_tokens": 5,
        "total_tokens": 15,
    }
    response.usage = usage
    return response


def _make_completion_response(text: str = "It is sunny."):
    response = MagicMock()
    choice = MagicMock()
    choice.text = text
    response.choices = [choice]
    usage = MagicMock()
    usage.model_dump.return_value = {
        "prompt_tokens": 10,
        "completion_tokens": 5,
        "total_tokens": 15,
    }
    response.usage = usage
    return response


def test_chat_completions_create_logs_start_and_end():
    client = _make_client()
    client._openai.chat.completions.create.return_value = _make_chat_response()

    response = client.chat_completions_create(
        model="gpt-4",
        messages=[{"role": "user", "content": "What is the weather?"}],
    )

    assert response.choices[0].message.content == "It is sunny."
    assert client.trace_id is not None
    assert client._client.log.call_count == 3
    calls = [call.kwargs for call in client._client.log.call_args_list]
    assert calls[0]["action"] == "openai_trace_start"
    assert calls[1]["action"] == "openai_chat_start"
    assert calls[1]["prompt"] == "user: What is the weather?"
    assert calls[2]["action"] == "openai_chat_end"
    assert calls[2]["response"] == "It is sunny."


def test_chat_completions_create_runs_guardrail_when_guarding():
    client = _make_client(guard=True)
    client._openai.chat.completions.create.return_value = _make_chat_response()

    client.chat_completions_create(
        model="gpt-4",
        messages=[{"role": "user", "content": "Hello!"}],
    )

    client._client.guardrail.assert_called_once()
    call = client._client.guardrail.call_args
    assert call.kwargs["action"] == "openai_chat_end"
    assert call.kwargs["response"] == "It is sunny."


def test_chat_completions_create_raises_on_block():
    from agentaudit.openai import ComplianceViolation

    client = _make_client(guard=True)
    client._client.guardrail.return_value = MagicMock(
        allowed=False,
        action="block",
        violations=["CRITICAL_pii_detect_SSN"],
        severity="critical",
        audit_log_id="guard-log-1",
    )
    client._openai.chat.completions.create.return_value = _make_chat_response("My SSN is 123-45-6789")

    with pytest.raises(ComplianceViolation):
        client.chat_completions_create(
            model="gpt-4",
            messages=[{"role": "user", "content": "My SSN is 123-45-6789"}],
        )


def test_completions_create_logs_start_and_end():
    client = _make_client()
    client._openai.completions.create.return_value = _make_completion_response()

    response = client.completions_create(model="gpt-3.5-turbo-instruct", prompt="Hello!")

    assert response.choices[0].text == "It is sunny."
    assert client._client.log.call_count == 3
    calls = [call.kwargs for call in client._client.log.call_args_list]
    assert calls[0]["action"] == "openai_trace_start"
    assert calls[1]["action"] == "openai_completion_start"
    assert calls[1]["prompt"] == "Hello!"
    assert calls[2]["action"] == "openai_completion_end"
    assert calls[2]["metadata"]["token_usage"]["total_tokens"] == 15


def test_embeddings_create_logs_start_and_end():
    client = _make_client()
    response = MagicMock()
    client._openai.embeddings.create.return_value = response

    result = client.embeddings_create(input=["Hello world"], model="text-embedding-ada-002")

    assert result is response
    assert client._client.log.call_count == 3
    calls = [call.kwargs for call in client._client.log.call_args_list]
    assert calls[0]["action"] == "openai_trace_start"
    assert calls[1]["action"] == "openai_embedding_start"
    assert calls[2]["action"] == "openai_embedding_end"


def test_lazy_import_from_package():
    from agentaudit import AgentAuditOpenAI
    assert AgentAuditOpenAI is not None
