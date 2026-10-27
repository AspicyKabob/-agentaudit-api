# Contributing to AgentAudit

Thank you for your interest in contributing! This document provides guidelines for contributing to the AgentAudit API. Please follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Reporting bugs and requesting features

Use the bug-report and feature-request forms in GitHub Issues. Include reproducible steps, your API or SDK version, and synthetic examples. Never include credentials or customer data. Report suspected vulnerabilities privately using [SECURITY.md](SECURITY.md), not in public issues or pull requests.

## Development Setup

```bash
git clone https://github.com/AspicyKabob/-agentaudit-api.git
cd -agentaudit-api
npm install
npx prisma generate
npm run dev
```

## Code Style

- TypeScript with strict mode
- ESLint + Prettier for formatting
- Conventional Commits for commit messages

## Commit Messages

Format: `type(scope): description`

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

Examples:
- `feat(audit): add traceId support to audit logs`
- `fix(guardrails): handle empty regex patterns`
- `docs(readme): update SDK installation instructions`

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit with conventional commit format
6. Push to your fork
7. Open a Pull Request

## Testing

All PRs must include tests for new features and bug fixes.

```bash
# Run the test suite
npm test

# Run with coverage
npm run test:coverage
```

## Questions?

Open a GitHub issue for general questions, or email [support@agentaudit.online](mailto:support@agentaudit.online) for private support. See the [integration guide](https://agentaudit.online/docs.html) and [API reference](https://agentaudit.online/docs) for usage help.
