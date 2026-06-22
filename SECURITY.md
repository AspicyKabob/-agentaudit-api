# Security Policy

## Supported Version

AgentAudit is currently in public beta. Security fixes are applied to the latest release and the `main` branch.

## Reporting a Vulnerability

Do not open a public GitHub issue for a suspected vulnerability or include secrets, API keys, customer data, or exploit details in public discussions.

Report security concerns privately by emailing [support@agentaudit.online](mailto:support@agentaudit.online) with the subject `Security report`. Include:

- the affected endpoint, component, or SDK;
- the impact and prerequisites;
- minimal reproduction steps or a proof of concept;
- the affected version or commit, if known; and
- a safe way to contact you for follow-up.

Use synthetic data and redact all credentials. We will acknowledge the report, investigate it, and coordinate remediation and disclosure based on severity. Please avoid accessing data that is not yours, degrading service, or testing against other customers.

## Scope

Security reports may cover:

- the AgentAudit API and hosted web application;
- the Python and TypeScript SDKs;
- authentication, authorization, and tenant isolation;
- compliance-rule and guardrail bypasses;
- webhook, billing, and data-exposure issues; and
- deployment or dependency vulnerabilities in this repository.

General bugs, feature requests, and documentation issues belong in the public issue tracker.
