"""Memory updater node — persists section state and manages completion.

Reference: https://github.com/Victoria824/FounderBuddy/blob/main/src/agents/founder_buddy/nodes/memory_updater.py

Runs after generate_decision. Using that decision it:
  1. When a section is complete/worth saving, summarizes what was collected for it
     (a cheap LLM call) and stores that as the section's content.
  2. Advances section_states (mark the current section DONE, next one IN_PROGRESS).
  3. Persists the section to Supabase (best-effort — a DB hiccup never breaks the turn).
  4. Sets should_generate_final_output once every section is DONE.

Completeness gate: a section is only marked DONE when the decision advanced it
(router_directive == "next"), i.e. generate_decision judged there was enough. Thin
sections stay IN_PROGRESS until that judgement is made.
"""

import logging

from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableConfig

from core.llm import get_model
from core.models import AnthropicModelName

from ..enums import RouterDirective, SectionID, SectionStatus
from ..models import SectionContent, SectionState, XBuddyState
from ..prompts import get_next_section, get_section_template

logger = logging.getLogger(__name__)

AGENT_ID = "fitness-buddy"


def _directive_value(directive) -> str:
    return getattr(directive, "value", directive) or RouterDirective.STAY.value


def _as_section_id(value) -> SectionID:
    if isinstance(value, SectionID):
        return value
    try:
        return SectionID(value)
    except (ValueError, TypeError):
        return list(SectionID)[0]


def _text(content) -> str:
    if isinstance(content, list):
        return "".join(b.get("text", "") for b in content if isinstance(b, dict))
    return content or ""


# Reliable completion signals (mirrors FounderBuddy's memory_updater). The final
# plan is triggered by the LLM's is_satisfied, OR — as a fallback on the LAST
# section only — a clear "done" or "give me the plan" from the user. This keeps
# the formatted plan card from being blocked when the Haiku decision is too
# conservative to ever set is_satisfied. Navigation between sections is still
# LLM-judged; these keywords only gate the final finish.
_DONE_SIGNALS = (
    "thats all", "that's all", "all done", "im done", "i'm done", "were done", "we're done",
    "im finished", "i'm finished", "finished", "done", "thats it", "that's it", "good to go",
    "im good", "i'm good", "were good", "we're good", "move on", "next", "proceed",
    "wrap it up", "wrap up", "lets finish", "let's finish", "thats everything", "that's everything",
    # Common affirmations that mean "I'm done, go ahead" — multi-word to stay safe
    # (avoid bare "good"/"ok" which could appear inside a real answer). Sonnet's
    # is_satisfied is the primary signal; these are just a safety net.
    "all good", "its all good", "it's all good", "sounds good", "sounds great", "looks good",
    "go ahead", "lets go", "let's go", "ready to go", "im ready", "i'm ready", "that works",
)
_PLAN_REQUESTS = (
    "give me the plan", "give me my plan", "my plan", "full plan", "final plan", "the plan",
    "workout plan", "training plan", "generate the plan", "generate my plan", "make the plan",
    "build the plan", "show me the plan", "create the plan", "put my plan together",
    "出计划", "计划", "给我计划",
)


def _last_user_text(history: list) -> str:
    for m in reversed(history):
        if isinstance(m, HumanMessage):
            return _text(m.content).strip().lower()
    return ""


def _last_reply_text(history: list) -> str:
    """The assistant reply generated this turn (history[-1] after generate_reply)."""
    for m in reversed(history):
        if isinstance(m, AIMessage):
            return _text(m.content).strip()
    return ""


def _format_transcript(history: list) -> str:
    """Render the message history as a plain-text transcript for the summarizer."""
    lines = []
    for m in history:
        who = "User" if isinstance(m, HumanMessage) else "Coach"
        text = _text(m.content).strip()
        if text:
            lines.append(f"{who}: {text}")
    return "\n".join(lines) if lines else "(no messages yet)"


async def _summarize_section(section: SectionID, history: list, config: RunnableConfig) -> str:
    """Concise plain-text summary of what the user gave for this section.

    The conversation is passed as a transcript inside a single user message. Passing the
    raw history (which can end with an assistant turn) makes Anthropic try to *continue*
    that turn and return nothing — so we render it as text instead.
    """
    template = get_section_template(section)
    prompt = (
        f"Conversation so far for the {template.name} section:\n\n"
        f"{_format_transcript(history)}\n\n"
        f"This section covers: {template.description}\n"
        f"Summarize what the USER has told us, in 1-3 concise plain-text sentences. "
        f"Use only what the user actually said. If little was provided, note what's still missing."
    )
    model = get_model(AnthropicModelName.HAIKU_45)
    # Tag as skip_stream so these summary tokens are NOT pushed to the user-facing SSE
    # stream (the /stream endpoint drops tokens carrying this tag). Without it, this
    # internal third-person summary leaks into the reply bubble.
    skip_cfg = {**(config or {}), "tags": [*((config or {}).get("tags") or []), "skip_stream"]}
    resp = await model.ainvoke([HumanMessage(content=prompt)], skip_cfg)
    return _text(resp.content).strip()


def _persist_section(user_id: int, thread_id: str, state: SectionState) -> None:
    """Best-effort write to Supabase — swallow errors so persistence never breaks a turn."""
    try:
        from integrations.supabase.supabase_client import SupabaseClient

        SupabaseClient().save_section_state(
            user_id=user_id,
            thread_id=thread_id,
            section_id=state.section_id.value,
            content=state.content.content if state.content else {},
            plain_text=state.content.plain_text if state.content else "",
            status=state.status.value,
            satisfaction_status=state.satisfaction_status,
            agent_id=AGENT_ID,
        )
    except Exception as exc:  # noqa: BLE001 — persistence is best-effort
        logger.warning("memory_updater | Supabase persist failed (%s)", exc)


