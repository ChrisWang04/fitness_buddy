"""Agent tools.

Reference: https://github.com/Victoria824/FounderBuddy/blob/main/src/agents/founder_buddy/tools.py

get_context loads the context packet (shared rules + section prompt + validation) for
a section. It mirrors what the router builds, but as a callable tool so the LLM can
fetch a section's context on demand.
"""

from langchain_core.tools import tool

from .enums import SectionID, SectionStatus
from .prompts import get_section_template
from .sections.base_prompt import BASE_RULES


@tool
async def get_context(
    user_id: int,
    thread_id: str,
    section_id: str,
    user_data: dict | None = None,
) -> dict:
    """Load the context packet for a section.

    Returns a dict with: section_id, status, system_prompt, draft, validation_rules
    """
    try:
        sid = SectionID(section_id)
    except ValueError:
        return {"error": f"Unknown section_id: {section_id!r}"}

    template = get_section_template(sid)
    validation = (
        {r.field_name: r.model_dump() for r in template.validation_rules} or None
    )

    # NOTE: this mirrors the context-packet assembly in router_node.router_node.
    # If ContextPacket's shape ever changes, update both places. (See MOSS review, PR 2.)
    return {
        "section_id": sid.value,
        "status": SectionStatus.IN_PROGRESS.value,
        "system_prompt": f"{BASE_RULES}\n\n{template.system_prompt_template}",
        "draft": None,
        "validation_rules": validation,
    }
