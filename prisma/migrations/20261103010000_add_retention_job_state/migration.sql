CREATE TABLE "RetentionJobState" (
    "id" TEXT NOT NULL,
    "deletionEnabled" BOOLEAN NOT NULL DEFAULT false,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "lastStartedAt" TIMESTAMP(3),
    "lastSucceededAt" TIMESTAMP(3),
    "lastSummary" JSONB,
    "dryRunCursor" TEXT,
    "executionCursor" TEXT,
    CONSTRAINT "RetentionJobState_pkey" PRIMARY KEY ("id")
);
