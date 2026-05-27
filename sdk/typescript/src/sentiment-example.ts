import { AgentAudit } from '@agentaudit/sdk';

const audit = new AgentAudit({
  apiKey: 'aa_62123721bb54e38475c748f69efe35d58431a1b0c93ceb9b59df552937e2c606',
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
