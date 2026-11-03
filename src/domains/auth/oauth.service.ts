import crypto from 'node:crypto';
import { config } from '../../config';
import { prisma } from '../../db/prisma';
import { signAccessToken, signRefreshToken } from '../../utils/token';
import { emailService } from '../../services/email.service';
import { logger } from '../../utils/logger';
import { AppError } from '../../utils/errors';

export type OAuthProvider = 'github' | 'google';

type ProviderDef = {
  clientId: string;
  clientSecret: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string;
};

const STATE_TTL_MS = 10 * 60 * 1000;

function providerDef(provider: OAuthProvider): ProviderDef {
  if (provider === 'github') {
    return {
      clientId: config.get('githubClientId'),
      clientSecret: config.get('githubClientSecret'),
      authorizeUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      scopes: 'read:user user:email',
    };
  }
  return {
    clientId: config.get('googleClientId'),
    clientSecret: config.get('googleClientSecret'),
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scopes: 'openid email profile',
  };
}

export function enabledProviders(): OAuthProvider[] {
  const out: OAuthProvider[] = [];
  if (config.get('githubClientId') && config.get('githubClientSecret')) out.push('github');
  if (config.get('googleClientId') && config.get('googleClientSecret')) out.push('google');
  return out;
}

export function assertProviderEnabled(provider: string): asserts provider is OAuthProvider {
  if (provider !== 'github' && provider !== 'google') throw new AppError('Unknown OAuth provider', 404);
  if (!enabledProviders().includes(provider)) throw new AppError(`Sign-in with ${provider} is not configured`, 404);
}

function stateSecret(): string {
  return config.get('jwtSecret') + ':oauth-state';
}

export function signState(): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const exp = Date.now() + STATE_TTL_MS;
  const body = `${nonce}.${exp}`;
  const sig = crypto.createHmac('sha256', stateSecret()).update(body).digest('hex');
  return `${body}.${sig}`;
}

export function verifyState(state: string): boolean {
  const parts = state.split('.');
  if (parts.length !== 3) return false;
  const [nonce, exp, sig] = parts;
  const expected = crypto.createHmac('sha256', stateSecret()).update(`${nonce}.${exp}`).digest('hex');
  const sigBuf = Buffer.from(sig, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return false;
  return Number(exp) > Date.now();
}

export function authorizeUrl(provider: OAuthProvider, redirectUri: string, state: string): string {
  const def = providerDef(provider);
  const params = new URLSearchParams({
    client_id: def.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: def.scopes,
    state,
  });
  return `${def.authorizeUrl}?${params.toString()}`;
}

type OAuthProfile = { providerId: string; email: string; name: string; verified: boolean };

async function fetchGithubProfile(def: ProviderDef, code: string, redirectUri: string): Promise<OAuthProfile> {
  const tokenRes = await fetch(def.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ client_id: def.clientId, client_secret: def.clientSecret, code, redirect_uri: redirectUri }),
  });
  const tokenBody = await tokenRes.json() as { access_token?: string; error?: string };
  if (!tokenRes.ok || !tokenBody.access_token) throw new AppError('GitHub token exchange failed', 502, { code: 'oauth_failed' });
  const headers = { Authorization: `Bearer ${tokenBody.access_token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'agentaudit-api' };
  const [userRes, emailsRes] = await Promise.all([
    fetch('https://api.github.com/user', { headers }),
    fetch('https://api.github.com/user/emails', { headers }),
  ]);
  if (!userRes.ok) throw new AppError('GitHub profile fetch failed', 502, { code: 'oauth_failed' });
  const user = await userRes.json() as { id: number; name?: string; login: string };
  const emails = emailsRes.ok ? await emailsRes.json() as Array<{ email: string; primary: boolean; verified: boolean }> : [];
  const primary = emails.find(e => e.primary && e.verified) ?? emails.find(e => e.verified);
  if (!primary) throw new AppError('GitHub account has no verified email address', 400, { code: 'oauth_no_email' });
  return { providerId: String(user.id), email: primary.email, name: user.name || user.login, verified: true };
}

async function fetchGoogleProfile(def: ProviderDef, code: string, redirectUri: string): Promise<OAuthProfile> {
  const tokenRes = await fetch(def.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: def.clientId, client_secret: def.clientSecret, code,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
    }),
  });
  const tokenBody = await tokenRes.json() as { access_token?: string };
  if (!tokenRes.ok || !tokenBody.access_token) throw new AppError('Google token exchange failed', 502, { code: 'oauth_failed' });
  const infoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokenBody.access_token}` },
  });
  if (!infoRes.ok) throw new AppError('Google profile fetch failed', 502, { code: 'oauth_failed' });
  const info = await infoRes.json() as { sub: string; email: string; email_verified?: boolean; name?: string };
  if (!info.email || info.email_verified === false) throw new AppError('Google account has no verified email address', 400, { code: 'oauth_no_email' });
  return { providerId: info.sub, email: info.email, name: info.name || info.email.split('@')[0], verified: true };
}

export async function fetchProfile(provider: OAuthProvider, code: string, redirectUri: string): Promise<OAuthProfile> {
  const def = providerDef(provider);
  return provider === 'github' ? fetchGithubProfile(def, code, redirectUri) : fetchGoogleProfile(def, code, redirectUri);
}

export async function loginWithProvider(provider: OAuthProvider, profile: OAuthProfile) {
  // 1. Existing provider link.
  let organization = await prisma.organization.findUnique({
    where: { provider_providerId: { provider, providerId: profile.providerId } },
  });
  if (organization) return tokensFor(organization);

  // 2. Existing account with same verified email — attach this provider identity.
  const byEmail = await prisma.organization.findUnique({ where: { email: profile.email } });
  if (byEmail) {
    organization = await prisma.organization.update({
      where: { id: byEmail.id },
      data: { provider, providerId: profile.providerId },
    });
    return tokensFor(organization);
  }

  // 3. New account.
  organization = await prisma.organization.create({
    data: { name: profile.name.slice(0, 100), email: profile.email, password: null, provider, providerId: profile.providerId },
  });
  emailService.sendWelcome(organization.email, organization.name, organization.id).catch((err) => {
    logger.warn({ organizationId: organization.id, error: err?.message || String(err) }, 'Welcome email delivery failed');
  });
  return tokensFor(organization);
}

function tokensFor(organization: { id: string; email: string; name: string; plan: string }) {
  const payload = { sub: organization.id, email: organization.email };
  return {
    organization: { id: organization.id, name: organization.name, email: organization.email, plan: organization.plan },
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}

export async function setPassword(organizationId: string, currentPassword: string | undefined, newPassword: string) {
  const organization = await prisma.organization.findUnique({ where: { id: organizationId }, select: { password: true } });
  if (!organization) throw new AppError('Organization not found', 404);
  if (organization.password) {
    const { comparePassword } = await import('../../utils/password');
    if (!currentPassword || !(await comparePassword(currentPassword, organization.password))) {
      throw new AppError('Current password is incorrect', 403, { code: 'invalid_password' });
    }
  }
  const { hashPassword } = await import('../../utils/password');
  await prisma.organization.update({ where: { id: organizationId }, data: { password: await hashPassword(newPassword) } });
  return { passwordSet: true };
}
