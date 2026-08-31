"""
backend/advisor/club_matcher.py

Matches a student's stated interests against embedded student org data
using semantic similarity, so recommendations reflect what they're
actually into, not just keyword matches.

Usage:
    from club_matcher import match_clubs
    result = match_clubs(user_hash="abc123")
    # or with raw interests directly:
    result = match_clubs(interests_text="I love hiking and environmental policy")
"""

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1] / "rag"))
sys.path.append(str(Path(__file__).resolve().parents[1] / "profile"))

from retrieve import retrieve_context
from student_profile import get_student_profile


def match_clubs(user_hash: str = None, interests_text: str = None, top_k: int = 5) -> dict:
    """
    Returns the top_k student orgs matching the student's interests, based
    on either their stored profile (skills, industries_of_interest, clubs
    they already know about) or raw interests text passed directly.
    """
    school = "vanderbilt"

    if interests_text is None:
        if not user_hash:
            return {"matches": [], "error": "Need either a user_hash or interests_text to match against."}

        profile = get_student_profile(user_hash)
        school = profile.get("school") or "vanderbilt"

        interest_parts = []
        if profile.get("skills"):
            interest_parts.append("skills: " + ", ".join(profile["skills"]))
        if profile.get("industries_of_interest"):
            interest_parts.append("interested in: " + ", ".join(profile["industries_of_interest"]))
        if profile.get("major"):
            interest_parts.append(f"majoring in {profile['major']}")

        if not interest_parts:
            return {
                "matches": [],
                "error": "Not enough profile info to match clubs yet - "
                         "no skills, interests, or major on file.",
            }

        interests_text = "; ".join(interest_parts)

    results = retrieve_context(interests_text, school=school, source_type="student_org", top_k=top_k)

    matches = [
        {
            "name": r["metadata"].get("name", "Unknown org"),
            "description": r["content"],
            "similarity": r["similarity"],
        }
        for r in results
    ]

    return {"matches": matches, "search_basis": interests_text}


if __name__ == "__main__":
    test_interests = sys.argv[1] if len(sys.argv) > 1 else None

    if test_interests:
        result = match_clubs(interests_text=test_interests)
    else:
        result = match_clubs(user_hash="test-user-12345")

    print(f"Search basis: {result.get('search_basis', 'N/A')}\n")

    if result.get("error"):
        print(f"Error: {result['error']}")
    else:
        for i, m in enumerate(result["matches"], 1):
            print(f"{i}. {m['name']} (similarity={m['similarity']:.3f})")
            print(f"   {m['description'][:150]}...")
            print()
