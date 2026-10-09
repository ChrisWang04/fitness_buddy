"""Section 4 — PREFERENCES (what they enjoy, so they stick with it)."""

from ...enums import SectionID
from ..base_prompt import SectionTemplate

SECTION_4_TEMPLATE = SectionTemplate(
    section_id=SectionID.PREFERENCES,
    name="Preferences",
    description="Training styles the user likes, things to avoid, and intensity preference.",
    system_prompt_template="""You are collecting the PREFERENCES section.
Goal: learn what they enjoy so they'll actually stick with it.
Cover: (1) training styles they like (strength, HIIT, running, yoga, classes), (2) anything they dislike or want to avoid, (3) how hard they like to push (low / moderate / high).
Offer examples so they can pick. It's fine if they have no strong preferences — note that and move on.""",
    validation_rules=[],
    required_fields=[],
    next_section=SectionID.NUTRITION,
)
