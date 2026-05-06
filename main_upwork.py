import logging
import logging.handlers
import time

from config.settings import LOG_DIR, LOG_LEVEL, MAX_JOBS_PER_RUN, SCORE_THRESHOLD
from src.scorer import RateLimitError, ScorerError, check_groq, score_job
from src.storage import (
    get_unscored_upwork_jobs,
    initialize_db,
    insert_upwork_jobs,
    update_upwork_job_score,
    update_upwork_job_status,
)
from src.upwork_scraper import fetch_upwork_jobs


def setup_logging() -> logging.Logger:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    logger = logging.getLogger("pipeline")
    if logger.handlers:
        return logger
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


def run_upwork_pipeline(progress_cb=None) -> None:
    logger = setup_logging()
    start = time.time()

    logger.info("=" * 60)
    logger.info("Upwork Pipeline started")

    initialize_db()

    try:
        check_groq()
        logger.info("Groq API is reachable")
    except Exception as e:
        logger.error(str(e))
        return

    # Fetch
    logger.info("Fetching jobs from Upwork RSS...")
    jobs = fetch_upwork_jobs()
    new_count = insert_upwork_jobs(jobs)
    logger.info("Fetched %d Upwork jobs, %d are new", len(jobs), new_count)

    # Score
    all_unscored = get_unscored_upwork_jobs()
    unscored = all_unscored[:MAX_JOBS_PER_RUN]
    skipped_count = len(all_unscored) - len(unscored)
    logger.info("Scoring %d new Upwork jobs (cap %d/run)%s...",
                len(unscored), MAX_JOBS_PER_RUN,
                f" — {skipped_count} queued for next run" if skipped_count else "")

    scored = errors = 0
    for idx, job in enumerate(unscored, 1):
        jid = job["job_id"]
        title = job["title"]
        if progress_cb:
            progress_cb(idx, len(unscored), title)
        try:
            score, reasoning = score_job(dict(job))
            update_upwork_job_score(jid, score, reasoning)
            scored += 1
            logger.info("  [%d/10] %s", score, title)
            if score < SCORE_THRESHOLD:
                update_upwork_job_status(jid, "skipped")
        except RateLimitError as e:
            logger.warning("  Rate limit hit — stopping Upwork scoring for today. %s", e)
            break
        except ScorerError as e:
            update_upwork_job_status(jid, "error", error_message=str(e))
            errors += 1
            logger.warning("  Failed: %s — %s", title, e)
        except Exception as e:
            update_upwork_job_status(jid, "error", error_message=str(e))
            errors += 1
            logger.error("  Unexpected error for %s: %s", title, e)

    duration = round(time.time() - start, 1)
    logger.info("-" * 60)
    logger.info(
        "Upwork done in %.1fs — fetched %d, new %d, scored %d, errors %d",
        duration, len(jobs), new_count, scored, errors,
    )
    logger.info("=" * 60)


if __name__ == "__main__":
    run_upwork_pipeline()
