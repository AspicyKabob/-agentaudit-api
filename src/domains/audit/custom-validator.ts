import ivm from 'isolated-vm';

export interface CustomValidatorCondition {
  /**
   * JavaScript function body that receives (text, prompt, response)
   * and must return a boolean. Example:
   *   return text.includes('secret') && text.length > 50;
   */
  code: string;
}

// Reuse a single isolate for performance (100ms timeout enforced per execution)
const isolate = new ivm.Isolate({ memoryLimit: 8 }); // 8MB memory limit

/**
 * Safely execute a user-provided custom validator function in a V8 isolate.
 *
 * Security model:
 * - Runs in a separate V8 heap with no access to Node.js primitives.
 * - Only `text`, `prompt`, `response` are injected (no `console`, `require`, etc.).
 * - Memory limited to 8MB, CPU execution capped at 100ms.
 * - Any error (syntax, runtime, timeout) returns false (safe-fail).
 */
export async function evaluateCustomValidator(
  text: string,
  prompt: string | undefined,
  response: string | undefined,
  condition: CustomValidatorCondition
): Promise<boolean> {
  if (!condition.code || condition.code.trim().length === 0) {
    return false;
  }

  const context = await isolate.createContext();
  const jail = context.global;
  
  // Inject only the allowed variables (no console, no Node.js globals)
  await jail.set('text', new ivm.ExternalCopy(text).copyInto());
  await jail.set('prompt', new ivm.ExternalCopy(prompt ?? '').copyInto());
  await jail.set('response', new ivm.ExternalCopy(response ?? '').copyInto());
  
  const wrapped = `(function(text, prompt, response) { ${condition.code} })(text, prompt, response)`;

  try {
    // Execute with 100ms timeout and 8MB memory limit
    const result = await context.eval(wrapped, {
      timeout: 100,
      memoryLimit: 8, // MB
      copy: true, // Return a copy of the result (not a reference)
    });
    return result === true;
  } catch {
    return false;
  } finally {
    // Clean up the context to prevent memory leaks
    await context.release();
  }
}
