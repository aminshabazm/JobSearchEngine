import re
import secrets
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.base import BaseHTTPMiddleware

from src.mailer import send_email
from src.storage import (
    add_search_query,
    add_upwork_query,
    clear_all_jobs,
    clear_all_upwork_jobs,
    cleanup_expired_sessions,
    create_session,
    delete_job,
    delete_search_query,
    delete_session,
    delete_upwork_job,
    delete_upwork_query,
    get_all_jobs,
    get_all_upwork_jobs,
    get_job,
    get_portal_settings,
    get_saved_jobs,
    get_saved_upwork_jobs,
    get_search_queries,
    get_stats,
    get_upwork_job,
    get_upwork_queries,
    get_upwork_stats,
    initialize_db,
    save_job,
    save_upwork_job,
    toggle_portal,
    toggle_search_query,
    toggle_upwork_query,
    update_job_email,
    update_job_status,
    update_upwork_job_status,
    validate_session,
)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")

app = FastAPI(
    title="Job Search Engine",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

SESSION_TTL = 7 * 24 * 3600  # 7 days
_LOGIN_ATTEMPTS: dict[str, list[float]] = {}
_LOGIN_LOCK = threading.Lock()


class AuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path == "/api/login" or not path.startswith("/api/"):
            return await call_next(request)
        token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        if not validate_session(token):
            return JSONResponse({"detail": "Not authenticated"}, status_code=401)
        return await call_next(request)


app.add_middleware(AuthMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

initialize_db()

# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class LoginPayload(BaseModel):
    username: str
    password: str


@app.post("/api/login")
def api_login(payload: LoginPayload, request: Request):
    from config.settings import APP_USERNAME, APP_PASSWORD
    if not APP_PASSWORD:
        raise HTTPException(status_code=503, detail="APP_PASSWORD not configured on server")

    # Brute-force protection: max 10 attempts per IP per 15 minutes
    ip = request.client.host if request.client else "unknown"
    now = time.time()
    window = 15 * 60
    with _LOGIN_LOCK:
        attempts = [t for t in _LOGIN_ATTEMPTS.get(ip, []) if now - t < window]
        if len(attempts) >= 10:
            raise HTTPException(status_code=429, detail="Too many login attempts. Try again in 15 minutes.")
        attempts.append(now)
        _LOGIN_ATTEMPTS[ip] = attempts

    if payload.username == APP_USERNAME and payload.password == APP_PASSWORD:
        token = secrets.token_hex(32)
        create_session(token, now + SESSION_TTL)
        cleanup_expired_sessions()
        return {"ok": True, "token": token}
    raise HTTPException(status_code=401, detail="Invalid username or password")


@app.post("/api/logout")
def api_logout(request: Request):
    token = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    delete_session(token)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Main pipeline state
# ---------------------------------------------------------------------------
_pipeline_lock = threading.Lock()
_pipeline_state = {"running": False, "started_at": None, "last_result": None, "progress": None}


def _run_pipeline_task():
    try:
        from main import run_pipeline
        def _progress_cb(current, total, label):
            with _pipeline_lock:
                _pipeline_state["progress"] = {"current": current, "total": total, "label": label}
        run_pipeline(progress_cb=_progress_cb)
        with _pipeline_lock:
            _pipeline_state["last_result"] = "success"
    except Exception as e:
        with _pipeline_lock:
            _pipeline_state["last_result"] = f"error: {e}"
    finally:
        with _pipeline_lock:
            _pipeline_state["running"] = False
            _pipeline_state["started_at"] = None
            _pipeline_state["progress"] = None


# ---------------------------------------------------------------------------
# Upwork pipeline state (completely separate)
# ---------------------------------------------------------------------------
_upwork_lock = threading.Lock()
_upwork_state = {"running": False, "started_at": None, "last_result": None, "progress": None}


def _run_upwork_pipeline_task():
    try:
        from main_upwork import run_upwork_pipeline
        def _progress_cb(current, total, label):
            with _upwork_lock:
                _upwork_state["progress"] = {"current": current, "total": total, "label": label}
        run_upwork_pipeline(progress_cb=_progress_cb)
        with _upwork_lock:
            _upwork_state["last_result"] = "success"
    except Exception as e:
        with _upwork_lock:
            _upwork_state["last_result"] = f"error: {e}"
    finally:
        with _upwork_lock:
            _upwork_state["running"] = False
            _upwork_state["started_at"] = None
            _upwork_state["progress"] = None


# ---------------------------------------------------------------------------
# Helper
# ---------------------------------------------------------------------------

def _row_to_dict(row) -> dict:
    return dict(row) if row else {}


# ---------------------------------------------------------------------------
# Main pipeline routes
# ---------------------------------------------------------------------------

@app.get("/api/stats")
def api_stats():
    return get_stats()


@app.get("/api/token-usage")
def api_token_usage():
    from src.scorer import get_token_stats
    return get_token_stats()


@app.delete("/api/jobs")
def api_clear_jobs():
    count = clear_all_jobs()
    return {"ok": True, "deleted": count}

@app.get("/api/jobs/saved")
def api_saved_jobs():
    return [_row_to_dict(r) for r in get_saved_jobs()]

@app.get("/api/jobs")
def api_jobs(status: str | None = None, min_score: int = 0):
    rows = get_all_jobs(status=status, min_score=min_score)
    return [_row_to_dict(r) for r in rows]


@app.get("/api/jobs/{job_id}")
def api_job_detail(job_id: str):
    row = get_job(job_id)
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    return _row_to_dict(row)


class EmailUpdate(BaseModel):
    subject: str
    body: str
    to_address: str | None = None


@app.patch("/api/jobs/{job_id}/email")
def api_update_email(job_id: str, payload: EmailUpdate):
    row = get_job(job_id)
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    update_job_email(job_id, payload.subject, payload.body)
    return {"ok": True}


@app.patch("/api/jobs/{job_id}/approve")
def api_approve(job_id: str, payload: EmailUpdate):
    row = get_job(job_id)
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    if not payload.to_address:
        raise HTTPException(status_code=400, detail="to_address is required to send email")
    if not _EMAIL_RE.match(payload.to_address):
        raise HTTPException(status_code=400, detail="to_address is not a valid email address")
    update_job_email(job_id, payload.subject, payload.body)
    sent = send_email(payload.to_address, payload.subject, payload.body)
    if sent:
        update_job_status(job_id, "sent",
            sent_at=datetime.now(timezone.utc).isoformat(),
            reviewed_at=datetime.now(timezone.utc).isoformat())
        return {"ok": True, "sent": True}
    else:
        update_job_status(job_id, "approved",
            reviewed_at=datetime.now(timezone.utc).isoformat())
        return {"ok": True, "sent": False, "message": "Approved but could not send. Check logs."}


@app.delete("/api/jobs/{job_id}")
def api_delete_job(job_id: str):
    if not delete_job(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    return {"ok": True}

@app.patch("/api/jobs/{job_id}/save")
def api_save_job(job_id: str):
    row = get_job(job_id)
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    new_saved = not bool(dict(row).get("is_saved", 0))
    save_job(job_id, new_saved)
    return {"ok": True, "is_saved": new_saved}

@app.patch("/api/jobs/{job_id}/skip")
def api_skip(job_id: str):
    row = get_job(job_id)
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    update_job_status(job_id, "skipped",
        reviewed_at=datetime.now(timezone.utc).isoformat())
    return {"ok": True}


# ---------------------------------------------------------------------------
# Search query / portal settings
# ---------------------------------------------------------------------------

class QueryPayload(BaseModel):
    search_term: str
    location: str = "Remote USA"
    work_mode: str = "Remote"

class TogglePayload(BaseModel):
    enabled: bool

@app.get("/api/settings/portals")
def api_get_portals():
    return [dict(p) for p in get_portal_settings()]

class PortalToggle(BaseModel):
    enabled: bool

@app.patch("/api/settings/portals/{name}")
def api_toggle_portal(name: str, payload: PortalToggle):
    if not toggle_portal(name, payload.enabled):
        raise HTTPException(status_code=404, detail="Portal not found")
    return {"ok": True}

@app.get("/api/settings/queries")
def api_get_queries():
    return [dict(q) for q in get_search_queries()]

@app.post("/api/settings/queries")
def api_add_query(payload: QueryPayload):
    if not payload.search_term.strip():
        raise HTTPException(status_code=400, detail="search_term is required")
    row = add_search_query(payload.search_term, payload.location, payload.work_mode)
    return dict(row)

@app.delete("/api/settings/queries/{query_id}")
def api_delete_query(query_id: int):
    if not delete_search_query(query_id):
        raise HTTPException(status_code=404, detail="Query not found")
    return {"ok": True}

@app.patch("/api/settings/queries/{query_id}")
def api_toggle_query(query_id: int, payload: TogglePayload):
    if not toggle_search_query(query_id, payload.enabled):
        raise HTTPException(status_code=404, detail="Query not found")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Main pipeline trigger
# ---------------------------------------------------------------------------

@app.post("/api/run")
def api_run_pipeline(background_tasks: BackgroundTasks):
    with _pipeline_lock:
        if _pipeline_state["running"]:
            return {"ok": False, "message": "Pipeline is already running"}
        _pipeline_state["running"] = True
        _pipeline_state["started_at"] = datetime.now(timezone.utc).isoformat()
        _pipeline_state["last_result"] = None
    background_tasks.add_task(_run_pipeline_task)
    return {"ok": True, "message": "Pipeline started"}


@app.get("/api/run/status")
def api_run_status():
    with _pipeline_lock:
        return {
            "running": _pipeline_state["running"],
            "started_at": _pipeline_state["started_at"],
            "last_result": _pipeline_state["last_result"],
            "progress": _pipeline_state["progress"],
        }


# ---------------------------------------------------------------------------
# Upwork routes
# ---------------------------------------------------------------------------

@app.get("/api/upwork/stats")
def api_upwork_stats():
    return get_upwork_stats()


@app.get("/api/upwork/jobs")
def api_upwork_jobs(status: str | None = None, min_score: int = 0):
    rows = get_all_upwork_jobs(status=status, min_score=min_score)
    return [_row_to_dict(r) for r in rows]


@app.get("/api/upwork/jobs/saved")
def api_upwork_saved():
    return [_row_to_dict(r) for r in get_saved_upwork_jobs()]


@app.get("/api/upwork/jobs/{job_id}")
def api_upwork_job_detail(job_id: str):
    row = get_upwork_job(job_id)
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    return _row_to_dict(row)


@app.delete("/api/upwork/jobs")
def api_upwork_clear():
    count = clear_all_upwork_jobs()
    return {"ok": True, "deleted": count}


@app.delete("/api/upwork/jobs/{job_id}")
def api_upwork_delete_job(job_id: str):
    if not delete_upwork_job(job_id):
        raise HTTPException(status_code=404, detail="Job not found")
    return {"ok": True}


@app.patch("/api/upwork/jobs/{job_id}/save")
def api_upwork_save_job(job_id: str):
    row = get_upwork_job(job_id)
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    new_saved = not bool(dict(row).get("is_saved", 0))
    save_upwork_job(job_id, new_saved)
    return {"ok": True, "is_saved": new_saved}


@app.patch("/api/upwork/jobs/{job_id}/skip")
def api_upwork_skip(job_id: str):
    row = get_upwork_job(job_id)
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    update_upwork_job_status(job_id, "skipped")
    return {"ok": True}


@app.get("/api/upwork/queries")
def api_upwork_get_queries():
    return [dict(q) for q in get_upwork_queries()]

class UpworkQueryPayload(BaseModel):
    search_term: str

@app.post("/api/upwork/queries")
def api_upwork_add_query(payload: UpworkQueryPayload):
    if not payload.search_term.strip():
        raise HTTPException(status_code=400, detail="search_term is required")
    row = add_upwork_query(payload.search_term)
    return dict(row)

@app.delete("/api/upwork/queries/{query_id}")
def api_upwork_delete_query(query_id: int):
    if not delete_upwork_query(query_id):
        raise HTTPException(status_code=404, detail="Query not found")
    return {"ok": True}

@app.patch("/api/upwork/queries/{query_id}")
def api_upwork_toggle_query(query_id: int, payload: TogglePayload):
    if not toggle_upwork_query(query_id, payload.enabled):
        raise HTTPException(status_code=404, detail="Query not found")
    return {"ok": True}


@app.post("/api/upwork/run")
def api_upwork_run(background_tasks: BackgroundTasks):
    with _upwork_lock:
        if _upwork_state["running"]:
            return {"ok": False, "message": "Upwork pipeline is already running"}
        _upwork_state["running"] = True
        _upwork_state["started_at"] = datetime.now(timezone.utc).isoformat()
        _upwork_state["last_result"] = None
    background_tasks.add_task(_run_upwork_pipeline_task)
    return {"ok": True, "message": "Upwork pipeline started"}


@app.get("/api/upwork/run/status")
def api_upwork_run_status():
    with _upwork_lock:
        return {
            "running": _upwork_state["running"],
            "started_at": _upwork_state["started_at"],
            "last_result": _upwork_state["last_result"],
            "progress": _upwork_state["progress"],
        }


# ---------------------------------------------------------------------------
# Serve React frontend in production
# ---------------------------------------------------------------------------

_DIST = Path(__file__).parent.parent / "frontend" / "dist"

if _DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        return FileResponse(str(_DIST / "index.html"))
