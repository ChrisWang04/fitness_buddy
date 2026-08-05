"""Section prompts and navigation helpers.

Reference: https://github.com/Victoria824/FounderBuddy/blob/main/src/agents/founder_buddy/prompts.py

TODO: Implement:
  - get_section_template(section_id) -> SectionTemplate
  - get_next_section(current_section) -> SectionID | None
  - get_next_unfinished_section(state) -> SectionID | None
"""

import re

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


# A navigation request is the WHOLE (short) message, not a word buried inside a
# sentence — so "next section" advances but "next step is usually stretching"
# does not. We match an anchored pattern: optional lead-ins ("ok", "yes",
# "let's", …), a navigation core, optional trailers ("please", "now", "section").
_ADVANCE_LEAD = r"(?:ok(?:ay)?|yes|yep|yeah|sure|alright|please|lets|let us|can we|could we|i think|i guess|and|so|now)"
_ADVANCE_CORE = (
    r"(?:next(?: section| step| one| part| topic)?|skip(?: this| it| ahead| this section)?"
    r"|move on|moving on|move to the next|move to next|go on(?: to the next)?|go to the next"
    r"|continue(?: to the next| on)?|proceed|thats all|that is all|were done|we are done"
    r"|im done|i am done|im finished|i am finished|lets continue|lets move on|lets move)"
)
_ADVANCE_TRAIL = r"(?:please|now|section|then|already)"
_ADVANCE_RE = re.compile(
    rf"^(?:{_ADVANCE_LEAD}\s+)*{_ADVANCE_CORE}(?:\s+{_ADVANCE_TRAIL})*$"
)
_ADVANCE_EXACT = {"next", "skip", "continue", "done", "proceed", "nxt", "onward"}


def is_explicit_advance(text: str) -> bool:
    """True if the user is explicitly asking to move to the next section.

    Deterministic (no LLM) so an explicit request is honored reliably and in the
    same turn. Tolerant of case, punctuation, apostrophes, and common lead-in/
    trailer words — but the message must be *primarily* a navigation command, not
    a longer sentence that merely contains a word like "next" or "skip".
    """
    t = (text or "").lower().replace("'", "").replace("’", "")
    norm = " ".join(re.sub(r"[^a-z0-9\s]", " ", t).split())
    if not norm:
        return False
    if norm in _ADVANCE_EXACT:
        return True
    return bool(_ADVANCE_RE.match(norm))
