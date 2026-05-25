"""
CrewAI Observer Integration for AgentAudit

Automatically logs CrewAI task executions, agent actions, and crew outputs.

Example:
    from crewai import Crew, Agent, Task
    from agentaudit_crewai import AgentAuditObserver

    observer = AgentAuditObserver(
        api_key="aa_your_key_here",
        crew_name="Research Crew"
    )

    crew = Crew(
        agents=[researcher, writer],
        tasks=[research_task, write_task],
        callbacks=[observer]
    )
    
    result = crew.kickoff()
    # All tasks, agent actions, and outputs are automatically logged!
"""

from typing import Any, Dict, Optional
from agentaudit import AgentAudit


class AgentAuditObserver:
    """
    CrewAI observer that automatically submits audit logs
    for task executions and crew outputs.
    """
    
    def __init__(
        self,
        api_key: str,
        crew_name: Optional[str] = None,
        base_url: str = "https://api.agentaudit.io/api/v1"
    ):
        self.client = AgentAudit(api_key=api_key, base_url=base_url)
        self.crew_name = crew_name or "unnamed-crew"
    
    def on_task_start(self, task: Any, **kwargs: Any) -> None:
        """Called when a task starts executing."""
        task_id = getattr(task, 'id', 'unknown')
        description = getattr(task, 'description', '')
        
        self.client.log(
            action="crewai_task_start",
            prompt=description,
            metadata={
                "crew": self.crew_name,
                "task_id": task_id,
                "expected_output": getattr(task, 'expected_output', ''),
                "event": "task_start"
            }
        )
    
    def on_task_end(self, task: Any, output: str, **kwargs: Any) -> None:
        """Called when a task completes."""
        task_id = getattr(task, 'id', 'unknown')
        
        self.client.log(
            action="crewai_task_end",
            prompt=getattr(task, 'description', ''),
            response=output,
            metadata={
                "crew": self.crew_name,
                "task_id": task_id,
                "event": "task_end"
            }
        )
    
    def on_agent_action(self, agent: Any, action: str, **kwargs: Any) -> None:
        """Called when an agent performs an action."""
        agent_role = getattr(agent, 'role', 'unknown')
        
        self.client.log(
            action="crewai_agent_action",
            prompt=action,
            metadata={
                "crew": self.crew_name,
                "agent_role": agent_role,
                "agent_goal": getattr(agent, 'goal', ''),
                "event": "agent_action"
            }
        )
    
    def on_crew_start(self, crew: Any, **kwargs: Any) -> None:
        """Called when a crew starts working."""
        self.crew_name = getattr(crew, 'name', self.crew_name)
        agents = [getattr(a, 'role', 'unknown') for a in getattr(crew, 'agents', [])]
        
        self.client.log(
            action="crewai_crew_start",
            metadata={
                "crew": self.crew_name,
                "agents": agents,
                "task_count": len(getattr(crew, 'tasks', [])),
                "event": "crew_start"
            }
        )
    
    def on_crew_end(self, crew: Any, output: str, **kwargs: Any) -> None:
        """Called when a crew finishes all tasks."""
        self.client.log(
            action="crewai_crew_end",
            response=output,
            metadata={
                "crew": self.crew_name,
                "event": "crew_end"
            }
        )
