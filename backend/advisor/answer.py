"""
backend/advisor/answer.py

The full advisor pipeline: classify intent, check the student's profile,
ask a clarifying question if needed, otherwise retrieve school-scoped
context and generate a grounded answer.

Usage:
    from answer import get_answer
    response = get_answer("What courses should I take?", user_hash="abc123")
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

sys.path.append(str(Path(__file__).resolve().parents[1] / "intent"))
sys.path.append(str(Path(__file__).resolve().parents[1] / "rag"))
sys.path.append(str(Path(__file__).resolve().parents[1] / "profile"))

from classify_intent import classify_intent, reject_out_of_scope
from retrieve import retrieve_context
from student_profile import get_student_profile
from clarifying_questions import get_clarifying_question

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

_client = None


def _get_client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


SYSTEM_PROMPT_TEMPLATE = """You are FutureSelf's AI academic and career advisor for {school} students.
Your job is to give clear, specific, genuinely useful guidance grounded in
real data - courses, degree requirements, student organizations, and
career center resources for this specific school.

What you know about this student: {profile_summary}

Rules:
- Only make factual claims (course codes, credit hours, requirements) using
  the CONTEXT provided below. If the context doesn't contain the answer,
  say so honestly rather than guessing.
- Be conversational and warm, not robotic or like a search engine dumping
  results. Talk like a knowledgeable advisor who wants the student to
  actually succeed.
- Cite specific course codes, org names, or resources by name when relevant
  so students know exactly what to look up.
- Keep responses focused and not overly long - students want actionable
  guidance, not an essay.

CONTEXT:
{context}
"""


def format_context(chunks: list) -> str:
    if not chunks:
        return "No specific matching information was found for this query."
    return "\n\n".join(f"[{c['source_type']}] {c['content']}" for c in chunks)


def format_profile_summary(profile: dict) -> str:
    parts = []
    if profile.get("major"):
        parts.append(f"major: {profile['major']}")
    if profile.get("minor"):
        parts.append(f"minor: {profile['minor']}")
    if profile.get("year"):
        parts.append(f"year: {profile['year']}")
    if profile.get("industries_of_interest"):
        parts.append(f"interested in: {', '.join(profile['industries_of_interest'])}")

    return "; ".join(parts) if parts else "no profile information yet"


def get_answer(user_message: str, user_hash: str = None, top_k: int = 5) -> dict:
    """
    Returns {"answer": str, "type": str, "sources": list}
    type is one of: "answer", "clarifying_question", "out_of_scope"
    """
    intent_result = classify_intent(user_message)
    category = intent_result["category"]

    if category == "out_of_scope":
        return {"answer": reject_out_of_scope(user_message), "type": "out_of_scope", "sources": []}

    # Look up the student's actual profile - falls back to an empty
    # profile if no user_hash was provided (e.g. testing, or anonymous use)
    profile = get_student_profile(user_hash) if user_hash else {}

    clarifying_question = get_clarifying_question(category, profile)
    if clarifying_question:
        return {"answer": clarifying_question, "type": "clarifying_question", "sources": []}

    school = profile.get("school") or "vanderbilt"

    # Enrich the search query with known profile context so vague questions
    # still retrieve relevant results - the raw question alone often isn'''t
    # specific enough to match well.
    search_query = user_message
    if profile.get("major"):
        search_query += f" (student'''s major: {profile['''major''']})"
    if profile.get("year"):
        search_query += f" (student'''s year: {profile['''year''']})"

    chunks = retrieve_context(search_query, school=school, top_k=top_k)
    context_str = format_context(chunks)
    profile_summary = format_profile_summary(profile)

    client = _get_client()
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {
                "role": "system",
                "content": SYSTEM_PROMPT_TEMPLATE.format(
                    school=school, profile_summary=profile_summary, context=context_str
                ),
            },
            {"role": "user", "content": user_message},
        ],
        temperature=0.7,
    )

    return {"answer": response.choices[0].message.content, "type": "answer", "sources": chunks}


if __name__ == "__main__":
    test_query = sys.argv[1] if len(sys.argv) > 1 else "What courses should I take?"
    test_user_hash = sys.argv[2] if len(sys.argv) > 2 else None

    print(f"Q: {test_query}  (user_hash={test_user_hash})\n")
    result = get_answer(test_query, user_hash=test_user_hash)

    print(f"[{result['type']}] {result['answer']}\n")
    print(f"({len(result['sources'])} sources used)")
