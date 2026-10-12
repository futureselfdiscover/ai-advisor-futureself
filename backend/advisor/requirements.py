"""
backend/advisor/requirements.py

Answers "what does major/minor X require" from the FULL catalog sections for
that program (data/scrapers/programs.json, built by build_programs.py),
instead of from search results, so no requirement group gets dropped.

find_program() maps however the student wrote it ("comp sci", "econ minor",
"HOD", "math") to an official program name like "Computer Science major".

Usage:
    python requirements.py "what classes do cs majors need"
"""

import difflib
import json
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

base = Path(__file__).resolve().parents[1]
load_dotenv(base / ".env")

DATA = base / "data" / "scrapers"
PROGRAMS_FILE = DATA / "programs.json"
COURSES_FILE = DATA / "course_catalog.json"
STRUCTURED_FILE = DATA / "program_requirements.json"
MAX_CONTEXT_CHARS = 30000

ALIASES = {
    "cs": "computer science", "comp sci": "computer science", "compsci": "computer science",
    "econ": "economics", "hod": "human and organizational development", "neuro": "neuroscience",
    "poli sci": "political science", "polisci": "political science", "psych": "psychology",
    "bme": "biomedical engineering", "mech e": "mechanical engineering", "me": "mechanical engineering",
    "ece": "electrical and computer engineering", "ee": "electrical and computer engineering",
    "chem": "chemistry", "bio": "biological sciences", "biology": "biological sciences",
    "math": "mathematics", "maths": "mathematics", "mhs": "medicine health and society",
    "cmst": "communication studies", "comm": "communication studies", "chbe": "chemical and biomolecular engineering",
    "civil": "civil engineering", "ce": "civil engineering", "ds": "data science", "philo": "philosophy",
}

_client = None
_programs = None
_course_titles = None
_structured = None


def _get_client():
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


def norm(text: str) -> str:
    n = str(text).lower().replace("&", " and ")
    n = re.sub(r"[^a-z0-9 ]+", " ", n)
    return re.sub(r"\s+", " ", n).strip()


def load_programs() -> list:
    global _programs
    if _programs is None:
        try:
            _programs = json.loads(PROGRAMS_FILE.read_text())
        except Exception as e:
            print(f"requirements: could not load {PROGRAMS_FILE}: {e}")
            _programs = []
    return _programs


def course_titles() -> dict:
    global _course_titles
    if _course_titles is None:
        try:
            _course_titles = {c["code"]: c.get("title", "") for c in json.loads(COURSES_FILE.read_text())}
        except Exception as e:
            print(f"requirements: could not load {COURSES_FILE}: {e}")
            _course_titles = {}
    return _course_titles


def load_structured() -> dict:
    """program name -> structured requirement groups (from extract_requirements.py)"""
    global _structured
    if _structured is None:
        try:
            _structured = {d["program"]: d for d in json.loads(STRUCTURED_FILE.read_text()) if not d.get("error")}
        except Exception as e:
            print(f"requirements: no structured requirements loaded ({e})")
            _structured = {}
    return _structured


def render_structured(d: dict) -> str:
    """Plain-text outline of one program's requirement groups, with course titles."""
    titles = course_titles()
    head = d["program"] + (f" ({d['total_hours']} total hours)" if d.get("total_hours") else "")
    lines = [head]
    if d.get("summary"):
        lines.append(d["summary"])
    for g in d.get("groups") or []:
        details = [g.get("rule"), f"{g['hours']} hours" if g.get("hours") else None, g.get("level_or_range")]
        lines.append(f"- {g.get('name', 'Requirement')} [{g.get('type', 'other')}]: "
                     + "; ".join(str(x) for x in details if x))
        if g.get("courses"):
            lines.append("    " + ", ".join(f"{c} ({titles[c]})" if titles.get(c) else c for c in g["courses"]))
        if g.get("notes"):
            lines.append(f"    Note: {g['notes']}")
    for rule in d.get("other_rules") or []:
        lines.append(f"- Rule: {rule}")
    return "\n".join(lines)


def program_names() -> list:
    return [p["name"] for p in load_programs()]


def get_program(name: str):
    return next((p for p in load_programs() if p["name"] == name), None)


def _resolve(picked: str, names: list):
    """Turns a model's or student's wording into an exact program name, or None."""
    if not picked:
        return None
    if picked in names:
        return picked
    want = norm(picked)
    wants_minor = "minor" in want.split()
    core = re.sub(r"\b(major|minor|program|degree|in|the|of|concentration|department|overview)\b", " ", want)
    core = re.sub(r"\s+", " ", core).strip()
    core = ALIASES.get(core, core)

    by_subject = [p for p in load_programs() if p["subject"] == core]
    if by_subject:
        order = ["minor", "major", "overview"] if wants_minor else ["major", "overview", "minor"]
        by_subject.sort(key=lambda p: order.index(p["kind"]) if p["kind"] in order else 9)
        return by_subject[0]["name"]

    close = difflib.get_close_matches(core, [p["subject"] for p in load_programs()], n=1, cutoff=0.8)
    if close:
        return _resolve(close[0] + (" minor" if wants_minor else ""), names)
    return None


