-- Idempotent migration for the Phase 5 schema.

CREATE TABLE IF NOT EXISTS "Policy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'flag',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "conditions" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourcePackId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AgentPolicy" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PolicyVersion" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "mode" TEXT NOT NULL DEFAULT 'flag',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "conditions" JSONB,
    "rules" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoredFromId" TEXT,
    CONSTRAINT "PolicyVersion_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ComplianceRule" ADD COLUMN IF NOT EXISTS "actionOverride" TEXT;
ALTER TABLE "ComplianceRule" ADD COLUMN IF NOT EXISTS "policyId" TEXT;

ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "enforcementAction" TEXT NOT NULL DEFAULT 'allow';
ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "violationDetails" JSONB;

CREATE INDEX IF NOT EXISTS "Policy_organizationId_isActive_idx" ON "Policy"("organizationId", "isActive");
CREATE INDEX IF NOT EXISTS "AgentPolicy_agentId_idx" ON "AgentPolicy"("agentId");
CREATE INDEX IF NOT EXISTS "AgentPolicy_policyId_idx" ON "AgentPolicy"("policyId");
CREATE UNIQUE INDEX IF NOT EXISTS "AgentPolicy_agentId_policyId_key" ON "AgentPolicy"("agentId", "policyId");
CREATE INDEX IF NOT EXISTS "PolicyVersion_organizationId_policyId_idx" ON "PolicyVersion"("organizationId", "policyId");
CREATE INDEX IF NOT EXISTS "PolicyVersion_policyId_versionNumber_idx" ON "PolicyVersion"("policyId", "versionNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "PolicyVersion_policyId_versionNumber_key" ON "PolicyVersion"("policyId", "versionNumber");
CREATE INDEX IF NOT EXISTS "ComplianceRule_organizationId_policyId_idx" ON "ComplianceRule"("organizationId", "policyId");
CREATE INDEX IF NOT EXISTS "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

ALTER TABLE "Policy" DROP CONSTRAINT IF EXISTS "Policy_organizationId_fkey";
ALTER TABLE "Policy" ADD CONSTRAINT "Policy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AgentPolicy" DROP CONSTRAINT IF EXISTS "AgentPolicy_agentId_fkey";
ALTER TABLE "AgentPolicy" ADD CONSTRAINT "AgentPolicy_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentPolicy" DROP CONSTRAINT IF EXISTS "AgentPolicy_policyId_fkey";
ALTER TABLE "AgentPolicy" ADD CONSTRAINT "AgentPolicy_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PolicyVersion" DROP CONSTRAINT IF EXISTS "PolicyVersion_policyId_fkey";
ALTER TABLE "PolicyVersion" ADD CONSTRAINT "PolicyVersion_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PolicyVersion" DROP CONSTRAINT IF EXISTS "PolicyVersion_organizationId_fkey";
ALTER TABLE "PolicyVersion" ADD CONSTRAINT "PolicyVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ComplianceRule" DROP CONSTRAINT IF EXISTS "ComplianceRule_policyId_fkey";
ALTER TABLE "ComplianceRule" ADD CONSTRAINT "ComplianceRule_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TYPE IF EXISTS "Plan";
