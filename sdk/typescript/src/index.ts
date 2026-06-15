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

export interface Policy {
  id: string;
  name: string;
  description?: string;
  mode: 'block' | 'flag' | 'log';
  priority: number;
  isActive: boolean;
  sourcePackId: string | null;
  rules?: ComplianceRule[];
  agents?: AgentPolicy[];
  createdAt: string;
}

export interface AgentPolicy {
  id: string;
  agentId: string;
  policyId: string;
  createdAt: string;
}

export interface ComplianceRule {
  id: string;
  name: string;
  ruleType: string;
  condition: Record<string, any>;
  severity: 'warning' | 'critical';
  isActive: boolean;
  actionOverride?: 'block' | 'flag' | 'log';
  policyId?: string;
  packId?: string;
  createdAt: string;
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
  action: 'allow' | 'block' | 'flag' | 'log';
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
   * List all policies for the organization.
   */
  async listPolicies(): Promise<Policy[]> {
    const { data } = await this.client.get<Policy[]>('/policies');
    return data;
  }

  /**
   * Create an empty policy.
   */
  async createPolicy(options: {
    name: string;
    description?: string;
    mode?: 'block' | 'flag' | 'log';
    priority?: number;
  }): Promise<Policy> {
    const { data } = await this.client.post<Policy>('/policies', options);
    return data;
  }

  /**
   * Get a single policy by ID, including its rules and agent assignments.
   */
  async getPolicy(policyId: string): Promise<Policy> {
    const { data } = await this.client.get<Policy>(`/policies/${policyId}`);
    return data;
  }

  /**
   * Clone a pre-built compliance pack into a new policy.
   */
  async clonePack(options: {
    name: string;
    description?: string;
    packId: 'hippo' | 'finance' | 'gdpr';
    mode?: 'block' | 'flag' | 'log';
    priority?: number;
  }): Promise<Policy> {
    const { data } = await this.client.post<Policy>('/policies/clone-pack', options);
    return data;
  }

  /**
   * Assign a policy to an agent.
   */
  async assignPolicy(policyId: string, agentId: string): Promise<AgentPolicy> {
    const { data } = await this.client.post<AgentPolicy>(`/policies/${policyId}/agents`, { agentId });
    return data;
  }

  /**
   * Remove a policy assignment from an agent.
   */
  async removePolicy(policyId: string, agentId: string): Promise<void> {
    await this.client.delete(`/policies/${policyId}/agents`, { data: { agentId } });
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
    const enforcementAction = (data as any).enforcementAction || 'allow';
    const severity = flags.some((f: string) => f.startsWith('CRITICAL')) ? 'critical' : 'warning';

    return {
      allowed: enforcementAction !== 'block',
      action: enforcementAction,
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
  ): Promise<{ data: AuditLog[]; processed: number; errors: number }> {
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
    const { data } = await this.client.post<{ data: AuditLog[]; processed: number; errors: number }>('/audit-logs/batch', enriched);
    return data;
  }
}

export default AgentAudit;
