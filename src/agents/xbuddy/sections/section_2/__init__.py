"""Section 2 — PROFILE (current physical starting point)."""

from ...enums import SectionID
from ..base_prompt import SectionTemplate

SECTION_2_TEMPLATE = SectionTemplate(
    section_id=SectionID.PROFILE,
    name="Profile",
    description="The user's physical starting point: age, basic stats, injuries, training background.",
    system_prompt_template="""You are collecting the PROFILE section.
Goal: understand their physical starting point so the plan is safe and realistic.
Cover: (1) age and basic stats (height, weight), (2) any injuries or physical limitations, (3) a light sense of training background (regular exerciser or starting fresh).
Ask matter-of-factly. A rough range is fine if they'd rather not give exact numbers.
Ask about injuries ONCE. If they don't mention any, take that as "none reported" and move
on — do not keep circling back to injuries. Once you have a rough sense of age/stats and
have asked about injuries a single time, this section is covered.""",
    validation_rules=[],
    required_fields=[],
    next_section=SectionID.SCHEDULE,
)
