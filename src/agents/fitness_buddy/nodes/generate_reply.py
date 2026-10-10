"""Generate reply node — creates the conversational, user-facing response.

Reference: https://github.com/Victoria824/FounderBuddy/blob/main/src/agents/founder_buddy/nodes/generate_reply.py

This node is the "for the human" half of the turn:
  1. Reads the context_packet the router loaded (shared rules + current section prompt).
  2. Builds the model input the way the reference does — system prompt, a progress
     note, a "new section" instruction when the section has no saved content yet,
     then the recent conversation.
  3. Calls the LLM (streaming) with that message list.
  4. Returns the AI reply as a message.

CRASH-AVOIDANCE (why the memory_updater→router loop is safe): the message list
passed to the model must NEVER end on an assistant message — Anthropic Sonnet
rejects that as an unsupported "assistant prefill". On a loop-back the raw
history ends with the reply we just generated, so we strip any TRAILING
AIMessage(s) before sending. The list then ends on the user's message (or a
SystemMessage), and the loop can emit the next section's opener the same turn.

The paired generate_decision node is the "for the machine" half — it turns the
same exchange into a structured routing decision.
"""

import logging

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from core.llm import get_model

from ..enums import SectionID, SectionStatus
from ..models import FitnessBuddyState
from ..prompts import get_section_template
from ..sections.base_prompt import BASE_RULES

logger = logging.getLogger(__name__)


def _strip_trailing_ai(messages: list[BaseMessage]) -> list[BaseMessage]:
    """Return messages with any trailing assistant message(s) removed, so the
    list handed to the model never ends on an AIMessage (prefill-safe)."""
    end = len(messages)
    while end > 0 and isinstance(messages[end - 1], AIMessage):
        end -= 1
    return list(messages[:end])


async def generate_reply_node(state: FitnessBuddyState, config: RunnableConfig) -> dict:
    """Generate a conversational reply for the current section."""
    packet = state.get("context_packet")
    system_prompt = packet.system_prompt if packet else BASE_RULES

    messages: list[BaseMessage] = [SystemMessage(content=system_prompt)]

    # Progress note + a "new section" instruction (only when the current section
    # has no saved content yet), mirroring the reference. This keeps the model
    # anchored to the current section and, on a loop-back into a freshly-entered
    # section, makes it open that section instead of continuing the previous one.
    current = state.get("current_section", list(SectionID)[0])
    if not isinstance(current, SectionID):
        try:
            current = SectionID(current)
        except (ValueError, TypeError):
            current = list(SectionID)[0]
    section_states = state.get("section_states", {})

    completed = [
        get_section_template(SectionID(sid)).name
        for sid, st in section_states.items()
        if st.status == SectionStatus.DONE
    ]
    progress = (
        "\n\nSYSTEM STATUS:\n"
        f"- Total sections: {len(list(SectionID))}\n"
        f"- Completed: {len(completed)} sections"
        + (f" ({', '.join(completed)})" if completed else "")
        + f"\n- Currently working on: {get_section_template(current).name}\n"
    )
    messages.append(SystemMessage(content=progress))

    section_state = section_states.get(current.value)
    if not section_state or not section_state.content:
        messages.append(SystemMessage(content=(
            f"IMPORTANT: You are now in the {current.value} section — a NEW section "
            "with no content yet. Follow this section's prompt to open it. Do NOT "
            "reference or restate content from previous sections."
        )))

    # Recent conversation, with any trailing assistant message(s) stripped so the
    # model input never ends on an AIMessage (the loop-back crash fix).
    messages.extend(_strip_trailing_ai(state.get("messages", [])))

    # get_model() returns the configured chat model with streaming=True, so tokens
    # stream out over the /stream endpoint automatically.
    model = get_model()
    response = await model.ainvoke(messages, config)

    logger.info("generate_reply | section=%s", current.value)
    return {"messages": [response], "awaiting_user_input": True}
