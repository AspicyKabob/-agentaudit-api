# AgentAudit CrewAI Integration

Real-time guardrails and automatic audit logging for CrewAI task execution.

## Installation

```bash
pip install agentaudit
```

## Usage — Guardrails Enabled (Default)

By default the observer **enforces guardrails** on every task and crew output.
If a compliance violation is detected (PII, forbidden keywords, rate limits),
a `ComplianceViolation` is raised and the crew halts before the output is delivered.

```python
from crewai import Crew, Agent, Task
from agentaudit_crewai import AgentAuditObserver

# Create observer with guardrails enabled (default)
observer = AgentAuditObserver(
    api_key="aa_your_key_here",
    crew_name="Research Crew",
    guard=True   # default
)

# Create crew with observer
researcher = Agent(role="Researcher", goal="Find information")
writer = Agent(role="Writer", goal="Write content")

task1 = Task(description="Research topic", agent=researcher)
task2 = Task(description="Write article", agent=writer)

crew = Crew(
    agents=[researcher, writer],
    tasks=[task1, task2],
    callbacks=[observer]
)

# Execute — outputs are guarded automatically!
result = crew.kickoff()
# If any output violates a rule (e.g. contains PII),
# ComplianceViolation is raised and the crew stops.
```

## Usage — Logging Only (No Guarding)

Set `guard=False` to log all events without blocking violations.

```python
observer = AgentAuditObserver(
    api_key="aa_your_key_here",
    crew_name="Research Crew",
    guard=False
)
```

## Handling Guardrail Violations

Catch `ComplianceViolation` to inspect what was blocked:

```python
from agentaudit_crewai import ComplianceViolation

try:
    result = crew.kickoff()
except ComplianceViolation as e:
    print(f"Blocked: {e.violations}")
    print(f"Severity: {e.severity}")
    print(f"Task: {e.task_id}")
```

## What Gets Logged

- `crewai_crew_start`: When crew begins execution
- `crewai_task_start` / `crewai_task_end`: Each task's input and output
- `crewai_agent_action`: Individual agent actions
- `crewai_crew_end`: Final crew output

## License

MIT
