import logging
import logging.handlers
import time
from datetime import datetime

from config.settings import LOG_DIR, LOG_LEVEL, MAX_JOBS_PER_RUN, SCORE_THRESHOLD
from src.mailer import validate_smtp_config
from src.scorer import RateLimitError, ScorerError, check_groq, draft_email, score_job
from src.scraper import ScraperError, fetch_all_queries
from src.storage import (
    get_unscored_jobs,
    initialize_db,
    insert_jobs,
    log_run,
    update_job_draft,
    update_job_score,
    update_job_status,
)


def setup_logging() -> logging.Logger:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("pipeline")
    logger.setLevel(getattr(logging, LOG_LEVEL, logging.INFO))
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s", "%Y-%m-%d %H:%M:%S")

    fh = logging.handlers.RotatingFileHandler(
        LOG_DIR / "pipeline.log", maxBytes=5 * 1024 * 1024, backupCount=3
    )
    fh.setFormatter(fmt)
    logger.addHandler(fh)

    ch = logging.StreamHandler()
    ch.setFormatter(fmt)
    logger.addHandler(ch)
    return logger


def run_pipeline(progress_cb=None) -> None:
    logger = setup_logging()
    start = time.time()
    stats = {"jobs_fetched": 0, "jobs_new": 0, "jobs_scored": 0, "jobs_drafted": 0, "errors": 0, "duration_sec": 0}

    logger.info("=" * 60)
    logger.info("Job Search Pipeline started")

    initialize_db()

    # Abort early if Groq API key is missing or invalid
    try:
        check_groq()
        logger.info("Groq API is reachable")
    except Exception as e:
        logger.error(str(e))
        return

    # Warn but don't abort if Gmail isn't configured yet
    if not validate_smtp_config():
        logger.warning("Email sending will be unavailable this run")

    # --- Fetch jobs ---
    logger.info("Fetching remote jobs from Indeed...")
    try:
        jobs = fetch_all_queries()
    except ScraperError as e:
        logger.error("Fatal scraper error: %s", e)
        return

    stats["jobs_fetched"] = len(jobs)
    new_count = insert_jobs(jobs)
    stats["jobs_new"] = new_count
    logger.info("Fetched %d jobs, %d are new", len(jobs), new_count)

    # --- Score & draft ---
    all_unscored = get_unscored_jobs()
    unscored = all_unscored[:MAX_JOBS_PER_RUN]
    skipped_count = len(all_unscored) - len(unscored)
    logger.info("Scoring %d new jobs (cap %d/run)%s...",
                len(unscored), MAX_JOBS_PER_RUN,
                f" — {skipped_count} queued for next run" if skipped_count else "")

    for idx, job in enumerate(unscored, 1):
        jid = job["job_id"]
        title_co = f"{job['title']} @ {job['company']}"
        if progress_cb:
            progress_cb(idx, len(unscored), title_co)
        try:
            score, reasoning = score_job(dict(job))
            update_job_score(jid, score, reasoning)
            stats["jobs_scored"] += 1
            logger.info("  [%d/10] %s", score, title_co)

            if score >= SCORE_THRESHOLD:
                subject, body = draft_email(dict(job))
                update_job_draft(jid, subject, body)
                stats["jobs_drafted"] += 1
                logger.info("  → Email drafted")
            else:
                update_job_status(jid, "skipped")

        except RateLimitError as e:
            logger.warning("  Rate limit hit — stopping scoring for today. %s", e)
            logger.warning("  %d jobs remain unscored for next run.", len(unscored) - idx)
            break
        except ScorerError as e:
            update_job_status(jid, "error", error_message=str(e))
            stats["errors"] += 1
            logger.warning("  Failed to score %s: %s", title_co, e)
        except Exception as e:
            update_job_status(jid, "error", error_message=str(e))
            stats["errors"] += 1
            logger.error("  Unexpected error for %s: %s", title_co, e)

    stats["duration_sec"] = round(time.time() - start, 1)
    log_run(stats)

    logger.info("-" * 60)
    logger.info(
        "Done in %.1fs — fetched %d, new %d, scored %d, drafted %d, errors %d",
        stats["duration_sec"], stats["jobs_fetched"], stats["jobs_new"],
        stats["jobs_scored"], stats["jobs_drafted"], stats["errors"],
    )
    logger.info("Open http://localhost:8000 to review today's job matches.")
    logger.info("=" * 60)


if __name__ == "__main__":
    run_pipeline()
