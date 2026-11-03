jest.mock('../../src/db/prisma', () => ({ prisma: { organization: {} } }));
jest.mock('../../src/services/email.service', () => ({ emailService: { sendWelcome: jest.fn() } }));

import { signState, verifyState, enabledProviders, authorizeUrl } from '../../src/domains/auth/oauth.service';

describe('oauth state token', () => {
  it('round-trips a signed state', () => {
    expect(verifyState(signState())).toBe(true);
  });
  it('rejects tampered and malformed states', () => {
    expect(verifyState('a.b.c')).toBe(false);
    expect(verifyState('not-a-state')).toBe(false);
    const s = signState();
    expect(verifyState(s.slice(0, -2) + 'zz')).toBe(false);
  });
});

describe('provider gating', () => {
  it('disables providers without credentials', () => {
    expect(enabledProviders()).toEqual([]);
    expect(() => authorizeUrl('github', 'http://x/cb', 's')).not.toThrow();
  });
});
