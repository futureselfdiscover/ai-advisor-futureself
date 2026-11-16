"""
backend/data/scrapers/build_from_kuali.py

Builds programs.json (every undergraduate major and minor) and updates course_catalog.json from
Vanderbilt's live Kuali undergraduate catalog.
  1. Reads every school / program-of-study content page.
  2. gpt-4o-mini (two passes) marks where each major/minor starts, using the official admissions names.
  3. Blair instrument degrees and track-split majors are merged; any official program still missing is
     searched for by name on every page.
  4. Programs not in the catalog at all get a short entry that links to the official program page.
Each new academic year: set CATALOG and PAGE_URL, update OFFICIAL in audit_programs.py, run catalog_update.sh.
"""
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from openai import OpenAI

D = Path(__file__).resolve().parent
load_dotenv(D.parents[1] / ".env")
sys.path.insert(0, str(D))
from audit_programs import OFFICIAL, toks, matches, official_link  # noqa: E402

CATALOG = "69861616dc1d2450f8837f3a"  # Undergraduate Catalog 2026-27
YEAR = "2026–27"
API = "https://vanderbilt.kuali.co/api/v1/catalog"
PAGE_URL = "https://www.vanderbilt.edu/catalogs/kuali/undergraduate-26-27/#/content/"
UA = {"User-Agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/124 Safari/537.36"}
CODE = re.compile(r"\b[A-Z]{2,5}(?:-[A-Z]{2,4})? \d{4}[A-Z]?\b")
SETS = {"Special Programs for Undergraduates", "College of Arts and Science", "Blair School of Music",
        "College of Connected Computing", "School of Engineering", "Peabody College", "Undergraduate Programs of Study"}
SKIP_PAGE = re.compile(r"(?i)administration and faculty|courses$|^honors in|first year|focus areas|"
                       r"degree programs in (the college|engineering)|community of interdisciplinary|programs of study$|"
                       r"engineering education|education and human development|the undergraduate program|licensure|"
                       r"music at vanderbilt|classes for students|regulations|^immersion|reserve officer|rotc|"
                       r"interdisciplinary majors|special program in peabody")
NAMES = "\n".join(f"{kind}: {n} ({school})" for kind, schools in OFFICIAL.items()
                  for school, names in schools.items() for n in names)
SYSTEM = f"""You split one page of Vanderbilt's {YEAR} undergraduate catalog into its undergraduate majors and minors.
You get the page title and a numbered list of its headings (#) and short title-like lines (-).
Reply with JSON: {{"programs": [{{"start": number of the line where that program's requirements begin (-1 = top of page),
"name": program name, "kind": "major" or "minor"}}]}}
Rules:
- Include every undergraduate major (program of concentration, B.A./B.S./B.Mus. degree, second major) and every minor.
  A page about one engineering department is that department's major.
- Do NOT include honors programs, tracks/concentrations/focus areas inside a major, licensure alone, graduate degrees,
  certificates, or course lists. Never split one major into its tracks (English's literary studies and creative
  writing tracks are one "English" major).
- Blair School of Music: all instrument/voice performance degrees are ONE major "Music Performance"; composition is
  "Music Composition"; integrated studies/teacher education (Blair-to-Peabody) is "Music Education"; also
  "Jazz Studies", "Music Integrated Studies", "Musical Arts". Blair minors: "Music", "Music Composition",
  "Music Performance", "Musicology/Ethnomusicology".
- Name each program the way the official list names it when it is the same program (list below); otherwise use the
  catalog's name without "Major in", "Minor in", "Program of Concentration in". Normal capitalization.
- If the page has no majors or minors, reply {{"programs": []}}.
Official names:
{NAMES}"""
_client = None


def ai():
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


def get(path):
    for _ in range(3):
        try:
            r = requests.get(API + path, headers=UA, timeout=60)
            if r.status_code == 200:
                return r.json()
            if r.status_code in (401, 403, 404):
                return None
        except Exception:
            pass
        time.sleep(2)
    return None


def _flat(x):
    if isinstance(x, dict):
        yield x
    elif isinstance(x, list):
        for y in x:
            yield from _flat(y)


def course_code(c):
    m = re.match(r"^([A-Z]+(?:-[A-Z]+)?)\s*(\d{4}[A-Z]?)$", (c.get("__catalogCourseId") or "").strip())
    return f"{m.group(1)} {m.group(2)}" if m else None


