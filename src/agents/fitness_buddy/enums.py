"""Enumerations for FitnessBuddy Agent."""

from enum import Enum


class SectionStatus(str, Enum):
    """Status of an agent section."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    DONE = "done"


class RouterDirective(str, Enum):
    """Router directive for navigation control."""
    STAY = "stay"
    NEXT = "next"
    MODIFY = "modify"  # Format: "modify:section_id"


class SectionID(str, Enum):
    """FitnessBuddy's five conversation sections, in order.

    The agent guides the user through these one at a time, then synthesizes a
    training + nutrition plan from the data collected across all five.
    """
    GOALS = "goals"              # what they want: build muscle, lose fat, run a 10k...
    PROFILE = "profile"          # current state: age, body stats, injuries
    SCHEDULE = "schedule"        # when/where they train: days/week, session length, location, equipment
    PREFERENCES = "preferences"  # training-style likes/dislikes, intensity
    NUTRITION = "nutrition"      # diet pattern, restrictions, calorie/meal targets
