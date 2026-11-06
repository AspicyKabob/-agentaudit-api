jest.mock('../../src/db/prisma', () => ({ prisma: { organization: {} } }));
jest.mock('../../src/services/email.service', () => ({ emailService: { sendWelcome: jest.fn() } }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { runInNewContext } from 'vm';
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

describe('website link navigation', () => {
  const script = readFileSync(join(__dirname, '../../website/script.js'), 'utf8');
  const handler = script.slice(script.indexOf(`document.querySelectorAll('a[href^="#"]')`), script.indexOf("window.addEventListener('scroll'"));

  it.each(['github', 'google'])('does not cancel %s navigation after provider discovery updates the link', provider => {
    let href = '#';
    let click: (this: unknown, event: unknown) => void = () => {};
    const anchor = {
      getAttribute: () => href,
      addEventListener: (_: string, listener: typeof click) => { click = listener; },
    };
    const querySelector = jest.fn();
    runInNewContext(handler, { document: { querySelectorAll: () => [anchor], getElementById: querySelector } });
    href = `https://agentaudit.online/api/v1/auth/oauth/${provider}`;
    const event = { preventDefault: jest.fn() };
    click.call(anchor, event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(querySelector).not.toHaveBeenCalled();
  });

  it('still smooth-scrolls valid section links and ignores placeholder links', () => {
    let href = '#';
    let click: (this: unknown, event: unknown) => void = () => {};
    const anchor = {
      getAttribute: () => href,
      addEventListener: (_: string, listener: typeof click) => { click = listener; },
    };
    const target = { scrollIntoView: jest.fn() };
    const querySelector = jest.fn(() => target);
    runInNewContext(handler, { document: { querySelectorAll: () => [anchor], getElementById: querySelector } });
    const event = { preventDefault: jest.fn() };
    click.call(anchor, event);
    expect(querySelector).not.toHaveBeenCalled();
    href = '#pricing';
    click.call(anchor, event);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(target.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });
});

describe('provider gating', () => {
  it('disables providers without credentials', () => {
    expect(enabledProviders()).toEqual([]);
    expect(() => authorizeUrl('github', 'http://x/cb', 's')).not.toThrow();
  });
});
