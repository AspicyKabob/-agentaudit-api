-- Create a delivery-tracking table for transactional emails.
-- This powers idempotency, deduplication, and Resend webhook status updates
-- for welcome, billing, and compliance-alert emails.
CREATE TABLE "EmailDelivery" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT,
  "type" TEXT NOT NULL,
  "eventId" TEXT,
  "dedupeKey" TEXT,
  "to" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'resend',
  "providerMessageId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "EmailDelivery_pkey" PRIMARY KEY ("id")
);

-- Unique constraint for per-event dedupe keys (e.g., billing event IDs).
CREATE UNIQUE INDEX "EmailDelivery_dedupeKey_key" ON "EmailDelivery"("dedupeKey");

-- Indexes for common operational lookups.
CREATE INDEX "EmailDelivery_organizationId_type_idx" ON "EmailDelivery"("organizationId", "type");
CREATE INDEX "EmailDelivery_providerMessageId_idx" ON "EmailDelivery"("providerMessageId");
CREATE INDEX "EmailDelivery_status_createdAt_idx" ON "EmailDelivery"("status", "createdAt");
