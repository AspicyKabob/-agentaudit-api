-- Align existing production databases with the audit enforcement fields used by
-- policy evaluation and guardrail decisions.
ALTER TABLE "AuditLog"
ADD COLUMN IF NOT EXISTS "enforcementAction" TEXT NOT NULL DEFAULT 'allow';

ALTER TABLE "AuditLog"
ADD COLUMN IF NOT EXISTS "violationDetails" JSONB;
