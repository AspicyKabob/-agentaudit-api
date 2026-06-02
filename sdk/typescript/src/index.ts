import axios, { AxiosInstance } from 'axios';

export interface AuditLog {
  id: string;
  action: string;
  agentId?: string;
  prompt?: string;
  response?: string;
  metadata?: Record<string, any>;
  complianceFlags: string[];
  createdAt: string;
}

export interface Agent {
  id: string;
  name: string;
  type: string;
  description?: string;
  config?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface QueryLogsResponse {
  data: AuditLog[];
  pagination: Pagination;
}

export interface Alert {
  id: string;
  severity: 'warning' | 'critical';
  message: string;
  isResolved: boolean;
  createdAt: string;
  resolvedAt?: string;
}

export interface GuardrailResult {
  allowed: boolean;
  action: 'allow' | 'block' | 'flag';
  violations: string[];
  severity: 'warning' | 'critical';
  auditLogId?: string;
}

export interface AgentAuditConfig {
  apiKey: string;
  baseUrl?: string;
  agentId?: string;
}

export class AgentAudit {
  private client: AxiosInstance;
  private agentId?: string;

  constructor(config: AgentAuditConfig) {
    this.agentId = config.agentId;
    this.client = axios.create({
      baseURL: (config.baseUrl || 'https://agentaudit-api-production.up.railway.app/api/v1').replace(/\/$/, ''),
      headers: {
        'X-API-Key': config.apiKey,
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });
  }

  /**
   * Submit an audit log entry.
   */
  async log(options: {
    action: string;
    prompt?: string;
    response?: string;
    metadata?: Record<string, any>;
    agentId?: string;
    traceId?: string;
    parentSpanId?: string;
  }): Promise<AuditLog> {
    const payload: Record<string, any> = {
      action: options.action,
    };

    const agentId = options.agentId || this.agentId;
    if (agentId) payload.agentId = agentId;
    if (options.prompt) payload.prompt = options.prompt;
    if (options.response) payload.response = options.response;
    if (options.metadata) payload.metadata = options.metadata;
    if (options.traceId) payload.traceId = options.traceId;
    if (options.parentSpanId) payload.parentSpanId = options.parentSpanId;

    const { data } = await this.client.post<AuditLog>('/audit-logs', payload);
    return data;
  }

  /**
   * Register a new agent.
   */
  async registerAgent(options: {
    name: string;
    type: 'langchain' | 'crewai' | 'autogpt' | 'custom';
    description?: string;
    config?: Record<string, any>;
  }): Promise<Agent> {
    const { data } = await this.client.post<Agent>('/agents', options);
    return data;
  }

  /**
   * List all registered agents.
   */
  async listAgents(): Promise<Agent[]> {
    const { data } = await this.client.get<Agent[]>('/agents');
    return data;
  }

  /**
   * Query audit logs with filters.
   */
  async queryLogs(options?: {
    action?: string;
    agentId?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
  }): Promise<QueryLogsResponse> {
    const params = new URLSearchParams();
    if (options?.action) params.append('action', options.action);
    if (options?.agentId) params.append('agentId', options.agentId);
    if (options?.startDate) params.append('startDate', options.startDate.toISOString());
    if (options?.endDate) params.append('endDate', options.endDate.toISOString());
    if (options?.page) params.append('page', String(options.page));
    if (options?.limit) params.append('limit', String(options.limit));

    const { data } = await this.client.get<QueryLogsResponse>(`/audit-logs?${params.toString()}`);
    return data;
  }

  /**
   * Get compliance alerts.
   */
  async getAlerts(options?: {
    isResolved?: boolean;
    severity?: 'warning' | 'critical';
  }): Promise<Alert[]> {
    const params = new URLSearchParams();
    if (options?.isResolved !== undefined) params.append('isResolved', String(options.isResolved));
    if (options?.severity) params.append('severity', options.severity);

    const { data } = await this.client.get<Alert[]>(`/alerts?${params.toString()}`);
    return data;
  }

  /**
   * Resolve an alert.
   */
  async resolveAlert(alertId: string): Promise<Alert> {
    const { data } = await this.client.patch<Alert>(`/alerts/${alertId}/resolve`);
    return data;
  }

  async guardrail(options: {
    action: string;
    prompt?: string;
    response?: string;
    metadata?: Record<string, any>;
    agentId?: string;
    traceId?: string;
    parentSpanId?: string;
  }): Promise<GuardrailResult> {
    const payload: Record<string, any> = {
      action: options.action,
      checkType: 'realtime',
    };

    const agentId = options.agentId || this.agentId;
    if (agentId) payload.agentId = agentId;
    if (options.prompt) payload.prompt = options.prompt;
    if (options.response) payload.response = options.response;
    if (options.metadata) payload.metadata = options.metadata;
    if (options.traceId) payload.traceId = options.traceId;
    if (options.parentSpanId) payload.parentSpanId = options.parentSpanId;

    const { data } = await this.client.post<AuditLog>('/audit-logs', payload);
    const flags = data.complianceFlags || [];
    const severity = flags.some((f: string) => f.includes('PII') || f.toLowerCase().includes('block'))
      ? 'critical'
      : 'warning';
    const actionResult: GuardrailResult['action'] = severity === 'critical' && flags.length > 0
      ? 'block'
      : flags.length > 0
        ? 'flag'
        : 'allow';

    return {
      allowed: actionResult !== 'block',
      action: actionResult,
      violations: flags,
      severity,
      auditLogId: data.id,
    };
  }
  /**
   * Submit a batch of audit log entries.
   */
  async logBatch(
    entries: Array<{
      action: string;
      prompt?: string;
      response?: string;
      metadata?: Record<string, any>;
      agentId?: string;
      traceId?: string;
      parentSpanId?: string;
    }>
  ): Promise<AuditLog[]> {
    const enriched = entries.map((entry) => {
      const agentId = entry.agentId || this.agentId;
      return {
        action: entry.action,
        ...(agentId ? { agentId } : {}),
        ...(entry.prompt ? { prompt: entry.prompt } : {}),
        ...(entry.response ? { response: entry.response } : {}),
        ...(entry.metadata ? { metadata: entry.metadata } : {}),
        ...(entry.traceId ? { traceId: entry.traceId } : {}),
        ...(entry.parentSpanId ? { parentSpanId: entry.parentSpanId } : {}),
      };
    });
    const { data } = await this.client.post<AuditLog[]>('/audit-logs/batch', enriched);
    return data;
  }
}

export default AgentAudit;
