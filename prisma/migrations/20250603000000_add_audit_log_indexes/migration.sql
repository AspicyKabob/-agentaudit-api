-- Create indexes for high-throughput batch queries
CREATE INDEX "idx_audit_log_org_traceId" ON "AuditLog" ("organizationId", "traceId");
CREATE INDEX "idx_audit_log_org_parentSpanId" ON "AuditLog" ("organizationId", "parentSpanId");
CREATE INDEX "idx_audit_log_org_createdAt" ON "AuditLog" ("organizationId", "createdAt" DESC);
