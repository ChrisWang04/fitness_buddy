"""Generate decision node — turns the exchange into a structured routing decision.

Reference: https://github.com/Victoria824/FounderBuddy/blob/main/src/agents/founder_buddy/nodes/generate_decision.py

This is the "for the machine" half of the turn. It:
  1. Analyzes the conversation so far for the CURRENT section.
  2. Produces a structured ChatAgentDecision: router_directive (stay / next / modify),
     whether the user seems satisfied, and whether the section content is worth saving.
  3. Writes router_directive back to state so the router acts on it next turn.

Structured output is produced via with_structured_output(ChatAgentDecision), so the
result is schema-validated. If the model/parse ever fails, we fall back to STAY — the
safe default (keep asking) rather than wrongly advancing.
"""

import logging

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig

from core.llm import get_model
from core.models import AnthropicModelName

from ..enums import RouterDirective, SectionID
from ..models import ChatAgentDecision, ChatAgentOutput, XBuddyState
from ..prompts import get_section_template

logger = logging.getLogger(__name__)

DECISION_SYSTEM_PROMPT = """You are the navigation controller for FitnessBuddy. Based ONLY on the
conversation so far, decide what should happen next for the CURRENT section.

Current section: {name} ({section_id})
This section should cover: {description}
Required fields: {required}

Produce a structured decision:
- router_directive:
    "stay"  -> the current section still needs more information from the user.
    "next"  -> the current section is covered well enough to move on.
    "modify:<section_id>" -> ONLY if the user explicitly asked to go back and change a
        previous section. Valid ids: goals, profile, schedule, preferences, nutrition.
- is_satisfied: true / false / null — does the user seem satisfied with what's captured here?
- user_satisfaction_feedback: a short note on their satisfaction, or null.
- should_save_content: true once this section has enough content worth saving.

When to advance (IMPORTANT — bias strongly toward advancing; do NOT over-ask):
- DEFAULT to "next". Set "stay" ONLY if the user has not yet given ANY of this section's
  core information, or asked a direct question you must answer before moving on.
- As soon as the user has given the section's essential info even ONCE, set "next". You do
  NOT need every minor detail, and you do NOT need to ask the user to confirm before moving on.
- ALWAYS set "next" if the user explicitly asks to move on (e.g. "next", "move on",
  "go to the next section", "that's all", "let's continue").
- Set "next" if the user's latest message provides information that belongs to a LATER
  section — that means they're already done with this one.
- Never re-ask for something the user already answered or clearly skipped — make a reasonable
  assumption and advance. Never ask the same question twice.
- Do NOT set "stay" merely because the assistant asked a follow-up or confirmation question;
  if the user has already provided this section's core info, advance regardless of any
  pending question."""


def _extract_text(content) -> str:
    """AIMessage content may be a plain string or a list of content blocks."""
    if isinstance(content, list):
        return "".join(
            b.get("text", "")
            for b in content
            if isinstance(b, dict) and b.get("type") == "text"
        )
    return content or ""


def _latest_human_text(messages: list) -> str:
    for m in reversed(messages):
        if isinstance(m, HumanMessage):
            c = m.content
            if isinstance(c, list):
                return "".join(b.get("text", "") for b in c if isinstance(b, dict))
            return c or ""
    return ""


def _is_substantive(text: str) -> bool:
    """True if the user just gave a real answer (not a short/clarifying message).

    Used to advance deterministically: the Haiku decision is unreliable and tends
    to linger on a section, so when the user has clearly provided information we
    move on rather than over-asking. Questions and very short replies (e.g. "yes",
    "the gym") are left to the LLM decision.
    """
    t = (text or "").strip()
    if not t or t.endswith("?"):
        return False
    return len(t.split()) >= 4


async def generate_decision_node(state: XBuddyState, config: RunnableConfig) -> dict:
    """Analyze the conversation and produce a structured routing decision."""
    current = state.get("current_section", list(SectionID)[0])
    if not isinstance(current, SectionID):
        try:
            current = SectionID(current)
        except ValueError:
            current = list(SectionID)[0]

    history = state.get("messages", [])

    # If router already performed a deterministic explicit-advance THIS turn, do
    # not let the Haiku decision advance AGAIN (the memory_updater→router loop
    # would otherwise skip a second section). Force STAY; memory_updater will
    # finalize the left section via force_advance_from.
    if state.get("force_advance_from"):
        last_reply = next((m for m in reversed(history) if isinstance(m, AIMessage)), None)
        agent_output = ChatAgentOutput(
            reply=_extract_text(last_reply.content) if last_reply else "",
            router_directive=RouterDirective.STAY.value,
            should_save_content=False,
        )
        logger.info("generate_decision | force_advance in flight → STAY (skip Haiku)")
        return {"router_directive": RouterDirective.STAY.value, "agent_output": agent_output}

    template = get_section_template(current)
    system = DECISION_SYSTEM_PROMPT.format(
        name=template.name,
        section_id=current.value,
        description=template.description,
        required=", ".join(template.required_fields) or "none",
    )

    # A cheaper/faster model is plenty for a structured classification.
    model = get_model(AnthropicModelName.HAIKU_45).with_structured_output(ChatAgentDecision)
    # Defensive: tag skip_stream so this internal classification never leaks into the SSE stream.
    skip_cfg = {**(config or {}), "tags": [*((config or {}).get("tags") or []), "skip_stream"]}
    try:
        decision = await model.ainvoke([SystemMessage(content=system), *history], skip_cfg)
    except Exception as exc:  # unparseable / LLM error -> safe fallback
        logger.warning("generate_decision | failed (%s) — defaulting to STAY", exc)
        decision = ChatAgentDecision(
            router_directive=RouterDirective.STAY.value,
            should_save_content=False,
        )

    # Deterministic anti-stall: the Haiku decision reliably lingers on a section.
    # If the user just gave a substantive answer, advance rather than over-asking.
    # (Modify/next from the LLM are respected; only a stall — "stay" — is overridden.)
    directive = decision.router_directive
    if directive == RouterDirective.STAY.value and _is_substantive(_latest_human_text(history)):
        directive = RouterDirective.NEXT.value
        logger.info("generate_decision | substantive answer → override STAY→NEXT")

    last_reply = next((m for m in reversed(history) if isinstance(m, AIMessage)), None)
    agent_output = ChatAgentOutput(
        reply=_extract_text(last_reply.content) if last_reply else "",
        router_directive=directive,
        user_satisfaction_feedback=decision.user_satisfaction_feedback,
        is_satisfied=decision.is_satisfied,
        should_save_content=decision.should_save_content,
    )

    logger.info(
        "generate_decision | directive=%s (llm=%s) satisfied=%s save=%s",
        directive, decision.router_directive, decision.is_satisfied, decision.should_save_content,
    )
    return {
        "router_directive": directive,
        "agent_output": agent_output,
    }
