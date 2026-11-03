ALTER TABLE "Organization" ALTER COLUMN "password" DROP NOT NULL;
ALTER TABLE "Organization" ADD COLUMN "provider" TEXT NOT NULL DEFAULT 'local';
ALTER TABLE "Organization" ADD COLUMN "providerId" TEXT;
CREATE UNIQUE INDEX "Organization_provider_providerId_key" ON "Organization"("provider", "providerId");
