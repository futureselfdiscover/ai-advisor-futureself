"""
Direct lookup against the salary_data table. This is NOT retrieval over
embeddings - salary_data is exact structured data (BLS OEWS), so we filter
with ilike/exact match instead of cosine similarity.

Usage:
    python salary_lookup.py "Software Developers" --city Nashville
    python salary_lookup.py "Marketing Managers"
"""

import argparse
import sys

sys.path.append("../db")  # so `from client import get_client` works when run
                           # from backend/advisor, matching the rest of the app
from client import get_client


def get_salary_info(occupation: str, city: str = None, top_n: int = 5) -> list:
    """
    Looks up salary_data rows matching an occupation (fuzzy, case-insensitive
    substring match against the occupation title) and optionally a city.

    Returns a list of dicts, each with city, occupation, occupation_code,
    annual_mean_wage, annual_median_wage, employment_count - or an empty
    list if nothing matches (callers should handle that gracefully rather
    than assuming data always exists for a given occupation/city pair).
    """
    client = get_client()

    query = client.table("salary_data").select("*").ilike("occupation", f"%{occupation}%")
    if city:
        query = query.ilike("city", f"%{city}%")

    result = query.limit(top_n).execute()
    return result.data


def format_salary_summary(rows: list) -> str:
    """
    Turns raw salary_data rows into a short plain-text summary, meant to be
    dropped into a GPT prompt as grounding context (same role format_context()
    plays for retrieve_context() chunks in rag/retrieve.py).
    """
    if not rows:
        return "No salary data available for this occupation/city combination."

    lines = []
    for r in rows:
        mean_str = f"${r['annual_mean_wage']:,}" if r.get("annual_mean_wage") else "N/A"
        median_str = f"${r['annual_median_wage']:,}" if r.get("annual_median_wage") else "N/A"
        emp_str = f"{r['employment_count']:,}" if r.get("employment_count") else "N/A"
        lines.append(
            f"- {r['occupation']} in {r['city']}: "
            f"mean annual wage {mean_str}, median annual wage {median_str}, "
            f"employment count {emp_str}"
        )
    return "\n".join(lines)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("occupation", help="Occupation title to search for, e.g. 'Software Developers'")
    parser.add_argument("--city", default=None, help="Optional city filter, e.g. 'Nashville'")
    parser.add_argument("--top-n", type=int, default=5)
    args = parser.parse_args()

    rows = get_salary_info(args.occupation, city=args.city, top_n=args.top_n)

    print(f"Query: occupation='{args.occupation}', city={args.city or 'any'}\n")
    if not rows:
        print("No matches found.")
    else:
        print(format_salary_summary(rows))
