import { AgentAudit } from './index';

const apiKey = process.env.AGENTAUDIT_API_KEY;
if (!apiKey) {
  throw new Error('Set AGENTAUDIT_API_KEY before running this example.');
}

const audit = new AgentAudit({
  apiKey,
});

async function main() {
  const result = await audit.guardrail({
    action: 'prompt_submitted',
    prompt: 'Tell me about John Doe, SSN 123-45-6789',
    response: 'John Doe is a person',
  });

  console.log('Allowed:', result.allowed);
  console.log('Action:', result.action);
  console.log('Violations:', result.violations);

  if (!result.allowed) {
    console.error('BLOCKED:', result.violations);
    process.exit(1);
  }

  console.log('ALLOWED:', result.auditLogId);
}

main();
