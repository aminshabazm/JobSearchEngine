import sqlite3
from datetime import datetime, timezone
from pathlib import Path

from config.settings import DB_PATH

_SCHEMA = """
CREATE TABLE IF NOT EXISTS portal_settings (
    name             TEXT PRIMARY KEY,
    label            TEXT NOT NULL,
    enabled          INTEGER NOT NULL DEFAULT 1,
    api_key_required INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS search_queries (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    search_term TEXT NOT NULL,
    location    TEXT NOT NULL DEFAULT 'Remote USA',
    work_mode   TEXT NOT NULL DEFAULT 'Remote',
    enabled     INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS jobs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id          TEXT UNIQUE NOT NULL,
    title           TEXT NOT NULL,
    company         TEXT NOT NULL,
    location        TEXT,
    remote_model    TEXT,
    salary_snippet  TEXT,
    job_type        TEXT,
    posted_at       TEXT,
    description     TEXT,
    apply_url       TEXT,
    job_url         TEXT,
    score           INTEGER,
    score_reasoning TEXT,
    email_subject   TEXT,
    email_body      TEXT,
    status          TEXT NOT NULL DEFAULT 'new',
    error_message   TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    reviewed_at     TEXT,
    sent_at         TEXT,
    search_query    TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_score  ON jobs(score DESC);

CREATE TABLE IF NOT EXISTS run_log (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    run_at       TEXT NOT NULL DEFAULT (datetime('now')),
    jobs_fetched INTEGER DEFAULT 0,
    jobs_new     INTEGER DEFAULT 0,
    jobs_scored  INTEGER DEFAULT 0,
    jobs_drafted INTEGER DEFAULT 0,
    errors       INTEGER DEFAULT 0,
    duration_sec REAL
);
"""


def get_connection() -> sqlite3.Connection:
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def initialize_db() -> None:
    with get_connection() as conn:
        conn.executescript(_SCHEMA)
        for migration in [
            "ALTER TABLE search_queries ADD COLUMN work_mode TEXT NOT NULL DEFAULT 'Remote'",
            "ALTER TABLE jobs ADD COLUMN is_saved INTEGER NOT NULL DEFAULT 0",
        ]:
            try:
                conn.execute(migration)
            except Exception:
                pass
    from config.settings import SEARCH_QUERIES
    seed_search_queries(SEARCH_QUERIES)
    _seed_portal_settings()


def insert_jobs(jobs: list[dict]) -> int:
    if not jobs:
        return 0
    cols = [
        "job_id", "title", "company", "location", "remote_model",
        "salary_snippet", "job_type", "posted_at", "description",
        "apply_url", "job_url", "search_query",
    ]
    placeholders = ", ".join(f":{c}" for c in cols)
    sql = f"INSERT OR IGNORE INTO jobs ({', '.join(cols)}) VALUES ({placeholders})"
    rows = [{c: job.get(c) for c in cols} for job in jobs]
    with get_connection() as conn:
        cursor = conn.executemany(sql, rows)
        return cursor.rowcount


def get_unscored_jobs() -> list[sqlite3.Row]:
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM jobs WHERE status = 'new' ORDER BY created_at ASC"
        ).fetchall()


def get_pending_jobs(min_score: int = 0) -> list[sqlite3.Row]:
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM jobs WHERE status = 'pending' AND score >= ? ORDER BY score DESC",
            (min_score,),
        ).fetchall()


def get_all_jobs(status: str | None = None, min_score: int = 0) -> list[sqlite3.Row]:
    with get_connection() as conn:
        if status:
            return conn.execute(
                "SELECT * FROM jobs WHERE status = ? AND (score IS NULL OR score >= ?) ORDER BY score DESC, created_at DESC",
                (status, min_score),
            ).fetchall()
        return conn.execute(
            "SELECT * FROM jobs WHERE (score IS NULL OR score >= ?) ORDER BY score DESC, created_at DESC",
            (min_score,),
        ).fetchall()


def get_job(job_id: str) -> sqlite3.Row | None:
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM jobs WHERE job_id = ?", (job_id,)
        ).fetchone()


def update_job_score(job_id: str, score: int, reasoning: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE jobs SET score = ?, score_reasoning = ?, status = 'scored' WHERE job_id = ?",
            (score, reasoning, job_id),
        )


def update_job_draft(job_id: str, subject: str, body: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE jobs SET email_subject = ?, email_body = ?, status = 'pending' WHERE job_id = ?",
            (subject, body, job_id),
        )


def update_job_email(job_id: str, subject: str, body: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE jobs SET email_subject = ?, email_body = ? WHERE job_id = ?",
            (subject, body, job_id),
        )


