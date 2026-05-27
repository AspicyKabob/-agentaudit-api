import { AgentAudit } from '@agentaudit/sdk';

const audit = new AgentAudit({
  apiKey: 'aa_your_key_here',
});

async function main() {
  const userInput = 'Tell me about John Doe, SSN 123-45-6789';
  const agentOutput = 'John Doe is a person with SSN 123-45-6789...';

  const result = await audit.guardrail({
    action: 'prompt_submitted',
    prompt: userInput,
    response: agentOutput,
  });

  if (!result.allowed) {
    console.error('BLOCKED:', result.violations);
    process.exit(1);
  }

  console.log('ALLOWED:', result.action);
  console.log('Audit log:', result.auditLogId);
}

main();
