-- Add trace columns to AuditLog for agent-to-agent audit trails
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "traceId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "parentSpanId" TEXT;

-- Create indexes for efficient trace and chain queries
CREATE INDEX IF NOT EXISTS "AuditLog_traceId_idx" ON "AuditLog"("traceId");
CREATE INDEX IF NOT EXISTS "AuditLog_parentSpanId_idx" ON "AuditLog"("parentSpanId");
