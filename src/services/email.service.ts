import { Resend } from 'resend';
import { config } from '../config';
import { logger } from '../utils/logger';
import { emailDeliveryService, EmailType } from './email-delivery.service';

let resend: Resend | null = null;

function getResend(): Resend | null {
  if (resend) return resend;
  const apiKey = config.get('resendApiKey');
  if (!apiKey) {
    logger.warn('RESEND_API_KEY not configured — emails will be skipped');
    return null;
  }
  resend = new Resend(apiKey);
  return resend;
}

function getReplyTo(): string | undefined {
  const support = config.get('supportEmail');
  if (support && support.trim().length > 0) return support;
  return undefined;
}

function getDashboardUrl(): string {
  return config.get('frontendUrl').replace(/\/$/, '') + '/dashboard.html';
}

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
  type?: EmailType;
  organizationId?: string;
  eventId?: string;
  dedupeKey?: string;
}

export const emailService = {
  async send(payload: EmailPayload): Promise<{ id?: string; error?: string; deliveryId?: string }> {
    try {
      if (payload.dedupeKey && (await emailDeliveryService.isDuplicate(payload.dedupeKey))) {
        logger.info({ dedupeKey: payload.dedupeKey, to: payload.to }, 'Duplicate email skipped');
        return { error: 'duplicate' };
      }

      const client = getResend();
      const from = payload.from || config.get('resendFromEmail');
      const replyTo = payload.replyTo || getReplyTo();
      let deliveryId: string | undefined;

      try {
        const delivery = await emailDeliveryService.recordDelivery({
          organizationId: payload.organizationId,
          type: payload.type || 'alert',
          to: Array.isArray(payload.to) ? payload.to.join(', ') : payload.to,
          subject: payload.subject,
          eventId: payload.eventId,
          dedupeKey: payload.dedupeKey,
          status: client ? 'pending' : 'skipped',
        });
        deliveryId = delivery.id;
      } catch (recordErr) {
        const message = recordErr instanceof Error ? recordErr.message : String(recordErr);
        logger.warn({ error: message, to: payload.to }, 'Failed to record email delivery; continuing');
      }

      if (!client) {
        logger.info({ to: payload.to, subject: payload.subject }, 'Email skipped (Resend not configured)');
        return { error: 'Resend not configured', deliveryId };
      }

      const { data, error } = await client.emails.send({
        from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        replyTo,
      });

      if (error) {
        if (deliveryId) {
          await emailDeliveryService.updateStatusById(deliveryId, 'failed', { error: error.message }).catch(() => {});
        }
        logger.error({ error, to: payload.to }, 'Resend email error');
        return { error: error.message, deliveryId };
      }

      if (deliveryId) {
        await emailDeliveryService.updateStatusById(deliveryId, 'sent', { providerMessageId: data?.id }).catch(() => {});
      }
      logger.info({ emailId: data?.id, to: payload.to }, 'Email sent');
      return { id: data?.id, deliveryId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ error: message, to: payload.to }, 'Email send exception');
      return { error: message };
    }
  },

  async sendAlert(to: string, alert: {
    severity: string;
    message: string;
    action: string;
    violations?: string[];
  }, organizationId?: string): Promise<{ id?: string; error?: string; deliveryId?: string }> {
    const violationsList = alert.violations?.length
      ? `<ul>${alert.violations.map(v => `<li>${v}</li>`).join('')}</ul>`
      : '';

    return this.send({
      to,
      type: 'alert',
      organizationId,
      subject: `[AgentAudit] ${alert.severity.toUpperCase()} — ${alert.message}`,
      html: `
        <div style="font-family:Inter,system-ui,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
          <div style="background:#dc2626;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0">
            <h2 style="margin:0;font-size:18px">AgentAudit Alert</h2>
          </div>
          <div style="border:1px solid #e5e5e5;border-top:none;padding:24px;border-radius:0 0 8px 8px">
            <p style="margin:0 0 12px"><strong>Severity:</strong> <span style="color:${alert.severity === 'critical' ? '#dc2626' : '#ca8a04'}">${alert.severity}</span></p>
            <p style="margin:0 0 12px"><strong>Action:</strong> ${alert.action}</p>
            <p style="margin:0 0 12px"><strong>Message:</strong> ${alert.message}</p>
            ${violationsList ? `<p style="margin:0 0 8px"><strong>Violations:</strong></p>${violationsList}` : ''}
            <p style="margin:24px 0 0;font-size:13px;color:#78716c">View in dashboard: <a href="${getDashboardUrl()}">AgentAudit Dashboard</a></p>
          </div>
        </div>
      `,
      text: `AgentAudit Alert\nSeverity: ${alert.severity}\nAction: ${alert.action}\nMessage: ${alert.message}\n${alert.violations ? 'Violations: ' + alert.violations.join(', ') : ''}\nDashboard: ${getDashboardUrl()}`,
    });
  },

  async sendWelcome(to: string, name: string, organizationId?: string): Promise<{ id?: string; error?: string; deliveryId?: string }> {
    return this.send({
      to,
      type: 'welcome',
      organizationId,
      subject: 'Welcome to AgentAudit — your compliance layer is ready',
      html: `
        <div style="font-family:Inter,system-ui,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
          <div style="background:#0c0c0c;color:#fafaf9;padding:32px 24px;text-align:center;border-radius:8px 8px 0 0">
            <h1 style="margin:0;font-size:28px;font-weight:800">Welcome to AgentAudit</h1>
            <p style="margin:8px 0 0;color:#a8a29e">Real-time guardrails for AI agents</p>
          </div>
          <div style="border:1px solid #e5e5e5;border-top:none;padding:32px 24px;border-radius:0 0 8px 8px">
            <p>Hi ${name},</p>
            <p>Your AgentAudit account is active. Here's how to get started in under 5 minutes:</p>
            <ol>
              <li><strong>Get your API key</strong> from the <a href="${getDashboardUrl()}">dashboard</a></li>
              <li><strong>Install the SDK:</strong> <code>pip install agentaudit-client</code> or <code>npm install agentaudit-client</code></li>
              <li><strong>Guard your first agent output</strong> with one line of code</li>
            </ol>
            <p style="margin:24px 0 0">Need help? Reply to this email or visit our <a href="${config.get('frontendUrl').replace(/\/$/, '')}/features.html">features page</a>.</p>
          </div>
        </div>
      `,
      text: `Welcome to AgentAudit, ${name}!\n\nYour account is active. Get started:\n1. Get your API key: ${getDashboardUrl()}\n2. Install the SDK: pip install agentaudit-client   or   npm install agentaudit-client\n3. Guard your first agent output with one line of code\n\nNeed help? Visit ${config.get('frontendUrl').replace(/\/$/, '')}/features.html`,
    });
  },

  // Billing emails
  async sendSubscriptionActivated(to: string, organizationId: string, plan: string, metadata?: { eventId?: string; dedupeKey?: string }): Promise<{ id?: string; error?: string; deliveryId?: string }> {
    return this.send({
      to,
      type: 'billing-activated',
      organizationId,
      eventId: metadata?.eventId,
      dedupeKey: metadata?.dedupeKey,
      subject: `Your AgentAudit ${plan.charAt(0).toUpperCase() + plan.slice(1)} plan is active`,
      html: this._billingHtml(`Welcome to AgentAudit ${plan.charAt(0).toUpperCase() + plan.slice(1)}`, `Your subscription is now active. You can manage your plan, payment method, and invoices anytime from the dashboard.`, getDashboardUrl()),
      text: `Your AgentAudit ${plan} subscription is active. Manage it here: ${getDashboardUrl()}`,
    });
  },

  async sendPlanChanged(to: string, organizationId: string, newPlan: string, metadata?: { eventId?: string; dedupeKey?: string }): Promise<{ id?: string; error?: string; deliveryId?: string }> {
    return this.send({
      to,
      type: 'billing-plan-change',
      organizationId,
      eventId: metadata?.eventId,
      dedupeKey: metadata?.dedupeKey,
      subject: `Your plan has been changed to ${newPlan.charAt(0).toUpperCase() + newPlan.slice(1)}`,
      html: this._billingHtml(`Plan updated`, `Your AgentAudit subscription is now on the ${newPlan.charAt(0).toUpperCase() + newPlan.slice(1)} plan. Changes take effect immediately.`, getDashboardUrl()),
      text: `Your AgentAudit plan has been changed to ${newPlan}. Manage it here: ${getDashboardUrl()}`,
    });
  },

  async sendRenewalSucceeded(to: string, organizationId: string, plan: string, metadata?: { eventId?: string; dedupeKey?: string }): Promise<{ id?: string; error?: string; deliveryId?: string }> {
    return this.send({
      to,
      type: 'billing-renewal',
      organizationId,
      eventId: metadata?.eventId,
      dedupeKey: metadata?.dedupeKey,
      subject: `Your AgentAudit ${plan.charAt(0).toUpperCase() + plan.slice(1)} subscription renewed`,
      html: this._billingHtml(`Subscription renewed`, `Thank you for being a customer. Your ${plan.charAt(0).toUpperCase() + plan.slice(1)} subscription has renewed successfully.`, getDashboardUrl()),
      text: `Your AgentAudit ${plan} subscription renewed successfully. View billing details: ${getDashboardUrl()}`,
    });
  },

  async sendPaymentFailed(to: string, organizationId: string, attemptCount: number, metadata?: { eventId?: string; dedupeKey?: string }): Promise<{ id?: string; error?: string; deliveryId?: string }> {
    return this.send({
      to,
      type: 'billing-payment-failed',
      organizationId,
      eventId: metadata?.eventId,
      dedupeKey: metadata?.dedupeKey,
      subject: `Action required: payment failed for AgentAudit`,
      html: this._billingHtml(`Payment failed`, `We couldn't process your latest payment (attempt ${attemptCount}). Please update your payment method in the billing portal to avoid service interruption.`, getDashboardUrl()),
      text: `We couldn't process your latest payment (attempt ${attemptCount}). Update your payment method: ${getDashboardUrl()}`,
    });
  },

  async sendPaymentRecovered(to: string, organizationId: string, metadata?: { eventId?: string; dedupeKey?: string }): Promise<{ id?: string; error?: string; deliveryId?: string }> {
    return this.send({
      to,
      type: 'billing-payment-recovered',
      organizationId,
      eventId: metadata?.eventId,
      dedupeKey: metadata?.dedupeKey,
      subject: `Payment resolved — your AgentAudit subscription is active`,
      html: this._billingHtml(`Payment resolved`, `Your payment method has been updated successfully and your subscription is active. Thank you.`, getDashboardUrl()),
      text: `Your payment method has been updated and your subscription is active. Manage billing: ${getDashboardUrl()}`,
    });
  },

  async sendCancellationNotice(to: string, organizationId: string, effectiveDate?: Date, metadata?: { eventId?: string; dedupeKey?: string }): Promise<{ id?: string; error?: string; deliveryId?: string }> {
    const dateText = effectiveDate ? ` effective ${effectiveDate.toLocaleDateString()}` : '';
    return this.send({
      to,
      type: 'billing-cancelled',
      organizationId,
      eventId: metadata?.eventId,
      dedupeKey: metadata?.dedupeKey,
      subject: `Your AgentAudit subscription has been canceled`,
      html: this._billingHtml(`Subscription canceled`, `Your subscription has been canceled${dateText}. You can resubscribe anytime from the dashboard.`, getDashboardUrl()),
      text: `Your AgentAudit subscription has been canceled${dateText}. Resubscribe here: ${getDashboardUrl()}`,
    });
  },

  _billingHtml(title: string, body: string, dashboardUrl: string): string {
    return `
      <div style="font-family:Inter,system-ui,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a">
        <div style="background:#0c0c0c;color:#fafaf9;padding:32px 24px;text-align:center;border-radius:8px 8px 0 0">
          <h1 style="margin:0;font-size:24px;font-weight:800">AgentAudit Billing</h1>
        </div>
        <div style="border:1px solid #e5e5e5;border-top:none;padding:32px 24px;border-radius:0 0 8px 8px">
          <h2 style="margin:0 0 16px;font-size:18px">${title}</h2>
          <p>${body}</p>
          <p style="margin:24px 0 0"><a href="${dashboardUrl}" style="display:inline-block;padding:10px 16px;background:#0c0c0c;color:#fafaf9;text-decoration:none;border-radius:6px;font-weight:600">Manage Billing</a></p>
        </div>
      </div>
    `;
  },
};
