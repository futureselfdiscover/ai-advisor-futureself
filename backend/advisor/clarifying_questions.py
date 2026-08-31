"""
backend/advisor/clarifying_questions.py

A small state machine that decides whether the advisor needs to ask a
clarifying question before it can give a good answer, based on:
1. The classified intent category
2. What's already known about the student from their profile

Each intent category has a config describing what fields matter and what
question to ask if that field is missing. Fields already present in the
student's profile are never re-asked.

Usage:
    from clarifying_questions import get_clarifying_question

    question = get_clarifying_question("academic_planning", student_profile)
    # Returns a question string, or None if nothing needs clarifying
"""

CLARIFICATION_CONFIG = {
    "academic_planning": {
        "relevant_fields": ["major", "year"],
        "questions": {
            "major": "What's your major (or the major you're considering)? That'll help me point you to the right courses.",
            "year": "What year are you (freshman, sophomore, junior, senior)? Course recommendations differ a good bit by year.",
        },
    },
    "career_coaching": {
        "relevant_fields": ["major", "industries_of_interest"],
        "questions": {
            "major": "What's your major? That helps me tailor career advice to your field.",
            "industries_of_interest": "What industries or types of roles are you interested in?",
        },
    },
    "campus_life": {
        "relevant_fields": [],
        "questions": {},
    },
    "post_grad": {
        "relevant_fields": ["major", "year"],
        "questions": {
            "major": "What's your major? That affects what post-grad paths make the most sense.",
            "year": "What year are you? Post-grad planning looks different depending on how close you are to graduating.",
        },
    },
    "clarification_needed": {
        "relevant_fields": [],
        "questions": {},
        "fallback_question": "I want to make sure I actually help with the right thing - could you tell me a bit more about what you're looking for? For example, are you thinking about courses, career stuff, clubs, or something else?",
    },
}


def is_field_missing(profile: dict, field: str) -> bool:
    value = profile.get(field)
    return value is None or value == "" or value == []


def get_clarifying_question(intent_category: str, student_profile: dict) -> str:
    """
    Returns a single clarifying question string if one is needed, or None
    if the advisor already has enough context to answer directly. Only
    ever returns ONE question at a time (the first missing relevant field).
    """
    config = CLARIFICATION_CONFIG.get(intent_category)
    if not config:
        return None

    if intent_category == "clarification_needed":
        return config.get("fallback_question")

    for field in config["relevant_fields"]:
        if is_field_missing(student_profile, field):
            return config["questions"].get(field)

    return None


if __name__ == "__main__":
    empty_profile = {"major": None, "year": None, "industries_of_interest": []}
    partial_profile = {"major": "Computer Science", "year": None, "industries_of_interest": []}
    full_profile = {"major": "Computer Science", "year": "sophomore", "industries_of_interest": ["tech"]}

    test_cases = [
        ("academic_planning", empty_profile),
        ("academic_planning", partial_profile),
        ("academic_planning", full_profile),
        ("campus_life", empty_profile),
        ("clarification_needed", empty_profile),
    ]

    for intent, profile in test_cases:
        question = get_clarifying_question(intent, profile)
        print(f"[{intent}] profile has major={profile.get('major')}, year={profile.get('year')}")
        print(f"  -> {question}\n")
