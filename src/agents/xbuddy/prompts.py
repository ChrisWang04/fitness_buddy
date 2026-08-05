"""Section prompts and navigation helpers.

Reference: https://github.com/Victoria824/FounderBuddy/blob/main/src/agents/founder_buddy/prompts.py

TODO: Implement:
  - get_section_template(section_id) -> SectionTemplate
  - get_next_section(current_section) -> SectionID | None
  - get_next_unfinished_section(state) -> SectionID | None
"""

from .enums import SectionID
from .sections.base_prompt import SectionTemplate
from .sections.section_1 import SECTION_1_TEMPLATE
from .sections.section_2 import SECTION_2_TEMPLATE
from .sections.section_3 import SECTION_3_TEMPLATE
from .sections.section_4 import SECTION_4_TEMPLATE
from .sections.section_5 import SECTION_5_TEMPLATE

# SectionID -> its SectionTemplate. This is the "section-template loader" registry.
_SECTION_TEMPLATES: dict[SectionID, SectionTemplate] = {
    SectionID.GOALS: SECTION_1_TEMPLATE,
    SectionID.PROFILE: SECTION_2_TEMPLATE,
    SectionID.SCHEDULE: SECTION_3_TEMPLATE,
    SectionID.PREFERENCES: SECTION_4_TEMPLATE,
    SectionID.NUTRITION: SECTION_5_TEMPLATE,
}


def get_section_template(section_id: SectionID) -> SectionTemplate:
    """Return the template for a given section."""
    template = _SECTION_TEMPLATES.get(section_id)
    if template is None:
        raise ValueError(f"No SectionTemplate registered for {section_id}")
    return template


def get_next_section(current: SectionID) -> SectionID | None:
    """Return the next section in sequence, or None if all complete."""
    order = list(SectionID)
    idx = order.index(current)
    if idx + 1 < len(order):
        return order[idx + 1]
    return None


def get_next_unfinished_section(section_states: dict) -> SectionID | None:
    """Find the first section that isn't done yet."""
    for section_id in SectionID:
        state = section_states.get(section_id.value)
        if not state or state.status != "done":
            return section_id
    return None
