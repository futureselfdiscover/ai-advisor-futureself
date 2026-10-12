"""
backend/data/scrapers/build_programs.py

Rebuilds every major, minor, and department requirements section from the
full catalog text, with no 4000-character cap, so requirement lists are
complete. Writes data/scrapers/programs.json.

How it finds programs: every table-of-contents entry before "Courses by
Subject Areas" whose name is a department (matches a subject area) or a
major/minor/program of concentration starts a new program. Sub-sections
(honors, electives, prerequisites...) stay with the program they belong to.

Usage (from backend/):
    python data/scrapers/build_programs.py
"""

import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
MAX_CHARS = 40000

CODE_RUN = re.compile(r"\b([A-Z]{2,5})\s(\d{4}[A-Z]?)((?:\s*(?:,|and|or|/)\s*\d{4}[A-Z]?)*)")
FOOTER = re.compile(r"(?m)^\s*Page \d+ of \d+\s*$")
PROGRAM_NAME = re.compile(
    r"^(?:(?:second|interdisciplinary|undergraduate)\s+)?(?:majors?|minors?|programs? of concentration)\s+in\s+(.+)$",
    re.I,
)
GENERIC = {"departmental minors", "potential peabody second majors"}
NOT_A_PROGRAM = re.compile(
    r"(?i)\b(requirements?|for the|approved|optional|outside|advice|polic(y|ies)|school of|college of|all programs)\b"
)


def norm(name: str) -> str:
    n = str(name).lower().replace("&", " and ")
    n = re.sub(r"\(.*?\)", " ", n)
    n = re.sub(r"[-–]\s*(pc|peabody)\b", " ", n)
    n = re.sub(r"[^a-z0-9 ]+", " ", n)
    return re.sub(r"\s+", " ", n).strip()


def split_shared(text: str) -> str:
    """'CS or ECE 3258' -> 'CS 3258 or ECE 3258' so both codes are counted."""
    return re.sub(r"\b([A-Z]{2,5}) or ([A-Z]{2,5}) (\d{4}[A-Z]?)", r"\1 \3 or \2 \3", text)


def course_codes(text: str) -> list:
    text = split_shared(text)
    codes = set()
    for subj, first, rest in CODE_RUN.findall(text):
        codes.add(f"{subj} {first}")
        for num in re.findall(r"\d{4}[A-Z]?", rest):
            codes.add(f"{subj} {num}")
    return sorted(codes)


def classify(toc_name: str, subjects: set):
    """Returns (display_name, subject_key, kind) if this TOC entry starts a program, else None."""
    name = re.sub(r"\s+", " ", str(toc_name)).strip()
    key = norm(name)
    if not key or key in GENERIC or NOT_A_PROGRAM.search(name):
        return None
    m = PROGRAM_NAME.match(name)
    if m:
        subject = re.sub(r"\(.*?\)", "", m.group(1)).strip()
        if not subject[:1].isupper() or re.match(r"(?i)(in|and|all)\b", subject):
            return None
        kind = "minor" if re.search(r"\bminors?\b", name, re.I) else "major"
        return f"{subject} {kind}", norm(subject), kind
    m = re.match(r"(?i)^(?:the\s+)?(?:undergraduate\s+)?(.+?)\s+minor$", name)
    if m and m.group(1)[:1].isupper():
        subject = m.group(1).strip(" -")
        return f"{subject} minor", norm(subject), "minor"
    if key in subjects:
        return f"{name} (department overview)", key, "overview"
    return None


