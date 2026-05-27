-- Safely add trace columns if they don't exist (handles init migration differences)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'AuditLog' AND column_name = 'traceId'
    ) THEN
        ALTER TABLE "AuditLog" ADD COLUMN "traceId" TEXT;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'AuditLog' AND column_name = 'parentSpanId'
    ) THEN
        ALTER TABLE "AuditLog" ADD COLUMN "parentSpanId" TEXT;
    END IF;
END $$;

-- Create indexes for efficient trace and chain queries
CREATE INDEX IF NOT EXISTS "AuditLog_traceId_idx" ON "AuditLog"("traceId");
CREATE INDEX IF NOT EXISTS "AuditLog_parentSpanId_idx" ON "AuditLog"("parentSpanId");
