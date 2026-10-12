"""
backend/advisor/club_matcher.py

Matches a student's stated interests against embedded student org data
using semantic similarity, so recommendations reflect what they're
actually into, not just keyword matches.

Graduate and professional school orgs (Law, Medicine, Owen, Divinity,
Nursing, Graduate School) are filtered out for undergraduates, using the
category field in student_orgs.json plus name/description checks for
orgs that have no category.

Usage:
    from club_matcher import match_clubs
    result = match_clubs(user_hash="abc123")
    # or with raw interests directly:
    result = match_clubs(interests_text="I love hiking and environmental policy")
"""

import json
import re
import sys
from pathlib import Path

base = Path(__file__).resolve().parents[1]
sys.path.append(str(base / "rag"))
sys.path.append(str(base / "profile"))

from retrieve import retrieve_context
from student_profile import get_student_profile

ORGS_FILE = base / "data" / "scrapers" / "student_orgs.json"

GRAD_CATEGORIES = {
    "law school", "advised by law school",
    "school of medicine",
    "graduate school", "advised by graduate school",
    "owen graduate school of management",
    "divinity school", "advised by divinity school",
    "school of nursing", "advised by school of nursing",
}
GRAD_NAME = re.compile(
    r"\b(law|lawyers?|jurists?|owen|mba|vusm|divinity|nursing|ph\.?d|postdocs?|medical students?|med students?)\b",
    re.I,
)
GRAD_DESC = re.compile(
    r"\b(law school|law students|owen students|owen graduate|mba students|medical students|school of medicine|"
    r"divinity school|nursing students|graduate and professional students|graduate students|ph\.?d\.? students)\b",
    re.I,
)
UNDERGRAD = re.compile(r"\b(undergrad(uate)?s?|pre-?law|pre-?med|pre-?health)\b", re.I)

_orgs_by_name = None


def _org_lookup() -> dict:
    """name (lowercased, trimmed) -> org record from student_orgs.json"""
    global _orgs_by_name
    if _orgs_by_name is None:
        try:
            orgs = json.loads(ORGS_FILE.read_text())
        except Exception as e:
            print(f"club_matcher: could not load {ORGS_FILE}: {e}")
            orgs = []
        _orgs_by_name = {str(o.get("name", "")).strip().lower(): o for o in orgs}
    return _orgs_by_name


def is_graduate_org(name: str, description: str) -> bool:
    org = _org_lookup().get(str(name).strip().lower(), {})
    categories = {str(c).strip().lower() for c in (org.get("category") or [])}
    if categories & GRAD_CATEGORIES:
        return True
    description = description or org.get("description") or ""
    if UNDERGRAD.search(f"{name} {description}"):
        return False
    return bool(GRAD_NAME.search(name) or GRAD_DESC.search(description))


def _is_grad_student(profile: dict) -> bool:
    year = str(profile.get("year") or "").lower()
    return any(w in year for w in ("grad", "master", "phd", "doctor", "mba", "law", "medical"))


def match_clubs(user_hash: str = None, interests_text: str = None, top_k: int = 5,
                include_graduate: bool = None) -> dict:
    """
    Returns the top_k student orgs matching the student's interests, based
    on either their stored profile (skills, industries_of_interest, clubs
    they already know about) or raw interests text passed directly.
    Graduate/professional orgs are skipped unless include_graduate is True
    or the student's profile says they are a graduate student.
    """
    school = "vanderbilt"
    profile = get_student_profile(user_hash) if user_hash else {}
    if include_graduate is None:
        include_graduate = _is_grad_student(profile)

    if interests_text is None:
        if not user_hash:
            return {"matches": [], "error": "Need either a user_hash or interests_text to match against."}

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

    # pull extra candidates so there are still top_k left after filtering
    results = retrieve_context(interests_text, school=school, source_type="student_org", top_k=top_k * 4)

    matches = []
    for r in results:
        name = (r.get("metadata") or {}).get("name", "Unknown org")
        if not include_graduate and is_graduate_org(name, r.get("content", "")):
            continue
        matches.append({"name": name, "description": r["content"], "similarity": r["similarity"]})
        if len(matches) == top_k:
            break

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
