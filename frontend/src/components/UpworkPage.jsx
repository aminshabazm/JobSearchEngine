import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../api.js";

const STATUS_COLORS = {
  new: "#64748b", scored: "#64748b", pending: "#f59e0b",
  approved: "#3b82f6", sent: "#22c55e", skipped: "#475569", error: "#ef4444",
};

function ScoreBadge({ score }) {
  if (score == null) return <span style={{ color: "#475569" }}>—</span>;
  const color = score >= 8 ? "#22c55e" : score >= 6 ? "#f59e0b" : "#ef4444";
  return (
    <span style={{ fontWeight: 700, fontSize: 13, color, background: color + "22", padding: "2px 8px", borderRadius: 12 }}>
      {score}/10
    </span>
  );
}

function JobDetailPanel({ job, onClose, onDelete, onSaveToggle }) {
  if (!job) return null;

  const handleSave = async () => {
    const res = await apiFetch(`/api/upwork/jobs/${job.job_id}/save`, { method: "PATCH" });
    const data = await res.json();
    if (data.ok) onSaveToggle(job.job_id, data.is_saved);
  };

  const handleSkip = async () => {
    await apiFetch(`/api/upwork/jobs/${job.job_id}/skip`, { method: "PATCH" });
    onDelete(job.job_id);
    onClose();
  };

  const handleDelete = async () => {
    await apiFetch(`/api/upwork/jobs/${job.job_id}`, { method: "DELETE" });
    onDelete(job.job_id);
    onClose();
  };

  const scoreColor = job.score >= 8 ? "#22c55e" : job.score >= 6 ? "#f59e0b" : "#ef4444";

  return (
    <div style={d.overlay} onClick={onClose}>
      <div style={d.panel} onClick={(e) => e.stopPropagation()}>
        <div style={d.header}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={d.title}>{job.title}</div>
            {job.budget && <div style={d.budget}>💰 {job.budget}</div>}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
            <button onClick={handleSave} style={{ ...d.iconBtn, color: job.is_saved ? "#f59e0b" : "#475569", fontSize: 20 }} title={job.is_saved ? "Unsave" : "Save"}>
              {job.is_saved ? "★" : "☆"}
            </button>
            <button onClick={handleSkip} style={d.skipBtn}>Skip</button>
            <button onClick={handleDelete} style={d.deleteBtn} title="Delete">🗑</button>
            <button onClick={onClose} style={d.closeBtn}>✕</button>
          </div>
        </div>
        <div style={d.body}>
          {job.score != null && (
            <div style={{ ...d.scoreBox, borderColor: scoreColor + "44", background: scoreColor + "11" }}>
              <span style={{ fontSize: 28, fontWeight: 800, color: scoreColor }}>{job.score}</span>
              <span style={{ fontSize: 13, color: scoreColor, marginLeft: 4 }}>/10</span>
              <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 12 }}>AI Match Score</span>
            </div>
          )}
          <div style={d.metaRow}>
            {job.search_query && <span style={d.metaChip}>🔍 {job.search_query}</span>}
            {job.posted_at && <span style={d.metaChip}>📅 {job.posted_at.slice(0, 16)}</span>}
            <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: (STATUS_COLORS[job.status] ?? "#64748b") + "22", color: STATUS_COLORS[job.status] ?? "#64748b", fontWeight: 600 }}>
              {job.status}
            </span>
          </div>
          {job.score_reasoning && (
            <div style={d.section}>
              <div style={d.sectionTitle}>AI Reasoning</div>
              <p style={d.reasoning}>{job.score_reasoning}</p>
            </div>
          )}
          {job.description && (
            <div style={d.section}>
              <div style={d.sectionTitle}>Job Description</div>
              <p style={d.desc}>{job.description}</p>
            </div>
          )}
          {job.apply_url && (
            <a href={job.apply_url} target="_blank" rel="noopener noreferrer" style={d.applyBtn}>
              Apply on RemoteOK ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function QueryFilter() {
  const [queries, setQueries] = useState([]);
  const [newTerm, setNewTerm] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    apiFetch("/api/upwork/queries").then((r) => r.json()).then(setQueries).catch(() => {});
  }, []);

  const flash = (type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const handleAdd = async () => {
    if (!newTerm.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/upwork/queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search_term: newTerm.trim() }),
      });
      const data = await res.json();
      if (res.ok) { setQueries((q) => [...q, data]); setNewTerm(""); flash("success", "Query added"); }
      else flash("error", data.detail || "Failed");
    } catch { flash("error", "Network error"); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    const res = await apiFetch(`/api/upwork/queries/${id}`, { method: "DELETE" });
    if (res.ok) setQueries((q) => q.filter((x) => x.id !== id));
  };

  const handleToggle = async (id, enabled) => {
    const res = await apiFetch(`/api/upwork/queries/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    if (res.ok) setQueries((q) => q.map((x) => x.id === id ? { ...x, enabled: !enabled ? 1 : 0 } : x));
  };

  return (
    <div style={q.wrap}>
      <div style={q.header}>
        <span style={q.title}>Job Filter</span>
        <span style={q.badge}>{queries.filter((x) => x.enabled).length} active</span>
      </div>

      {msg && (
        <div style={{ ...q.flash, background: msg.type === "error" ? "#7f1d1d" : "#1e3a2e", borderColor: msg.type === "error" ? "#ef4444" : "#22c55e", color: msg.type === "error" ? "#fca5a5" : "#86efac" }}>
          {msg.text}
        </div>
      )}

      {/* Add row */}
      <div style={q.addRow}>
        <input
          placeholder="e.g. Java Backend Developer"
          value={newTerm}
          onChange={(e) => setNewTerm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          style={q.input}
        />
        <button
          onClick={handleAdd}
          disabled={saving || !newTerm.trim()}
          style={{ ...q.addBtn, opacity: saving || !newTerm.trim() ? 0.5 : 1 }}
        >
          + Add
        </button>
      </div>

      {/* Query list */}
      <div style={q.list}>
        {queries.length === 0 && <p style={q.empty}>No queries yet. Add a job title above.</p>}
        {queries.map((item) => (
          <div key={item.id} style={{ ...q.row, opacity: item.enabled ? 1 : 0.45 }}>
            <span style={q.term}>{item.search_term}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button
                onClick={() => handleToggle(item.id, item.enabled)}
                style={{ ...q.toggleBtn, background: item.enabled ? "#166534" : "#374151" }}
              >
                {item.enabled ? "ON" : "OFF"}
              </button>
              <button onClick={() => handleDelete(item.id)} style={q.deleteBtn}>✕</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function UpworkPage() {
  const [jobs, setJobs] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [activeTab, setActiveTab] = useState("jobs"); // "jobs" | "saved" | "filter"
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineMsg, setPipelineMsg] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const pollRef = useRef(null);

  const fetchStats = () =>
    apiFetch("/api/upwork/stats").then((r) => r.json()).then(setStats).catch(() => {});

  const fetchJobs = () => {
    setLoading(true);
    const endpoint = activeTab === "saved" ? "/api/upwork/jobs/saved" : "/api/upwork/jobs";
    const params = new URLSearchParams();
    if (activeTab === "jobs" && statusFilter) params.set("status", statusFilter);
    if (activeTab === "jobs" && minScore > 0) params.set("min_score", minScore);
    apiFetch(`${endpoint}?${params}`)
      .then((r) => r.json())
      .then((data) => { setJobs(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchStats(); }, []);
  useEffect(() => {
    if (activeTab !== "filter") fetchJobs();
  }, [statusFilter, minScore, activeTab]);

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch("/api/upwork/run/status");
        const data = await res.json();
        if (data.running) {
          if (data.progress) {
            const { current, total, label } = data.progress;
            setPipelineMsg(`Scoring ${current}/${total} — ${label}`);
          } else {
            setPipelineMsg("Fetching jobs from RemoteOK...");
          }
        } else {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setPipelineRunning(false);
          setPipelineMsg(
            data.last_result === "success"
              ? "Pipeline finished — remote jobs updated!"
              : data.last_result ?? "Pipeline finished"
          );
          fetchStats();
          fetchJobs();
          setTimeout(() => setPipelineMsg(null), 5000);
        }
      } catch {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setPipelineRunning(false);
      }
    }, 3000);
  };

  const handleRunPipeline = async () => {
    if (pipelineRunning) return;
    setPipelineMsg(null);
    try {
      const res = await apiFetch("/api/upwork/run", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setPipelineRunning(true);
        setPipelineMsg("Fetching remote jobs & scoring with Groq AI...");
        startPolling();
      } else {
        setPipelineMsg(data.message);
      }
    } catch {
      setPipelineMsg("Could not start pipeline — is the server running?");
    }
  };

  const handleClearJobs = async () => {
    await apiFetch("/api/upwork/jobs", { method: "DELETE" });
    setJobs([]); setSelectedJob(null); setConfirmClear(false);
    fetchStats();
  };

  const handleDelete = (jobId) => {
    setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
    fetchStats();
  };

  const handleSaveToggle = (jobId, isSaved) => {
    if (activeTab === "saved" && !isSaved) {
      setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
    } else {
      setJobs((prev) => prev.map((j) => j.job_id === jobId ? { ...j, is_saved: isSaved ? 1 : 0 } : j));
    }
    if (selectedJob?.job_id === jobId) setSelectedJob((j) => ({ ...j, is_saved: isSaved ? 1 : 0 }));
  };

  const counts = stats?.counts ?? {};

  return (
    <div style={s.page}>
      {selectedJob && (
        <JobDetailPanel
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onDelete={(id) => { handleDelete(id); setSelectedJob(null); }}
          onSaveToggle={handleSaveToggle}
        />
      )}

      {/* Page header */}
      <div style={s.pageHeader}>
        <div style={s.headerTop}>
          <div>
            <h2 style={s.title}>Remote Jobs</h2>
            <p style={s.subtitle}>Freelance & remote jobs via RemoteOK · Groq AI scoring</p>
          </div>

          {/* Stats */}
          <div style={s.statsBar}>
            {Object.entries(counts).map(([status, count]) => (
              <span key={status} style={{ ...s.statChip, borderColor: STATUS_COLORS[status] ?? "#64748b" }}>
                <span style={{ color: STATUS_COLORS[status] ?? "#64748b", fontWeight: 600 }}>{count}</span>
                {" "}{status}
              </span>
            ))}
          </div>

          {/* Tabs */}
          <div style={s.tabs}>
            {[
              { key: "jobs", label: "All Jobs" },
              { key: "saved", label: "★ Saved" },
              { key: "filter", label: "⚙ Job Filter" },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                style={{ ...s.tab, ...(activeTab === key ? s.tabActive : {}) }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Actions (only on jobs/saved tabs) */}
          {activeTab !== "filter" && (
            confirmClear ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#f87171", fontSize: 12 }}>Clear all?</span>
                <button onClick={handleClearJobs} style={s.confirmYes}>Yes</button>
                <button onClick={() => setConfirmClear(false)} style={s.confirmNo}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmClear(true)} style={s.clearBtn}>🗑 Clear All</button>
            )
          )}

          <button
            onClick={handleRunPipeline}
            disabled={pipelineRunning}
            style={{ ...s.runBtn, opacity: pipelineRunning ? 0.7 : 1, cursor: pipelineRunning ? "not-allowed" : "pointer" }}
          >
            {pipelineRunning ? <><span style={s.spinner} /> Running...</> : "▶ Run Remote Jobs Pipeline"}
          </button>
        </div>

        {pipelineMsg && (
          <div style={{ ...s.pipelineMsg, background: pipelineMsg.startsWith("error") ? "#7f1d1d" : "#1e3a2e", borderColor: pipelineMsg.startsWith("error") ? "#ef4444" : "#22c55e", color: pipelineMsg.startsWith("error") ? "#fca5a5" : "#86efac" }}>
            {pipelineMsg}
          </div>
        )}
      </div>

      {/* Job Filter tab */}
      {activeTab === "filter" && <QueryFilter />}

      {/* Jobs / Saved tabs */}
      {activeTab !== "filter" && (
        <>
          {/* Filters bar */}
          {activeTab === "jobs" && (
            <div style={s.filters}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={s.label}>Status</label>
                <select style={s.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">All</option>
                  {["new", "scored", "skipped", "error"].map((st) => (
                    <option key={st} value={st}>{st}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label style={s.label}>Min score: {minScore}</label>
                <input type="range" min={0} max={10} value={minScore}
                  onChange={(e) => setMinScore(Number(e.target.value))}
                  style={{ width: 120, accentColor: "#f59e0b" }} />
              </div>
              <span style={{ marginLeft: "auto", color: "#64748b", fontSize: 13 }}>
                {jobs.length} job{jobs.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}

          {/* Table */}
          <div style={s.tableWrap}>
            {loading ? (
              <p style={s.empty}>Loading...</p>
            ) : jobs.length === 0 ? (
              <div style={s.emptyBox}>
                <div style={{ fontSize: 36, color: "#334155", marginBottom: 12 }}>
                  {activeTab === "saved" ? "★" : "🔍"}
                </div>
                <p style={{ color: "#64748b", fontSize: 15 }}>
                  {activeTab === "saved" ? "No saved remote jobs yet." : "No remote jobs found."}
                </p>
                <p style={{ color: "#475569", fontSize: 13, marginTop: 6 }}>
                  {activeTab === "saved"
                    ? "Click ☆ on any job to bookmark it here."
                    : "Click ▶ Run Remote Jobs Pipeline to fetch and score jobs."}
                </p>
              </div>
            ) : (
              <table style={s.table}>
                <thead>
                  <tr style={s.thead}>
                    <th style={{ ...s.th, width: 70 }}>Score</th>
                    <th style={s.th}>Title</th>
                    <th style={{ ...s.th, width: 140 }}>Budget</th>
                    <th style={{ ...s.th, width: 90 }}>Status</th>
                    <th style={{ ...s.th, width: 90 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr
                      key={job.job_id}
                      onClick={() => setSelectedJob(job)}
                      style={s.row}
                      onMouseEnter={(e) => e.currentTarget.style.background = "#1e293b"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                    >
                      <td style={s.td}><ScoreBadge score={job.score} /></td>
                      <td style={s.td}>
                        <div style={s.jobTitle}>{job.title}</div>
                        {job.search_query && <div style={s.jobMeta}>🔍 {job.search_query}</div>}
                      </td>
                      <td style={s.td}><span style={s.budget}>{job.budget || "—"}</span></td>
                      <td style={s.td}>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: (STATUS_COLORS[job.status] ?? "#64748b") + "22", color: STATUS_COLORS[job.status] ?? "#64748b", fontWeight: 500 }}>
                          {job.status}
                        </span>
                      </td>
                      <td style={s.td} onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              const res = await apiFetch(`/api/upwork/jobs/${job.job_id}/save`, { method: "PATCH" });
                              const data = await res.json();
                              if (data.ok) handleSaveToggle(job.job_id, data.is_saved);
                            }}
                            style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 18, color: job.is_saved ? "#f59e0b" : "#475569" }}
                            title={job.is_saved ? "Unsave" : "Save"}
                          >
                            {job.is_saved ? "★" : "☆"}
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              await apiFetch(`/api/upwork/jobs/${job.job_id}`, { method: "DELETE" });
                              handleDelete(job.job_id);
                            }}
                            style={{ background: "transparent", border: "none", cursor: "pointer", color: "#ef444488", fontSize: 14 }}
                            title="Delete"
                          >
                            🗑
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const s = {
  page: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  pageHeader: { background: "#1a1f2e", borderBottom: "1px solid #1e293b", padding: "14px 24px" },
  headerTop: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  title: { fontSize: 18, fontWeight: 700, color: "#f1f5f9", margin: 0 },
  subtitle: { fontSize: 11, color: "#64748b", marginTop: 2 },
  statsBar: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1 },
  statChip: { fontSize: 12, padding: "3px 10px", border: "1px solid", borderRadius: 20, background: "transparent", color: "#94a3b8" },
  tabs: { display: "flex", gap: 0, border: "1px solid #334155", borderRadius: 8, overflow: "hidden" },
  tab: { background: "transparent", color: "#94a3b8", border: "none", padding: "7px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer" },
  tabActive: { background: "#334155", color: "#f1f5f9" },
  clearBtn: { background: "transparent", color: "#94a3b8", border: "1px solid #334155", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" },
  confirmYes: { background: "#7f1d1d", color: "#fca5a5", border: "1px solid #ef4444", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer" },
  confirmNo: { background: "transparent", color: "#94a3b8", border: "1px solid #334155", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer" },
  runBtn: { display: "flex", alignItems: "center", gap: 6, background: "#b45309", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" },
  spinner: { display: "inline-block", width: 12, height: 12, border: "2px solid #ffffff44", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" },
  pipelineMsg: { marginTop: 10, padding: "7px 14px", borderRadius: 6, border: "1px solid", fontSize: 13 },
  filters: { display: "flex", alignItems: "center", gap: 20, padding: "10px 24px", background: "#161b27", borderBottom: "1px solid #1e293b", flexWrap: "wrap" },
  label: { fontSize: 13, color: "#94a3b8" },
  select: { background: "#1e293b", border: "1px solid #334155", color: "#e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 13, cursor: "pointer" },
  tableWrap: { flex: 1, overflowY: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  thead: { position: "sticky", top: 0, background: "#161b27", zIndex: 1 },
  th: { padding: "11px 16px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #1e293b" },
  row: { borderBottom: "1px solid #1e293b", cursor: "pointer", transition: "background 0.1s", background: "transparent" },
  td: { padding: "11px 16px", verticalAlign: "middle" },
  jobTitle: { fontWeight: 600, color: "#e2e8f0", fontSize: 14 },
  jobMeta: { fontSize: 11, color: "#475569", marginTop: 2 },
  budget: { fontSize: 13, color: "#f59e0b", fontWeight: 600 },
  emptyBox: { padding: 60, textAlign: "center" },
  empty: { padding: 32, textAlign: "center", color: "#64748b", fontSize: 14 },
};

const d = {
  overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  panel: { background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, width: "min(780px, 94vw)", maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden" },
  header: { display: "flex", alignItems: "flex-start", gap: 12, padding: "18px 20px", borderBottom: "1px solid #1e293b", background: "#1e293b" },
  title: { fontSize: 16, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.4 },
  budget: { fontSize: 13, color: "#f59e0b", fontWeight: 600, marginTop: 4 },
  body: { overflowY: "auto", padding: "20px", display: "flex", flexDirection: "column", gap: 16 },
  scoreBox: { display: "flex", alignItems: "baseline", padding: "12px 16px", border: "1px solid", borderRadius: 8 },
  metaRow: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  metaChip: { fontSize: 12, color: "#64748b", background: "#1e293b", border: "1px solid #334155", borderRadius: 6, padding: "3px 8px" },
  section: { display: "flex", flexDirection: "column", gap: 6 },
  sectionTitle: { fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em" },
  reasoning: { fontSize: 13, color: "#94a3b8", lineHeight: 1.6, margin: 0 },
  desc: { fontSize: 13, color: "#64748b", lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" },
  applyBtn: { display: "inline-block", background: "#b45309", color: "#fff", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, textDecoration: "none", alignSelf: "flex-start" },
  iconBtn: { background: "transparent", border: "none", cursor: "pointer", padding: "2px 4px", lineHeight: 1 },
  skipBtn: { background: "transparent", color: "#94a3b8", border: "1px solid #334155", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer" },
  deleteBtn: { background: "transparent", border: "1px solid #ef444433", color: "#ef444488", borderRadius: 6, padding: "5px 8px", cursor: "pointer", fontSize: 13 },
  closeBtn: { background: "transparent", border: "none", color: "#64748b", fontSize: 18, cursor: "pointer", padding: "2px 6px", lineHeight: 1 },
};

const q = {
  wrap: { flex: 1, overflowY: "auto", padding: "24px 32px", maxWidth: 640 },
  header: { display: "flex", alignItems: "center", gap: 10, marginBottom: 16 },
  title: { fontSize: 14, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" },
  badge: { fontSize: 11, background: "#1e293b", border: "1px solid #334155", color: "#64748b", borderRadius: 20, padding: "2px 8px" },
  flash: { marginBottom: 12, padding: "8px 12px", borderRadius: 6, border: "1px solid", fontSize: 13 },
  addRow: { display: "flex", gap: 8, marginBottom: 16 },
  input: { flex: 1, background: "#1e293b", border: "1px solid #334155", color: "#e2e8f0", borderRadius: 6, padding: "8px 12px", fontSize: 13, outline: "none" },
  addBtn: { background: "#b45309", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  empty: { color: "#475569", fontSize: 13 },
  row: { display: "flex", alignItems: "center", justifyContent: "space-between", background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "10px 14px" },
  term: { fontSize: 14, color: "#e2e8f0", fontWeight: 500 },
  toggleBtn: { fontSize: 10, fontWeight: 700, color: "#fff", border: "none", borderRadius: 4, padding: "3px 8px", cursor: "pointer", letterSpacing: "0.05em" },
  deleteBtn: { background: "transparent", border: "1px solid #374151", color: "#64748b", borderRadius: 4, padding: "3px 8px", cursor: "pointer", fontSize: 12 },
};
