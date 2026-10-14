ALTER TABLE "EmailDelivery"
ADD COLUMN "attemptCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
ADD COLUMN "deadLetteredAt" TIMESTAMP(3);

CREATE INDEX "EmailDelivery_status_nextAttemptAt_idx"
ON "EmailDelivery"("status", "nextAttemptAt");
