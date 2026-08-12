"""
backend/intent/scope_guard.py

Checks whether a user's question is actually relevant to what the AI
advisor is for — academic planning, career guidance, courses, majors,
student orgs, internships, etc. Blocks off-topic chatter (weather,
small talk, anything unrelated) before it reaches the more expensive
retrieval + generation steps.

Usage:
    from scope_guard import check_scope
    result = check_scope("What's the weather like today?")
    # {"in_scope": False, "reason": "off_topic"}
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


SYSTEM_PROMPT = """You are a strict scope classifier for a Vanderbilt University academic
and career advisor AI. Your only job is to decide if a student's message is
something the advisor should answer.

IN SCOPE - things the advisor should answer:
- Questions about courses, majors, minors, degree requirements
- Questions about student organizations, clubs, campus involvement
- Career guidance, internships, job searching, resumes, career paths
- Academic planning: scheduling, prerequisites, credit hours
- Questions about the student's own academic progress or interests
- Casual but relevant framing of the above (e.g. "idk what to do with my life")

OUT OF SCOPE - the advisor should NOT answer these:
- Small talk unrelated to academics/career (weather, "how are you", jokes)
- General knowledge questions unrelated to Vanderbilt or career guidance
- Requests to do something unrelated (write code, solve unrelated homework, etc.)
- Anything that's just testing/probing the bot rather than seeking real guidance

Respond with ONLY one word: "IN_SCOPE" or "OUT_OF_SCOPE". Nothing else."""


def check_scope(user_message: str) -> dict:
    """
    Returns {"in_scope": bool, "reason": str}
    """
    client = _get_client()

    response = client.chat.completions.create(
        model="gpt-4o-mini",  # cheap and fast, this is just a classification gate
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_message},
        ],
        max_tokens=5,
        temperature=0,
    )

    verdict = response.choices[0].message.content.strip().upper()
    in_scope = verdict == "IN_SCOPE"

    return {
        "in_scope": in_scope,
        "reason": "off_topic" if not in_scope else "on_topic",
    }


OFF_TOPIC_RESPONSE = (
    "I'm not able to help with that. "
    "I can help with things like choosing courses, understanding degree requirements, "
    "finding student orgs that fit your interests, or figuring out career paths. "
    "What can I help you with on that front?"
)


if __name__ == "__main__":
    # Quick manual test
    test_queries = [
        "What's the weather like today?",
        "How's your day going?",
        "What courses should I take for a computer science major?",
        "Tell me a joke",
        "I don't know what I want to do with my life, any advice?",
        "Write me a python script to sort a list",
    ]

    for q in test_queries:
        result = check_scope(q)
        print(f"{'IN SCOPE ' if result['in_scope'] else 'OUT     '} | {q}")
