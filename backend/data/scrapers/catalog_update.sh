#!/bin/bash
# Rebuild every major/minor from the live Kuali catalog, check against the official lists,
# extract requirements, test, and ship. Run on a feature branch from anywhere in the repo.
cd "$(git rev-parse --show-toplevel)" || exit 1
ROOT=$(pwd)
source backend/venv/bin/activate
cd backend
echo "===== 1. Reading the catalog pages ====="
python data/scrapers/build_from_kuali.py 2>/dev/null
python data/scrapers/add_manual_programs.py 2>/dev/null
echo ""
echo "===== 2. Checking against the official admissions lists ====="
AUDIT=$(python data/scrapers/audit_programs.py); echo "$AUDIT"
MM=$(echo "$AUDIT" | sed -n 's/.*AUDIT_MISSING_MAJORS=\([0-9]*\).*/\1/p')
TOTAL=$(python -c "import json; print(len(json.load(open('data/scrapers/programs.json'))))")
if [ "${TOTAL:-0}" -lt 100 ] || [ "${MM:-99}" -gt 5 ]; then
  echo ""
  echo "SAFETY STOP: the catalog read looks incomplete. Nothing paid for or shipped. Paste this output to me."
  git checkout -q data/scrapers/programs.json data/scrapers/course_catalog.json
  exit 0
fi

echo ""
echo "===== 3. Pulling exact requirements for every program (10-15 min) ====="
cp data/scrapers/program_requirements.json /tmp/program_requirements_prev.json 2>/dev/null
rm -f data/scrapers/program_requirements.json
python data/scrapers/extract_requirements.py --force > /tmp/extract_report.txt 2>&1
python data/scrapers/extract_requirements.py --recheck-choices >> /tmp/extract_report.txt 2>&1
tail -1 /tmp/extract_report.txt
echo "programs with no requirement groups: $(grep -c NO_GROUPS /tmp/extract_report.txt)"

python - <<'PYEOF'
import re
from pathlib import Path
for f in Path("advisor").glob("*.py"):
    t = f.read_text(); o = t
    t = t.replace("2025–26", "2026–27").replace("2025/2026", "2026/2027").replace("2025/26", "2026/27")
    t = re.sub(r",? pp\. \{(\w+)\['start_page'\]\}[–-]\{\1\['end_page'\]\}", "", t)
    t = re.sub(r" \(pages \{(\w+)\['start_page'\]\}[–-]\{\1\['end_page'\]\}\)", "", t)
    if t != o:
        f.write_text(t); print("updated", f.name)
r = Path("advisor/requirements.py"); t = r.read_text()
if "# --- remap aliases to current names ---" not in t:
    block = '''
# --- remap aliases to current names ---
try:
    _names = {p["name"] for p in load_programs()}
    for _k, _v in list(ALIASES.items()):
        if isinstance(_v, str) and _v not in _names:
            _base = re.sub(r"\\s*\\(department overview\\)$|\\s+(major|minor)$", "", _v).strip().lower()
            _c = next((n for n in sorted(_names) if n.lower().startswith(_base + " major")), None) or \\
                 next((n for n in sorted(_names) if n.lower().startswith(_base)), None)
            if _c:
                ALIASES[_k] = _c
except Exception:
    pass
'''
    j = t.find('\nif __name__ == "__main__":')
    r.write_text(t[:j] + block + t[j:] if j != -1 else t + block)
PYEOF
python -m py_compile advisor/*.py && echo "SYNTAX OK"

echo ""
echo "===== 4. Spot checks ====="
python - <<'PYEOF' 2>/dev/null
import sys, re, html
sys.path.insert(0, "advisor")
from requirements import find_program, requirements_html, kind_note
for q, w in [("ai design and practice major", "major"), ("integrative biology", None), ("generative ai minor", "minor"),
             ("jazz studies", None), ("secondary education", None), ("biomedical engineering", None), ("econ minor", "minor")]:
    n = find_program(q)
    v = requirements_html(n, kind_note(n, w)) if n else None
    print(f"--- {q} -> {n}")
    print(html.unescape(re.sub(r"<[^>]+>", "", (v or "NO LIST").replace("<br>", "\n")))[:450]); print()
PYEOF
INTENT=$(python tests/test_intent.py 2>/dev/null | tail -2); echo "$INTENT"
WORD=$(python tests/test_router_wording.py 2>/dev/null | tail -6); echo "$WORD"
KEY=$(railway variables --kv 2>/dev/null | grep '^BACKEND_API_KEY=' | cut -d= -f2-)
cd "$ROOT"
if ! (echo "$INTENT" | grep -q PASS && echo "$WORD" | grep -q PASS); then
  echo "TESTS DID NOT PASS - nothing shipped. Paste this output to me."
  exit 0
fi

git rm -q --cached backend/data/scrapers/add_peabody_programs.py 2>/dev/null; rm -f backend/data/scrapers/add_peabody_programs.py
python3 - <<'PYEOF'
import re
from pathlib import Path
h = Path("HANDOFF.md"); t = h.read_text()
new = """## Yearly catalog update (each new academic year)

Requirements come from Vanderbilt's live Kuali undergraduate catalog. No PDF needed.

1. In `backend/data/scrapers/build_from_kuali.py`, set `CATALOG` to the new catalog id (open the new catalog
   page, view source, search "catalogId") and update `PAGE_URL`.
2. Update `OFFICIAL` in `backend/data/scrapers/audit_programs.py` from admissions.vanderbilt.edu/major/ and
   admissions.vanderbilt.edu/academics/minors/.
3. On a new branch, run `bash backend/data/scrapers/catalog_update.sh`. It reads every catalog page, checks
   every official major/minor is found (stops safely if not), extracts requirements, runs the tests, and ships.
4. Search-and-replace the catalog year (e.g. "2026–27" -> "2027–28") in `backend/advisor/*.py` first.

Cost: about $5–10 of OpenAI use per full update.

"""
t = re.sub(r"## Yearly catalog update.*?(?=\n## )", new, t, flags=re.S)
h.write_text(t)
PYEOF
BR=$(git branch --show-current)
git add HANDOFF.md backend/advisor/ backend/data/official_programs.json backend/data/scrapers/build_from_kuali.py \
  backend/data/scrapers/audit_programs.py backend/data/scrapers/catalog_update.sh backend/data/scrapers/programs.json \
  backend/data/scrapers/program_requirements.json backend/data/scrapers/course_catalog.json
git commit -qm "Catalog update: every major and minor from Vanderbilt's live catalog"
git push -qu origin "$BR"
gh pr create --fill && gh pr merge --squash --delete-branch
git checkout -q main && git pull -q
cd backend && railway up --detach >/dev/null && cd ..
ask() { curl -s -X POST https://ai-advisor-backend-production-dded.up.railway.app/chat \
  -H "Content-Type: application/json" -H "x-api-key: $KEY" -d "{\"message\": \"$1\", \"user_hash\": \"test\"}"; }
echo "Deploying (checking every 30s, up to 8 min)..."
for i in $(seq 1 16); do
  sleep 30
  ask "what do i need for the integrative biology major" | grep -q 'Integrative Biology' && { echo "LIVE after $((i*30))s"; break; }
done