def update_job_status(job_id: str, status: str, **kwargs) -> None:
    allowed = {"error_message", "reviewed_at", "sent_at"}
    extras = {k: v for k, v in kwargs.items() if k in allowed}
    sets = ", ".join(f"{k} = ?" for k in extras)
    values = list(extras.values())
    if sets:
        sql = f"UPDATE jobs SET status = ?, {sets} WHERE job_id = ?"
        values = [status] + values + [job_id]
    else:
        sql = "UPDATE jobs SET status = ? WHERE job_id = ?"
        values = [status, job_id]
    with get_connection() as conn:
        conn.execute(sql, values)


def get_stats() -> dict:
    with get_connection() as conn:
        counts = {}
        for row in conn.execute("SELECT status, COUNT(*) as n FROM jobs GROUP BY status"):
            counts[row["status"]] = row["n"]
        last_run = conn.execute(
            "SELECT * FROM run_log ORDER BY id DESC LIMIT 1"
        ).fetchone()
        return {
            "counts": counts,
            "total": sum(counts.values()),
            "last_run": dict(last_run) if last_run else None,
        }


def _seed_portal_settings() -> None:
    portals = [
        ("remotive", "Remotive",             1, 0),
        ("wwr",      "We Work Remotely",     1, 0),
        ("jsearch",  "LinkedIn (JSearch)",   0, 1),
    ]
    with get_connection() as conn:
        for name, label, enabled, req_key in portals:
            conn.execute(
                "INSERT OR IGNORE INTO portal_settings (name, label, enabled, api_key_required) VALUES (?,?,?,?)",
                (name, label, enabled, req_key),
            )


def get_portal_settings() -> list[sqlite3.Row]:
    with get_connection() as conn:
        return conn.execute("SELECT * FROM portal_settings ORDER BY name").fetchall()


def toggle_portal(name: str, enabled: bool) -> bool:
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE portal_settings SET enabled = ? WHERE name = ?",
            (1 if enabled else 0, name),
        )
        return cursor.rowcount > 0


def save_job(job_id: str, saved: bool) -> bool:
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE jobs SET is_saved = ? WHERE job_id = ?",
            (1 if saved else 0, job_id),
        )
        return cursor.rowcount > 0


def get_saved_jobs() -> list[sqlite3.Row]:
    with get_connection() as conn:
        return conn.execute(
            "SELECT * FROM jobs WHERE is_saved = 1 ORDER BY score DESC, created_at DESC"
        ).fetchall()


def delete_job(job_id: str) -> bool:
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM jobs WHERE job_id = ?", (job_id,))
        return cursor.rowcount > 0


def clear_all_jobs() -> int:
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM jobs")
        conn.execute("DELETE FROM run_log")
        return cursor.rowcount


def get_search_queries(enabled_only: bool = False) -> list[sqlite3.Row]:
    with get_connection() as conn:
        if enabled_only:
            return conn.execute(
                "SELECT * FROM search_queries WHERE enabled = 1 ORDER BY id ASC"
            ).fetchall()
        return conn.execute("SELECT * FROM search_queries ORDER BY id ASC").fetchall()


def add_search_query(search_term: str, location: str, work_mode: str = "Remote") -> sqlite3.Row:
    with get_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO search_queries (search_term, location, work_mode) VALUES (?, ?, ?)",
            (search_term.strip(), location.strip(), work_mode.strip()),
        )
        return conn.execute(
            "SELECT * FROM search_queries WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()


def delete_search_query(query_id: int) -> bool:
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM search_queries WHERE id = ?", (query_id,))
        return cursor.rowcount > 0


def toggle_search_query(query_id: int, enabled: bool) -> bool:
    with get_connection() as conn:
        cursor = conn.execute(
            "UPDATE search_queries SET enabled = ? WHERE id = ?",
            (1 if enabled else 0, query_id),
        )
        return cursor.rowcount > 0


def seed_search_queries(queries: list[tuple[str, str]]) -> None:
    """Seed default queries if the table is empty."""
    with get_connection() as conn:
        count = conn.execute("SELECT COUNT(*) FROM search_queries").fetchone()[0]
        if count == 0:
            conn.executemany(
                "INSERT INTO search_queries (search_term, location) VALUES (?, ?)",
                queries,
            )


def log_run(stats: dict) -> None:
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO run_log (jobs_fetched, jobs_new, jobs_scored, jobs_drafted, errors, duration_sec)
               VALUES (:jobs_fetched, :jobs_new, :jobs_scored, :jobs_drafted, :errors, :duration_sec)""",
            stats,
        )
