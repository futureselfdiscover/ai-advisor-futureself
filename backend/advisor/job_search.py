"""
backend/advisor/job_search.py

Guided job search: "find a job in Chicago" -> one question about what they want ->
companies that fit, each with its careers link.
"""
import json
import os
import re
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

from careers import suggest_companies, explorer_html, explorer_brief

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

JOB = re.compile(r"\b(find|get|land|looking for|look for|search(ing)? for|apply(ing)?( to| for)?|hunt(ing)?)\b.*"
                 r"\b(jobs?|internships?|work|positions?|roles?)\b|\bjob (search|hunt)|\binternships? in\b|\bjobs? (in|at|near)\b|\bwhere (can|could|should|would|do|does)\b.{0,50}\bwork\b|\b(companies|employers|organizations|places|nonprofits|startups)\b.{0,30}\b(hire|hires|hiring|for)\b|\bwho hires\b",
                 re.I)
PAY = re.compile(r"\b(make|makes|salary|salaries|pay|paid|earn|wages?|cost of living|afford|rent|where should i live|which city)",
                 re.I)
_client = None


def _ai():
    global _client
    if _client is None:
        _client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
    return _client


def _is_job(text):
    return bool(JOB.search(text or "")) and not PAY.search(text or "")


def _context(message, history):
    turns = [t for t in (history or []) if t.get("role") in ("user", "assistant")][-6:]
    convo = "\n".join(f"{t['role']}: {re.sub(r'<[^>]+>', ' ', str(t.get('content', '')))[:400]}" for t in turns)
    r = _ai().chat.completions.create(
        model="gpt-4o-mini", temperature=0, max_tokens=150, response_format={"type": "json_object"},
        messages=[{"role": "system", "content":
                   "A student is talking to a career advisor. Reply with JSON: "
                   '{"job_search": true if the latest message is about finding a job or internship, or answers the '
                   "advisor's question during a job or internship search, otherwise false, "
                   '"field": the kind of work or industry they want (e.g. "marketing", "nursing"), or null, '
                   '"location": US city or region, or null, '
                   '"preferences": short phrase of anything else they care about (company size, mission, pay, remote), or null, '
                   '"company_type": kind of employer they asked for (startup, fortune 500, big tech, big four, consulting firm, nonprofit, government, small business), or null}'},
                  {"role": "user", "content": f"Conversation:\n{convo}\n\nLatest message: {message}"}])
    return json.loads(r.choices[0].message.content) or {}


def wrap_route(route_fn):
    def route(message, user_hash=None, history=None):
        prev = [str(t.get("content", "")) for t in (history or []) if t.get("role") == "user"][-2:]
        if not (_is_job(message) or any(_is_job(u) for u in prev)):
            return route_fn(message, user_hash, history)
        try:
            ctx = _context(message, history)
        except Exception:
            return route_fn(message, user_hash, history)
        if not ctx.get("job_search") and not _is_job(message):
            return route_fn(message, user_hash, history)
        field, location, prefs = ctx.get("field"), ctx.get("location"), ctx.get("preferences")
        if not field:
            where = f" in {location}" if location else ""
            q = (f"I can help you find companies{where} and link you to their careers pages. What kind of work "
                 f"are you looking for, and what matters most to you (industry, company size, mission, pay, remote)?")
            return {"answer": q, "feature": "clarifying_question", "category": "career_coaching", "question": message}
        want = " ".join(x for x in [field, f"in {location}" if location else "", f"({prefs})" if prefs else ""] if x)
        picks = suggest_companies(field=field, location=location, message=f"Student wants a job: {want}. Company type: {ctx.get('company_type') or 'any'}. {message}")
        if not picks:
            return route_fn(message, user_hash, history)
        return {"answer": explorer_brief(picks), "feature": "company_explorer", "category": "career_coaching",
                "question": message, "display_html": explorer_html(picks, field, location), "brief": explorer_brief(picks)}
    return route
