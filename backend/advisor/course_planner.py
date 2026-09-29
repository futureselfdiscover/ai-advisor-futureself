"""
backend/advisor/course_planner.py

Pulls a student's degree requirements, cross-references what they've
already taken, and suggests what to take next.

Usage:
    from course_planner import plan_courses
    result = plan_courses(user_hash="abc123")
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

sys.path.append(str(Path(__file__).resolve().parents[1] / "rag"))
sys.path.append(str(Path(__file__).resolve().parents[1] / "profile"))

from retrieve import retrieve_context
from student_profile import get_student_profile

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


PLANNER_PROMPT = """You are helping a Vanderbilt student plan their upcoming courses.

Student's major: {major}
Student's year: {year}
Courses already taken: {courses_taken}

DEGREE REQUIREMENT INFO (retrieved from Vanderbilt's catalog for this major):
{requirement_context}

Based on the requirement info above and what the student has already taken,
suggest what they should consider taking next. If the requirement info
doesn't clearly cover this major (e.g. it's missing or looks unrelated),
say so honestly rather than making up requirements - recommend they check
with their academic advisor or department instead.

Be specific about course codes where the data supports it. Only write a course title if it appears in the requirement info above. If no title is given, write just the course code. Never guess a title from memory. Note any
prerequisite chains that matter for sequencing. Keep the response focused
and practical, not an essay."""


def plan_courses(user_hash: str) -> dict:
    profile = get_student_profile(user_hash)
    major = profile.get("major")
    year = profile.get("year") or "unknown year"
    courses_taken = profile.get("courses_taken") or []

    if not major:
        return {
            "plan": "I don't have your major on file yet, so I can't build a course plan. What's your major?",
            "sources": [],
        }

    school = profile.get("school") or "vanderbilt"
    requirement_chunks = retrieve_context(
        f"degree requirements for {major} major", school=school, source_type="degree_requirements", top_k=6
    )

    if not requirement_chunks:
        return {
            "plan": f"I don't have detailed degree requirements on file for {major} yet - "
                    f"I'd recommend checking with your academic advisor or the {major} department directly "
                    f"for the most accurate requirement info.",
            "sources": [],
        }

    requirement_context = "\n\n".join(c["content"] for c in requirement_chunks)

    client = _get_client()
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": PLANNER_PROMPT.format(
                    major=major,
                    year=year,
                    courses_taken=", ".join(courses_taken) if courses_taken else "none recorded yet",
                    requirement_context=requirement_context,
                ),
            },
            {"role": "user", "content": "What should I take next?"},
        ],
        temperature=0.5,
    )

    return {"plan": response.choices[0].message.content, "sources": requirement_chunks}


if __name__ == "__main__":
    test_hash = sys.argv[1] if len(sys.argv) > 1 else "test-user-12345"
    result = plan_courses(test_hash)
    print(result["plan"])
    print(f"\n({len(result['sources'])} requirement sources used)")
