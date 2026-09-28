"""
backend/advisor/career_coach.py

Three career coaching features, all grounded in the career_center data
already embedded in Supabase:
- resume_feedback(): reviews a student's resume text
- interview_prep(): generates practice questions for a given field/role
- explore_industry_path(): explains what a path into a given industry looks like

Usage:
    from career_coach import resume_feedback, interview_prep, explore_industry_path
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
from salary_lookup import get_salary_info, format_salary_summary

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


def _get_school(user_hash: str = None) -> str:
    if not user_hash:
        return "vanderbilt"
    profile = get_student_profile(user_hash)
    return profile.get("school") or "vanderbilt"


RESUME_FEEDBACK_PROMPT = """You are a career coach reviewing a Vanderbilt student's resume.

RELEVANT CAREER CENTER GUIDANCE (use this to ground your feedback in real
resources, e.g. pointing them to specific career center services):
{context}

Give specific, actionable feedback on the resume below. Cover:
- Clarity and impact of bullet points (are they specific and results-oriented?)
- Structure and formatting concerns
- Anything missing that career center resources suggest students should include
- One or two things they're doing well, not just critique

Be direct and genuinely useful, not generic. If the career center guidance
above mentions a specific resource (like resume review appointments), point
the student to it."""


def resume_feedback(resume_text: str, user_hash: str = None) -> dict:
    school = _get_school(user_hash)
    context_chunks = retrieve_context(
        "resume writing tips and feedback", school=school, source_type="career_center", top_k=4
    )
    context = "\n\n".join(c["content"] for c in context_chunks)

    client = _get_client()
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": RESUME_FEEDBACK_PROMPT.format(context=context)},
            {"role": "user", "content": f"Here's my resume:\n\n{resume_text}"},
        ],
        temperature=0.5,
    )

    return {"feedback": response.choices[0].message.content, "sources": context_chunks}


INTERVIEW_PREP_PROMPT = """You are helping a Vanderbilt student prepare for interviews in {field}.

RELEVANT CAREER CENTER GUIDANCE:
{context}

Generate 5 realistic practice interview questions for this field, mixing
behavioral and role-specific technical/situational questions. For each
question, give a brief note on what a strong answer would touch on -
not a full script, just the key things to hit."""


def interview_prep(field: str, user_hash: str = None) -> dict:
    school = _get_school(user_hash)
    context_chunks = retrieve_context(
        f"interview preparation for {field}", school=school, source_type="career_center", top_k=4
    )
    context = "\n\n".join(c["content"] for c in context_chunks)

    client = _get_client()
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": INTERVIEW_PREP_PROMPT.format(field=field, context=context)},
            {"role": "user", "content": f"Give me practice interview questions for {field}"},
        ],
        temperature=0.6,
    )

    return {"questions": response.choices[0].message.content, "sources": context_chunks}


INDUSTRY_PATH_PROMPT = """You are helping a Vanderbilt student understand what a career path into
{industry} looks like, and what Vanderbilt-specific resources can help them
get there.

RELEVANT CAREER CENTER GUIDANCE:
{context}

Explain, practically:
- What kinds of roles/entry points exist in this industry for new grads
- What skills or experiences matter most for breaking in
- What specific Vanderbilt resources (from the guidance above) can help,
  if any are mentioned

Be honest if the career center guidance doesn't have much on this specific
industry - don't pad the response with generic advice presented as if it's
Vanderbilt-specific when it isn't."""


def explore_industry_path(industry: str, user_hash: str = None) -> dict:
    school = _get_school(user_hash)
    context_chunks = retrieve_context(
        f"career path into {industry}", school=school, source_type="career_center", top_k=4
    )
    context = "\n\n".join(c["content"] for c in context_chunks)

    client = _get_client()
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": INDUSTRY_PATH_PROMPT.format(industry=industry, context=context)},
            {"role": "user", "content": f"What does a path into {industry} look like?"},
        ],
        temperature=0.5,
    )

    return {"explanation": response.choices[0].message.content, "sources": context_chunks}


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "interview"

    if mode == "resume":
        sample_resume = """
        Jane Student
        Objective: Looking for a job in finance.

        Experience:
        - Worked at a coffee shop, made coffee and talked to customers
        - Did a school project about the stock market

        Education: Vanderbilt University, expected 2027
        """
        result = resume_feedback(sample_resume)
        print(result["feedback"])
        print(f"\n({len(result['sources'])} sources used)")

    elif mode == "interview":
        result = interview_prep("finance")
        print(result["questions"])
        print(f"\n({len(result['sources'])} sources used)")

    elif mode == "industry":
        result = explore_industry_path("consulting")
        print(result["explanation"])
        print(f"\n({len(result['sources'])} sources used)")


def salary_outlook(occupation: str, city: str = None) -> dict:
    """
    Grounds a career-coaching answer in real BLS wage data for a given
    occupation (optionally filtered to a city). Unlike interview_prep()
    and explore_industry_path(), this pulls from salary_data directly
    (exact lookup) rather than retrieve_context() (semantic search) -
    there's nothing to embed-search for exact wage figures.
    """
    rows = get_salary_info(occupation, city=city)
    salary_context = format_salary_summary(rows)

    client = _get_client()
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a Vanderbilt career advisor. Use the salary data below "
                    "to give the student a realistic, grounded answer about earning "
                    "potential for this role. If no data is available for their exact "
                    "city, say so plainly and note the closest data you do have, "
                    "rather than inventing numbers.\n\n"
                    f"Salary data:\n{salary_context}"
                ),
            },
            {
                "role": "user",
                "content": f"What can I expect to earn as a {occupation}"
                           + (f" in {city}?" if city else "?"),
            },
        ],
        temperature=0.5,
    )

    return {
        "answer": response.choices[0].message.content,
        "salary_rows_used": len(rows),
    }


if __name__ == "__main__" and len(sys.argv) > 1 and sys.argv[1] == "salary":
    test_occupation = sys.argv[2] if len(sys.argv) > 2 else "Software Developers"
    test_city = sys.argv[3] if len(sys.argv) > 3 else None
    result = salary_outlook(test_occupation, city=test_city)
    print(result["answer"])
    print(f"\n({result['salary_rows_used']} salary rows used)")
