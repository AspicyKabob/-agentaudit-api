-- Align existing production databases with the ComplianceRule fields used by
-- policy-scoped guardrails and per-rule enforcement overrides.
ALTER TABLE "ComplianceRule"
ADD COLUMN IF NOT EXISTS "policyId" TEXT;

ALTER TABLE "ComplianceRule"
ADD COLUMN IF NOT EXISTS "actionOverride" TEXT;

CREATE INDEX IF NOT EXISTS "ComplianceRule_organizationId_policyId_idx"
ON "ComplianceRule"("organizationId", "policyId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'ComplianceRule_policyId_fkey'
    ) THEN
        ALTER TABLE "ComplianceRule"
        ADD CONSTRAINT "ComplianceRule_policyId_fkey"
        FOREIGN KEY ("policyId") REFERENCES "Policy"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
