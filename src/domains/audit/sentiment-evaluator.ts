import Sentiment from 'sentiment';

const sentiment = new Sentiment();

// Additional toxic/hostile terms not covered by AFINN-165 with stronger scores
const DEFAULT_TOXIC_EXTRAS: Record<string, number> = {
  // Discrimination / hate
  'nazi': -5,
  'racist': -5,
  'bigot': -5,
  'supremacist': -5,
  'xenophobe': -4,
  'homophobe': -4,
  'transphobe': -4,
  'misogynist': -4,
  'sexist': -4,
  'ableist': -4,

  // Hostility / violence
  'kill yourself': -5,
  'kys': -5,
  'die in a fire': -5,
  'go to hell': -4,
  'burn in hell': -4,
  ' worthless ': -4,
  'pathetic': -4,
  'disgusting': -4,
  'revolting': -4,
  'vile': -4,
  'despicable': -4,
  'deplorable': -4,

  // Threats / intimidation
  ' i will kill': -5,
  'i will hurt': -5,
  'i will destroy': -4,
  'you deserve to die': -5,
  'nobody cares about you': -4,
  'no one loves you': -4,
  'you are nothing': -4,
  'you are useless': -4,

  // Harassment
  'shut up': -2,
  'stupid idiot': -4,
  'dumbass': -4,
  'moron': -4,
  'retard': -5,
  'cripple': -5,
};

export interface SentimentCondition {
  /** Maximum allowed comparative sentiment score (negative numbers). Default: -0.3 */
  threshold?: number;
  /** Minimum number of tokens required before evaluating. Default: 3 */
  minTokens?: number;
  /** Custom word/score pairs to add or override the built-in dictionary */
  extras?: Record<string, number>;
}

/**
 * Evaluate text sentiment and return true if it is too negative / toxic.
 *
 * Threshold strategy:
 * - Uses the "comparative" score (total score / token count) so short and long
 *   texts are evaluated consistently.
 * - Default threshold is -0.3. Tuning guide:
 *     -0.1  → very lenient (catches only extremely hostile text)
 *     -0.3  → balanced (default, recommended)
 *     -0.5  → strict (catches moderately negative text)
 *     -0.8  → very strict (catches mild negativity)
 * - minTokens prevents flagging very short phrases like "no" or "bad".
 *
 * Custom dictionaries:
 * - Pass `extras` in the condition to add domain-specific toxic terms.
 *   Example: { extras: { 'acme fraud': -5, 'ponzi': -4 } }
 * - Extras are merged with built-in toxic extras on every call.
 */
export function evaluateSentiment(
  text: string,
  condition: SentimentCondition = {}
): boolean {
  const threshold = condition.threshold ?? -0.3;
  const minTokens = condition.minTokens ?? 3;

  if (!text || text.trim().length === 0) {
    return false;
  }

  const extras = condition.extras
    ? { ...DEFAULT_TOXIC_EXTRAS, ...condition.extras }
    : DEFAULT_TOXIC_EXTRAS;

  const result = sentiment.analyze(text, { extras });

  if (result.tokens.length < minTokens) {
    return false;
  }

  return result.comparative <= threshold;
}
