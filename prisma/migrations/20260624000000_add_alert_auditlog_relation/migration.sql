-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_auditLogId_fkey" FOREIGN KEY ("auditLogId") REFERENCES "AuditLog"("id") ON DELETE SET NULL ON UPDATE CASCADE;