async def memory_updater_node(state: XBuddyState, config: RunnableConfig) -> dict:
    """Update section state, persist it, and check for completion."""
    updates: dict = {}
    current = _as_section_id(state.get("current_section"))
    directive = _directive_value(state.get("router_directive"))
    advancing = directive == RouterDirective.NEXT.value

    agent_output = state.get("agent_output")
    should_save = bool(agent_output and agent_output.should_save_content)
    is_satisfied = agent_output.is_satisfied if agent_output else None

    # Work on copies so we don't mutate the incoming state in place.
    section_states = {k: v.model_copy(deep=True) for k, v in state.get("section_states", {}).items()}
    history = state.get("messages", [])
    thread_id = state.get("thread_id", "")
    # section_states.user_id is an INTEGER column; coerce so a str like "1" from the
    # auth/config layer still persists instead of silently failing inside the try/except.
    user_id_raw = state.get("user_id", 1)
    try:
        user_id = int(user_id_raw)
    except (TypeError, ValueError):
        logger.warning("memory_updater | user_id %r is not int-coercible", user_id_raw)
        user_id = user_id_raw

    # Section is complete when the decision advanced (NEXT) OR the user is
    # satisfied — matches the reference _status_from_output.
    # Reliable finish (mirrors FounderBuddy): on the LAST section, a clear done /
    # plan-request from the user finalizes it even if Haiku never set is_satisfied,
    # so the formatted plan card is never blocked by a conservative decision.
    last_user = _last_user_text(history)
    is_last_section = current == list(SectionID)[-1]
    user_done = bool(is_satisfied) or any(s in last_user for s in _DONE_SIGNALS)
    user_requested_plan = any(s in last_user for s in _PLAN_REQUESTS)

    # The signals above read the LAST user message — which, on a loop-back turn,
    # still belongs to the PREVIOUS section. When the loop advances into the final
    # section, is_last_section flips true while that stale message is still the
    # most recent one, so an ordinary "next" used to leave Preferences would fire
    # the whole plan the instant Nutrition opened, before the user answered a
    # single nutrition question. Require input the user actually gave *after*
    # entering this section — the same "fresh input" test generate_decision uses
    # (history[-1] is the reply we just wrote; history[-2] is the user's turn only
    # if they just spoke, and another AI message on a loop-back opener).
    has_fresh_user_input = len(history) >= 2 and isinstance(history[-2], HumanMessage)
    finish_on_last = (
        is_last_section and has_fresh_user_input and (user_done or user_requested_plan)
    )

    # On the last section, "advance" doesn't mean "open the next section" — it means
    # generate the entire plan and end the conversation. So it must not happen while
    # we've just asked the user something and they haven't answered: the decision
    # node is deliberately told to advance despite a pending question (that keeps it
    # from fixating mid-conversation), which is right for sections 1-4 but here left
    # the user staring at a question that got steamrolled by the plan. Wait a turn so
    # they can answer. An explicit done / plan-request still finishes immediately, so
    # this can't trap someone who is ready to wrap up.
    reply_asks_question = _last_reply_text(history).rstrip().endswith("?")
    awaiting_answer_on_last = (
        is_last_section and reply_asks_question and not (user_done or user_requested_plan)
    )

    section_done = (
        advancing or bool(is_satisfied) or finish_on_last
    ) and not awaiting_answer_on_last

    # 1. Save the current section's content if the decision said so (or it's complete).
    if should_save or section_done:
        summary = await _summarize_section(current, history, config)
        cur = section_states.get(current.value) or SectionState(section_id=current)
        # Guard: never overwrite existing content with an empty summary.
        if summary:
            cur.content = SectionContent(content={"text": summary}, plain_text=summary)
        else:
            logger.warning("memory_updater | empty summary for %s — keeping prior content", current.value)
        cur.satisfaction_status = (
            "satisfied" if is_satisfied else "needs_improvement" if is_satisfied is False else None
        )
        # Completeness gate: DONE when advanced or satisfied; otherwise at least IN_PROGRESS.
        if section_done:
            cur.status = SectionStatus.DONE
        elif cur.status == SectionStatus.PENDING:
            cur.status = SectionStatus.IN_PROGRESS
        section_states[current.value] = cur
        _persist_section(user_id, thread_id, cur)

    # 2. On advance, wake the next section.
    if advancing:
        nxt = get_next_section(current)
        if nxt and nxt.value in section_states and section_states[nxt.value].status == SectionStatus.PENDING:
            section_states[nxt.value].status = SectionStatus.IN_PROGRESS

    updates["section_states"] = section_states

    # 3. All sections done → signal the graph to generate the final plan.
    all_done = all(
        section_states.get(s.value) and section_states[s.value].status == SectionStatus.DONE
        for s in SectionID
    )
    # Don't re-trigger once a plan already exists — otherwise any later "done"-ish
    # message (e.g. the user re-affirming) regenerates the plan again, wasting an
    # expensive Sonnet call and swapping in a second, different plan card.
    if (all_done or finish_on_last) and not state.get("finished"):
        updates["should_generate_final_output"] = True

    logger.info(
        "memory_updater | section=%s advancing=%s done=%s finish_on_last=%s all_done=%s fresh_input=%s",
        current.value, advancing, section_done, finish_on_last, all_done, has_fresh_user_input,
    )
    return updates
