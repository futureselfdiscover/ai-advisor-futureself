"""
backend/intent/classify_intent.py

Classifies a student's message into one of six categories, per the Week 4
roadmap spec.

Categories:
    academic_planning   - courses, majors, degree requirements, scheduling
    career_coaching      - internships, jobs, resumes, career center, career paths
    campus_life          - student orgs, clubs, campus involvement
    post_grad             - grad school, fellowships, life after Vanderbilt
    out_of_scope          - unrelated to academics/career
    clarification_needed  - too vague to route confidently

Usage:
    from classify_intent import classify_intent
    result = classify_intent("What courses should I take for CS?")
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

_client = None

VALID_CATEGORIES = {
    "academic_planning",
    "career_coaching",
    "campus_life",
    "post_grad",
    "out_of_scope",
    "clarification_needed",
}


def _get_client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


SYSTEM_PROMPT = """You are an intent classifier for a Vanderbilt University academic and
career advisor AI. Classify the student's message into EXACTLY ONE of
these six categories:

academic_planning - courses, majors, minors, degree requirements,
  scheduling, prerequisites, credit hours, "what should I take"

career_coaching - internships, jobs, resumes, interviews, the career
  center, networking, career paths, "how do I get a job in X"

campus_life - student organizations, clubs, campus involvement,
  extracurriculars, "are there any clubs for X"

post_grad - grad school, fellowships, life/plans after graduation,
  "what happens after I graduate", law/med school prep as a post-grad path

out_of_scope - unrelated to academics or career (weather, small talk,
  jokes, unrelated general knowledge, requests to do unrelated tasks)

clarification_needed - the message IS relevant to advising but is too
  vague or open-ended to route confidently (e.g. "I don't know what I
  want to do with my life", "can you help me?", "I'm lost")

Respond with ONLY the category name, exactly as written above. Nothing else."""


def classify_intent(user_message: str) -> dict:
    client = _get_client()

    response = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        max_tokens=10,
        temperature=0,
    )

    category = response.choices[0].message.content.strip().lower()

    if category not in VALID_CATEGORIES:
        category = "clarification_needed"

    return {"category": category}


def reject_out_of_scope(user_message: str) -> str:
    return (
        "I'm your Vanderbilt academic and career advisor, so I'm not able to help with that. "
        "I can help with things like choosing courses, understanding degree requirements, "
        "finding student orgs that fit your interests, or figuring out career paths. "
        "What can I help you with on that front?"
    )


if __name__ == "__main__":
    test_queries = [
        "What courses should I take for a computer science major?",
        "How do I get an internship in finance?",
        "Are there any clubs for entrepreneurship?",
        "What should I do about grad school applications?",
        "What's the weather like today?",
        "I don't know what I want to do with my life",
    ]

    for q in test_queries:
        result = classify_intent(q)
        print(f"{result['category']:<25} | {q}")
