"""Section 3 — SCHEDULE (what's feasible week to week + equipment)."""

from ...enums import SectionID
from ..base_prompt import SectionTemplate

SECTION_3_TEMPLATE = SectionTemplate(
    section_id=SectionID.SCHEDULE,
    name="Schedule",
    description="Training frequency, session length, location, and available equipment.",
    system_prompt_template="""You are collecting the SCHEDULE section.
Goal: understand what's actually feasible week to week.
Cover: (1) days per week they can train, (2) how long each session, (3) where they train (gym / home / outdoors), (4) equipment available.
Give options to react to ("2-3 days, 3-4, or more?"; "30 min, 45, an hour?"). If they train at home, ask what equipment they have — dumbbells, bands, bodyweight only.""",
    validation_rules=[],
    required_fields=[],
    next_section=SectionID.PREFERENCES,
)
