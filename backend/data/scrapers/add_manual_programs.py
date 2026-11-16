"""
backend/data/scrapers/add_manual_programs.py

Programs whose catalog headings the automatic builder misreads, sliced by their exact headings.
Runs after build_from_kuali.py (catalog_update.sh does this). Check these headings each new year.
"""
import json
import re
import sys
from pathlib import Path

D = Path(__file__).resolve().parent
sys.path.insert(0, str(D))
import build_from_kuali as b  # noqa: E402

# (page title, start heading regex, end heading regex or None = next heading of same/higher level, name, kind)
MANUAL = [
    ("The Degree Programs", r"^@@H6@@INTEGRATED STUDIES$", r"^@@H6@@INTEGRATED STUDIES/TEACHER", "Music Integrated Studies", "major"),
    ("Engineering Science and Management", r"^@@H4@@Engineering Science Major", None, "Engineering Science", "major"),
    ("Biological Sciences", r"^@@H4@@Requirements for the Integrative Biology", None, "Integrative Biology", "major"),
    ("Peabody Minors", r"^@@H4@@Child Psych and Mental Health", None, "Child Psychology and Mental Health", "minor"),
    ("Peabody Minors", r"^@@H4@@Multilingual Learner Education", None, "Multilingual Learner Education", "minor"),
]
RENAME = {"Education Studies minor": "Educational Studies minor"}
DROP = {"The Undergraduate Business minor"}


def main():
    path = D / "programs.json"
    progs = [p for p in json.load(open(path)) if p["name"] not in DROP]
    for p in progs:
        if p["name"] in RENAME:
            p["name"] = RENAME[p["name"]]
            p["subject"] = p["name"].rsplit(" ", 1)[0].lower()
    names = {p["name"] for p in progs}
    progs = [p for p in progs if not (p.get("placeholder") and p["name"] in {f"{n} {k}" for _, _, _, n, k in MANUAL}
                                     | set(RENAME.values()))]
    nav = b.get(f"/public/catalogs/{b.CATALOG}")["settings"]["catalog"]["navigation"]
    pages = {it["title"].strip(): it["to"].split("/")[-1] for top in nav for it in (top.get("nestedItems") or [])}
    cache = {}
    for page, start, end, name, kind in MANUAL:
        if page not in pages:
            print(f"MISSING PAGE {page}"); continue
        lines = cache.setdefault(page, b.page_lines((b.get("/content/" + pages[page]) or {}).get("body", "")))
        s = next((i for i, l in enumerate(lines) if re.search(start, l)), None)
        if s is None:
            print(f"HEADING NOT FOUND for {name}: {start}"); continue
        lvl = int(re.match(r"@@H(\d)@@", lines[s]).group(1)) if lines[s].startswith("@@H") else 6
        if end:
            e = next((i for i in range(s + 1, len(lines)) if re.search(end, lines[i])), len(lines))
        else:
            e = next((i for i in range(s + 1, len(lines))
                      if (m := re.match(r"@@H(\d)@@", lines[i])) and int(m.group(1)) <= lvl), len(lines))
        text = "\n".join(re.sub(r"^@@H\d@@", "", l) for l in lines[s:e])
        full = f"{name} {kind}"
        progs = [p for p in progs if p["name"] != full]
        progs.append({"name": full, "subject": re.sub(r"[^a-z0-9 ]", " ", name.lower()).strip(), "kind": kind,
                      "school": "", "page": page, "url": b.PAGE_URL + pages[page], "start_page": None, "end_page": None,
                      "found": "manual-heading", "capped": False, "text": text[:20000], "chars": len(text),
                      "course_codes": len(set(b.CODE.findall(text)))})
        print(f"added {full:<45} {len(text):>6} chars  {len(set(b.CODE.findall(text))):>3} course codes")
    json.dump(sorted(progs, key=lambda p: p["name"]), open(path, "w"), indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
