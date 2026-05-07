import hashlib
import html
import logging
import re
import time
import xml.etree.ElementTree as ET

import requests

from config.settings import (
    JSEARCH_API_KEY,
    REMOTIVE_BASE_URL,
    REMOTIVE_TIMEOUT,
)
from src.storage import get_portal_settings, get_search_queries

logger = logging.getLogger("pipeline")


class ScraperError(Exception):
    pass


def _strip_html(text: str) -> str:
    text = html.unescape(text or "")
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s{2,}", " ", text).strip()


def _is_us_compatible(location: str) -> bool:
    loc = (location or "").strip().lower()
    if not loc:
        return True
    us_patterns = [r"\busa\b", r"\bunited states\b", r"\bworldwide\b", r"\banywhere\b", r"\bremote\b"]
    return any(re.search(p, loc) for p in us_patterns)


# ─── Remotive ────────────────────────────────────────────────────────────────

def _remotive_normalize(raw: dict, search_query: str) -> dict:
    return {
        "job_id":        f"remotive_{raw['id']}",
        "title":         raw.get("title") or "",
        "company":       raw.get("company_name") or "",
        "location":      raw.get("candidate_required_location") or "Remote",
        "remote_model":  "Remote",
        "salary_snippet": raw.get("salary") or "",
        "job_type":      (raw.get("job_type") or "").replace("_", " ").title(),
        "posted_at":     raw.get("publication_date") or "",
        "description":   _strip_html(raw.get("description") or ""),
        "apply_url":     raw.get("url") or "",
        "job_url":       raw.get("url") or "",
        "search_query":  search_query,
    }


def _fetch_remotive(search_term: str) -> list[dict]:
    try:
        resp = requests.get(
            f"{REMOTIVE_BASE_URL}/remote-jobs",
            params={"category": "software-dev", "search": search_term, "limit": 100},
            timeout=REMOTIVE_TIMEOUT,
        )
        if resp.status_code == 429:
            logger.warning("Remotive rate-limited for '%s', waiting 30s", search_term)
            time.sleep(30)
            resp = requests.get(
                f"{REMOTIVE_BASE_URL}/remote-jobs",
                params={"category": "software-dev", "search": search_term, "limit": 100},
                timeout=REMOTIVE_TIMEOUT,
            )
        if resp.status_code != 200:
            logger.warning("Remotive returned %d for '%s'", resp.status_code, search_term)
            return []
        return resp.json().get("jobs", [])
    except requests.exceptions.RequestException as e:
        logger.warning("Remotive network error for '%s': %s", search_term, e)
        return []


# ─── We Work Remotely (WWR) ───────────────────────────────────────────────────

_WWR_FEEDS = [
    ("Programming", "https://weworkremotely.com/categories/remote-programming-jobs.rss"),
    ("DevOps/SysAdmin", "https://weworkremotely.com/categories/remote-devops-sysadmin-jobs.rss"),
]

def _fetch_wwr(search_term: str) -> list[dict]:
    results = []
    kw = search_term.lower().split()
    for _cat, feed_url in _WWR_FEEDS:
        try:
            resp = requests.get(feed_url, timeout=15)
            if resp.status_code != 200:
                continue
            root = ET.fromstring(resp.content)
            for item in root.findall(".//item"):
                title = (item.findtext("title") or "").strip()
                link  = (item.findtext("link") or "").strip()
                desc  = _strip_html(item.findtext("description") or "")
                region = (item.findtext("{https://weworkremotely.com}region") or "Worldwide").strip()
                company_tag = item.findtext("{https://weworkremotely.com}company") or ""
                pub_date = item.findtext("pubDate") or ""

                # Title or description must mention the search keyword
                haystack = f"{title} {desc}".lower()
                if not any(k in haystack for k in kw):
                    continue
                if not _is_us_compatible(region):
                    continue

                # WWR titles are "Company: Title" — split them
                if ": " in title:
                    company_part, title_part = title.split(": ", 1)
                else:
                    company_part, title_part = company_tag or "Unknown", title

                job_id = f"wwr_{hashlib.md5(link.encode()).hexdigest()[:16]}"
                results.append({
                    "job_id":        job_id,
                    "title":         title_part,
                    "company":       company_part,
                    "location":      region,
                    "remote_model":  "Remote",
                    "salary_snippet": "",
                    "job_type":      "Full Time",
                    "posted_at":     pub_date,
                    "description":   desc[:3000],
                    "apply_url":     link,
                    "job_url":       link,
                    "search_query":  search_term,
                })
        except Exception as e:
            logger.warning("WWR feed error for '%s': %s", search_term, e)
    return results


# ─── RemoteOK ────────────────────────────────────────────────────────────────

_REMOTEOK_TAG_MAP = [
    ("spring", "spring"),
    ("ai",     "ai"),
    ("agent",  "ai"),
    ("java",   "java"),
    ("python", "python"),
]

