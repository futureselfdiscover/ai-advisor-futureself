# AI Advisor (FutureSelf) — Handoff Guide

An AI academic and career advisor for Vanderbilt students, shown as the chat bubble on
futureselfdiscover.com. Answers are grounded in real Vanderbilt data (catalog, degree
requirements, student orgs, career center, BLS salary data), not model memory.

## How a message flows

```
Student types in the chat bubble (proxy/public/widget.js, on futureselfdiscover.com)
  -> Vercel proxy  POST /api/proxy  (proxy/api/proxy.js)
       1. asks the Python backend for verified Vanderbilt data   (ADVISOR_BACKEND_URL)
       2. builds the system prompt (proxy/behavior/*.txt + profile + memory + that data)
       3. calls OpenAI gpt-4o for the reply
       4. for requirements questions, the reply is the backend's clean list (no model text)
       5. logs the turn to Supabase (conversation_logs) and saves memory (user_memory)
  -> Railway backend  POST /chat  (backend/main.py -> backend/advisor/router.py)
       condense follow-up -> classify intent -> pick feature -> answer from data
```

If the backend is slow (>30s) or down, the proxy skips it and the widget still answers
(without verified data). Nothing breaks for students.

## Where everything runs (all on company accounts)

| Piece | Where | Account |
|---|---|---|
| Code | GitHub `futureselfdiscover/ai-advisor-futureself` | company org |
| Widget + proxy | Vercel project `ai-advisor-futureself` (ai-advisor-futureself.vercel.app) | FutureSelf Discover team (Hobby plan) |
| Python backend | Railway project `ai-advisor-backend` (ai-advisor-backend-production-dded.up.railway.app) | fsd@futureselfnetwork.com |
| Database + vector search | Supabase | company |
| Models | OpenAI API (gpt-4o, gpt-4o-mini, text-embedding-3-small) | company key |

## Secrets (names only — values live in the dashboards, never in git)

