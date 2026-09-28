"""
backend/advisor/city_explorer.py

Compares wages for a field across cities using real BLS OEWS data
(May 2025) stored in the salary_data table. Numbers come straight from
the database, and the model only explains them.

Usage:
    python city_explorer.py "software"
    python city_explorer.py "financial analyst" "Nashville,New York,Chicago"
"""

import os
import sys
from collections import defaultdict
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

sys.path.append(str(Path(__file__).resolve().parents[1] / "db"))
sys.path.append(str(Path(__file__).resolve().parents[1] / "profile"))

from client import get_client
from student_profile import get_student_profile

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

_openai = None


def _get_openai():
    global _openai
    if _openai is None:
        _openai = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _openai


def fetch_wages(field: str, cities: list = None) -> list:
    client = get_client()
    query = client.table("salary_data").select("*")
    for word in field.split():
        query = query.ilike("occupation", f"%{word}%")
    if cities:
        conditions = ",".join(f"city.ilike.%{c.strip()}%" for c in cities if c.strip())
        query = query.or_(conditions)
    return query.execute().data


def build_table(rows: list, max_occupations: int = 3) -> str:
    by_occupation = defaultdict(list)
    for r in rows:
        if r.get("annual_median_wage") is not None:
            by_occupation[r["occupation"]].append(r)

    ranked = sorted(
        by_occupation.items(),
        key=lambda item: sum(r.get("employment_count") or 0 for r in item[1]),
        reverse=True,
    )[:max_occupations]

    blocks = []
    for occupation, occ_rows in ranked:
        occ_rows = sorted(occ_rows, key=lambda r: r["annual_median_wage"], reverse=True)
        lines = [f"{occupation}:"]
        for r in occ_rows:
            mean = f"${r['annual_mean_wage']:,}" if r.get("annual_mean_wage") else "n/a"
            emp = f"{r['employment_count']:,}" if r.get("employment_count") else "n/a"
            lines.append(
                f"  {r['city']}: median ${r['annual_median_wage']:,}, mean {mean}, employed {emp}"
            )
        blocks.append("\n".join(lines))

    return "\n\n".join(blocks)


EXPLORER_PROMPT = """You are helping a {school} student compare cities for a career in {field}.

WAGE DATA (U.S. Bureau of Labor Statistics OEWS, May 2025):
{table}

Rules:
- Only use numbers that appear in the wage data above. Never invent or estimate figures.
- This data covers all workers in each occupation, not just entry level. New graduates
  usually start below these medians, so say that plainly.
- The data does not include cost of living. Do not give cost of living numbers. You can
  tell the student to weigh cost of living themselves.
- The employed number is how many people currently work in that occupation in that city. It is not the number of open jobs, so never call it openings or jobs available. Describe it as the size of the job market or the number of people employed.
- Only 20 metro areas are covered. If the student asks about a city that is not in the
  data, say so.
- Be plain and direct. Point out the highest paying cities, the biggest job markets
  (by job count), and where those two things differ.
- Keep it short and useful, not an essay."""


def explore_cities(field: str = None, cities: list = None, user_hash: str = None) -> dict:
    school = "your school"
    if user_hash:
        profile = get_student_profile(user_hash)
        school = (profile.get("school") or "your school").title()
        if not field:
            interests = profile.get("industries_of_interest") or []
            field = interests[0] if interests else profile.get("major")

    if not field:
        return {
            "explanation": "What field or job are you thinking about? Then I can compare cities for it.",
            "table": "",
            "row_count": 0,
        }

    rows = fetch_wages(field, cities)
    table = build_table(rows)

    if not table:
        return {
            "explanation": f"I don't have wage data for '{field}' in the cities I cover yet. "
                           f"Try a broader job title, like software or accountant.",
            "table": "",
            "row_count": 0,
        }

    response = _get_openai().chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": EXPLORER_PROMPT.format(school=school, field=field, table=table)},
            {"role": "user", "content": f"Compare cities for a career in {field}."},
        ],
        temperature=0.4,
    )

    return {"explanation": response.choices[0].message.content, "table": table, "row_count": len(rows)}


if __name__ == "__main__":
    test_field = sys.argv[1] if len(sys.argv) > 1 else "software"
    test_cities = sys.argv[2].split(",") if len(sys.argv) > 2 else None

    result = explore_cities(field=test_field, cities=test_cities)

    print("DATA USED:")
    print(result["table"])
    print("\nEXPLANATION:")
    print(result["explanation"])
    print(f"\n({result['row_count']} wage rows matched)")
