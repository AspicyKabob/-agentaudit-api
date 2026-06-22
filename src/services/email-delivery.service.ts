import { prisma } from '../db/prisma';
import { logger } from '../utils/logger';

export type EmailType =
  | 'welcome'
  | 'alert'
  | 'billing-activated'
  | 'billing-plan-change'
  | 'billing-renewal'
  | 'billing-payment-failed'
  | 'billing-payment-recovered'
  | 'billing-cancelled';

export type EmailStatus =
  | 'pending'
  | 'sent'
  | 'delivered'
  | 'bounced'
  | 'complained'
  | 'suppressed'
  | 'failed'
  | 'skipped';

interface RecordDeliveryInput {
  organizationId?: string;
  type: EmailType;
  to: string;
  subject: string;
  eventId?: string;
  dedupeKey?: string;
  providerMessageId?: string;
  status?: EmailStatus;
  error?: string;
}

export const emailDeliveryService = {
  async isDuplicate(dedupeKey: string): Promise<boolean> {
    if (!dedupeKey) return false;
    const existing = await prisma.emailDelivery.findUnique({
      where: { dedupeKey },
    });
    return !!existing;
  },

  async recordDelivery(input: RecordDeliveryInput) {
    const record = await prisma.emailDelivery.create({
      data: {
        organizationId: input.organizationId,
        type: input.type,
        to: input.to,
        subject: input.subject,
        eventId: input.eventId,
        dedupeKey: input.dedupeKey,
        providerMessageId: input.providerMessageId,
        status: input.status || 'pending',
        error: input.error,
      },
    });

    logger.info({
      emailDeliveryId: record.id,
      type: record.type,
      to: record.to,
      status: record.status,
    }, 'Email delivery recorded');

    return record;
  },

  async updateStatusById(
    id: string,
    status: EmailStatus,
    updates?: { providerMessageId?: string; error?: string }
  ) {
    const updated = await prisma.emailDelivery.update({
      where: { id },
      data: {
        status,
        ...(updates?.providerMessageId && { providerMessageId: updates.providerMessageId }),
        ...(updates?.error && { error: updates.error }),
        updatedAt: new Date(),
      },
    });

    logger.info({
      emailDeliveryId: updated.id,
      type: updated.type,
      status: updated.status,
      error: updated.error,
    }, 'Email delivery status updated');

    return updated;
  },

  async updateStatusByProviderMessageId(
    providerMessageId: string,
    status: EmailStatus,
    error?: string
  ) {
    if (!providerMessageId) return null;

    const record = await prisma.emailDelivery.findFirst({
      where: { providerMessageId },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      logger.warn({ providerMessageId, status }, 'No email delivery record found for provider message ID');
      return null;
    }

    return this.updateStatusById(record.id, status, { error });
  },

  async listRecentFailures(limit: number = 50) {
    return prisma.emailDelivery.findMany({
      where: {
        status: { in: ['bounced', 'complained', 'suppressed', 'failed'] },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        type: true,
        to: true,
        status: true,
        error: true,
        createdAt: true,
      },
    });
  },
};