| Variable | Railway (backend) | Vercel (proxy) | Purpose |
|---|---|---|---|
| OPENAI_API_KEY | yes | yes | model calls |
| SUPABASE_URL | yes | yes | database |
| SUPABASE_KEY | yes | | backend reads (vector search, profiles) |
| SUPABASE_SERVICE_KEY | | yes | proxy writes logs/memory |
| BACKEND_API_KEY | yes | | password the backend requires on /chat |
| ADVISOR_BACKEND_URL | | yes | backend address |
| ADVISOR_BACKEND_KEY | | yes | must equal BACKEND_API_KEY |
| ADMIN_KEY | | yes | unlocks debug + digest admin endpoints |
| USER_HASH_SALT, HIVEBRITE_*, GITHUB_TOKEN, RESEND_API_KEY, CRON_SECRET, DIGEST_* | | yes | profile, digest, email (teammate's features) |

To rotate the backend password: set a new BACKEND_API_KEY in Railway, set the same value as
ADVISOR_BACKEND_KEY in Vercel, then redeploy both.

## Repo map (the parts that matter)

```
proxy/
  api/proxy.js                 Vercel function: prompt, OpenAI call, backend call, logging, memory
  behavior/*.txt               advisor personality and resources (edit text, no code change)
  public/widget.js             the chat bubble
  scripts/test-proxy-local.mjs run the proxy on a laptop against the real backend (no OpenAI cost)
backend/
  main.py                      FastAPI app, POST /chat (API key, history, error handling)
  advisor/router.py            follow-up rewrite -> intent -> AI feature picker -> feature
  advisor/classify_intent.py   in-scope / out-of-scope / vague
  advisor/requirements.py      major/minor requirements: program matching, lists, notes
  advisor/club_matcher.py      clubs (grad/professional school orgs hidden for undergrads)
  advisor/city_explorer.py     salaries by city (BLS data in Supabase)
  advisor/career_coach.py      interview prep, resume feedback, industry paths
  data/scrapers/
    catalog_pages.json         full 2025/26 catalog text, one entry per page
    toc_entries.json           catalog table of contents
    build_programs.py          -> programs.json (every major/minor section, full length)
    extract_requirements.py    -> program_requirements.json (grouped requirements, verified codes)
    course_catalog.json, student_orgs.json, salary_data.json, career_center*.json
  tests/
    test_intent.py             50 prompts, classifier accuracy (target 90%)
    test_router_wording.py     32 phrasings must reach the right feature and program
```

## Deploying

- Proxy/widget: merge to `main` -> Vercel deploys automatically.
- Backend: merge to `main` -> Railway deploys automatically (if GitHub deploys are connected;
  otherwise run `railway up --detach` from `backend/` while logged in as the company account).
- Always work on a branch and open a pull request; never commit secrets.

## Checks before merging backend changes

```bash
cd backend && source venv/bin/activate
python tests/test_intent.py            # must say PASS
python tests/test_router_wording.py    # must say PASS
python advisor/router.py "what do I need for the econ minor"
```

## Yearly catalog update (each new academic year)

1. Get the new Undergraduate Catalog PDF and regenerate `catalog_pages.json` and
   `toc_entries.json` with the existing catalog scraper in `backend/data/scrapers/`.
2. Rebuild and re-extract only what changed:
```bash
   cd backend && source venv/bin/activate
   cp data/scrapers/programs.json /tmp/programs_old.json
   python data/scrapers/build_programs.py > /tmp/build_report.txt; tail -1 /tmp/build_report.txt
   python data/scrapers/extract_requirements.py --since /tmp/programs_old.json
   python data/scrapers/extract_requirements.py --recheck-choices
   python tests/test_router_wording.py
```
3. Search-and-replace "2025–26" / "2025/2026" in `advisor/requirements.py` to the new year.
4. Spot-check a few majors and minors, open a pull request, merge.

Cost: a full re-extraction (`--force`) is roughly $5–10 of gpt-4o; `--since` only redoes
changed programs (usually cents to a few dollars).

## Logs, review, and the weekly digest

- Every turn is logged (emails, phones, and names scrubbed) to Supabase `conversation_logs`,
  with the `feature` and `category` that answered each assistant reply.
- Which features students use most (Supabase SQL editor):
```sql
  select feature, count(*) from conversation_logs
  where role = 'assistant' and created_at > now() - interval '7 days'
  group by feature order by 2 desc;
```
- A weekly cron (Mondays) summarizes questions and emails a suggested behavior change for
  human review at `/digest-review.html` (admin key required).

## Costs

- Vercel Hobby: free (Hobby terms are for non-commercial use; consider Pro).
- Supabase: free tier.
- Railway: small monthly plan on the company account.
- OpenAI: per use. Each reply = a few gpt-4o-mini calls in the backend + one gpt-4o call in
  the proxy. Switching the proxy model to gpt-4o-mini is ~15x cheaper per reply; test quality first.

## Troubleshooting

| Symptom | Check |
|---|---|
| Replies are generic, no Vanderbilt data | `_advisor` is null in the proxy response: Railway down, or ADVISOR_BACKEND_URL / ADVISOR_BACKEND_KEY wrong in Vercel. `railway logs` from `backend/`. |
| Backend returns 401 | ADVISOR_BACKEND_KEY in Vercel differs from BACKEND_API_KEY in Railway. |
| A major or minor is missing or wrong | Look it up in `programs.json` / `program_requirements.json`; fix `build_programs.py` rules, then re-run with `--since`. |
| Wrong feature answers a question | Add the phrasing to `tests/router_wording_cases.json`, adjust `PICKER_PROMPT` in `router.py`, re-run the test. |
| Clubs from law/med/business school show up | Add the category or name pattern in `club_matcher.py`. |

## Known limitations / next steps

- Course planner needs a backend student profile; most students get the requirements list instead.
- Requirements come from the 2025/26 catalog only; students should confirm with their advisor.
- Internship finder (Handshake) is not built yet.
- Course titles come from `course_catalog.json`; some newer courses are missing titles.

## Company explorer and careers pages

- "Take me to the careers page for Asurion" -> `company_careers` feature returns the official careers page (never a job posting).
- "What companies hire nursing grads in Nashville" -> `company_explorer` suggests a short list, then offers "Show their careers pages".
- Links come from `backend/data/companies.json` (hand-checked list). Unknown companies are looked up live and only shown if the page loads on the company's own domain or a known job board.
- Monthly: `python data/scrapers/verify_companies.py` re-checks every link. Sites that block automatic checks: open in a browser, then `--approve "Company Name"`.
- To add or fix a company: edit `companies.json`, run the verify script, commit.
