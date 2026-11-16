"""
backend/data/scrapers/add_peabody_programs.py

Adds Peabody programs that build_programs.py misses (Teaching & Learning majors, Peabody minors).
Run right after build_programs.py, before extract_requirements.py.
"""
import json
import re
from pathlib import Path

D = Path(__file__).resolve().parent
CODE = re.compile(r"\b[A-Z]{2,5}(?:-[A-Z]{2,4})? \d{4}[A-Z]?\b")
# (name, subject, kind, start page, start heading, end page, end heading)
PROGRAMS = [
    ("Elementary Education major", "elementary education", "major", 248, r"Elementary Education", 250, r"Secondary Education"),
    ("Secondary Education major", "secondary education", "major", 250, r"Secondary Education", 252, r"Educational Studies"),
    ("Educational Studies major", "educational studies", "major", 252, r"Educational Studies", 255, r"Peabody Minors"),
    ("Child Psychology and Mental Health minor", "child psychology and mental health", "minor", 256, r"Child Psych", 257, r"Cognitive Studies"),
    ("Cognitive Studies minor", "cognitive studies", "minor", 257, r"Cognitive Studies", 258, r"Language Sciences"),
    ("Language Sciences minor", "language sciences", "minor", 258, r"Language Sciences", 259, r"Quantitative Methods"),
    ("Quantitative Methods minor", "quantitative methods", "minor", 259, r"Quantitative Methods", 259, r"Special Education Minors"),
    ("Education Studies minor", "education studies", "minor", 261, r"Education Studies", 261, r"Multilingual Learner Education"),
    ("Multilingual Learner Education minor", "multilingual learner education", "minor", 261, r"Multilingual Learner Education", 261, r"Literacy Education"),
    ("Literacy Education minor", "literacy education", "minor", 261, r"Literacy Education", 261, r"STEM Education"),
]
REMOVE = {"Studies, and  in Multilingual Learner Education minor"}


def main():
    pages = json.load(open(D / "catalog_pages.json"))
    progs = [p for p in json.load(open(D / "programs.json")) if p["name"] not in REMOVE]
    names = {p["name"] for p in progs}
    added = 0
    for name, subject, kind, sp, sh, ep, eh in PROGRAMS:
        if name in names:
            continue
        text = "\n".join(pages[sp - 1:ep])
        m = re.search(r"(?mi)^\s*(Major in |Minor in )?" + sh, text)
        start = m.start() if m else 0
        e = re.search(r"(?mi)^\s*(Major in |Minor in )?" + eh, text[start + 40:])
        body = text[start:start + 40 + e.start()] if e else text[start:]
        body = body.strip()[:20000]
        if kind not in body.lower() and kind == "minor" and "minor" not in text.lower():
            print(f"SKIPPED {name}: the word '{kind}' is not in its catalog text")
            continue
        progs.append({"name": name, "subject": subject, "kind": kind, "start_page": sp, "end_page": ep,
                      "found": "add_peabody_programs", "capped": False, "text": body, "chars": len(body),
                      "course_codes": len(set(CODE.findall(body)))})
        added += 1
        print(f"added {name:<42} pp.{sp}-{ep}  {len(body):>6} chars  {len(set(CODE.findall(body))):>3} course codes")
    json.dump(progs, open(D / "programs.json", "w"), indent=2, ensure_ascii=False)
    print(f"{added} Peabody programs added; programs.json now has {len(progs)} programs")


if __name__ == "__main__":
    main()
