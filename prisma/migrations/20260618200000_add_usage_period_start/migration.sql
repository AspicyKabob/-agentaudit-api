-- Add a billing-period window anchor so monthly quota usage can be reset.
ALTER TABLE "Organization"
ADD COLUMN "usagePeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Anchor existing organizations to the start of the current calendar month (UTC).
UPDATE "Organization"
SET "usagePeriodStart" = date_trunc('month', (now() AT TIME ZONE 'UTC'));
