# AgentAudit Compliance Check — GitHub Action

Run compliance checks on AI agent outputs, prompts, and responses in your CI/CD pipeline.

## Usage

```yaml
name: Compliance Check
on: [push, pull_request]

jobs:
  compliance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: AspicyKabob/-agentaudit-api/.github/actions/compliance-check@main
        with:
          api-key: ${{ secrets.AGENTAUDIT_API_KEY }}
          rules: pii,keywords,sentiment
          fail-on-critical: true
```

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `api-key` | ✅ | — | Your AgentAudit API key |
| `base-url` | ❌ | `https://agentaudit-api-production.up.railway.app/api/v1` | API base URL |
| `rules` | ❌ | `pii,keywords` | Rules to check (comma-separated) |
| `fail-on-critical` | ❌ | `true` | Fail build on critical violations |
| `file-pattern` | ❌ | `**/*.{md,txt,prompt}` | Files to scan |
| `check-type` | ❌ | `passive` | Check mode (realtime/passive) |

## Examples

### Scan all markdown files
```yaml
- uses: AspicyKabob/-agentaudit-api/.github/actions/compliance-check@main
  with:
    api-key: ${{ secrets.AGENTAUDIT_API_KEY }}
    file-pattern: '**/*.md'
```

### Strict mode — fail on any violation
```yaml
- uses: AspicyKabob/-agentaudit-api/.github/actions/compliance-check@main
  with:
    api-key: ${{ secrets.AGENTAUDIT_API_KEY }}
    rules: pii,keywords,regex,sentiment,custom
    fail-on-critical: true
```

### Self-hosted deployment
```yaml
- uses: AspicyKabob/-agentaudit-api/.github/actions/compliance-check@main
  with:
    api-key: ${{ secrets.AGENTAUDIT_API_KEY }}
    base-url: https://your-agentaudit-instance.com/api/v1
```
