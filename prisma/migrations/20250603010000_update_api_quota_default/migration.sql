-- Update Organization apiQuota default from 1000 to 5000
ALTER TABLE "Organization" ALTER COLUMN "apiQuota" SET DEFAULT 5000;

-- Update existing organizations to match new plan-based quotas
UPDATE "Organization"
SET "apiQuota" = CASE plan
  WHEN 'free' THEN 5000
  WHEN 'pro' THEN 50000
  WHEN 'business' THEN 250000
  WHEN 'enterprise' THEN 999999999
  ELSE 5000
END;