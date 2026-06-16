# AgentAudit TypeScript SDK

Official TypeScript/JavaScript SDK for the AgentAudit API — real-time guardrails and audit logging for AI agents.

## Installation

```bash
npm install agentaudit-client
```

## Quick Start

```typescript
import { AgentAudit } from 'agentaudit-client';

const audit = new AgentAudit({
  apiKey: 'aa_your_key_here'
});

// Submit an audit log
await audit.log({
  action: 'prompt_submitted',
  prompt: 'What is the weather?',
  response: 'It is sunny today.',
  metadata: { model: 'gpt-4', tokens: 150 }
});

// LangChain callback handler (install @langchain/core separately)
import { AgentAuditCallbackHandler } from 'agentaudit-client/langchain';

const handler = new AgentAuditCallbackHandler(
  { apiKey: 'aa_your_key_here', agentId: 'uuid-of-your-agent' },
  { guard: true }
);
```

## Real-Time Guardrails

Intercept and block violations before they reach users:

```typescript
const result = await audit.guardrail({
  action: 'prompt_submitted',
  prompt: 'User: My SSN is 123-45-6789',
  response: 'Here is your account info...'
});

if (!result.allowed) {
  throw new Error(`Blocked: ${result.violations.join(', ')}`);
}
// Violations blocked. Clean output delivered to user.
```

## Features

- **Simple logging**: One-line audit log submission
- **Real-time guardrails**: Block PII, keywords, regex matches, sentiment violations, custom validators, and rate-limit violations before delivery
- **Agent registration**: Track which agents are performing actions
- **Query and export**: Retrieve audit logs with filters
- **Alert management**: List and resolve compliance alerts
- **Type-safe**: Full TypeScript support with typed responses

## Agent-to-Agent Audit Trails

Track multi-agent conversations and CrewAI workflows with distributed tracing:

```typescript
// Start a trace — e.g. when a CrewAI crew begins execution
const traceId = crypto.randomUUID();

// Log the root event (crew start)
const root = await audit.log({
  action: 'crewai_crew_start',
  traceId,
  metadata: { crew: 'Research Crew', task_count: 3 }
});

// Log child events (tasks, agent actions) with parentSpanId
await audit.log({
  action: 'crewai_task_start',
  traceId,
  parentSpanId: root.id,
  prompt: 'Research topic X',
  metadata: { task_id: 'task-1' }
});

// Query the full trace later
const trace = await audit.query({ traceId });
console.log(trace); // all events in this crew execution

// Or fetch the chain starting from the root log
const chain = await audit.getChain(root.id);
console.log(chain.root);       // crew_start
console.log(chain.descendants); // [task_start, task_end, agent_action, ...]
```

### CrewAI Integration

The [CrewAI observer](../../integrations/crewai/) automatically manages trace IDs and parent span IDs:

```typescript
import { AgentAuditObserver } from 'agentaudit-client/crewai';

const observer = new AgentAuditObserver({ apiKey: 'aa_key', crewName: 'My Crew' });
// trace_id is generated automatically in on_crew_start
// every event shares the same traceId with proper parentSpanId linking
```

## License

MIT

---

## Publishing (Maintainers Only)

This package is published automatically via GitHub Actions when you push a version tag:

### Prerequisites
1. Create an [npm account](https://www.npmjs.com/signup)
2. Enable 2FA on your npm account (required for publishing)
3. Generate an Access Token: **npmjs.com → Access Tokens → Generate New Token → Granular Access Token**
   - Select Packages & Scopes → Publish
   - Select the scope `agentaudit-client` and the package `crewai` (if publishing under scope)
4. Add the token to your GitHub repo: **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `NPM_TOKEN`
   - Value: your npm access token

### Publish a New Version
```bash
# Update version in sdk/typescript/package.json
git add sdk/typescript/package.json
git commit -m "chore: bump TypeScript SDK to v1.0.1"
git tag v1.0.1
git push origin v1.0.1
```

The `publish-typescript.yml` workflow will automatically build and publish to npm.
