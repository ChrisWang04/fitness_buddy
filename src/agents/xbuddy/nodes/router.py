"""Router node — handles section navigation and context loading.

Reference: https://github.com/Victoria824/FounderBuddy/blob/main/src/agents/founder_buddy/nodes/router.py

This node runs each turn before the reply is generated. It:
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

from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig

from ..enums import RouterDirective, SectionID, SectionStatus
from ..models import ContextPacket, XBuddyState
from ..prompts import (
    get_next_section,
    get_next_unfinished_section,
    get_section_template,
    is_explicit_advance,
)
from ..sections.base_prompt import BASE_RULES

logger = logging.getLogger(__name__)


def _directive_value(directive) -> str:
    """Normalize a RouterDirective enum or raw string to a plain string."""
    return getattr(directive, "value", directive) or RouterDirective.NEXT.value


def _as_section_id(value) -> SectionID:
    if isinstance(value, SectionID):
        return value
    try:
        return SectionID(value)
    except (ValueError, TypeError):
        return list(SectionID)[0]


def _latest_human_text(messages: list) -> str:
    for m in reversed(messages):
        if isinstance(m, HumanMessage):
            content = m.content
            if isinstance(content, list):
                return "".join(b.get("text", "") for b in content if isinstance(b, dict))
            return content or ""
    return ""


async def router_node(state: XBuddyState, config: RunnableConfig) -> dict:
    """Route to the correct section and load its context packet."""
    updates: dict = {}
    section_states = state.get("section_states", {})
    current = _as_section_id(state.get("current_section", list(SectionID)[0]))
    directive = _directive_value(state.get("router_directive"))

    # 0. Deterministic explicit-advance (code, not the Haiku decision). If the
    #    user explicitly asked to move on, advance the section HERE — before the
    #    reply is generated — so the reply the user gets this same turn is the
    #    NEXT section's opener, not another question from the current section.
    #    Guarded by force_advance_from so the memory_updater→router loop can't
    #    re-trigger a second advance on the same message (initialize clears it).
    latest_human = _latest_human_text(state.get("messages", []))
    already_advancing = bool(state.get("force_advance_from"))
    if not state.get("finished", False) and not already_advancing and is_explicit_advance(latest_human):
        nxt = get_next_section(current)
        if nxt is not None:
            # Not the last section: jump to the next one for this turn's reply.
            new_states = {k: v.model_copy(deep=True) for k, v in section_states.items()}
            if nxt.value in new_states and new_states[nxt.value].status == SectionStatus.PENDING:
                new_states[nxt.value].status = SectionStatus.IN_PROGRESS
            updates["section_states"] = new_states
            section_states = new_states
            updates["force_advance_from"] = current.value  # memory_updater finalizes this section
            current = nxt
            directive = RouterDirective.NEXT.value
            logger.info("router | explicit advance → leaving=%s entering=%s", updates["force_advance_from"], current.value)
        else:
            # Last section: keep it, produce a brief closing reply, then finish.
            updates["force_advance_from"] = current.value
            directive = RouterDirective.STAY.value
            logger.info("router | explicit advance on last section=%s → finishing", current.value)
        updates["router_directive"] = directive
        updates["current_section"] = current
        return _load_context(current, section_states, updates)

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
    return _load_context(current, section_states, updates)


def _load_context(current: SectionID, section_states: dict, updates: dict) -> dict:

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

    logger.info("router | → section=%s (%s)", current.value, status)
    return updates
