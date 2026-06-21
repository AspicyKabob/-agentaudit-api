# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Tenant-isolation regression coverage for organization-owned resources and audit agents
- Revoked API-key and production CORS security regression tests
- Public beta launch-readiness checklist, security reporting policy, and structured bug-report template
- MIT license file matching the repository's published license metadata

### Fixed
- Prevent audit submissions from attaching an agent owned by another organization
- Scope agent-policy evaluation to the authenticated organization
- Isolate authentication, general, and audit rate-limit counters so normal traffic cannot consume the login/register attempt budget
- Replace dead or placeholder documentation, deployment, repository, and community links
- Align published Pro and Business pricing at $29 and $79

### Changed
- Run Railway database migrations in the pre-deploy phase and remove a stale one-off migration repair from application startup
- Document production backup, restore, rollback, Redis fallback, and incident-response procedures
- Enforce the Railway migration/startup split with a deployment configuration test

## [1.1.0-trace] - 2026-05-28

### Added
- Agent-to-agent audit trails with traceId and parentSpanId
- Trace visualizer for interactive agent chain exploration
- Webhook alerts for real-time compliance violation notifications
- Pre-built compliance rule packs (Healthcare, Finance, GDPR)
- API playground with copy-paste code examples
- GitHub Action for CI/CD compliance scanning
- Self-hosting documentation and Docker support

### Changed
- Landing page redesigned with framework integration tabs
- Pricing aligned to self-serve model
- README completely overhauled with badges, architecture diagram, and SDK examples

## [1.0.0] - 2026-05-20

### Added
- Initial API release
- Real-time guardrails with 6 compliance rule types
- CrewAI integration with automatic auditing
- Python and TypeScript SDKs
- Railway deployment support
- JWT authentication and API key management

---

## Roadmap

See [ROADMAP.md](ROADMAP.md) for upcoming features.
