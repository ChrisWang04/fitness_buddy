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
- is_satisfied: true / false / null — has the user indicated they're satisfied or DONE with
    this section? Set TRUE whenever the user affirms, agrees, or signals they're finished in
    ANY wording — e.g. "yes", "ok", "sure", "yep", "cool", "sounds good", "looks good",
    "that's all", "it's all good", "we're good", "let's do it", "give me the plan". Do NOT be
    conservative: on the LAST section this is what triggers the final plan, so if the user is
    clearly done or wants to proceed, set is_satisfied = true.
- user_satisfaction_feedback: a short note on their satisfaction, or null.
- should_save_content: true once this section has enough content worth saving.

CRITICAL — judge ONLY what the USER actually said:
- Count information from the USER's own messages. Do NOT count something just because
  it appears in the assistant's reply: the assistant can restate or assume wrongly, and
  treating its words as fact launders a guess into a saved answer.
- If the user's latest message doesn't address this section at all (it's off-topic, or a
  repeat of an earlier message), that is NOT new information — set "stay" unless the
  section was already covered by something they genuinely said earlier.

When to advance (IMPORTANT — bias strongly toward advancing; do NOT over-ask):
- DEFAULT to "next". Set "stay" ONLY if the user has not yet given ANY of this section's
  core information, or asked a direct question you must answer before moving on.
- As soon as the user has given the section's essential info even ONCE, set "next". You do
  NOT need every minor detail, and you do NOT need to ask the user to confirm before moving on.
- ALWAYS set "next" if the user explicitly asks to move on (e.g. "next", "move on",
  "go to the next section", "that's all", "let's continue").
- Set "next" if the user's latest message provides information that belongs to a LATER
  section — that means they're already done with this one.
- Never re-ask something the user already answered or clearly skipped — advance instead.
  Never ask the same question twice. (Advancing past a skipped detail is fine; inventing
  the user's answer to it is not — see the CRITICAL rule above.)
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


async def generate_decision_node(state: XBuddyState, config: RunnableConfig) -> dict:
    """Analyze the conversation and produce a structured routing decision."""
    current = state.get("current_section", list(SectionID)[0])
    if not isinstance(current, SectionID):
        try:
            current = SectionID(current)
        except ValueError:
            current = list(SectionID)[0]

    history = state.get("messages", [])

    # Anti-runaway guard (matches the reference: advance only on FRESH user input).
    # This node runs right after generate_reply, so history[-1] is the reply we just
    # produced. On a memory_updater→router loop-back, that reply was the OPENER for a
    # newly-entered section and history[-2] is the previous assistant reply — there is
    # no new user message to act on — so STAY and wait for the user. Without this, a
    # single turn's directive would cascade through every section in one pass.
    if len(history) < 2 or not isinstance(history[-2], HumanMessage):
        last_reply = history[-1] if history else None
        agent_output = ChatAgentOutput(
            reply=_extract_text(last_reply.content) if isinstance(last_reply, AIMessage) else "",
            router_directive=RouterDirective.STAY.value,
            should_save_content=False,
        )
        logger.info("generate_decision | no fresh user input (loop-back opener) → STAY")
        return {"router_directive": RouterDirective.STAY.value, "agent_output": agent_output}

    template = get_section_template(current)
    system = DECISION_SYSTEM_PROMPT.format(
        name=template.name,
        section_id=current.value,
        description=template.description,
        required=", ".join(template.required_fields) or "none",
    )

    # A cheaper/faster model is plenty for this structured classification. Pin
    # temperature to 0: this is a classification, not a creative task, and the
    # default 0.4 was making stay/next judgements inconsistent across otherwise
    # identical turns (verified via repeated local runs of the same transcript).
    model = get_model(AnthropicModelName.HAIKU_45).bind(temperature=0).with_structured_output(ChatAgentDecision)
    # Defensive: tag skip_stream so this internal classification never leaks into the SSE stream.
    skip_cfg = {**(config or {}), "tags": [*((config or {}).get("tags") or []), "skip_stream"]}
    try:
        decision = await model.ainvoke([SystemMessage(content=system), *history], skip_cfg)
    except Exception as exc:  # unparseable / LLM error -> safe fallback
        logger.warning("generate_decision | failed (%s) — defaulting to STAY", exc)
        decision = ChatAgentDecision(
            reasoning="LLM/parse error — falling back to STAY.",
            router_directive=RouterDirective.STAY.value,
            should_save_content=False,
        )

    # Navigation is judged by the LLM (no keyword/word-count overrides). If the
    # model/parse failed above, the safe fallback is STAY.
    directive = decision.router_directive

    last_reply = next((m for m in reversed(history) if isinstance(m, AIMessage)), None)
    agent_output = ChatAgentOutput(
        reply=_extract_text(last_reply.content) if last_reply else "",
        router_directive=directive,
        user_satisfaction_feedback=decision.user_satisfaction_feedback,
        is_satisfied=decision.is_satisfied,
        should_save_content=decision.should_save_content,
    )

    logger.info(
        "generate_decision | directive=%s satisfied=%s save=%s reasoning=%r",
        directive, decision.is_satisfied, decision.should_save_content, decision.reasoning,
    )
    return {
        "router_directive": directive,
        "agent_output": agent_output,
    }
