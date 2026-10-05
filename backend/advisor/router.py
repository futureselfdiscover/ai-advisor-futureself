"""
backend/advisor/router.py

The single entry point for the advisor. Classifies the message, then
sends it to the right feature.

Usage:
    python router.py "where should I live if I want to work in finance"
    python router.py "what should I take next" test-user-12345
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

base = Path(__file__).resolve().parents[1]
for folder in ["intent", "rag", "profile", "db"]:
    sys.path.append(str(base / folder))

from classify_intent import classify_intent, reject_out_of_scope
from answer import get_answer
from course_planner import plan_courses
from club_matcher import match_clubs
from career_coach import resume_feedback, interview_prep, explore_industry_path
from city_explorer import explore_cities
from clarifying_questions import CLARIFICATION_CONFIG

load_dotenv(base / ".env")

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


PLANNER_WORDS = [
    "what should i take", "plan my", "schedule", "next semester",
    "what's left", "whats left", "remaining requirements", "degree plan",
    "what do i still need", "what classes should i",
]
CITY_WORDS = [
    "where should i live", "which city", "what city", "cities", "salary",
    "salaries", "how much", "get paid", "earn", "move to", "relocate",
]
INDUSTRY_WORDS = [
    "path into", "break into", "get into", "career in", "how do i become",
    "what does a career", "what is it like to work in",
]


def has_any(text: str, words: list) -> bool:
    return any(w in text for w in words)


def extract_field(message: str):
    """Pulls out the job or industry the student is asking about."""
    response = _get_client().chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {
                "role": "system",
                "content": (
                    "Pull out the job or industry the student is asking about. "
                    "Answer with one or two lowercase keywords, singular, using official "
                    "government job wording where you can. Examples: software developer, "
                    "financial analyst, accountant, registered nurse, management analyst. "
                    "If no job or industry is named, answer none."
                ),
            },
            {"role": "user", "content": message},
        ],
        max_tokens=10,
        temperature=0,
    )
    text = response.choices[0].message.content.strip().lower()
    return None if text in ("none", "") else text


def format_clubs(result: dict) -> str:
    if result.get("error"):
        return result["error"]
    if not result.get("matches"):
        return "I could not find clubs that match that yet. Tell me a bit more about what you are into."
    lines = ["Here are some clubs that fit what you described:"]
    for i, m in enumerate(result["matches"], 1):
        lines.append(f"{i}. {m['description'][:220]}")
    return "\n".join(lines)


def clean_turn(content) -> str:
    """Drops the suggestions/memory JSON lines the widget appends to replies."""
    lines = [
        line for line in str(content).splitlines()
        if not line.strip().startswith(('{"suggestions"', '{"memory"'))
    ]
    return "\n".join(lines).strip()


def condense_question(message: str, history: list) -> str:
    """Turns a follow-up like 'what about Chicago?' into a standalone question."""
    turns = [
        t for t in (history or [])
        if isinstance(t, dict) and t.get("role") in ("user", "assistant") and t.get("content")
    ][-6:]
    if not turns:
        return message

    convo = "\n".join(f"{t['role']}: {clean_turn(t['content'])[:600]}" for t in turns)
    try:
        response = _get_client().chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Rewrite the student's latest message as a standalone question that "
                        "makes sense without the conversation. Keep any course codes, majors, "
                        "jobs, cities, or clubs they are referring to. If the message already "
                        "stands on its own, return it unchanged. Return only the question."
                    ),
                },
                {"role": "user", "content": f"Conversation:\n{convo}\n\nLatest message: {message}"},
            ],
            max_tokens=120,
            temperature=0,
        )
        rewritten = response.choices[0].message.content.strip()
        return rewritten or message
    except Exception as e:
        print(f"condense_question failed, using original message: {e}")
        return message


def route(message: str, user_hash: str = None, history: list = None) -> dict:
    """Returns {"answer": str, "feature": str, "category": str, "question": str}"""
    standalone = condense_question(message, history)
    result = _route(standalone, user_hash)
    result["question"] = standalone
    return result


def _route(message: str, user_hash: str = None) -> dict:
    text = message.lower()
    category = classify_intent(message)["category"]

    if category == "out_of_scope":
        return {"answer": reject_out_of_scope(message), "feature": "out_of_scope", "category": category}

    if category == "clarification_needed":
        question = CLARIFICATION_CONFIG["clarification_needed"]["fallback_question"]
        return {"answer": question, "feature": "clarifying_question", "category": category}

    if category == "campus_life":
        result = match_clubs(interests_text=message)
        return {"answer": format_clubs(result), "feature": "club_matcher", "category": category}

    if category == "academic_planning":
        if user_hash and has_any(text, PLANNER_WORDS):
            return {"answer": plan_courses(user_hash)["plan"], "feature": "course_planner", "category": category}

    if category in ("career_coaching", "post_grad"):
        if "resume" in text:
            if len(message) > 400:
                return {"answer": resume_feedback(message, user_hash)["feedback"], "feature": "resume_feedback", "category": category}
            return {
                "answer": "Happy to review it. Paste the full text of your resume into the chat and I will give you feedback.",
                "feature": "resume_feedback",
                "category": category,
            }

        if "interview" in text:
            field = extract_field(message)
            if not field:
                return {"answer": "What field or role are you interviewing for?", "feature": "interview_prep", "category": category}
            return {"answer": interview_prep(field, user_hash)["questions"], "feature": "interview_prep", "category": category}

        if has_any(text, CITY_WORDS):
            return {"answer": explore_cities(field=extract_field(message), user_hash=user_hash)["explanation"], "feature": "city_explorer", "category": category}

        if category == "career_coaching" and has_any(text, INDUSTRY_WORDS):
            field = extract_field(message)
            if field:
                return {"answer": explore_industry_path(field, user_hash)["explanation"], "feature": "industry_path", "category": category}

    result = get_answer(message, user_hash=user_hash)
    return {"answer": result["answer"], "feature": "general_answer", "category": category}


if __name__ == "__main__":
    test_message = sys.argv[1] if len(sys.argv) > 1 else "What courses should I take?"
    test_hash = sys.argv[2] if len(sys.argv) > 2 else None

    result = route(test_message, test_hash)
    print(f"[{result['category']} -> {result['feature']}]\n")
    print(result["answer"])
