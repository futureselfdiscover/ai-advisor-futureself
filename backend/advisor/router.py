"""
backend/advisor/router.py

The single entry point for the advisor:
  1. condense_question() turns follow-ups ("what about Chicago?") into a full question
  2. classify_intent() screens out off-topic and too-vague messages
  3. pick_feature() reads the question and picks the feature + the program/job
     it is about, so any wording reaches the right place (no keyword lists)
  4. the chosen feature answers from Vanderbilt data

Usage:
    python router.py "comp sci maybe, what classes would i need"
    python router.py "what should I take next" test-user-12345
"""

import json
import os
import re
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
from requirements import find_program, program_requirements, requirements_outline, requirements_html, requirements_brief, kind_note
from student_profile import get_student_profile

load_dotenv(base / ".env")

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


FEATURES = {
    "program_requirements", "course_planner", "club_matcher", "city_explorer",
    "industry_path", "interview_prep", "resume_feedback", "general",
}

PICKER_PROMPT = """You route a Vanderbilt student's message to ONE advisor feature.

program_requirements - what a major, minor, or academic program requires: required or core
  classes, credits, what it takes to complete it. ("what classes do CS majors take",
  "reqs for the econ minor", "computer science maybe, what would I need to take")
course_planner - the student wants a personal plan for what THEY should take next, and does
  not name a specific major or minor. ("what should I take next semester", "plan my spring")
club_matcher - student organizations, clubs, groups, getting involved on campus
city_explorer - which cities or places to live or work, salaries or pay for a job, cost of
  living, relocating
industry_path - how to break into or build a career in a field, what the path looks like,
  skills or experience needed for a kind of job
interview_prep - preparing for interviews, practice interview questions
resume_feedback - resume or CV review, formatting, or writing help
general - anything else about school, careers, or life after college, including policies,
  deadlines, declaring a major, campus resources, and the career center

Also extract:
program - the major, minor, or program they mean, as they wrote it (e.g. "comp sci",
  "econ minor"), or null
field - the job, role, or industry they mean, singular, using standard job titles where
  possible (e.g. "software developer", "financial analyst", "consulting"), or null

Respond with JSON only: {"feature": "...", "program": "..." or null, "field": "..." or null}"""


def pick_feature(message: str) -> dict:
    """Returns {"feature": str, "program": str|None, "field": str|None}."""
    try:
        response = _get_client().chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            temperature=0,
            max_tokens=80,
            messages=[
                {"role": "system", "content": PICKER_PROMPT},
                {"role": "user", "content": message},
            ],
        )
        data = json.loads(response.choices[0].message.content)
    except Exception as e:
        print(f"pick_feature failed, using general: {e}")
        data = {}

    feature = data.get("feature") if data.get("feature") in FEATURES else "general"

    def clean(v):
        v = (v or "").strip() if isinstance(v, str) else ""
        return v if v and v.lower() not in ("null", "none") else None

    return {"feature": feature, "program": clean(data.get("program")), "field": clean(data.get("field"))}


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


def format_clubs(result: dict) -> str:
    if result.get("error"):
        return result["error"]
    if not result.get("matches"):
        return "I could not find clubs that match that yet. Tell me a bit more about what you are into."
    lines = ["Here are some clubs that fit what you described:"]
    for i, m in enumerate(result["matches"], 1):
        lines.append(f"{i}. {m['description'][:220]}")
    return "\n".join(lines)


def _profile_major(user_hash: str):
    if not user_hash:
        return None
    try:
        return (get_student_profile(user_hash) or {}).get("major")
    except Exception:
        return None


def route(message: str, user_hash: str = None, history: list = None) -> dict:
    """Returns {"answer", "feature", "category", "question"}"""
    standalone = condense_question(message, history)
    result = _route(standalone, user_hash)
    result["question"] = standalone
    return result


def _route(message: str, user_hash: str = None) -> dict:
    category = classify_intent(message)["category"]

    def done(answer: str, feature: str) -> dict:
        return {"answer": answer, "feature": feature, "category": category}

    if category == "out_of_scope":
        return done(reject_out_of_scope(message), "out_of_scope")

    if category == "clarification_needed":
        return done(CLARIFICATION_CONFIG["clarification_needed"]["fallback_question"], "clarifying_question")

    pick = pick_feature(message)
    feature, program, field = pick["feature"], pick["program"], pick["field"]

    if feature in ("program_requirements", "course_planner"):
        official = find_program(program) if program else None
        if not official and feature == "course_planner":
            major = _profile_major(user_hash)
            official = find_program(major) if major else None
        ask = f"{program or ''} {message}"
        wanted = "minor" if re.search(r"(?i)\bminor\b", ask) else ("major" if re.search(r"(?i)\bmajor\b", ask) else None)
        note = kind_note(official, wanted) if official else None
        if official:
            result = done(requirements_outline(official) or program_requirements(message, official),
                          "program_requirements")
            view = requirements_html(official, note)
            if view:
                result["display_html"] = view
                result["brief"] = requirements_brief(official)
            return result
        if feature == "course_planner" and user_hash and _profile_major(user_hash):
            return done(plan_courses(user_hash)["plan"], "course_planner")
        if program:
            return done(
                f'I couldn\'t find a program matching "{program}" in the 2025/2026 Vanderbilt catalog. '
                "What's the exact name of the major or minor you're asking about?",
                "clarifying_question",
            )
        return done(
            "Which major or minor are you asking about? Tell me and I'll pull its full requirements "
            "from the Vanderbilt catalog.",
            "clarifying_question",
        )

    if feature == "club_matcher":
        return done(format_clubs(match_clubs(interests_text=message)), "club_matcher")

    if feature == "resume_feedback":
        if len(message) > 400:
            return done(resume_feedback(message, user_hash)["feedback"], "resume_feedback")
        return done(
            "Happy to review it. Paste the full text of your resume into the chat and I will give you feedback.",
            "resume_feedback",
        )

    if feature == "interview_prep":
        if not field:
            return done("What field or role are you interviewing for?", "interview_prep")
        return done(interview_prep(field, user_hash)["questions"], "interview_prep")

    if feature == "city_explorer":
        return done(explore_cities(field=field, user_hash=user_hash)["explanation"], "city_explorer")

    if feature == "industry_path" and field:
        return done(explore_industry_path(field, user_hash)["explanation"], "industry_path")

    result = get_answer(message, user_hash=user_hash)
    return done(result["answer"], "general_answer")


if __name__ == "__main__":
    test_message = sys.argv[1] if len(sys.argv) > 1 else "What courses should I take?"
    test_hash = sys.argv[2] if len(sys.argv) > 2 else None

    result = route(test_message, test_hash)
    print(f"[{result['category']} -> {result['feature']}]\n")
    print(result["answer"])
