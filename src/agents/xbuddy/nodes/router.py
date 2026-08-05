"""Router node — handles section navigation and context loading.

Reference: https://github.com/Victoria824/FounderBuddy/blob/main/src/agents/founder_buddy/nodes/router.py

This node runs each turn (and on every memory_updater→router loop-back) before the
reply is generated. It:
  1. Reads the router_directive (STAY / NEXT / MODIFY:<section>) set by generate_decision.
  2. Updates current_section accordingly.
  3. Loads the context_packet (shared rules + section prompt + validation) for that section.
  4. Flags completion when every section is done.

Design note (code vs LLM): the *decision* of stay/next/modify is made by the LLM in
generate_decision. The router itself is pure code — it just enforces that directive and
loads the right prompt. Navigation is deterministic; only the judgement of "is this
section done?" needs the LLM.
"""

import logging

from langchain_core.runnables import RunnableConfig

from ..enums import RouterDirective, SectionID, SectionStatus
from ..models import ContextPacket, XBuddyState
from ..prompts import get_next_unfinished_section, get_section_template
from ..sections.base_prompt import BASE_RULES

logger = logging.getLogger(__name__)


def _directive_value(directive) -> str:
    """Normalize a RouterDirective enum or raw string to a plain string."""
    return getattr(directive, "value", directive) or RouterDirective.NEXT.value


async def router_node(state: XBuddyState, config: RunnableConfig) -> dict:
    """Route to the correct section and load its context packet."""
    updates: dict = {}
    section_states = state.get("section_states", {})
    current = state.get("current_section", list(SectionID)[0])
    directive = _directive_value(state.get("router_directive"))

    # 1. Resolve the target section from the directive.
    if directive.startswith("modify:"):
        target = directive.split(":", 1)[1].strip()
        try:
            current = SectionID(target)
        except ValueError:
            logger.warning("router: unknown modify target %r — staying put", target)

    elif directive == RouterDirective.NEXT.value:
        nxt = get_next_unfinished_section(section_states)
        if nxt is None:
            # Every section is done — signal the graph to generate the final plan.
            updates["should_generate_final_output"] = True
            logger.info("router | all sections done → final output")
            return updates
        current = nxt

    # directive == STAY → keep the current section as-is.

    updates["current_section"] = current

    # 2. Load the context packet for the current section.
    template = get_section_template(current)
    section_state = section_states.get(current.value)
    status = section_state.status if section_state else SectionStatus.IN_PROGRESS
    validation = (
        {r.field_name: r.model_dump() for r in template.validation_rules}
        or None
    )

    updates["context_packet"] = ContextPacket(
        section_id=current,
        status=status,
        system_prompt=f"{BASE_RULES}\n\n{template.system_prompt_template}",
        draft=section_state.content if section_state else None,
        validation_rules=validation,
    )

    logger.info("router | directive=%s → section=%s (%s)", directive, current.value, status)
    return updates
