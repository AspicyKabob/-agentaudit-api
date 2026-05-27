import { runInNewContext } from 'vm';

export interface CustomValidatorCondition {
  /**
   * JavaScript function body that receives (text, prompt, response)
   * and must return a boolean. Example:
   *   return text.includes('secret') && text.length > 50;
   */
  code: string;
}

/**
 * Safely execute a user-provided custom validator function.
 *
 * Security model:
 * - Runs inside Node.js vm.runInNewContext with a pristine, empty sandbox.
 * - Only `text`, `prompt`, `response`, and `console` are injected.
 * - No access to `require`, `process`, `fs`, network, or any built-in module.
 * - Execution is capped at 100 ms to prevent infinite loops.
 * - Any error (syntax, runtime, timeout) returns false (safe-fail).
 */
export function evaluateCustomValidator(
  text: string,
  prompt: string | undefined,
  response: string | undefined,
  condition: CustomValidatorCondition
): boolean {
  if (!condition.code || condition.code.trim().length === 0) {
    return false;
  }

  const sandbox = {
    text,
    prompt: prompt ?? '',
    response: response ?? '',
    console,
  };

  const wrapped = `(function(text, prompt, response) { ${condition.code} })(text, prompt, response)`;

  try {
    const result = runInNewContext(wrapped, sandbox, { timeout: 100 });
    return result === true;
  } catch {
    return false;
  }
}