def page_lines(html):
    soup = BeautifulSoup(html or "", "html.parser")
    for h in soup.find_all(re.compile("^h[1-6]$")):
        h.replace_with(f"\n@@H{h.name[1]}@@{h.get_text(' ', strip=True)}\n")
    for p in soup.find_all("p"):
        s = p.find(["strong", "b"])
        t = p.get_text(" ", strip=True)
        if s and t and t == s.get_text(" ", strip=True) and len(t) < 120:
            p.replace_with(f"\n@@H5@@{t}\n")
    for br in soup.find_all("br"):
        br.replace_with("\n")
    return [l.strip() for l in soup.get_text("\n").splitlines() if l.strip()]


GENERIC = re.compile(r"(?i)^(the\s+)?(major|minor|programs? of concentration|requirements for the (major|minor)|"
                     r"(major|minor) requirements|the program)$")
P_IN = re.compile(r"(?i)^(?:the\s+)?(?:interdisciplinary\s+|second\s+|optional\s+)?(major|minor|programs? of concentration|"
                  r"concentration|bachelor of (?:arts|science)|b\.?\s?[as]\.?)\s+in\s+(.+)$")
P_SUFFIX = re.compile(r"(?i)^(.+?)\s+(major|minor)\b(?:\s*\(.*\))?$")
NOT_SUBJECT = re.compile(r"(?i)honors|requirement|optional|second|double|triple|declar|approved|outside|area|undergraduate$|\d")
OFFICIAL_NAMES = {k: [n for s in v.values() for n in s] for k, v in OFFICIAL.items()}


def clean(s):
    s = re.sub(r"\s*\([^)]*(hours|credit|B\.A|B\.S|B\.Mus)[^)]*\)", "", s, flags=re.I)
    return re.sub(r"\s+", " ", s).strip(" :.-–")


def classify(h, page, set_title):
    h = clean(h)
    if not h or len(h) > 110:
        return None
    m = P_IN.match(h)
    if m:
        k = m.group(1).lower()
        if k == "concentration" and set_title == "Blair School of Music":
            return None
        return clean(m.group(2)), "minor" if "minor" in k else "major"
    if GENERIC.match(h) and set_title in ("Undergraduate Programs of Study", "School of Engineering") \
            and not re.search(r"(?i)minors|special|focus", page):
        return clean(re.sub(r"(?i)^department of\s+", "", page)), "minor" if "minor" in h.lower() else "major"
    m = P_SUFFIX.match(h)
    if m and not NOT_SUBJECT.search(m.group(1)) and len(m.group(1)) > 2:
        return clean(m.group(1)), m.group(2).lower()
    return None


def to_official(name, kind):
    t = toks(name)
    best, score = name, 0
    for n in OFFICIAL_NAMES[kind]:
        on = toks(n)
        if on == t:
            return n
        if t and len(t) >= 2 and t <= on and len(t) > score:
            best, score = n, len(t)
        elif len(on) >= 2 and on <= t and len(on) > score:
            best, score = n, len(on)
    return best


def heads_of(lines):
    return [(i, int(m.group(1)), m.group(2).strip()) for i, l in enumerate(lines) if (m := re.match(r"@@H(\d)@@(.*)", l))]


def shorts_of(lines):
    return [(i, 6, l) for i, l in enumerate(lines) if not l.startswith("@@H") and 3 < len(l) <= 100
            and not CODE.match(l) and not re.match(r"^[\d•\-–(*]", l) and not l.endswith(".")]


def cands_of(lines):
    out = []
    for i, l in enumerate(lines):
        m = re.match(r"@@H(\d)@@(.*)", l)
        if m:
            out.append((i, int(m.group(1)), m.group(2).strip()))
        elif 3 < len(l) <= 100 and not CODE.match(l) and not re.match(r"^[\d•\-–(*]", l) and not l.endswith("."):
            out.append((i, 6, l))
    return out[:350]


def ai_marks(page, cands):
    listing = "\n".join(f"{n}. {'#' * lvl + ' ' if lvl < 6 else '- '}{t[:110]}"
                        for n, (_, lvl, t) in enumerate(cands)) or "(nothing)"
    best = {}
    for temp in (0, 0.5):
        try:
            r = ai().chat.completions.create(
                model="gpt-4o-mini", temperature=temp, response_format={"type": "json_object"},
                messages=[{"role": "system", "content": SYSTEM},
                          {"role": "user", "content": f"Page: {page}\nLines:\n{listing}"}])
            found = json.loads(r.choices[0].message.content).get("programs") or []
        except Exception as e:
            print(f"  !! {page}: {e}")
            continue
        for f in found:
            try:
                s = int(f.get("start", -1))
            except Exception:
                continue
            name, kind = str(f.get("name") or "").strip(), str(f.get("kind") or "").lower()
            if not name or kind not in ("major", "minor"):
                continue
            if name.isupper():
                name = name.title()
            line = cands[s][0] if 0 <= s < len(cands) else 0
            key = (name.lower(), kind)
            if key not in best or line < best[key]["line"]:
                best[key] = {"line": line, "name": name, "kind": kind}
    return list(best.values())