def _search_to_remoteok_tag(search_term: str) -> str:
    term = search_term.lower()
    for kw, tag in _REMOTEOK_TAG_MAP:
        if kw in term:
            return tag
    return "backend"


def _fetch_remoteok(search_term: str) -> list[dict]:
    tag = _search_to_remoteok_tag(search_term)
    try:
        resp = requests.get(
            "https://remoteok.com/api",
            params={"tag": tag},
            headers={"User-Agent": "Mozilla/5.0 (compatible; JobSearchBot/1.0)"},
            timeout=20,
        )
        if resp.status_code == 429:
            logger.warning("RemoteOK rate-limited for tag '%s'", tag)
            return []
        if resp.status_code != 200:
            logger.warning("RemoteOK returned %d for tag '%s'", resp.status_code, tag)
            return []
        data = resp.json()
        # First item is metadata (has 'legal' key, not a job)
        jobs_raw = [item for item in data if isinstance(item, dict) and "position" in item]
        kw = search_term.lower().split()
        results = []
        for raw in jobs_raw:
            haystack = f"{raw.get('position','')} {' '.join(raw.get('tags') or [])} {raw.get('description','')}".lower()
            if not any(k in haystack for k in kw):
                continue
            results.append({
                "job_id":        f"remoteok_{raw['id']}",
                "title":         raw.get("position") or "",
                "company":       raw.get("company") or "",
                "location":      raw.get("location") or "Remote",
                "remote_model":  "Remote",
                "salary_snippet": "",
                "job_type":      "Full Time",
                "posted_at":     raw.get("date") or "",
                "description":   _strip_html(raw.get("description") or "")[:3000],
                "apply_url":     raw.get("url") or "",
                "job_url":       raw.get("url") or "",
                "search_query":  search_term,
            })
        return results
    except Exception as e:
        logger.warning("RemoteOK error for '%s': %s", search_term, e)
        return []


# ─── Himalayas ────────────────────────────────────────────────────────────────

def _fetch_himalayas(search_term: str) -> list[dict]:
    try:
        resp = requests.get(
            "https://himalayas.app/jobs/api",
            params={"q": search_term, "limit": 100},
            headers={"User-Agent": "Mozilla/5.0 (compatible; JobSearchBot/1.0)"},
            timeout=20,
        )
        if resp.status_code == 429:
            logger.warning("Himalayas rate-limited for '%s'", search_term)
            return []
        if resp.status_code != 200:
            logger.warning("Himalayas returned %d for '%s'", resp.status_code, search_term)
            return []
        jobs_raw = resp.json().get("jobs", [])
        results = []
        for raw in jobs_raw:
            company = raw.get("company") or {}
            company_name = company.get("name") if isinstance(company, dict) else str(company)
            job_url = raw.get("applicationUrl") or raw.get("url") or ""
            results.append({
                "job_id":        f"himalayas_{raw['id']}",
                "title":         raw.get("title") or "",
                "company":       company_name or "",
                "location":      raw.get("location") or "Remote",
                "remote_model":  "Remote",
                "salary_snippet": "",
                "job_type":      raw.get("jobType") or "Full Time",
                "posted_at":     raw.get("createdAt") or "",
                "description":   _strip_html(raw.get("description") or "")[:3000],
                "apply_url":     job_url,
                "job_url":       job_url,
                "search_query":  search_term,
            })
        return results
    except Exception as e:
        logger.warning("Himalayas error for '%s': %s", search_term, e)
        return []


# ─── Jobicy ───────────────────────────────────────────────────────────────────

def _fetch_jobicy(search_term: str) -> list[dict]:
    tag = search_term.lower().replace(" ", "-")
    try:
        resp = requests.get(
            "https://jobicy.com/api/v2/remote-jobs",
            params={"count": 50, "tag": tag},
            headers={"User-Agent": "Mozilla/5.0 (compatible; JobSearchBot/1.0)"},
            timeout=20,
        )
        if resp.status_code == 429:
            logger.warning("Jobicy rate-limited for '%s', skipping", search_term)
            return []
        if resp.status_code != 200:
            logger.warning("Jobicy returned %d for '%s'", resp.status_code, search_term)
            return []
        jobs_raw = resp.json().get("jobs", [])
        results = []
        for raw in jobs_raw:
            jtype = raw.get("jobType") or ""
            if isinstance(jtype, list):
                jtype = jtype[0] if jtype else ""
            results.append({
                "job_id":        f"jobicy_{raw['id']}",
                "title":         raw.get("jobTitle") or "",
                "company":       raw.get("companyName") or "",
                "location":      raw.get("jobGeo") or "Remote",
                "remote_model":  "Remote",
                "salary_snippet": "",
                "job_type":      jtype,
                "posted_at":     raw.get("pubDate") or "",
                "description":   _strip_html(raw.get("jobDescription") or raw.get("jobExcerpt") or "")[:3000],
                "apply_url":     raw.get("url") or "",
                "job_url":       raw.get("url") or "",
                "search_query":  search_term,
            })
        return results
    except Exception as e:
        logger.warning("Jobicy error for '%s': %s", search_term, e)
        return []


