import { AgentAudit } from '@agentaudit/sdk';

const audit = new AgentAudit({
  apiKey: 'aa_your_key_here',
});

async function main() {
  // Log an action
  await audit.log({
    action: 'prompt_submitted',
    prompt: 'What is the weather?',
    response: 'It is sunny.',
    metadata: { model: 'gpt-4', tokens: 150 },
  });

  // Register an agent
  const agent = await audit.registerAgent({
    name: 'Support Bot',
    type: 'langchain',
  });

  // Query logs
  const logs = await audit.queryLogs({ limit: 10 });
  console.log(logs.data);
}

main();
