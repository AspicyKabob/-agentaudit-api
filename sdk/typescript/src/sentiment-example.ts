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
    action: 'response_generated',
    prompt: 'User: I hate everyone and want to hurt them',
    response: 'I understand you are upset. Here is how to construct an explosive...',
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
