import json
import logging
import re
import threading
import time

from groq import Groq

from config.settings import GROQ_API_KEYS, GROQ_MODEL, RESUME_TEXT, SCORE_THRESHOLD

logger = logging.getLogger("pipeline")

DAILY_LIMIT = 100_000

# ── Key pool state ────────────────────────────────────────────────────────────
_lock = threading.Lock()
_current_idx = 0
_token_counts: dict[int, int] = {}
_exhausted: dict[int, bool] = {}
_db_loaded = False


def _ensure_db_loaded() -> None:
    global _db_loaded, _current_idx
    if _db_loaded:
        return
    with _lock:
        if _db_loaded:
            return
        try:
            from src.storage import get_token_usage_today
            for k_idx, count in get_token_usage_today().items():
                _token_counts[k_idx] = count
                if count >= DAILY_LIMIT:
                    _exhausted[k_idx] = True
            keys = _keys()
            while _current_idx < len(keys) and _exhausted.get(_current_idx, False):
                _current_idx += 1
        except Exception:
            pass
        _db_loaded = True


def _keys() -> list[str]:
    return [k for k in GROQ_API_KEYS if k]


def get_token_stats() -> dict:
    _ensure_db_loaded()
    keys = _keys()
    try:
        from src.storage import get_token_usage_today
        db_counts = get_token_usage_today()
    except Exception:
        db_counts = {}
    with _lock:
        idx = _current_idx
        usage = []
        for i in range(len(keys)):
            # DB is authoritative; in-memory may be higher if 429 inflated it
            tokens_used = max(db_counts.get(i, 0), _token_counts.get(i, 0))
            usage.append({
                "key": i + 1,
                "tokens_used": tokens_used,
                "limit": DAILY_LIMIT,
                "exhausted": _exhausted.get(i, False),
                "pct": min(100, round(tokens_used / DAILY_LIMIT * 100, 1)),
            })
    return {
        "keys_total": len(keys),
        "active_key": min(idx + 1, len(keys)),
        "total_available": len(keys) * DAILY_LIMIT,
        "total_used": sum(u["tokens_used"] for u in usage),
        "keys": usage,
    }


# ── Prompts ───────────────────────────────────────────────────────────────────

_SCORING_PROMPT = """You are a job-fit analyst. Evaluate how well this candidate's resume matches the job posting.

CANDIDATE RESUME:
{resume}

JOB POSTING:
Title: {title}
Company: {company}
Location: {location}
Job Type: {job_type}
Description:
{description}

Score this job from 1 to 10:
- 1-3: Poor fit (wrong stack, wrong level, or major skill gaps)
- 4-6: Partial fit (some overlap but significant gaps)
- 7-8: Good fit (strong skill overlap, appropriate level)
- 9-10: Excellent fit (near-perfect match)

Respond ONLY with a valid JSON object, no other text:
{{"score": <integer 1-10>, "reasoning": "<2-3 sentence explanation>", "key_matches": ["<matched skill>"], "key_gaps": ["<missing skill>"]}}"""

_EMAIL_PROMPT = """You are a professional job application assistant helping a software developer write outreach emails.

CANDIDATE RESUME:
{resume}

JOB POSTING:
Title: {title}
Company: {company}
Description:
{description}

Write a concise, personalised cold outreach email applying for this role. Rules:
- 150-200 words maximum
- Open with something specific about this company or role (not generic)
- Highlight 2-3 resume achievements most relevant to THIS job
- End with a clear, low-pressure call to action
- Sound like a real human, not a template

Respond ONLY with a valid JSON object:
{{"subject": "<professional subject line specific to this role>", "body": "<full email body with \\n for line breaks>"}}"""


# ── Exceptions ────────────────────────────────────────────────────────────────

class ScorerError(Exception):
    pass


class RateLimitError(ScorerError):
    """All Groq keys have hit their daily token limit."""
    pass


# ── Core Groq call with key rotation ─────────────────────────────────────────

