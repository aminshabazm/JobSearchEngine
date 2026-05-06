import json
import logging
import re
import time

from groq import Groq

from config.settings import GROQ_API_KEY, GROQ_MODEL, RESUME_TEXT, SCORE_THRESHOLD

logger = logging.getLogger("pipeline")

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


class ScorerError(Exception):
    pass


class RateLimitError(ScorerError):
    """Raised when Groq daily token limit is reached — signals the pipeline to stop scoring."""
    pass


def _client() -> Groq:
    if not GROQ_API_KEY:
        raise ScorerError(
            "GROQ_API_KEY is not set. "
            "Get a free key at https://console.groq.com → API Keys → Create API Key, "
            "then set it in run_pipeline.bat or Railway environment variables."
        )
    return Groq(api_key=GROQ_API_KEY)


def _call_groq(prompt: str, temperature: float = 0.3) -> str:
    try:
        response = _client().chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {"role": "system", "content": "You are a helpful assistant. Always respond with valid JSON only."},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=temperature,
            max_tokens=600,
        )
        time.sleep(1.5)  # stay within per-minute token limits
        return response.choices[0].message.content
    except Exception as e:
        msg = str(e)
        if "429" in msg and ("tokens per day" in msg or "TPD" in msg):
            raise RateLimitError("Groq daily token limit (100k/day) reached. Scoring will resume tomorrow.")
        raise


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


def check_groq() -> None:
    """Raises ScorerError if the Groq API key is missing or invalid."""
    if not GROQ_API_KEY:
        raise ScorerError(
            "GROQ_API_KEY is not set.\n"
            "Get a free key at https://console.groq.com → API Keys → Create API Key\n"
            "Then add it to run_pipeline.bat:  set GROQ_API_KEY=gsk_xxxxxxxxxxxx\n"
            "Or set it as a Railway environment variable for cloud deployment."
        )
    # Quick validation — list models to confirm key works
    try:
        _client().models.list()
    except Exception as e:
        raise ScorerError(f"Groq API key invalid or unreachable: {e}")


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
            raise  # never retry on daily limit — propagate immediately
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