# ─── JSearch / LinkedIn (RapidAPI) ───────────────────────────────────────────

def _fetch_jsearch(search_term: str, location: str) -> list[dict]:
    if not JSEARCH_API_KEY:
        return []
    query = f"{search_term} in {location}" if location and location != "Remote USA" else search_term
    try:
        resp = requests.get(
            "https://jsearch.p.rapidapi.com/search",
            headers={
                "X-RapidAPI-Key": JSEARCH_API_KEY,
                "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
            },
            params={"query": query, "page": "1", "num_pages": "1", "remote_jobs_only": "true"},
            timeout=20,
        )
        if resp.status_code == 429:
            logger.warning("JSearch rate-limited (monthly quota may be exhausted)")
            return []
        if resp.status_code != 200:
            logger.warning("JSearch returned %d for '%s'", resp.status_code, search_term)
            return []
        jobs = []
        for raw in resp.json().get("data", []):
            job_id = f"jsearch_{raw.get('job_id', abs(hash(raw.get('job_apply_link',''))))}"
            jobs.append({
                "job_id":        job_id,
                "title":         raw.get("job_title") or "",
                "company":       raw.get("employer_name") or "",
                "location":      raw.get("job_city") or raw.get("job_country") or "USA",
                "remote_model":  "Remote" if raw.get("job_is_remote") else "On-site",
                "salary_snippet": _build_salary(raw),
                "job_type":      raw.get("job_employment_type") or "",
                "posted_at":     raw.get("job_posted_at_datetime_utc") or "",
                "description":   _strip_html(raw.get("job_description") or "")[:3000],
                "apply_url":     raw.get("job_apply_link") or "",
                "job_url":       raw.get("job_apply_link") or "",
                "search_query":  search_term,
            })
        return jobs
    except requests.exceptions.RequestException as e:
        logger.warning("JSearch network error for '%s': %s", search_term, e)
        return []


def _build_salary(raw: dict) -> str:
    mn = raw.get("job_min_salary")
    mx = raw.get("job_max_salary")
    period = raw.get("job_salary_period") or ""
    if mn and mx:
        return f"${int(mn):,} – ${int(mx):,} {period}".strip()
    if mn:
        return f"${int(mn):,}+ {period}".strip()
    return ""


# ─── Main entry point ─────────────────────────────────────────────────────────

def fetch_all_queries() -> list[dict]:
    queries  = [dict(q) for q in get_search_queries(enabled_only=True)]
    portals  = {dict(p)["name"]: bool(dict(p)["enabled"]) for p in get_portal_settings()}
    all_jobs: dict[str, dict] = {}

    for q in queries:
        search_term = q["search_term"]
        location    = q["location"]

        if portals.get("remotive", True):
            logger.info("[Remotive] '%s'", search_term)
            for raw in _fetch_remotive(search_term):
                if _is_us_compatible(raw.get("candidate_required_location", "")):
                    job = _remotive_normalize(raw, search_term)
                    all_jobs.setdefault(job["job_id"], job)
            time.sleep(0.5)

        if portals.get("wwr", True):
            logger.info("[WWR] '%s'", search_term)
            for job in _fetch_wwr(search_term):
                all_jobs.setdefault(job["job_id"], job)
            time.sleep(0.5)

        if portals.get("remoteok", True):
            logger.info("[RemoteOK] '%s'", search_term)
            for job in _fetch_remoteok(search_term):
                all_jobs.setdefault(job["job_id"], job)
            time.sleep(1)

        if portals.get("himalayas", True):
            logger.info("[Himalayas] '%s'", search_term)
            for job in _fetch_himalayas(search_term):
                all_jobs.setdefault(job["job_id"], job)
            time.sleep(0.5)

        if portals.get("jobicy", True):
            logger.info("[Jobicy] '%s'", search_term)
            for job in _fetch_jobicy(search_term):
                all_jobs.setdefault(job["job_id"], job)
            time.sleep(1)

        if portals.get("jsearch", False) and JSEARCH_API_KEY:
            logger.info("[JSearch/LinkedIn] '%s' in %s", search_term, location)
            for job in _fetch_jsearch(search_term, location):
                all_jobs.setdefault(job["job_id"], job)
            time.sleep(1)

    sources = {}
    for jid in all_jobs:
        src = jid.split("_")[0]
        sources[src] = sources.get(src, 0) + 1
    logger.info(
        "Total unique jobs: %d — %s",
        len(all_jobs),
        ", ".join(f"{s}: {n}" for s, n in sources.items()),
    )
    return list(all_jobs.values())
