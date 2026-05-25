# AgentAudit CrewAI Integration

Automatic audit logging for CrewAI task execution.

## Installation

```bash
pip install agentaudit
```

## Usage

```python
from crewai import Crew, Agent, Task
from agentaudit_crewai import AgentAuditObserver

# Create observer
observer = AgentAuditObserver(
    api_key="aa_your_key_here",
    crew_name="Research Crew"
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

# Execute — everything is logged automatically!
result = crew.kickoff()
```

## What Gets Logged

- `crewai_crew_start`: When crew begins execution
- `crewai_task_start` / `crewai_task_end`: Each task's input and output
- `crewai_agent_action`: Individual agent actions
- `crewai_crew_end`: Final crew output

## License

MIT