def main():
    pages = json.loads((HERE / "catalog_pages.json").read_text())
    toc = json.loads((HERE / "toc_entries.json").read_text())

    courses_start = next((int(e["page"]) for e in toc if norm(e["name"]) == "courses by subject areas"), None)
    if not courses_start:
        raise SystemExit("Could not find 'Courses by Subject Areas' in toc_entries.json")
    req_end = next((int(e["page"]) for e in toc
                    if norm(e["name"]) == "campus resources" and int(e["page"]) < courses_start), courses_start)
    subjects = {norm(e["name"]) for e in toc
                if int(e["page"]) >= courses_start and norm(e["name"]) != "courses by subject areas"}

    offsets, pos = [], 0
    for p in pages:
        offsets.append(pos)
        pos += len(p) + 1
    full = "\n".join(pages)

    def off(i: int) -> int:
        return 0 if i <= 0 else len(full) if i >= len(pages) else offsets[i]

    def page_of(c: int) -> int:
        lo, hi = 0, len(offsets) - 1
        while lo < hi:
            mid = (lo + hi + 1) // 2
            lo, hi = (mid, hi) if offsets[mid] <= c else (lo, mid - 1)
        return lo + 1

    def locate(name: str, page: int):
        words = re.findall(r"[A-Za-z0-9&'’\-]+", name)
        if not words:
            return off(page - 1), "page start"
        idx = page - 1
        exact = re.compile(r"(?m)^[ \t]*" + r"\s+".join(re.escape(w) for w in words) + r"[ \t]*$")
        for a, b in ((idx, idx + 2), (idx - 1, idx + 3), (idx - 2, idx + 4)):
            m = exact.search(full, off(a), off(b))
            if m:
                return m.start(), "heading"
        loose = re.compile(r"\s+".join(re.escape(w) for w in words), re.I)
        m = loose.search(full, off(idx), off(idx + 2))
        return (m.start(), "text match") if m else (off(idx), "page start")

    # department names also appear in the AP/IB credit tables near the front of the
    # catalog; those are not program sections, so skip department heads there
    ap_start = next((int(e["page"]) for e in toc if "advanced placement" in norm(e["name"])), None)
    ap_end = next((int(e["page"]) for e in toc if ap_start and int(e["page"]) >= ap_start
                   and norm(e["name"]).startswith("pre college")), None)

    heads = []
    for e in toc:
        page = int(e["page"])
        if page < 10 or page >= req_end:
            continue
        c = classify(e["name"], subjects)
        if c and c[2] == "overview" and ap_start and ap_end and ap_start <= page < ap_end:
            continue
        if c:
            start, how = locate(str(e["name"]), page)
            heads.append({"display": c[0], "subject": c[1], "kind": c[2], "toc_name": e["name"],
                          "start": start, "found": how})
    heads.sort(key=lambda h: h["start"])
    stop = off(req_end - 1)

    merged = {}
    for i, h in enumerate(heads):
        nxt = next((x["start"] for x in heads[i + 1:] if x["start"] > h["start"]), stop)
        end = min(nxt, stop)
        if end <= h["start"]:
            continue
        text = re.sub(r"\n{3,}", "\n\n", FOOTER.sub("", full[h["start"]:end])).strip()
        p = merged.setdefault((h["subject"], h["kind"]), {
            "name": h["display"], "subject": h["subject"], "kind": h["kind"],
            "start_page": page_of(h["start"]), "end_page": page_of(end - 1),
            "found": h["found"], "text": "", "longest": 0, "toc_upper": str(h["toc_name"]).isupper(),
        })
        if p["toc_upper"] and not str(h["toc_name"]).isupper():  # prefer "Mathematics" over "MATHEMATICS"
            p["name"], p["toc_upper"] = h["display"], False
        if len(text) > p["longest"]:  # report the pages of the main section
            p["longest"] = len(text)
            p["start_page"], p["end_page"], p["found"] = page_of(h["start"]), page_of(end - 1), h["found"]
        p["text"] = (p["text"] + "\n\n" + text).strip()

    programs = []
    for p in merged.values():
        p.pop("longest", None)
        p.pop("toc_upper", None)
        p["capped"] = len(p["text"]) > MAX_CHARS
        p["text"] = p["text"][:MAX_CHARS]
        p["chars"] = len(p["text"])
        p["course_codes"] = course_codes(p["text"])
        programs.append(p)
    programs.sort(key=lambda p: (p["subject"], p["kind"] != "major", p["kind"] != "minor"))

    (HERE / "programs.json").write_text(json.dumps(programs, indent=1))

    print(f"{'program':<58} {'pages':<10} {'chars':>6} {'codes':>5}  flags")
    flagged = 0
    for p in programs:
        flags = []
        if p["found"] != "heading":
            flags.append("HEADING:" + p["found"])
        if p["chars"] < 300:
            flags.append("SHORT")
        if p["kind"] != "overview" and not p["course_codes"]:
            flags.append("NO_CODES")
        if p["capped"]:
            flags.append("CAPPED")
        flagged += bool(flags)
        print(f"{p['name'][:58]:<58} {p['start_page']}-{p['end_page']:<6} {p['chars']:>6} "
              f"{len(p['course_codes']):>5}  {' '.join(flags)}")

    kinds = {k: sum(p["kind"] == k for p in programs) for k in ("major", "minor", "overview")}
    print(f"\n{len(programs)} programs ({kinds['major']} majors, {kinds['minor']} minors, "
          f"{kinds['overview']} department overviews) written to programs.json; {flagged} flagged")


if __name__ == "__main__":
    main()
