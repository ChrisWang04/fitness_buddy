"""Routing logic for XBuddy Agent graph.

These functions are used as conditional edges in the StateGraph.
Study FounderBuddy's routes.py:
https://github.com/Victoria824/FounderBuddy/blob/main/src/agents/founder_buddy/graph/routes.py
"""

from typing import Literal

from langchain_core.messages import HumanMessage
from langgraph.constants import END

from ..enums import RouterDirective
from ..models import XBuddyState


def route_after_memory_updater(state: XBuddyState):
    """Route after memory_updater — generate the final plan, or end the turn.

    Deliberately does NOT loop back to router within the same turn. The reply for
    this turn was already produced by generate_reply (the router advances the
    section up-front for explicit "next" requests, so that single reply is already
    the right section's). Looping back would (a) generate a SECOND reply whose
    message history ends with an assistant message — which Anthropic rejects as an
    unsupported prefill — and (b) show the user two bubbles. A section advanced by
    the Haiku decision simply takes effect on the next user turn via the router.
    """
    if state.get("should_generate_final_output", False):
        return "implementation"
    return END


def route_decision(state: XBuddyState) -> Literal["generate_reply"] | None:
    """Determine whether to generate a reply or end the turn.

    TODO: Study FounderBuddy's route_decision to understand the full logic
    for handling STAY/NEXT/MODIFY directives and pending user input.
    """
    def has_pending_user_input() -> bool:
        msgs = state.get("messages", [])
        if not msgs:
            return False
        return isinstance(msgs[-1], HumanMessage)

    if state.get("finished", False):
        if has_pending_user_input():
            return "generate_reply"
        return None

    directive = state.get("router_directive")

    if directive == RouterDirective.STAY or (isinstance(directive, str) and directive.lower() == "stay"):
        if has_pending_user_input():
            return "generate_reply"
        if state.get("awaiting_user_input", False):
            return None
        return None

    elif directive == RouterDirective.NEXT or (isinstance(directive, str) and directive.startswith("modify:")):
        return "generate_reply"

    return None