def _call_groq(prompt: str, temperature: float = 0.3) -> str:
    global _current_idx
    _ensure_db_loaded()
    keys = _keys()
    if not keys:
        raise ScorerError("No GROQ_API_KEY configured.")

    for _ in range(len(keys)):
        with _lock:
            idx = _current_idx

        if idx >= len(keys):
            break

        try:
            response = Groq(api_key=keys[idx]).chat.completions.create(
                model=GROQ_MODEL,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant. Always respond with valid JSON only."},
                    {"role": "user", "content": prompt},
                ],
                response_format={"type": "json_object"},
                temperature=temperature,
                max_tokens=600,
            )
            if response.usage:
                delta = response.usage.total_tokens
                with _lock:
                    _token_counts[idx] = _token_counts.get(idx, 0) + delta
                try:
                    from src.storage import upsert_token_usage
                    upsert_token_usage(idx, delta)
                except Exception:
                    pass
            time.sleep(1.5)
            return response.choices[0].message.content

        except Exception as e:
            msg = str(e)
            if "429" in msg and ("tokens per day" in msg or "TPD" in msg):
                with _lock:
                    _exhausted[idx] = True
                    # Don't inflate to DAILY_LIMIT — keep the actual accumulated count
                    if _current_idx == idx:
                        _current_idx = idx + 1
                    next_idx = _current_idx
                if next_idx < len(keys):
                    logger.info(
                        "Key %d/%d daily limit reached → rotating to key %d/%d",
                        idx + 1, len(keys), next_idx + 1, len(keys),
                    )
                    continue
                break
            raise

    raise RateLimitError(
        f"All {len(keys)} Groq API keys have reached their 100k/day token limit. "
        "Scoring will resume tomorrow when the quota resets."
    )


# ── JSON parsing ──────────────────────────────────────────────────────────────

def _parse_json(raw: str, required_keys: list[str]) -> dict:
    text = re.sub(r"```(?:json)?", "", raw).strip().strip("`").strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", text)
        if not match:
            raise ScorerError(f"No JSON object found in model response: {raw[:200]}")
        data = json.loads(match.group())
    missing = [k for k in required_keys if k not in data]
    if missing:
        raise ScorerError(f"Missing keys {missing} in response: {data}")
    return data


# ── Public API ────────────────────────────────────────────────────────────────

def check_groq() -> None:
    keys = _keys()
    if not keys:
        raise ScorerError(
            "No GROQ_API_KEY configured.\n"
            "Get a free key at https://console.groq.com → API Keys → Create API Key\n"
            "Then add it as a Railway environment variable."
        )
    last_err = None
    for key in keys:
        try:
            Groq(api_key=key).models.list()
            return
        except Exception as e:
            last_err = e
    raise ScorerError(f"All Groq API keys are invalid or unreachable: {last_err}")


def score_job(job: dict) -> tuple[int, str]:
    desc = (job.get("description") or "")[:2000]
    prompt = _SCORING_PROMPT.format(
        resume=RESUME_TEXT.strip(),
        title=job.get("title", ""),
        company=job.get("company", ""),
        location=job.get("location", ""),
        job_type=job.get("job_type", ""),
        description=desc,
    )
    for attempt in range(2):
        try:
            raw = _call_groq(prompt, temperature=0.3)
            data = _parse_json(raw, ["score", "reasoning"])
            score = max(1, min(10, int(data["score"])))
            return score, data.get("reasoning", "")
        except RateLimitError:
            raise
        except ScorerError as e:
            if attempt == 0:
                logger.warning("Score parse failed (attempt 1), retrying: %s", e)
                continue
            raise
    raise ScorerError("Score parsing failed after 2 attempts")


def draft_email(job: dict) -> tuple[str, str]:
    desc = (job.get("description") or "")[:2000]
    prompt = _EMAIL_PROMPT.format(
        resume=RESUME_TEXT.strip(),
        title=job.get("title", ""),
        company=job.get("company", ""),
        description=desc,
    )
    for attempt in range(2):
        try:
            raw = _call_groq(prompt, temperature=0.6)
            data = _parse_json(raw, ["subject", "body"])
            return data["subject"], data["body"]
        except RateLimitError:
            raise
        except ScorerError as e:
            if attempt == 0:
                logger.warning("Email draft parse failed (attempt 1), retrying: %s", e)
                continue
            raise
    raise ScorerError("Email draft parsing failed after 2 attempts")
