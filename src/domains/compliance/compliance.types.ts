import { z } from 'zod';
import { PIIPatternType } from '../audit/pii-detector';

export const PACK_IDS = ['hippo', 'finance', 'gdpr'] as const;
export type PackId = (typeof PACK_IDS)[number];

type PackRule = {
  name: string;
  ruleType: 'pii_detect' | 'keyword_match' | 'rate_limit' | 'regex_match' | 'sentiment_analysis' | 'custom_validator';
  condition: Record<string, unknown>;
  severity: 'warning' | 'critical';
};

type PackDefinition = {
  name: string;
  description: string;
  category: string;
  rules: PackRule[];
};

export const PACKS: Record<PackId, PackDefinition> = {
  hippo: {
    name: 'Healthcare (HIPAA)',
    description: 'Detects PHI, medical IDs, and SSNs to help satisfy HIPAA requirements.',
    category: 'healthcare',
    rules: [
      { name: 'SSN Detection', ruleType: 'pii_detect', condition: { patterns: ['ssn'] as PIIPatternType[] }, severity: 'critical' },
      { name: 'Phone Number Detection', ruleType: 'pii_detect', condition: { patterns: ['phone'] as PIIPatternType[] }, severity: 'critical' },
      { name: 'Email Detection', ruleType: 'pii_detect', condition: { patterns: ['email'] as PIIPatternType[] }, severity: 'warning' },
    ],
  },
  finance: {
    name: 'Finance (PCI-DSS)',
    description: 'Flags credit card numbers, bank accounts, and insider-trading keywords for PCI-DSS and SOX.',
    category: 'finance',
    rules: [
      { name: 'Credit Card Detection', ruleType: 'pii_detect', condition: { patterns: ['credit_card'] as PIIPatternType[] }, severity: 'critical' },
      { name: 'Bank Account Detection', ruleType: 'pii_detect', condition: { patterns: ['bank_account'] as PIIPatternType[] }, severity: 'critical' },
      { name: 'Insider Trading Keywords', ruleType: 'keyword_match', condition: { keywords: ['material nonpublic information', 'mnpi', 'inside information', 'confidential offering'] }, severity: 'critical' },
    ],
  },
  gdpr: {
    name: 'Data Protection (GDPR/CCPA)',
    description: 'Detects email, phone, and address leakage for GDPR and CCPA compliance.',
    category: 'privacy',
    rules: [
      { name: 'Email Detection', ruleType: 'pii_detect', condition: { patterns: ['email'] as PIIPatternType[] }, severity: 'warning' },
      { name: 'Phone Number Detection', ruleType: 'pii_detect', condition: { patterns: ['phone'] as PIIPatternType[] }, severity: 'warning' },
      { name: 'Address Detection', ruleType: 'pii_detect', condition: { patterns: ['address'] as PIIPatternType[] }, severity: 'warning' },
    ],
  },
};

export const installPackSchema = z.object({
  body: z.object({
    packId: z.enum([...PACK_IDS] as [string, ...string[]]),
  }),
});

export const packIdParamSchema = z.object({
  params: z.object({
    id: z.enum([...PACK_IDS] as [string, ...string[]]),
  }),
});

const enforcementActionSchema = z.enum(['block', 'flag', 'log']).optional();

export const createRuleSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    ruleType: z.enum(['pii_detect', 'keyword_match', 'rate_limit', 'regex_match', 'sentiment_analysis', 'custom_validator']),
    condition: z.record(z.any()),
    severity: z.enum(['warning', 'critical']).default('warning'),
    policyId: z.string().uuid().optional(),
    packId: z.string().optional(),
    actionOverride: enforcementActionSchema,
  }),
});

export const updateRuleSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
  body: z.object({
    name: z.string().min(1).max(100).optional(),
    condition: z.record(z.any()).optional(),
    severity: z.enum(['warning', 'critical']).optional(),
    actionOverride: enforcementActionSchema,
    isActive: z.boolean().optional(),
  }),
});

export const ruleIdSchema = z.object({
  params: z.object({
    id: z.string().uuid(),
  }),
});

export type CreateRuleBody = z.infer<typeof createRuleSchema>['body'];
export type UpdateRuleBody = z.infer<typeof updateRuleSchema>['body'];
export type InstallPackBody = z.infer<typeof installPackSchema>['body'];