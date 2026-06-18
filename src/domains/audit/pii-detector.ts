export type PIIPatternType =
  | 'ssn'
  | 'email'
  | 'phone'
  | 'credit_card'
  | 'bank_account'
  | 'address';

export interface PIIDetectCondition {
  /** Which PII patterns to look for. If omitted, all known patterns are checked. */
  patterns?: PIIPatternType[];
}

interface PatternConfig {
  test: (text: string) => boolean;
  /** Short explanation of what was matched, useful for flags/logs. */
  label: string;
}

// Luhn check for credit-card-like numbers
function luhnCheck(value: string): boolean {
  let sum = 0;
  let alternate = false;
  for (let i = value.length - 1; i >= 0; i--) {
    let n = parseInt(value.substring(i, i + 1), 10);
    if (isNaN(n)) return false;
    if (alternate) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alternate = !alternate;
  }
  return sum % 10 === 0;
}

function hasLuhnValidSequence(text: string): boolean {
  // Extract contiguous digit sequences of 13-19 chars, ignoring spaces/dashes
  const matches = text.match(/(?:\d[\s-]*){13,19}/g);
  if (!matches) return false;
  return matches.some((match) => {
    const digits = match.replace(/\D/g, '');
    return digits.length >= 13 && digits.length <= 19 && luhnCheck(digits);
  });
}

function hasPhoneNumber(text: string): boolean {
  // US-style: (555) 123-4567, 555-123-4567, 555.123.4567, +1 555 123 4567
  const phonePattern =
    /(?:\+\d{1,3}[\s-]?)?\(?\d{3}\)?[\s.-]{0,2}\d{3}[\s.-]{0,2}\d{4}/;
  return phonePattern.test(text);
}

function hasEmail(text: string): boolean {
  const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
  return emailPattern.test(text);
}

function hasSSN(text: string): boolean {
  const ssnPattern = /\b\d{3}-\d{2}-\d{4}\b/;
  return ssnPattern.test(text);
}

function hasBankAccount(text: string): boolean {
  // US routing + account: 9-digit routing followed by account, or account-like 8-17 digits
  const routingAccountPattern = /\b\d{9}\s+[\d-]{8,17}\b/;
  const accountOnlyPattern = /\b(?:account\s*(?:#|number|no)?[:\s]*)?\d{8,17}\b/i;
  return routingAccountPattern.test(text) || accountOnlyPattern.test(text);
}

function hasAddress(text: string): boolean {
  // Look for common US address patterns: number + street type + optional apt/unit
  const addressPattern =
    /\b\d{1,6}\s+(?:[A-Za-z]+\s+)*(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way|Court|Ct|Plaza|Circle|Cir|Terrace|Highway|Hwy|Suite|Ste|Apt|Apartment)\b/gi;
  return addressPattern.test(text);
}

const PII_PATTERNS: Record<PIIPatternType, PatternConfig> = {
  ssn: { test: hasSSN, label: 'SSN detected' },
  email: { test: hasEmail, label: 'Email detected' },
  phone: { test: hasPhoneNumber, label: 'Phone number detected' },
  credit_card: { test: hasLuhnValidSequence, label: 'Credit card detected' },
  bank_account: { test: hasBankAccount, label: 'Bank account detected' },
  address: { test: hasAddress, label: 'Address detected' },
};

const ALL_PATTERN_TYPES = Object.keys(PII_PATTERNS) as PIIPatternType[];

/**
 * Detect PII in text.
 *
 * @param text - The text to scan.
 * @param condition - Optional condition limiting which patterns to check.
 * @returns True if any requested PII pattern was found.
 */
export function detectPII(text: string, condition?: PIIDetectCondition): boolean {
  if (!text || text.trim().length === 0) {
    return false;
  }

  const requested = condition?.patterns?.length
    ? condition.patterns
    : ALL_PATTERN_TYPES;

  return requested.some((pattern) => {
    const config = PII_PATTERNS[pattern];
    return config ? config.test(text) : false;
  });
}

/**
 * Get the list of PII pattern types that matched the text.
 * Useful for detailed flags or debugging.
 */
export function detectPIITypes(
  text: string,
  condition?: PIIDetectCondition
): PIIPatternType[] {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const requested = condition?.patterns?.length
    ? condition.patterns
    : ALL_PATTERN_TYPES;

  return requested.filter((pattern) => {
    const config = PII_PATTERNS[pattern];
    return config ? config.test(text) : false;
  });
}
