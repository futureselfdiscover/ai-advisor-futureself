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
import html
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

def compact_codes(codes: list, titles: dict) -> str:
    """['CS 2201', 'ECE 2201', 'CS 3250', 'CHEM 1601', 'CHEM 1601L'] -> 'CS/ECE 2201; CS 3250; CHEM 1601/L'"""
    codes = list(dict.fromkeys(codes))
    present = set(codes)
    cross, skip = {}, set()
    for i, a in enumerate(codes):  # cross-listed: same number and same title in two subjects
        sa, na = a.split(" ", 1)
        for b in codes[i + 1:]:
            sb, nb = b.split(" ", 1)
            if na == nb and sa != sb and b not in skip and titles.get(a) and titles.get(a) == titles.get(b):
                cross[a] = f"{sa}/{sb}"
                skip.add(b)
    runs = []
    for code in codes:
        if code in skip:
            continue
        subject, number = code.split(" ", 1)
        if number.endswith("L") and f"{subject} {number[:-1]}" in present:
            continue  # lab folded into its lecture: 1601/L
        label = number + ("/L" if f"{subject} {number}L" in present else "")
        key = cross.get(code, subject)
        if runs and runs[-1][0] == key:
            runs[-1][1].append(label)
        else:
            runs.append((key, [label]))
    return "; ".join(f"{key} {', '.join(nums)}" for key, nums in runs)


# catalog sections that are not degree programs, so never call them "X major"
NOT_DEGREE = {"honors", "immersion vanderbilt", "naval science", "peabody college", "literature"}


def _display_title(program: dict) -> str:
    title = program["name"].replace(" (department overview)", "")
    if program["kind"] == "overview" and program["subject"] not in NOT_DEGREE and not any(
            p["subject"] == program["subject"] and p["kind"] == "major" for p in load_programs()):
        title += " major"
    return title


def _chosen_structured(program_name: str):
    program = get_program(program_name)
    if not program:
        return None, None
    structured = load_structured()
    related = [program] + [p for p in load_programs()
                           if p["subject"] == program["subject"] and p["name"] != program["name"]]
    chosen = next((p for p in related if structured.get(p["name"], {}).get("groups")), None)
    return (chosen, structured[chosen["name"]]) if chosen else (None, None)


def requirements_html(program_name: str, note: str = None):
    """Short, scannable HTML list of every requirement group for the chat widget, or None."""
    chosen, d = _chosen_structured(program_name)
    if not chosen:
        return None
    titles = course_titles()
    esc = html.escape

    hours = f" · {esc(str(d['total_hours']))} credit hours" if d.get("total_hours") else ""
    lines = ([esc(note)] if note else []) + [f"<b>{esc(_display_title(chosen))}</b>{hours}"]
    for g in d.get("groups") or []:
        name = esc(str(g.get("name") or "Requirement"))
        label = f"<b>{name}</b>" + (f" ({esc(str(g['hours']))} hrs)" if g.get("hours") else "")
        rule = str(g.get("rule") or "").strip()
        if rule.lower() in ("take all", "complete all", "complete all requirements", "required"):
            rule = "required"
        if len(rule) > 140:
            rule = rule[:140].rsplit(" ", 1)[0].rstrip(",;") + "..."
        detail = "; ".join(x for x in [esc(rule) if rule else "", esc(str(g.get("level_or_range") or ""))] if x)
        codes = compact_codes(g.get("courses") or [], titles)
        line = "• " + label
        if detail:
            line += f": {detail}"
        if codes:
            line += f"<br>&nbsp;&nbsp;{esc(codes)}"
        lines.append(line)
    lines.append(f"<i>2025–26 Vanderbilt Undergraduate Catalog, pp. {chosen['start_page']}–{chosen['end_page']}. "
                 f"Confirm with your advisor before registering.</i>")
    return "<br>".join(lines)


def requirements_brief(program_name: str):
    """One-line summary for the chat model (the full list is attached separately)."""
    chosen, d = _chosen_structured(program_name)
    if not chosen:
        return None
    groups = ", ".join(str(g.get("name")) for g in d.get("groups") or [] if g.get("name"))
    hours = f" ({d['total_hours']} credit hours)" if d.get("total_hours") else ""
    return f"{_display_title(chosen)}{hours}. Requirement groups: {groups}."


STOPWORDS = {"and", "of", "the", "in", "studies", "science", "sciences"}

def effective_kind(program: dict) -> str:
    """major / minor / overview; a department section that holds a major's requirements counts as the major."""
    if program["kind"] == "overview":
        return "major" if _display_title(program).endswith(" major") else "overview"
    return program["kind"]


def kind_note(program_name: str, wanted: str):
    """If they asked for a major but only a minor exists (or the reverse), say so above the list."""
    if wanted not in ("major", "minor"):
        return None
    program = get_program(program_name)
    if not program:
        return None
    chosen, _ = _chosen_structured(program_name)
    have = effective_kind(chosen or program)
    if have == wanted or have == "overview":
        return None
    base = re.sub(r" (major|minor)$", "", _display_title(chosen or program))
    if wanted == "major":
        return (f"Vanderbilt doesn't offer a {base} major (2025–26 catalog), but it does offer a {base} minor. "
                f"Here are its requirements:")
    words = set(program["subject"].split()) - STOPWORDS
    related = [p["name"] for p in load_programs()
               if p["kind"] == "minor" and p["subject"] != program["subject"]
               and words & (set(p["subject"].split()) - STOPWORDS)][:3]
    also = f" Related minors: {', '.join(related)}." if related else ""
    return (f"Vanderbilt doesn't offer a {base} minor (2025–26 catalog), but it does offer a {base} major.{also} "
            f"Here are the major requirements:")

if __name__ == "__main__":
    q = sys.argv[1] if len(sys.argv) > 1 else "what classes do cs majors need to take"
    name = find_program(q)
    print(f"[program: {name}]\n")
    print(program_requirements(q, name) if name else "No matching program found.")
