import { AgentAuditCallbackHandler } from '../langchain';

type MockClient = {
  log: jest.MockedFunction<(opts: any) => Promise<any>>;
  guardrail: jest.MockedFunction<(opts: any) => Promise<any>>;
};

type HandlerWithMock = AgentAuditCallbackHandler & {
  client: MockClient;
  traceId?: string;
  currentSpanId?: string;
};

function makeHandler(options: { guard?: boolean } = {}): HandlerWithMock {
  const handler = new AgentAuditCallbackHandler(
    { apiKey: 'aa_test_key', agentId: 'agent-123' },
    { guard: options.guard ?? false }
  ) as HandlerWithMock;

  handler.client.log = jest.fn(async (opts: any) => {
    const log = { id: `log-${Date.now()}`, ...opts };
    return log;
  });
  handler.client.guardrail = jest.fn(async (opts: any) => ({
    allowed: true,
    action: 'allow' as const,
    violations: [],
    severity: 'warning' as const,
    auditLogId: `guard-${Date.now()}`,
  }));

  return handler;
}

describe('AgentAuditCallbackHandler', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID: () => 'trace-123' },
      configurable: true,
    });
  });

  it('starts a trace on LLM start', async () => {
    const handler = makeHandler();
    await handler.handleLLMStart({ id: ['langchain', 'llms', 'OpenAI'] }, ['Hello'], 'run-1');
    expect(handler.trace_id).toBe('trace-123');
    expect(handler.client.log).toHaveBeenCalled();
  });

  it('extracts model name from kwargs', async () => {
    const handler = makeHandler();
    await handler.handleLLMStart({ kwargs: { model: 'gpt-4o' } }, ['Hello'], 'run-1');
    const call = handler.client.log.mock.calls[0][0];
    expect(call.metadata.model).toBe('gpt-4o');
  });

  it('logs chat model start with messages', async () => {
    const handler = makeHandler();
    await handler.handleChatModelStart(
      { kwargs: { model: 'gpt-4' } },
      [[{ type: 'human', content: 'Hi' }]],
      'run-1'
    );
    const call = handler.client.log.mock.calls[1][0];
    expect(call.action).toBe('llm_start');
    expect(call.prompt).toContain('human: Hi');
  });

  it('logs LLM end with token usage', async () => {
    const handler = makeHandler();
    handler.traceId = 'trace-1';
    handler.currentSpanId = 'span-1';
    await handler.handleLLMEnd(
      {
        generations: [[{ text: 'It is sunny.' }]],
        llmOutput: { tokenUsage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 } },
      },
      'run-1'
    );
    const call = handler.client.log.mock.calls[0][0];
    expect(call.action).toBe('llm_end');
    expect(call.response).toBe('It is sunny.');
    expect(call.metadata.tokenUsage.totalTokens).toBe(15);
  });

  it('prefers usage_metadata over tokenUsage', async () => {
    const handler = makeHandler();
    handler.traceId = 'trace-1';
    handler.currentSpanId = 'span-1';
    await handler.handleLLMEnd(
      {
        generations: [[{ text: 'Hi', message: { content: 'Hi', usage_metadata: { input_tokens: 2, output_tokens: 1, total_tokens: 3 } } }]],
        llmOutput: { tokenUsage: { input_tokens: 100 } },
      },
      'run-1'
    );
    const call = handler.client.log.mock.calls[0][0];
    expect(call.metadata.tokenUsage.totalTokens).toBe(3);
  });

  it('logs chain start and end', async () => {
    const handler = makeHandler();
    await handler.handleChainStart({ name: 'my_chain' }, { topic: 'AI' }, 'run-1');
    await handler.handleChainEnd({ answer: '42' }, 'run-1');
    const calls = handler.client.log.mock.calls.map((c) => c[0].action);
    expect(calls).toEqual(['langchain_trace_start', 'chain_start', 'chain_end']);
  });

  it('raises ComplianceViolation when guard blocks chain end', async () => {
    const handler = makeHandler({ guard: true });
    handler.traceId = 'trace-1';
    handler.currentSpanId = 'span-1';
    handler.client.guardrail = jest.fn(async (_opts: any) => ({
      allowed: false,
      action: 'block' as const,
      violations: ['CRITICAL_pii_detect_SSN'],
      severity: 'critical' as const,
    }));

    await expect(handler.handleChainEnd({ answer: '123-45-6789' }, 'run-1')).rejects.toThrow(
      'Blocked by AgentAudit guardrail'
    );
  });

  it('logs tool start and end', async () => {
    const handler = makeHandler();
    handler.traceId = 'trace-1';
    handler.currentSpanId = 'span-1';
    await handler.handleToolStart({ name: 'search' }, 'weather today', 'run-1');
    await handler.handleToolEnd('Sunny, 72F', 'run-1');
    const calls = handler.client.log.mock.calls.map((c) => c[0].action);
    expect(calls).toEqual(['tool_start', 'tool_end']);
  });

  it('logs LLM errors', async () => {
    const handler = makeHandler();
    handler.traceId = 'trace-1';
    handler.currentSpanId = 'span-1';
    await handler.handleLLMError(new Error('model failed'), 'run-1');
    const call = handler.client.log.mock.calls[0][0];
    expect(call.action).toBe('llm_error');
    expect(call.response).toContain('model failed');
  });
});
