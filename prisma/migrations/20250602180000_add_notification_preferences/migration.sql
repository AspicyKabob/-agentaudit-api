-- Add notification preference columns to Organization
ALTER TABLE "Organization" ADD COLUMN "notifyWebhook" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organization" ADD COLUMN "notifyEmail" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Organization" ADD COLUMN "notifyMinSeverity" TEXT NOT NULL DEFAULT 'warning';
