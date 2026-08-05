"""Initialize node — validates and sets up conversation state.

Reference: https://github.com/Victoria824/FounderBuddy/blob/main/src/agents/founder_buddy/nodes/initialize.py

This node runs once at the start of every invocation. It is intentionally
idempotent: it only fills in what's missing, so it's safe on both a
cold start (brand-new conversation) and a warm start (returning user whose
state was restored by the checkpointer).

It:
  1. Sets user_id / thread_id from config if not already in state.
  2. Sets defaults for current_section and router_directive.
  3. Bootstraps section_states on cold start (all PENDING, first IN_PROGRESS).
  4. Ensures the domain data container (user_data) exists.
  5. Logs whether this was a cold or warm start.
"""

import logging

from langchain_core.runnables import RunnableConfig

from ..enums import RouterDirective, SectionID, SectionStatus
from ..models import SectionState, XBuddyData, XBuddyState

logger = logging.getLogger(__name__)


async def initialize_node(state: XBuddyState, config: RunnableConfig) -> dict:
    """Initialize conversation state (idempotent — cold + warm start safe)."""
    updates: dict = {}
    configurable = config.get("configurable", {}) or {}
    section_order = list(SectionID)

    # 1. Identity — pull from config on cold start, never overwrite once set.
    if not state.get("user_id") and configurable.get("user_id") is not None:
        updates["user_id"] = configurable["user_id"]
    if not state.get("thread_id") and configurable.get("thread_id") is not None:
        updates["thread_id"] = configurable["thread_id"]

    # 2. Navigation defaults / validation. If current_section is missing or
    #    somehow invalid (corrupt state), reset it to the first section.
    current = state.get("current_section")
    current_value = getattr(current, "value", current)
    if current_value not in {s.value for s in SectionID}:
        updates["current_section"] = section_order[0]

    if not state.get("router_directive"):
        updates["router_directive"] = RouterDirective.NEXT

    # 3. Cold start vs warm start. If section_states already exist, this is a
    #    returning user (checkpointer restored it) — leave it untouched.
    #    Otherwise bootstrap: every section PENDING, the first IN_PROGRESS.
    is_cold_start = not state.get("section_states")
    if is_cold_start:
        updates["section_states"] = {
            sid.value: SectionState(
                section_id=sid,
                status=SectionStatus.IN_PROGRESS if i == 0 else SectionStatus.PENDING,
            )
            for i, sid in enumerate(section_order)
        }

    # 4. Ensure the domain data container exists.
    if not state.get("user_data"):
        updates["user_data"] = XBuddyData()

    logger.info(
        "initialize_node | thread=%s cold_start=%s current_section=%s",
        updates.get("thread_id", state.get("thread_id")),
        is_cold_start,
        updates.get("current_section", state.get("current_section")),
    )
    return updates
