import { useEffect, useRef, useState } from "react";
import { apiFetch, clearToken, getToken } from "./api.js";
import Login from "./components/Login.jsx";
import JobModal from "./components/JobModal.jsx";
import JobTable from "./components/JobTable.jsx";
import SavedJobs from "./components/SavedJobs.jsx";
import SettingsPage from "./components/SettingsPage.jsx";
import UpworkPage from "./components/UpworkPage.jsx";
import TokenMeter from "./components/TokenMeter.jsx";

const STATUS_COLORS = {
  new: "#64748b", scored: "#64748b", pending: "#f59e0b",
  approved: "#3b82f6", sent: "#22c55e", skipped: "#475569", error: "#ef4444",
};

// ── Sidebar icons ────────────────────────────────────────────────────────────

function IconAllJobs({ active }) {
  const c = active ? "#f1f5f9" : "#64748b";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconSaved({ active }) {
  const c = active ? "#f59e0b" : "#64748b";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? c : "none"} stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function IconFilter({ active }) {
  const c = active ? "#818cf8" : "#64748b";
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="18" x2="20" y2="18" />
      <circle cx="8"  cy="6"  r="2.2" fill={c} stroke="none" />
      <circle cx="16" cy="12" r="2.2" fill={c} stroke="none" />
      <circle cx="8"  cy="18" r="2.2" fill={c} stroke="none" />
    </svg>
  );
}

function IconUpwork({ active }) {
  const c = active ? "#14a800" : "#64748b";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <text x="3" y="19" fontFamily="Arial Black, Arial" fontWeight="900" fontSize="18" fill={c}>U</text>
      {active && <circle cx="19" cy="17" r="3" fill="#14a800" />}
    </svg>
  );
}

const NAV_ITEMS = [
  { key: "home",   label: "All Jobs",   Icon: IconAllJobs,  accent: "#6366f1" },
  { key: "saved",  label: "Saved Jobs", Icon: IconSaved,    accent: "#f59e0b" },
  { key: "filter", label: "Job Filter", Icon: IconFilter,   accent: "#818cf8" },
  { key: "upwork", label: "Remote Jobs", Icon: IconUpwork,   accent: "#14a800" },
];

// ── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  const [authed, setAuthed] = useState(!!getToken());

  const handleLogout = async () => {
    await apiFetch("/api/logout", { method: "POST" }).catch(() => {});
    clearToken();
    setAuthed(false);
  };

  if (!authed) return <Login onLogin={() => setAuthed(true)} />;

  return <AppInner onLogout={handleLogout} />;
}

