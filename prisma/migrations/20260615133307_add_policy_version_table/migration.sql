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

CREATE INDEX IF NOT EXISTS "PolicyVersion_organizationId_policyId_idx" ON "PolicyVersion"("organizationId", "policyId");
CREATE INDEX IF NOT EXISTS "PolicyVersion_policyId_versionNumber_idx" ON "PolicyVersion"("policyId", "versionNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "PolicyVersion_policyId_versionNumber_key" ON "PolicyVersion"("policyId", "versionNumber");

ALTER TABLE "PolicyVersion" DROP CONSTRAINT IF EXISTS "PolicyVersion_policyId_fkey";
ALTER TABLE "PolicyVersion" ADD CONSTRAINT "PolicyVersion_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PolicyVersion" DROP CONSTRAINT IF EXISTS "PolicyVersion_organizationId_fkey";
ALTER TABLE "PolicyVersion" ADD CONSTRAINT "PolicyVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
