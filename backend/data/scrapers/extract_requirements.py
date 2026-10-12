"""
backend/data/scrapers/extract_requirements.py

One-time (re-runnable) step after build_programs.py. Reads each program's
full catalog text and turns it into structured requirement groups: core,
depth/level-based electives, projects/capstones, math, science, writing,
liberal arts core, open electives, honors, etc., keeping the catalog's own
group names, rules ("choose 2", "3000-level or above"), and credit hours.

Every course code the model returns is checked against the catalog text and
course_catalog.json; codes found in neither are removed and reported.

Input:  programs.json, course_catalog.json
Output: program_requirements.json

Usage (from backend/):
    python data/scrapers/extract_requirements.py            # only programs not done yet
    python data/scrapers/extract_requirements.py --force    # redo everything
    python data/scrapers/extract_requirements.py --only "Computer Science major"
"""

import argparse
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

HERE = Path(__file__).resolve().parent
load_dotenv(HERE.parents[1] / ".env")

OUT_FILE = HERE / "program_requirements.json"
MAX_TEXT = 40000
CODE = re.compile(r"\b[A-Z]{2,5} \d{4}[A-Z]?\b")
GROUP_TYPES = ["core", "depth_elective", "elective", "project_capstone", "math", "science",
               "writing", "liberal_arts_core", "concentration", "honors", "other"]

PROMPT = """You extract degree requirements from the official 2025/2026 Vanderbilt Undergraduate Catalog.

Program: {name}

CATALOG TEXT:
{text}

Return JSON with EVERY requirement for this program, grouped the way the catalog groups them:
{{
  "program": "{name}",
  "total_hours": "total credit hours for the program as written, or null",
  "summary": "one sentence describing the program's structure",
  "groups": [
    {{
      "name": "the catalog's own heading for this group, e.g. 'Computer Science Core', 'Depth', 'Project', 'Mathematics', 'Technical Electives', 'Liberal Arts Core'",
      "type": one of {types},
      "rule": "exactly what must be done, e.g. 'Take all', 'Choose 2', 'At least 6 hours at the 3000 level or above', 'One course from each area'",
      "hours": "credit hours for this group as written, or null",
      "courses": ["every course code listed for this group, written in full like 'CS 3250'"],
      "level_or_range": "course-level or number-range rules, e.g. '3000-level or above', 'CS 3250-3899', or null",
      "notes": "conditions, restrictions, substitutions, grade rules, or null"
    }}
  ],
  "other_rules": ["program-wide rules: GPA or grade minimums, pass/fail limits, residency, double counting, declaring"],
  "has_requirements": true or false
}}

Rules:
- Include every group: core/required courses, choose-N groups, depth or level-based electives, project or
  capstone, math, science, writing, liberal arts core, concentrations or tracks, honors, open electives.
- Expand shorthand: "CS 3250, 3251, and 3270" means CS 3250, CS 3251, CS 3270, and "CS or ECE 3258"
  means both CS 3258 and ECE 3258. Expand an explicit list,
  but describe ranges ("any CS 3000-level course") in level_or_range instead of inventing codes.
- Use only what is in the text. Never invent courses, hours, or rules.
- If this text is only a department introduction with no requirements, return "has_requirements": false
  and an empty groups list."""

_client = None


def client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


def expand_codes(text: str) -> set:
    text = re.sub(r"\b([A-Z]{2,5}) or ([A-Z]{2,5}) (\d{4}[A-Z]?)", r"\1 \3 or \2 \3", text)
    codes = set()
    for subj, first, rest in re.findall(r"\b([A-Z]{2,5})\s(\d{4}[A-Z]?)((?:\s*(?:,|and|or|/)\s*\d{4}[A-Z]?)*)", text):
        codes.add(f"{subj} {first}")
        codes.update(f"{subj} {n}" for n in re.findall(r"\d{4}[A-Z]?", rest))
    return codes


def extract(program: dict, catalog_codes: set) -> dict:
    text = program["text"][:MAX_TEXT]
    source_codes = expand_codes(text)
    last_error = None
    for attempt in range(3):
        try:
            response = client().chat.completions.create(
                model="gpt-4o",
                response_format={"type": "json_object"},
                temperature=0,
                max_tokens=6000,
                messages=[{"role": "user", "content": PROMPT.format(
                    name=program["name"], text=text, types=", ".join(GROUP_TYPES))}],
            )
            data = json.loads(response.choices[0].message.content)
            break
        except Exception as e:
            last_error = e
            time.sleep(2 * (attempt + 1))
    else:
        return {"program": program["name"], "error": str(last_error), "groups": []}

    removed = []
    for g in data.get("groups", []) or []:
        if g.get("type") not in GROUP_TYPES:
            g["type"] = "other"
        kept = []
        for c in g.get("courses") or []:
            c = re.sub(r"\s+", " ", str(c)).strip().upper()
            if not CODE.fullmatch(c):
                continue
            if c in source_codes or c in catalog_codes:
                if c not in kept:
                    kept.append(c)
            else:
                removed.append(c)
        g["courses"] = kept

    data["program"] = program["name"]
    data["subject"] = program["subject"]
    data["kind"] = program["kind"]
    data["start_page"] = program["start_page"]
    data["end_page"] = program["end_page"]
    data["removed_codes"] = sorted(set(removed))
    return data


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--only", default=None)
    args = ap.parse_args()

    programs = json.loads((HERE / "programs.json").read_text())
    catalog_codes = {c["code"] for c in json.loads((HERE / "course_catalog.json").read_text())}
    done = {}
    if OUT_FILE.exists() and not args.force:
        done = {d["program"]: d for d in json.loads(OUT_FILE.read_text()) if not d.get("error")}

    todo = [p for p in programs if (args.only is None or p["name"] == args.only)
            and (args.force or args.only or p["name"] not in done)]
    print(f"{len(programs)} programs, {len(done)} already extracted, extracting {len(todo)} now...")

    with ThreadPoolExecutor(max_workers=6) as pool:
        for i, result in enumerate(pool.map(lambda p: extract(p, catalog_codes), todo), 1):
            done[result["program"]] = result
            if i % 10 == 0 or i == len(todo):
                print(f"  {i}/{len(todo)} done")
                ordered = [done[p["name"]] for p in programs if p["name"] in done]
                OUT_FILE.write_text(json.dumps(ordered, indent=1))

    ordered = [done[p["name"]] for p in programs if p["name"] in done]
    OUT_FILE.write_text(json.dumps(ordered, indent=1))

    print(f"\n{'program':<55} {'groups':>6} {'courses':>7}  {'hours':<10} flags")
    flagged = 0
    for d in ordered:
        groups = d.get("groups") or []
        n_courses = len({c for g in groups for c in g.get("courses") or []})
        flags = []
        if d.get("error"):
            flags.append("ERROR")
        elif d.get("kind") != "overview" and not groups:
            flags.append("NO_GROUPS")
        if d.get("removed_codes"):
            flags.append(f"REMOVED_{len(d['removed_codes'])}_UNVERIFIED")
        flagged += bool(flags)
        print(f"{d['program'][:55]:<55} {len(groups):>6} {n_courses:>7}  {str(d.get('total_hours') or '')[:10]:<10} "
              f"{' '.join(flags)}")
    print(f"\n{len(ordered)} programs in program_requirements.json, {flagged} flagged")


if __name__ == "__main__":
    main()