def blair_name(name, kind):
    n = name.lower()
    if kind == "major":
        if re.search(r"teacher education|music education|blair.to.peabody", n):
            return "Music Education"
        for word, new in [("jazz", "Jazz Studies"), ("integrated", "Music Integrated Studies"),
                          ("musical arts", "Musical Arts"), ("composition", "Music Composition")]:
            if word in n:
                return new
        if re.search(r"performance|piano|voice|organ|guitar|violin|viola|cello|bass|harp|brass|wind|percussion|string", n):
            return "Music Performance"
    else:
        if "musicology" in n:
            return "Musicology/Ethnomusicology"
        if "composition" in n:
            return "Music Composition"
        if "performance" in n:
            return "Music Performance"
        if "music" in n:
            return "Music"
    return name


def main():
    nav = get(f"/public/catalogs/{CATALOG}")["settings"]["catalog"]["navigation"]
    pages, seen = [], set()
    for top in nav:
        if top.get("title") not in SETS:
            continue
        for it in top.get("nestedItems") or []:
            cid = (it.get("to") or "").replace("/content/", "")
            if not re.fullmatch(r"[a-f0-9]{24}", cid) or cid in seen or SKIP_PAGE.search(it.get("title", "")):
                continue
            seen.add(cid)
            pages.append({"set": top["title"], "title": it["title"].strip(), "cid": cid})
    print(f"{len(pages)} program pages to read")

    with ThreadPoolExecutor(max_workers=8) as pool:
        bodies = list(pool.map(lambda p: (get(f"/content/{p['cid']}") or {}).get("body", ""), pages))
    for p, b in zip(pages, bodies):
        p["lines"] = page_lines(b)
        p["heads"] = heads_of(p["lines"])
        p["shorts"] = shorts_of(p["lines"])
        p["cands"] = p["heads"] if len(p["heads"]) > 3 else sorted(p["heads"] + p["shorts"])[:400]
    with ThreadPoolExecutor(max_workers=6) as pool:
        all_marks = list(pool.map(lambda p: ai_marks(p["title"], p["cands"]), pages))
    for p, marks in zip(pages, all_marks):
        for i, _, txt in p["heads"]:
            c = classify(txt, p["title"], p["set"])
            if c:
                marks.append({"line": i, "name": c[0], "kind": c[1]})
        merged = {}
        for m in marks:
            if m["name"].isupper():
                m["name"] = m["name"].title()
            if p["set"] == "Blair School of Music":
                m["name"] = blair_name(m["name"], m["kind"])
            m["name"] = to_official(m["name"], m["kind"])
            key = (m["name"], m["kind"])
            if key not in merged or m["line"] < merged[key]["line"]:
                merged[key] = m
        marks[:] = list(merged.values())

    official_majors = {n.lower().replace("&", "and"): n for s in OFFICIAL["major"].values() for n in s}
    for p, marks in zip(pages, all_marks):
        if p["set"] == "Blair School of Music":
            for m in marks:
                m["name"] = blair_name(m["name"], m["kind"])
        title = re.sub(r"\s*\(.*\)$", "", p["title"]).lower().replace("&", "and")
        if title in official_majors and not any(m["kind"] == "major" and matches(toks(title), toks(m["name"])) for m in marks):
            for m in marks:
                if m["kind"] == "major":
                    m["name"] = official_majors[title]
        p["marks"] = marks

    def have():
        return [(m["kind"], toks(m["name"])) for p in pages for m in p["marks"]]

    missing = [(kind, n) for kind, schools in OFFICIAL.items() for s in schools.values() for n in s]
    missing = [(k, n) for k, n in missing if not any(k == hk and matches(toks(n), h) for hk, h in have())]
    added = []
    for kind, n in sorted(missing, key=lambda x: -len(x[1])):
        t = toks(n)
        hit = None
        for p in pages:
            if t <= toks(p["title"]) and not any(m["kind"] == kind for m in p["marks"]):
                hit = (p, 0)
                break
        if not hit:
            for p in pages:
                for i, lvl, text in p["heads"] + p["shorts"]:
                    low, tt = text.lower(), toks(text)
                    kind_word = "minor" in low if kind == "minor" else bool(re.search(r"major|concentration|bachelor", low))
                    if t <= tt and len(tt) <= len(t) + 4 and (kind_word or lvl < 6) \
                            and not any(m["line"] == i for m in p["marks"]):
                        hit = (p, i)
                        break
                if hit:
                    break
        if hit:
            hit[0]["marks"].append({"line": hit[1], "name": n, "kind": kind})
            added.append(f"{n} ({kind}) on '{hit[0]['title']}'")

    progs = {}
    for p in pages:
        starts = sorted({m["line"] for m in p["marks"]})
        segs = {}
        for m in sorted(p["marks"], key=lambda m: m["line"]):
            nxt = next((s for s in starts if s > m["line"]), len(p["lines"]))
            seg = "\n".join(re.sub(r"^@@H\d@@", "", l) for l in p["lines"][m["line"]:nxt])
            key = (m["name"], m["kind"])
            segs[key] = (segs.get(key, "") + "\n" + seg).strip()
        names = []
        for (name, kind), text in segs.items():
            if len(text) < 150:
                continue
            full = f"{name} {kind}"
            subject = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", name.lower().replace("&", "and"))).strip()
            score = (1 if toks(name) <= toks(p["title"]) else 0, len(text))
            entry = {"name": full, "subject": subject, "kind": kind, "school": p["set"], "page": p["title"],
                     "url": PAGE_URL + p["cid"], "start_page": None, "end_page": None, "found": "kuali-content",
                     "capped": len(text) > 20000, "text": text[:20000], "chars": len(text),
                     "course_codes": len(set(CODE.findall(text))), "_score": score}
            if full not in progs or score > progs[full]["_score"]:
                progs[full] = entry
            names.append(f"{name} ({'Mj' if kind == 'major' else 'Mn'})")
        print(f"  {p['title'][:45]:<45} {len(names):>2}  {', '.join(names)[:160]}")
    print("\nfound by direct name search:", added or "none")

    placeholders = []
    have_progs = [(p["kind"], toks(p["subject"])) for p in progs.values()]
    for kind, schools in OFFICIAL.items():
        for school, names in schools.items():
            for n in names:
                if any(kind == k and matches(toks(n), h) for k, h in have_progs):
                    continue
                link = official_link(n, kind)
                text = (f"{n} {kind}\nVanderbilt Admissions lists {n} as an undergraduate {kind} ({school}), but its "
                        f"requirements are not in the {YEAR} undergraduate catalog yet; it may be a new program. "
                        f"Official program page: {link}\nStudents should check that page or ask their academic advisor "
                        f"for the current requirements.")
                full = f"{n} {kind}"
                progs[full] = {"name": full, "subject": re.sub(r"[^a-z0-9 ]", " ", n.lower()).strip(), "kind": kind,
                               "school": school, "url": link, "start_page": None, "end_page": None,
                               "found": "admissions-only", "placeholder": True, "capped": False, "text": text,
                               "chars": len(text), "course_codes": 0, "_score": (0, 0)}
                placeholders.append(f"{n} ({kind})")
    print("not in the catalog (advisor will link the official page):", placeholders or "none")

    out = sorted(progs.values(), key=lambda p: p["name"])
    for p in out:
        p.pop("_score", None)
    json.dump(out, open(D / "programs.json", "w"), indent=2, ensure_ascii=False)

    titles = {}
    for c in _flat(get(f"/courses/{CATALOG}") or []):
        code = course_code(c)
        if code:
            titles[code] = c.get("title") or ""
    old = {c["code"]: c for c in json.load(open(D / "course_catalog.json"))} if (D / "course_catalog.json").exists() else {}
    for code, t in titles.items():
        old[code] = {"code": code, "title": t, "description": old.get(code, {}).get("description", "")}
    json.dump(sorted(old.values(), key=lambda c: c["code"]), open(D / "course_catalog.json", "w"), indent=1, ensure_ascii=False)
    real = [p for p in out if not p.get("placeholder")]
    kinds = {k: sum(1 for p in real if p["kind"] == k) for k in ("major", "minor")}
    print(f"\n{len(real)} programs from the catalog ({kinds['major']} majors, {kinds['minor']} minors) "
          f"+ {len(placeholders)} admissions-only; {len(titles)} course titles")


if __name__ == "__main__":
    main()
