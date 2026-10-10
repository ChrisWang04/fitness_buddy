"""Section 1 — GOALS (the anchor section; everything else builds on this)."""

from ...enums import SectionID
from ..base_prompt import SectionTemplate, ValidationRule

SECTION_1_TEMPLATE = SectionTemplate(
    section_id=SectionID.GOALS,
    name="Goals",
    description="What the user wants to achieve, their rough timeframe, and their motivation.",
    system_prompt_template="""You are collecting the GOALS section — the foundation of the whole plan.
Goal: understand what they want to achieve, roughly by when, and why.
Cover: (1) primary goal, (2) rough timeline, (3) motivation.
Offer concrete options so they can just pick (build muscle, lose fat, get generally fitter, or train for an event). If a goal is vague like "get in shape," gently narrow it. Don't push on the timeline — a rough sense is enough.""",
    validation_rules=[
        ValidationRule(
            field_name="primary_goal",
            rule_type="required",
            value=True,
            error_message="We need a primary goal before moving on.",
        ),
    ],
    required_fields=["primary_goal"],
    next_section=SectionID.PROFILE,
)