def find_program(mention: str):
    """Maps a student's wording of a program to the official program name, or None."""
    names = program_names()
    if not names or not mention or not str(mention).strip():
        return None

    quick = _resolve(mention, names)
    if quick:
        return quick

    listing = "\n".join(f"- {n}" for n in names)
    try:
        response = _get_client().chat.completions.create(
            model="gpt-4o-mini",
            response_format={"type": "json_object"},
            temperature=0,
            max_tokens=60,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Match the student's wording to ONE program from this Vanderbilt catalog list:\n"
                        f"{listing}\n\n"
                        "Handle abbreviations, nicknames, and typos (CS or comp sci = Computer Science, "
                        "econ = Economics, HOD = Human and Organizational Development, neuro = Neuroscience, "
                        "poli sci = Political Science, psych = Psychology, math = Mathematics). "
                        "Choose the 'major' entry unless they say minor; choose a '(department overview)' "
                        "entry only when no major or minor fits. "
                        'Respond with JSON only: {"program": "<exact name from the list>"} '
                        'or {"program": null} if nothing in the list fits.'
                    ),
                },
                {"role": "user", "content": str(mention)},
            ],
        )
        picked = json.loads(response.choices[0].message.content).get("program")
        return _resolve(picked, names) if picked else None
    except Exception as e:
        print(f"find_program failed: {e}")
        return None


REQUIREMENTS_PROMPT = """You are a Vanderbilt academic advisor answering from the official 2025/2026 Vanderbilt
Undergraduate Catalog. The student asked about "{name}" ({subject}).

STRUCTURED REQUIREMENTS (extracted from the catalog and checked against it):
{structured}

FULL CATALOG TEXT (for details and anything the outline does not cover):
{text}

Answer the student's question using ONLY the material above.
- When they ask what is required, use the STRUCTURED REQUIREMENTS as your outline: give every group
  under its catalog name (core, depth or level-based electives, project/capstone, math, science,
  writing, liberal arts core, concentrations, open electives...) with its rule, credit hours, level
  rules, and EVERY course listed for it. Do not skip, merge away, or shorten any group.
- Write course codes in full and add titles where given.
- If something they ask about is not covered, say so and suggest the department's director of
  undergraduate studies.
- Never add courses, rules, or numbers that are not in the material above."""


def program_requirements(question: str, program_name: str) -> str:
    program = get_program(program_name)
    if not program:
        return f"I couldn't find {program_name} in the Vanderbilt catalog data."

    # the chosen program first, then the rest of the department's sections
    related = [program] + [p for p in load_programs()
                           if p["subject"] == program["subject"] and p["name"] != program["name"]]

    structured = load_structured()
    outline = "\n\n".join(render_structured(structured[p["name"]]) for p in related
                           if p["name"] in structured and structured[p["name"]].get("groups"))
    outline = outline or "(no structured outline available; use the full catalog text)"

    parts = [f"=== {p['name']} (catalog pages {p['start_page']}-{p['end_page']}) ===\n{p['text']}" for p in related]
    text = "\n\n".join(parts)
    budget = max(8000, MAX_CONTEXT_CHARS - len(outline))
    truncated = len(text) > budget
    text = text[:budget]

    response = _get_client().chat.completions.create(
        model="gpt-4o",
        temperature=0.2,
        messages=[
            {"role": "system", "content": REQUIREMENTS_PROMPT.format(
                subject=program["subject"].title(), name=program["name"], structured=outline, text=text)},
            {"role": "user", "content": question},
        ],
    )
    answer = response.choices[0].message.content.strip()
    source = (f"Source: {program['name']}, 2025/2026 Vanderbilt Undergraduate Catalog "
              f"(pages {program['start_page']}-{program['end_page']}).")
    if truncated:
        source += " This section is long, so confirm details with the department."
    return f"{answer}\n\n{source}"



def requirements_outline(program_name: str):
    """Complete requirement outline for a program and its department (no model call), or None."""
    program = get_program(program_name)
    if not program:
        return None
    related = [program] + [p for p in load_programs()
                           if p["subject"] == program["subject"] and p["name"] != program["name"]]
    structured = load_structured()
    blocks = [render_structured(structured[p["name"]]) for p in related
              if p["name"] in structured and structured[p["name"]].get("groups")]
    if not blocks:
        return None
    return (f"Official requirements from the 2025/2026 Vanderbilt Undergraduate Catalog. "
            f"The student asked about: {program['name']}.\n\n" + "\n\n".join(blocks)
            + f"\n\nSource: {program['name']}, 2025/2026 Vanderbilt Undergraduate Catalog "
              f"(pages {program['start_page']}-{program['end_page']}).")

if __name__ == "__main__":
    q = sys.argv[1] if len(sys.argv) > 1 else "what classes do cs majors need to take"
    name = find_program(q)
    print(f"[program: {name}]\n")
    print(program_requirements(q, name) if name else "No matching program found.")
