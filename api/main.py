import threading
from datetime import datetime, timezone
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from src.mailer import send_email
from src.storage import (
    add_search_query,
    clear_all_jobs,
    delete_job,
    delete_search_query,
    get_all_jobs,
    get_job,
    get_portal_settings,
    get_saved_jobs,
    get_search_queries,
    get_stats,
    initialize_db,
    save_job,
    toggle_portal,
    toggle_search_query,
    update_job_email,
    update_job_status,
)

app = FastAPI(title="Job Search Engine", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

initialize_db()

# --- Pipeline run state ---
_pipeline_lock = threading.Lock()
_pipeline_state = {"running": False, "started_at": None, "last_result": None, "progress": None}


def _run_pipeline_task():
    global _pipeline_state
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


# --- Helper ---

def _row_to_dict(row) -> dict:
    return dict(row) if row else {}


# --- API Routes ---

@app.get("/api/stats")
def api_stats():
    return get_stats()


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


# --- Search query settings ---

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


# --- Pipeline trigger ---

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


# --- Serve React frontend in production ---

_DIST = Path(__file__).parent.parent / "frontend" / "dist"

if _DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        return FileResponse(str(_DIST / "index.html"))
