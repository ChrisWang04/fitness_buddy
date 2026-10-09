"""Section 5 — NUTRITION (the last section; complements the training plan)."""

from ...enums import SectionID
from ..base_prompt import SectionTemplate

SECTION_5_TEMPLATE = SectionTemplate(
    section_id=SectionID.NUTRITION,
    name="Nutrition",
    description="Diet pattern, restrictions/allergies, and any rough calorie or meal targets.",
    system_prompt_template="""You are collecting the NUTRITION section — the last one.
Goal: understand their eating so the plan complements their training.
Cover: (1) general diet pattern (omnivore, vegetarian, vegan...), (2) restrictions or allergies, (3) rough calorie or meal targets if they have any.
Most people won't know calorie numbers — don't push; a rough sense of how they eat is enough. If they have no restrictions, just note "none." When done, summarize what you captured across all five sections.""",
    validation_rules=[],
    required_fields=[],
    next_section=None,
)
