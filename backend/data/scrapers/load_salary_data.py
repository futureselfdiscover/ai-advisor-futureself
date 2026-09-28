"""
Loads BLS OEWS metro-area wage data, filtered to career-relevant
occupations and a reasonable set of cities, into a clean structured
JSON ready for a Supabase table (not embeddings - this is exact lookup
data, not semantic search).

Usage:
    python load_salary_data.py
"""

import pandas as pd
import json
from pathlib import Path

df = pd.read_excel("oesm25ma/MSA_M2025_dl.xlsx")
print(f"Loaded {len(df)} total rows")

# Only keep cross-industry (overall) estimates, not industry-specific breakdowns
df = df[df["NAICS_TITLE"] == "Cross-industry"]
print(f"After filtering to cross-industry: {len(df)} rows")

# Only keep detailed occupation rows (not broad category totals)
df = df[df["O_GROUP"] == "detailed"]
print(f"After filtering to detailed occupations: {len(df)} rows")

# Curated list of occupations relevant to career guidance - keyword match
# against OCC_TITLE, case-insensitive
RELEVANT_OCCUPATION_KEYWORDS = [
    "software", "computer", "data scientist", "data analyst",
    "financial analyst", "financial and investment", "budget analyst", "operations research", "web developer", "information security", "accountant", "management analyst", "consultant",
    "marketing manager", "market research", "human resources",
    "mechanical engineer", "civil engineer", "electrical engineer",
    "chemical engineer", "biomedical engineer",
    "registered nurse", "physician", "teacher", "lawyer", "paralegal",
    "economist", "statistician", "psychologist", "social worker",
    "public relations", "journalist", "graphic designer",
    "project manager", "product manager", "operations manager",
    "sales manager", "financial manager",
]

pattern = "|".join(RELEVANT_OCCUPATION_KEYWORDS)
df = df[df["OCC_TITLE"].str.lower().str.contains(pattern, case=False, na=False)]
print(f"After filtering to relevant occupations: {len(df)} rows")

# Curated list of major metro areas students commonly consider
RELEVANT_CITIES = [
    "Nashville", "New York", "San Francisco", "Chicago", "Atlanta",
    "Boston", "Washington-Arlington", "Los Angeles", "Dallas", "Austin",
    "Seattle", "Denver", "Charlotte", "Houston", "Philadelphia",
    "Miami", "Minneapolis", "Phoenix", "San Diego", "Portland",
]

city_pattern = "|".join(RELEVANT_CITIES)
df = df[df["AREA_TITLE"].str.contains(city_pattern, case=False, na=False)]
df = df[~df["AREA_TITLE"].str.contains("Charlottesville|Portland-South Portland", case=False, na=False)]
print(f"After filtering to relevant cities: {len(df)} rows")

# BLS OEWS uses text codes (*, **, #) for suppressed/unavailable values
# instead of blanks, so pd.isna() alone misses them. Coerce these
# columns first so any non-numeric junk becomes a real NaN.
for col in ["A_MEAN", "A_MEDIAN", "TOT_EMP"]:
    df[col] = pd.to_numeric(df[col], errors="coerce")

# Build clean records
records = []
for _, row in df.iterrows():
    records.append({
        "city": row["AREA_TITLE"],
        "occupation": row["OCC_TITLE"],
        "occupation_code": row["OCC_CODE"],
        "annual_mean_wage": None if pd.isna(row["A_MEAN"]) else int(row["A_MEAN"]),
        "annual_median_wage": None if pd.isna(row["A_MEDIAN"]) else int(row["A_MEDIAN"]),
        "employment_count": None if pd.isna(row["TOT_EMP"]) else int(row["TOT_EMP"]),
    })

Path("salary_data.json").write_text(json.dumps(records, indent=2))
print(f"\nWrote {len(records)} records to salary_data.json")

print("\nSample records:")
for r in records[:5]:
    print(r)