function AppInner({ onLogout }) {
  const [stats, setStats] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineMsg, setPipelineMsg] = useState(null);
  const [activeKeyIndex, setActiveKeyIndex] = useState(null);
  const [tokenStats, setTokenStats] = useState(null);
  const [view, setView] = useState("home");
  const [confirmClear, setConfirmClear] = useState(false);
  const [tooltip, setTooltip] = useState(null);
  const [showLogout, setShowLogout] = useState(false);
  const pollRef = useRef(null);

  const fetchStats = () =>
    apiFetch("/api/stats").then((r) => r.json()).then(setStats).catch(() => {});

  const fetchJobs = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (minScore > 0) params.set("min_score", minScore);
    apiFetch(`/api/jobs?${params}`)
      .then((r) => r.json())
      .then((data) => { setJobs(data.filter((j) => !j.is_saved)); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { fetchStats(); fetchJobs(); }, [statusFilter, minScore]);

  useEffect(() => {
    const load = () => apiFetch("/api/token-usage").then((r) => r.json()).then(setTokenStats).catch(() => {});
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await apiFetch("/api/run/status");
        const data = await res.json();
        if (data.running) {
          setPipelineMsg(data.progress
            ? `Scoring ${data.progress.current}/${data.progress.total} — ${data.progress.label}`
            : "Fetching jobs from portals...");
        } else {
          clearInterval(pollRef.current); pollRef.current = null;
          setPipelineRunning(false);
          setActiveKeyIndex(null);
          setPipelineMsg(data.last_result === "success" ? "Pipeline finished — jobs updated!" : data.last_result ?? "Pipeline finished");
          fetchStats(); fetchJobs();
          setTimeout(() => setPipelineMsg(null), 5000);
        }
      } catch {
        clearInterval(pollRef.current); pollRef.current = null; setPipelineRunning(false);
      }
    }, 3000);
  };

  const handleRunWithKey = async (keyIndex) => {
    if (pipelineRunning) return;
    setPipelineMsg(null);
    setActiveKeyIndex(keyIndex);
    try {
      const res = await apiFetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key_index: keyIndex }),
      });
      const data = await res.json();
      if (data.ok) {
        setPipelineRunning(true);
        setPipelineMsg(keyIndex
          ? `Scoring with Key ${keyIndex} — fetching jobs...`
          : "Fetching jobs & scoring with Groq AI (auto)...");
        startPolling();
      } else {
        setPipelineMsg(data.message);
        setActiveKeyIndex(null);
      }
    } catch {
      setPipelineMsg("Could not start pipeline — is the server running?");
      setActiveKeyIndex(null);
    }
  };

  const handleClearJobs = async () => {
    await apiFetch("/api/jobs", { method: "DELETE" });
    setJobs([]); setSelectedJob(null); setConfirmClear(false); fetchStats();
  };

  const handleJobUpdate = () => {
    fetchStats(); fetchJobs();
    if (selectedJob) apiFetch(`/api/jobs/${selectedJob.job_id}`).then((r) => r.json()).then(setSelectedJob);
  };

  const handleSaveToggle = (jobId, isSaved) => {
    if (isSaved) setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
    else setJobs((prev) => prev.map((j) => j.job_id === jobId ? { ...j, is_saved: 0 } : j));
  };

  const handleDelete = (jobId) => { setJobs((prev) => prev.filter((j) => j.job_id !== jobId)); fetchStats(); };

  const counts = stats?.counts ?? {};
  const activeAccent = NAV_ITEMS.find((n) => n.key === view)?.accent ?? "#6366f1";

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── Top header ── */}
      <header style={st.header}>
        <div style={st.headerInner}>
          <div style={{ minWidth: 0 }}>
            <h1 style={st.title}>Job Search Engine</h1>
            <p style={st.subtitle}>Groq AI · Remotive · WWR · Gmail</p>
          </div>

          {/* Stats */}
          {stats && (
            <div style={st.statsBar}>
              {Object.entries(counts).map(([status, count]) => (
                <span key={status} style={{ ...st.statChip, borderColor: STATUS_COLORS[status] ?? "#64748b" }}>
                  <span style={{ color: STATUS_COLORS[status] ?? "#64748b", fontWeight: 600 }}>{count}</span>
                  {" "}{status}
                </span>
              ))}
              {stats.last_run && (
                <span style={st.lastRun}>Last run: {new Date(stats.last_run.run_at).toLocaleString()}</span>
              )}
            </div>
          )}

          {/* Token meter */}
          <TokenMeter />

          {/* Clear button */}
          {view !== "upwork" && (
            confirmClear ? (
              <div style={st.confirmRow}>
                <span style={{ color: "#f87171", fontSize: 12 }}>Clear all jobs?</span>
                <button onClick={handleClearJobs} style={st.confirmYes}>Yes, clear</button>
                <button onClick={() => setConfirmClear(false)} style={st.confirmNo}>Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmClear(true)} style={st.clearBtn} title="Clear all jobs">🗑</button>
            )
          )}

          {/* Key score buttons — one per Groq key + Auto */}
          {view !== "upwork" && (
            <div style={st.keyBtnRow}>
              {/* Auto button */}
              <button
                onClick={() => handleRunWithKey(null)}
                disabled={pipelineRunning}
                title="Auto-rotate through all available keys"
                style={{
                  ...st.keyBtn,
                  borderColor: pipelineRunning && activeKeyIndex === null ? "#6366f1" : "#334155",
                  color: pipelineRunning && activeKeyIndex === null ? "#818cf8" : "#94a3b8",
                  background: pipelineRunning && activeKeyIndex === null ? "#6366f118" : "transparent",
                  opacity: pipelineRunning ? 0.6 : 1,
                  cursor: pipelineRunning ? "not-allowed" : "pointer",
                  fontWeight: 600,
                  minWidth: 48,
                }}
              >
                {pipelineRunning && activeKeyIndex === null ? <><span style={st.spinner} /> Auto</> : "▶ Auto"}
              </button>

              {/* Per-key buttons */}
              {(tokenStats?.keys ?? []).map((k) => {
                const isRunningThisKey = pipelineRunning && activeKeyIndex === k.key;
                const dotColor = k.exhausted ? "#ef4444" : k.pct > 70 ? "#f59e0b" : "#22c55e";
                return (
                  <button
                    key={k.key}
                    onClick={() => handleRunWithKey(k.key)}
                    disabled={pipelineRunning}
                    title={`Score with Key ${k.key} — ${(k.tokens_used / 1000).toFixed(1)}k / 100k used${k.exhausted ? " (exhausted)" : ""}`}
                    style={{
                      ...st.keyBtn,
                      borderColor: isRunningThisKey ? dotColor : k.exhausted ? "#3f2020" : "#1e293b",
                      color: isRunningThisKey ? dotColor : k.exhausted ? "#7f3030" : "#94a3b8",
                      background: isRunningThisKey ? `${dotColor}18` : "transparent",
                      opacity: pipelineRunning ? 0.6 : 1,
                      cursor: pipelineRunning ? "not-allowed" : "pointer",
                    }}
                  >
                    {isRunningThisKey && <span style={st.spinner} />}
                    K{k.key}
                    <span style={{ ...st.dot, background: dotColor }} />
                    <span style={{ fontSize: 9, color: "#475569" }}>{(k.tokens_used / 1000).toFixed(0)}k</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* User / Logout */}
          <div style={{ position: "relative" }}>
            <button
              onClick={() => setShowLogout((v) => !v)}
              style={st.userBtn}
              title="Account"
            >
              👤
            </button>
            {showLogout && (
              <div style={st.userMenu}>
                <div style={st.userMenuName}>shabaz</div>
                <button onClick={onLogout} style={st.logoutBtn}>Sign out</button>
              </div>
            )}
          </div>
        </div>

        {pipelineMsg && view !== "upwork" && (
          <div style={{ ...st.pipelineMsg, background: pipelineMsg.startsWith("error") ? "#7f1d1d" : "#1e3a2e", borderColor: pipelineMsg.startsWith("error") ? "#ef4444" : "#22c55e", color: pipelineMsg.startsWith("error") ? "#fca5a5" : "#86efac" }}>
            {pipelineMsg}
          </div>
        )}
      </header>

      {/* ── Body: sidebar + content ── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>

        {/* Left icon sidebar */}
        <nav style={st.sidebar}>
          {NAV_ITEMS.map(({ key, label, Icon, accent }) => {
            const active = view === key;
            return (
              <div key={key} style={{ position: "relative" }}>
                <button
                  onClick={() => { setView(key); if (key === "home" && view !== "home") fetchJobs(); }}
                  onMouseEnter={() => setTooltip(key)}
                  onMouseLeave={() => setTooltip(null)}
                  style={{
                    ...st.navBtn,
                    background: active ? `${accent}18` : "transparent",
                    borderLeft: active ? `3px solid ${accent}` : "3px solid transparent",
                  }}
                  title={label}
                >
                  <Icon active={active} />
                  <span style={{ fontSize: 10, color: active ? accent : "#475569", marginTop: 4, fontWeight: active ? 600 : 400 }}>
                    {label.split(" ")[0]}
                  </span>
                </button>

                {/* Tooltip */}
                {tooltip === key && !active && (
                  <div style={{ ...st.tooltip, borderColor: accent }}>
                    {label}
                    <div style={{ ...st.tooltipArrow, borderRightColor: accent }} />
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Content area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Job detail modal */}
          {selectedJob && (
            <JobModal
              job={selectedJob}
              onClose={() => setSelectedJob(null)}
              onUpdate={handleJobUpdate}
              onDelete={handleDelete}
            />
          )}

          {view === "saved"  && <SavedJobs />}
          {view === "filter" && <SettingsPage />}
          {view === "upwork" && <UpworkPage />}

          {view === "home" && (
            <>
              <div style={st.filters}>
                <div style={st.filterGroup}>
                  <label style={st.label}>Status</label>
                  <select style={st.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                    <option value="">All</option>
                    {["new", "pending", "approved", "sent", "skipped", "error"].map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div style={st.filterGroup}>
                  <label style={st.label}>Min score: {minScore}</label>
                  <input type="range" min={0} max={10} value={minScore}
                    onChange={(e) => setMinScore(Number(e.target.value))}
                    style={{ width: 120, accentColor: "#6366f1" }} />
                </div>
                <span style={{ marginLeft: "auto", color: "#64748b", fontSize: 13 }}>
                  {jobs.length} job{jobs.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div style={st.tableWrap}>
                {loading ? (
                  <p style={st.empty}>Loading...</p>
                ) : jobs.length === 0 ? (
                  <div style={st.emptyBox}>
                    <p style={{ color: "#64748b", fontSize: 15 }}>No jobs found.</p>
                    <p style={{ color: "#475569", fontSize: 13, marginTop: 6 }}>
                      {!statusFilter && minScore === 0 ? "Click ▶ Run Pipeline to fetch and score jobs." : "Try adjusting the filters."}
                    </p>
                  </div>
                ) : (
                  <JobTable jobs={jobs} onSelect={setSelectedJob} onSaveToggle={handleSaveToggle} onDelete={handleDelete} />
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const st = {
  header: { background: "#1e293b", borderBottom: "1px solid #334155", padding: "12px 20px", flexShrink: 0 },
  headerInner: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  title: { fontSize: 18, fontWeight: 700, color: "#f1f5f9", margin: 0 },
  subtitle: { fontSize: 11, color: "#64748b", marginTop: 2 },
  statsBar: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1 },
  statChip: { fontSize: 12, padding: "3px 10px", border: "1px solid", borderRadius: 20, background: "transparent", color: "#94a3b8" },
  lastRun: { fontSize: 11, color: "#475569" },
  confirmRow: { display: "flex", alignItems: "center", gap: 8 },
  confirmYes: { background: "#7f1d1d", color: "#fca5a5", border: "1px solid #ef4444", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer" },
  confirmNo:  { background: "transparent", color: "#94a3b8", border: "1px solid #334155", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer" },
  clearBtn: { background: "transparent", color: "#94a3b8", border: "1px solid #334155", borderRadius: 8, padding: "7px 14px", fontSize: 13, cursor: "pointer" },
  spinner: { display: "inline-block", width: 10, height: 10, border: "2px solid #ffffff22", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite", flexShrink: 0 },
  keyBtnRow: { display: "flex", alignItems: "center", gap: 4, flexWrap: "nowrap" },
  keyBtn: { display: "flex", alignItems: "center", gap: 4, border: "1px solid", borderRadius: 6, padding: "5px 8px", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap", transition: "all 0.15s" },
  dot: { width: 6, height: 6, borderRadius: "50%", flexShrink: 0 },
  pipelineMsg: { marginTop: 8, padding: "6px 12px", borderRadius: 6, border: "1px solid", fontSize: 13 },

  sidebar: {
    width: 72, flexShrink: 0,
    background: "#161b27",
    borderRight: "1px solid #1e293b",
    display: "flex", flexDirection: "column",
    alignItems: "center",
    paddingTop: 12, gap: 4,
  },
  navBtn: {
    width: 68, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    padding: "10px 0", border: "none", cursor: "pointer",
    borderRadius: "0 8px 8px 0", transition: "background 0.15s",
    gap: 2,
  },
  tooltip: {
    position: "absolute", left: 76, top: "50%", transform: "translateY(-50%)",
    background: "#1e293b", border: "1px solid",
    color: "#f1f5f9", fontSize: 12, fontWeight: 500,
    padding: "5px 10px", borderRadius: 6, whiteSpace: "nowrap",
    zIndex: 100, pointerEvents: "none",
  },
  tooltipArrow: {
    position: "absolute", left: -6, top: "50%", transform: "translateY(-50%)",
    width: 0, height: 0,
    borderTop: "5px solid transparent",
    borderBottom: "5px solid transparent",
    borderRight: "6px solid",
  },

  filters: { display: "flex", alignItems: "center", gap: 20, padding: "10px 20px", background: "#161b27", borderBottom: "1px solid #1e293b", flexWrap: "wrap", flexShrink: 0 },
  filterGroup: { display: "flex", alignItems: "center", gap: 8 },
  label: { fontSize: 13, color: "#94a3b8" },
  select: { background: "#1e293b", border: "1px solid #334155", color: "#e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 13, cursor: "pointer" },
  tableWrap: { flex: 1, overflowY: "auto" },
  emptyBox: { padding: 60, textAlign: "center" },
  empty: { padding: 32, textAlign: "center", color: "#64748b", fontSize: 14 },
  userBtn: { background: "transparent", border: "1px solid #334155", borderRadius: 8, color: "#94a3b8", fontSize: 16, padding: "6px 10px", cursor: "pointer" },
  userMenu: { position: "absolute", right: 0, top: "calc(100% + 6px)", background: "#1e293b", border: "1px solid #334155", borderRadius: 8, padding: "10px", minWidth: 140, zIndex: 200, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" },
  userMenuName: { fontSize: 13, fontWeight: 600, color: "#f1f5f9", padding: "4px 8px 10px", borderBottom: "1px solid #334155", marginBottom: 6 },
  logoutBtn: { width: "100%", background: "transparent", border: "none", color: "#f87171", fontSize: 13, padding: "6px 8px", cursor: "pointer", textAlign: "left", borderRadius: 4 },
};
