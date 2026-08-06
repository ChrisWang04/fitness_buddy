"""Implementation node — generates the final output when all sections are complete.

Reference: https://github.com/Victoria824/FounderBuddy/blob/main/src/agents/founder_buddy/nodes/generate_business_plan.py

For FitnessBuddy the final artifact is a structured training + nutrition plan. This node:
  1. Gathers every section's summary from section_states.
  2. Calls the LLM (Sonnet) to synthesize the plan, grounded only in what was collected.
  3. Persists it to Supabase (best-effort).
  4. Sets finished = True and stores it in final_output.
"""

import logging

from langchain_core.messages import HumanMessage
from langchain_core.runnables import RunnableConfig
from langgraph.config import get_stream_writer

from core.llm import get_model

from ..enums import SectionID
from ..models import XBuddyState
from ..prompts import get_section_template

logger = logging.getLogger(__name__)

AGENT_ID = "fitness-buddy"

# The final plan is long (overview + weekly table + per-day exercise tables +
# nutrition + tips); the default 3000-token cap truncates it mid-sentence.
PLAN_MAX_TOKENS = 8000

PLAN_PROMPT = """You are FitnessBuddy. The user has finished all five sections. Using ONLY the
collected information below, write a clear, structured, personalized training + nutrition plan.

Collected information:
{collected}

Write the plan with these parts:
1. Overview — their goal and how this plan gets them there.
2. Weekly training split — which days and what focus, fitting their schedule, location, and equipment.
3. Key exercises & progression — grounded in their available equipment; avoid anything that aggravates their injuries or that they dislike.
4. Nutrition guidance — aligned with their diet pattern, restrictions, and goal.
5. Tips & staying on track.

Be specific, encouraging, and practical. Use their actual details. Do not invent facts that
aren't in the collected information — if something is missing, give sensible general guidance
and briefly note the assumption."""


def _text(content) -> str:
    if isinstance(content, list):
        return "".join(b.get("text", "") for b in content if isinstance(b, dict))
    return content or ""


def _persist_plan(user_id, thread_id: str, plan: str) -> None:
    """Best-effort save to Supabase — never let a DB error break plan delivery."""
    try:
        user_id = int(user_id)
    except (TypeError, ValueError):
        logger.warning("implementation | user_id %r not int-coercible", user_id)
    try:
        from integrations.supabase.supabase_client import SupabaseClient

        SupabaseClient().save_business_plan(
            user_id=user_id,
            thread_id=thread_id,
            content=plan,
            markdown_content=plan,
            agent_id=AGENT_ID,
        )
    except Exception as exc:  # noqa: BLE001 — best-effort
        logger.warning("implementation | Supabase save failed (%s)", exc)


async def implementation_node(state: XBuddyState, config: RunnableConfig) -> dict:
    """Synthesize the final training + nutrition plan from all section summaries."""
    section_states = state.get("section_states", {})

    lines = []
    for sid in SectionID:
        st = section_states.get(sid.value)
        summary = st.content.plain_text if st and st.content else ""
        lines.append(f"- {get_section_template(sid).name}: {summary.strip() or '(not provided)'}")
    collected = "\n".join(lines)

    # Sonnet — quality matters for the final artifact. The full plan (overview +
    # weekly table + per-day exercise tables + nutrition + tips) is long, so raise
    # max_tokens for THIS call only (get_model() is @cache'd, so bind instead of
    # mutating the shared instance; Sonnet 4.x allows well above this).
    model = get_model().bind(max_tokens=PLAN_MAX_TOKENS)
    # Tag skip_stream so the plan's tokens are NOT pushed onto the user-facing SSE
    # *token* stream — otherwise they'd stream token-by-token into the same chat
    # bubble as generate_reply's reply and concatenate with it.
    skip_cfg = {**(config or {}), "tags": [*((config or {}).get("tags") or []), "skip_stream"]}

    # Stream the plan out as it's written, via a dedicated custom event.
    #
    # This node is the longest call in the app (60-90s). Buffering it and shipping
    # the whole thing as a single event at the very end made delivery all-or-
    # nothing: the connection sat completely silent the entire time (so every
    # proxy/function timeout in the path got a chance to kill it), and any failure
    # lost 100% of the plan. Emitting chunks as they arrive keeps bytes flowing
    # continuously and lets the card fill in live, which is also just better UX
    # than staring at nothing for a minute and a half.
    #
    # These go out as "custom" stream events (not token events), so the frontend
    # can route them into the standalone plan card instead of the chat bubble.
    writer = get_stream_writer()
    chunks: list[str] = []
    async for chunk in model.astream(
        [HumanMessage(content=PLAN_PROMPT.format(collected=collected))], skip_cfg
    ):
        text = _text(chunk.content)
        if not text:
            continue
        chunks.append(text)
        if writer:
            writer({"type": "final_plan_chunk", "content": text})
    plan = "".join(chunks).strip()

    _persist_plan(state.get("user_id", 1), state.get("thread_id", ""), plan)

    logger.info("implementation | plan generated (%d chars)", len(plan))
    # Deliberately do NOT return the plan in "messages": that would emit a
    # 'message' SSE event whose content overwrites the reply bubble with raw plan
    # markdown. The plan reaches the client only via the dedicated 'final_plan'
    # SSE event (emitted from final_output in service.py), rendered as a big card.
    return {
        "final_output": plan,
        "finished": True,
        # Reset the trigger — otherwise it stays True in checkpointed state and
        # every subsequent user message re-enters this node (re-running the
        # expensive Sonnet call and overwriting final_output with a new plan).
        "should_generate_final_output": False,
    }
