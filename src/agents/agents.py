from dataclasses import dataclass

from langgraph.graph.state import CompiledStateGraph
from langgraph.pregel import Pregel

from .fitness_buddy.agent import graph as fitness_buddy_agent
from schema import AgentInfo

DEFAULT_AGENT = "fitness_buddy"

AgentGraph = CompiledStateGraph | Pregel


@dataclass
class Agent:
    description: str
    graph: AgentGraph


agents: dict[str, Agent] = {
    "fitness_buddy": Agent(
        description="FitnessBuddy — builds a personalized training and nutrition plan through a 5-section conversation",
        graph=fitness_buddy_agent,
    ),
}


def get_agent(agent_id: str) -> AgentGraph:
    return agents[agent_id].graph


def get_all_agent_info() -> list[AgentInfo]:
    return [
        AgentInfo(key=agent_id, description=agent.description)
        for agent_id, agent in agents.items()
    ]
