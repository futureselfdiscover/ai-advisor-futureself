"""
backend/profile/profile.py

Reads and writes student profile data across two tables:
- fsd_profile: FutureSelf's cross-platform profile (skills, experience, etc.)
- student_academic_profile: Vanderbilt-specific academic context (major,
  minor, year, credits) that this advisor needs but fsd_profile doesn't have.

get_student_profile() merges both into one dict so callers don't need to
know which table a field lives in.

Usage:
    from student_profile import get_student_profile, update_student_profile

    profile = get_student_profile("some-user-hash")
    update_student_profile("some-user-hash", school="vanderbilt", major="Computer Science", year="sophomore")
"""

import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1] / "db"))
from client import get_client


def get_student_profile(user_hash: str) -> dict:
    """
    Returns a merged profile dict combining fsd_profile (cross-platform)
    and student_academic_profile (Vanderbilt-specific) data for this user.
    Returns an empty-ish dict with defaults if the user has no profile yet
    rather than raising - callers should treat missing fields as "unknown."
    """
    client = get_client()

    fsd_result = client.table("fsd_profile").select("*").eq("user_hash", user_hash).limit(1).execute()
    academic_result = (
        client.table("student_academic_profile").select("*").eq("user_hash", user_hash).limit(1).execute()
    )

    fsd_data = fsd_result.data[0] if fsd_result.data else {}
    academic_data = academic_result.data[0] if academic_result.data else {}

    merged = {
        "user_hash": user_hash,
        # From fsd_profile
        "skills": fsd_data.get("skills", []),
        "industries_of_interest": fsd_data.get("industries_of_interest", []),
        "career_priorities": fsd_data.get("career_priorities"),
        "clubs_and_organizations": fsd_data.get("clubs_and_organizations", []),
        "experience": fsd_data.get("experience", []),
        # From student_academic_profile - falls back to fsd_profile's school
        # field if our table doesn't have it yet, since fsd_profile.school
        # exists too (just often empty)
        "school": academic_data.get("school") or fsd_data.get("school"),
        "major": academic_data.get("major"),
        "minor": academic_data.get("minor"),
        "year": academic_data.get("year"),
        "credits_completed": academic_data.get("credits_completed"),
        "courses_taken": academic_data.get("courses_taken", []),
        # Bookkeeping
        "has_academic_profile": bool(academic_data),
        "has_fsd_profile": bool(fsd_data),
    }

    return merged


def update_student_profile(user_hash: str, **fields) -> dict:
    """
    Upserts fields into student_academic_profile only. This does NOT touch
    fsd_profile - that table belongs to the broader FutureSelf platform,
    not this advisor, so we don't write to it here.

    Accepted fields: school, major, minor, year, credits_completed

    Usage:
        update_student_profile("abc123", major="Computer Science", year="sophomore")
    """
    client = get_client()

    allowed_fields = {"school", "major", "minor", "year", "credits_completed"}
    update_data = {k: v for k, v in fields.items() if k in allowed_fields}

    if not update_data:
        raise ValueError(f"No valid fields provided. Allowed: {allowed_fields}")

    update_data["user_hash"] = user_hash

    result = client.table("student_academic_profile").upsert(update_data, on_conflict="user_hash").execute()
    return result.data[0] if result.data else {}


if __name__ == "__main__":
    # Quick manual test using a fake user_hash
    test_hash = "test-user-12345"

    print("Before update:")
    print(get_student_profile(test_hash))

    print("\nUpdating profile...")
    update_student_profile(test_hash, school="vanderbilt", major="Computer Science", year="sophomore", credits_completed=45)

    print("\nAfter update:")
    print(get_student_profile(test_hash))
