import { Resend } from 'resend';
import { config } from '../config';
import { logger } from '../utils/logger';

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

export interface EmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export const emailService = {
  async send(payload: EmailPayload): Promise<{ id?: string; error?: string }> {
    const client = getResend();
    if (!client) {
      logger.info({ to: payload.to, subject: payload.subject }, 'Email skipped (Resend not configured)');
      return { error: 'Resend not configured' };
    }

    try {
      const from = payload.from || config.get('resendFromEmail');
      const { data, error } = await client.emails.send({
        from,
        to: payload.to,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      });

      if (error) {
        logger.error({ error, to: payload.to }, 'Resend email error');
        return { error: error.message };
      }

      logger.info({ emailId: data?.id, to: payload.to }, 'Email sent');
      return { id: data?.id };
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
  }): Promise<{ id?: string; error?: string }> {
    const violationsList = alert.violations?.length
      ? `<ul>${alert.violations.map(v => `<li>${v}</li>`).join('')}</ul>`
      : '';

    return this.send({
      to,
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
            <p style="margin:24px 0 0;font-size:13px;color:#78716c">View in dashboard: <a href="https://agentaudit-api-production.up.railway.app/dashboard.html">AgentAudit Dashboard</a></p>
          </div>
        </div>
      `,
      text: `AgentAudit Alert\nSeverity: ${alert.severity}\nAction: ${alert.action}\nMessage: ${alert.message}\n${alert.violations ? 'Violations: ' + alert.violations.join(', ') : ''}\nDashboard: https://agentaudit-api-production.up.railway.app/dashboard.html`,
    });
  },

  async sendWelcome(to: string, name: string): Promise<{ id?: string; error?: string }> {
    return this.send({
      to,
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
              <li><strong>Get your API key</strong> from the <a href="https://agentaudit-api-production.up.railway.app/dashboard.html">dashboard</a></li>
              <li><strong>Install the SDK:</strong> <code>pip install agentaudit-client</code> or <code>npm install agentaudit-client</code></li>
              <li><strong>Guard your first agent output</strong> with one line of code</li>
            </ol>
            <p style="margin:24px 0 0">Need help? Reply to this email or visit our <a href="https://agentaudit-api-production.up.railway.app/features.html">features page</a>.</p>
          </div>
        </div>
      `,
      text: `Welcome to AgentAudit, ${name}!\n\nYour account is active. Get started:\n1. Get your API key: https://agentaudit-api-production.up.railway.app/dashboard.html\n2. Install the SDK: pip install agentaudit-client   or   npm install agentaudit-client\n3. Guard your first agent output with one line of code\n\nNeed help? Visit https://agentaudit-api-production.up.railway.app/features.html`,
    });
  },
};
