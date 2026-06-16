import { AgentAudit, AgentAuditConfig, GuardrailResult } from './index';

let BaseCallbackHandlerClass: any;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const base = require('@langchain/core/callbacks/base');
  BaseCallbackHandlerClass = base.BaseCallbackHandler;
} catch {
  // Stub used only when @langchain/core is not installed. The resulting
  // instance is not a valid LangChain callback, but the class can still be
  // imported and the runtime error is deferred until asHandler() is called.
  BaseCallbackHandlerClass = class {
    name = 'stub_base_callback_handler';
  };
}

export class AgentAuditCallbackHandler extends BaseCallbackHandlerClass {
  name = 'agentaudit_callback_handler';

  /** @internal */
  client: AgentAudit;
  private guard: boolean;
  /** @internal */
  traceId?: string;
  /** @internal */
  currentSpanId?: string;
  private rootSpanId?: string;

  constructor(
    config: AgentAuditConfig,
    options: { guard?: boolean } = {}
  ) {
    // BaseCallbackHandler constructor may accept no args or an object with
    // ignore* flags; pass nothing to keep the call compatible across versions.
    super();
    this.client = new AgentAudit(config);
    this.guard = options.guard ?? true;
  }

  get trace_id(): string | undefined {
    return this.traceId;
  }

  /** Return the underlying LangChain-compatible callback handler instance. */
  asHandler(): AgentAuditCallbackHandler {
    if (!this.isLangChainAvailable()) {
      throw new Error(
        'The AgentAudit LangChain callback handler requires @langchain/core. ' +
          'Install it with: npm install @langchain/core'
      );
    }
    return this;
  }

  private isLangChainAvailable(): boolean {
    try {
      require.resolve('@langchain/core/callbacks/base');
      return true;
    } catch {
      return false;
    }
  }

  private startTrace(metadata?: Record<string, any>): void {
    this.traceId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;
    void this.client
      .log({
        action: 'langchain_trace_start',
        metadata,
        traceId: this.traceId,
      })
      .then((log) => {
        this.rootSpanId = log.id;
        this.currentSpanId = log.id;
      });
  }

  private updateSpan(spanId?: string): void {
    if (spanId) {
      this.currentSpanId = spanId;
    }
  }

  private async guardOrLog(
    action: string,
    options: {
      prompt?: string;
      response?: string;
      metadata?: Record<string, any>;
    } = {}
  ): Promise<GuardrailResult | undefined> {
    if (this.guard) {
      const result = await this.client.guardrail({
        action,
        prompt: options.prompt,
        response: options.response,
        metadata: options.metadata,
        traceId: this.traceId,
        parentSpanId: this.currentSpanId,
      });
      if (!result.allowed) {
        const err = new Error(
          `Blocked by AgentAudit guardrail (${action}): ${result.violations.join(', ')}`
        ) as any;
        err.violations = result.violations;
        err.severity = result.severity;
        err.name = 'ComplianceViolation';
        throw err;
      }
      return result;
    }
    await this.client.log({
      action,
      prompt: options.prompt,
      response: options.response,
      metadata: options.metadata,
      traceId: this.traceId,
      parentSpanId: this.currentSpanId,
    });
    return undefined;
  }

  async handleLLMStart(
    llm: any,
    prompts: string[],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string
  ): Promise<void> {
    if (!this.traceId) {
      this.startTrace({ model: this.extractModel(llm) });
    }
    const log = await this.client.log({
      action: 'llm_start',
      prompt: prompts.join('\n'),
      metadata: {
        model: this.extractModel(llm),
        event: 'llm_start',
        runId,
        parentRunId,
        runName,
        tags,
        extraParams,
      },
      traceId: this.traceId,
      parentSpanId: this.currentSpanId,
    });
    this.updateSpan(log.id);
  }

  async handleChatModelStart(
    llm: any,
    messages: any[][],
    runId: string,
    parentRunId?: string,
    extraParams?: Record<string, unknown>,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string
  ): Promise<void> {
    if (!this.traceId) {
      this.startTrace({ model: this.extractModel(llm) });
    }
    const prompt = this.stringifyMessages(messages);
    const log = await this.client.log({
      action: 'llm_start',
      prompt,
      metadata: {
        model: this.extractModel(llm),
        event: 'chat_model_start',
        runId,
        parentRunId,
        runName,
        tags,
      },
      traceId: this.traceId,
      parentSpanId: this.currentSpanId,
    });
    this.updateSpan(log.id);
  }

  async handleLLMEnd(output: any, runId: string): Promise<void> {
    const outputText = this.extractOutputText(output);
    const tokenUsage = this.extractTokenUsage(output);
    await this.guardOrLog('llm_end', {
      response: outputText,
      metadata: { tokenUsage, event: 'llm_end', runId },
    });
  }

  async handleLLMError(err: Error, runId: string): Promise<void> {
    await this.client.log({
      action: 'llm_error',
      response: err.message,
      metadata: { event: 'llm_error', runId },
      traceId: this.traceId,
      parentSpanId: this.currentSpanId,
    });
  }

