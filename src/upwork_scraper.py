"""
Freelance / remote job scraper using the RemoteOK public API.
Upwork discontinued public RSS feeds — RemoteOK is a free, no-key alternative
that covers the same remote-tech job market.
API docs: https://remoteok.com/api
"""
import hashlib
import logging
import re
import time
from typing import Any

import requests

logger = logging.getLogger("pipeline")

_API_BASE = "https://remoteok.com/api"
_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}

# Map human-readable search terms → RemoteOK tag strings
_TAG_MAP: dict[str, str] = {
    "java backend developer":  "java,backend",
    "spring boot developer":   "spring",
    "technical lead java":     "java",
    "java microservices":      "java,microservices",
    "java developer":          "java",
    "backend developer":       "backend",
    "node.js developer":       "node",
    "python developer":        "python",
    "devops engineer":         "devops",
    "full stack developer":    "fullstack",
    "react developer":         "react",
    "software engineer":       "software-engineer",
}


def _query_to_tags(search_term: str) -> str:
    """Convert a user search term to RemoteOK tag(s)."""
    normalized = search_term.strip().lower()
    if normalized in _TAG_MAP:
        return _TAG_MAP[normalized]
    # Fallback: use first significant word
    words = [w for w in normalized.split() if len(w) > 3 and w not in {"developer", "engineer", "lead", "senior"}]
    return words[0] if words else normalized.split()[0]


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text or "").strip()


def _fetch_remoteok(tags: str) -> list[dict[str, Any]]:
    try:
        resp = requests.get(
            _API_BASE,
            params={"tags": tags},
            headers=_HEADERS,
            timeout=15,
        )
        resp.raise_for_status()
        raw = resp.json()

        # First element is a legal notice dict, skip it
        jobs_raw = [r for r in raw if isinstance(r, dict) and "id" in r]

        jobs = []
        for item in jobs_raw:
            title = (item.get("position") or "").strip()
            apply_url = item.get("url") or item.get("apply_url") or ""
            if not title or not apply_url:
                continue

            job_id = "remoteok_" + str(item.get("id", hashlib.md5(apply_url.encode()).hexdigest()[:10]))
            description = _strip_html(item.get("description") or "")
            company = (item.get("company") or "").strip()
            salary_min = item.get("salary_min")
            salary_max = item.get("salary_max")
            if salary_min and salary_max:
                budget = f"${int(salary_min):,}–${int(salary_max):,}/yr"
            elif salary_min:
                budget = f"${int(salary_min):,}+/yr"
            else:
                budget = ""

            jobs.append({
                "job_id":      job_id,
                "title":       f"{title}{' @ ' + company if company else ''}",
                "description": description,
                "apply_url":   apply_url,
                "posted_at":   item.get("date", "")[:10],
                "budget":      budget,
                "search_query": tags,
            })

        logger.info("RemoteOK tags='%s': %d jobs", tags, len(jobs))
        return jobs

    except Exception as e:
        logger.warning("RemoteOK fetch failed for tags='%s': %s", tags, e)
        return []


def fetch_upwork_jobs(queries: list[str] | None = None) -> list[dict[str, Any]]:
    """Fetch remote jobs from RemoteOK for all enabled search queries."""
    if queries is None:
        from src.storage import get_upwork_queries
        queries = [dict(q)["search_term"] for q in get_upwork_queries(enabled_only=True)]
        if not queries:
            logger.warning("No enabled queries found — nothing to fetch")
            return []

    all_jobs: list[dict[str, Any]] = []
    seen: set[str] = set()

    for query in queries:
        tags = _query_to_tags(query)
        for job in _fetch_remoteok(tags):
            if job["job_id"] not in seen:
                seen.add(job["job_id"])
                all_jobs.append(job)
        time.sleep(1)

    return all_jobs
