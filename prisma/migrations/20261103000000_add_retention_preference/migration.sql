ALTER TABLE "Organization" ADD COLUMN "retentionDays" INTEGER;

ALTER TABLE "Organization" ADD CONSTRAINT "Organization_retentionDays_check"
CHECK ("retentionDays" IS NULL OR "retentionDays" IN (7, 30, 90));

CREATE INDEX "Alert_organizationId_createdAt_idx" ON "Alert"("organizationId", "createdAt");
CREATE INDEX "Alert_auditLogId_idx" ON "Alert"("auditLogId");
