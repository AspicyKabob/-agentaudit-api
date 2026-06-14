import { detectPII, detectPIITypes } from '../../src/domains/audit/pii-detector';

describe('detectPII', () => {
  it('returns false for empty or whitespace-only text', () => {
    expect(detectPII('')).toBe(false);
    expect(detectPII('   ')).toBe(false);
  });

  describe('ssn', () => {
    it('detects a US SSN', () => {
      expect(detectPII('My SSN is 123-45-6789', { patterns: ['ssn'] })).toBe(true);
    });

    it('does not flag a number that is not an SSN', () => {
      expect(detectPII('My number is 123-456-7890', { patterns: ['ssn'] })).toBe(false);
    });
  });

  describe('email', () => {
    it('detects an email address', () => {
      expect(detectPII('Contact me at user@example.com', { patterns: ['email'] })).toBe(true);
    });

    it('does not flag plain text without an email', () => {
      expect(detectPII('Contact me soon', { patterns: ['email'] })).toBe(false);
    });
  });

  describe('phone', () => {
    it('detects a US phone number with dashes', () => {
      expect(detectPII('Call me at 555-123-4567', { patterns: ['phone'] })).toBe(true);
    });

    it('detects a phone number with parentheses', () => {
      expect(detectPII('Call me at (555) 123-4567', { patterns: ['phone'] })).toBe(true);
    });

    it('does not flag a short number', () => {
      expect(detectPII('Call me at 123', { patterns: ['phone'] })).toBe(false);
    });
  });

  describe('credit_card', () => {
    it('detects a valid Visa test number', () => {
      expect(detectPII('Card: 4111 1111 1111 1111', { patterns: ['credit_card'] })).toBe(true);
    });

    it('does not flag a random number that fails Luhn', () => {
      expect(detectPII('Card: 4111 1111 1111 1112', { patterns: ['credit_card'] })).toBe(false);
    });
  });

  describe('bank_account', () => {
    it('detects a routing and account number pair', () => {
      expect(detectPII('Routing 123456789 Account 12345678', { patterns: ['bank_account'] })).toBe(true);
    });

    it('detects an account number label', () => {
      expect(detectPII('Account number: 12345678', { patterns: ['bank_account'] })).toBe(true);
    });

    it('does not flag a short numeric string', () => {
      expect(detectPII('Pin: 1234', { patterns: ['bank_account'] })).toBe(false);
    });
  });

  describe('address', () => {
    it('detects a street address', () => {
      expect(detectPII('I live at 123 Main Street', { patterns: ['address'] })).toBe(true);
    });

    it('detects an abbreviated street address', () => {
      expect(detectPII('I live at 456 Oak Ave', { patterns: ['address'] })).toBe(true);
    });

    it('does not flag a sentence without an address', () => {
      expect(detectPII('I live nearby', { patterns: ['address'] })).toBe(false);
    });
  });

  describe('default behavior', () => {
    it('checks all patterns when no condition is provided', () => {
      expect(detectPII('My SSN is 123-45-6789')).toBe(true);
      expect(detectPII('Call me at user@example.com')).toBe(true);
    });

    it('returns false for benign text', () => {
      expect(detectPII('The weather is nice today.')).toBe(false);
    });
  });

  describe('detectPIITypes', () => {
    it('returns the matching pattern types', () => {
      const types = detectPIITypes('My SSN is 123-45-6789 and email is a@b.com');
      expect(types).toContain('ssn');
      expect(types).toContain('email');
    });

    it('returns an empty array for benign text', () => {
      expect(detectPIITypes('Hello world')).toEqual([]);
    });
  });
});