  async handleChainStart(
    chain: any,
    inputs: Record<string, any>,
    runId: string,
    runType?: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string
  ): Promise<void> {
    if (!this.traceId) {
      this.startTrace({ chain: chain?.name ?? 'unknown' });
    }
    const log = await this.client.log({
      action: 'chain_start',
      prompt: JSON.stringify(inputs),
      metadata: {
        chain: chain?.name ?? 'unknown',
        event: 'chain_start',
        runId,
        runType,
        runName,
        tags,
      },
      traceId: this.traceId,
      parentSpanId: this.currentSpanId,
    });
    this.updateSpan(log.id);
  }

  async handleChainEnd(outputs: Record<string, any>, runId: string): Promise<void> {
    await this.guardOrLog('chain_end', {
      response: JSON.stringify(outputs),
      metadata: { event: 'chain_end', runId },
    });
  }

  async handleChainError(err: Error, runId: string): Promise<void> {
    await this.client.log({
      action: 'chain_error',
      response: err.message,
      metadata: { event: 'chain_error', runId },
      traceId: this.traceId,
      parentSpanId: this.currentSpanId,
    });
  }

  async handleToolStart(
    tool: any,
    input: string,
    runId: string,
    parentRunId?: string,
    tags?: string[],
    metadata?: Record<string, unknown>,
    runName?: string
  ): Promise<void> {
    if (!this.traceId) {
      this.startTrace();
    }
    const log = await this.client.log({
      action: 'tool_start',
      prompt: input,
      metadata: {
        tool: tool?.name ?? 'unknown',
        event: 'tool_start',
        runId,
        parentRunId,
        runName,
        tags,
      },
      traceId: this.traceId,
      parentSpanId: this.currentSpanId,
    });
    this.updateSpan(log.id);
  }

  async handleToolEnd(output: any, runId: string): Promise<void> {
    await this.guardOrLog('tool_end', {
      response: typeof output === 'string' ? output : JSON.stringify(output),
      metadata: { event: 'tool_end', runId },
    });
  }

  async handleToolError(err: Error, runId: string): Promise<void> {
    await this.client.log({
      action: 'tool_error',
      response: err.message,
      metadata: { event: 'tool_error', runId },
      traceId: this.traceId,
      parentSpanId: this.currentSpanId,
    });
  }

  async handleAgentAction(action: any, runId: string): Promise<void> {
    if (!this.traceId) {
      this.startTrace();
    }
    const log = await this.client.log({
      action: 'agent_action',
      prompt: action?.log ?? '',
      metadata: {
        tool: action?.tool ?? 'unknown',
        toolInput: action?.toolInput,
        event: 'agent_action',
        runId,
      },
      traceId: this.traceId,
      parentSpanId: this.currentSpanId,
    });
    this.updateSpan(log.id);
  }

  async handleAgentEnd(action: any, runId: string): Promise<void> {
    const outputText =
      typeof action?.returnValues?.output === 'string'
        ? action.returnValues.output
        : JSON.stringify(action?.returnValues ?? {});
    await this.guardOrLog('agent_finish', {
      response: outputText,
      metadata: { event: 'agent_finish', runId, log: action?.log },
    });
  }

  private extractModel(serialized: any): string {
    if (serialized?.kwargs?.model) {
      return serialized.kwargs.model;
    }
    if (Array.isArray(serialized?.id) && serialized.id.length > 0) {
      return serialized.id[serialized.id.length - 1];
    }
    return 'unknown';
  }

  private stringifyMessages(messages: any[][]): string {
    const lines: string[] = [];
    for (const conversation of messages) {
      for (const message of conversation) {
        if (typeof message === 'string') {
          lines.push(message);
        } else if (message?.content) {
          const role = message.type ?? message._getType?.() ?? 'message';
          lines.push(`${role}: ${message.content}`);
        } else {
          lines.push(JSON.stringify(message));
        }
      }
    }
    return lines.join('\n');
  }

  private extractOutputText(output: any): string {
    if (!output?.generations) {
      return '';
    }
    const texts: string[] = [];
    for (const generationList of output.generations) {
      for (const generation of generationList) {
        if (typeof generation?.text === 'string') {
          texts.push(generation.text);
        } else if (generation?.message?.content) {
          texts.push(generation.message.content);
        }
      }
    }
    return texts.join('\n');
  }

  private extractTokenUsage(output: any): Record<string, number> {
    const empty = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    // Prefer usage_metadata on the first message
    try {
      const message = output?.generations?.[0]?.[0]?.message;
      const usage = message?.usage_metadata ?? message?.usageMetadata;
      if (usage && typeof usage === 'object') {
        return {
          promptTokens: usage.input_tokens ?? 0,
          completionTokens: usage.output_tokens ?? 0,
          totalTokens: usage.total_tokens ?? 0,
        };
      }
    } catch {
      // fall through
    }

    // Fall back to llmOutput
    const llmOutput = output?.llmOutput ?? {};
    const tokenUsage = llmOutput?.tokenUsage ?? llmOutput?.token_usage ?? {};
    if (tokenUsage && typeof tokenUsage === 'object') {
      return {
        promptTokens:
          tokenUsage.input_tokens ?? tokenUsage.prompt_tokens ?? llmOutput?.promptTokens ?? 0,
        completionTokens:
          tokenUsage.output_tokens ??
          tokenUsage.completion_tokens ??
          llmOutput?.completionTokens ??
          0,
        totalTokens:
          tokenUsage.total_tokens ??
          llmOutput?.totalTokens ??
          (tokenUsage.input_tokens ?? 0) + (tokenUsage.output_tokens ?? 0),
      };
    }

    return empty;
  }
}
