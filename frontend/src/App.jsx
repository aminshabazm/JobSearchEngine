import { useEffect, useRef, useState } from "react";
import JobModal from "./components/JobModal.jsx";
import JobTable from "./components/JobTable.jsx";
import SavedJobs from "./components/SavedJobs.jsx";
import SettingsPage from "./components/SettingsPage.jsx";

const STATUS_COLORS = {
  new: "#64748b", scored: "#64748b", pending: "#f59e0b",
  approved: "#3b82f6", sent: "#22c55e", skipped: "#475569", error: "#ef4444",
};

export default function App() {
  const [stats, setStats] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [selectedJob, setSelectedJob] = useState(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [minScore, setMinScore] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [pipelineMsg, setPipelineMsg] = useState(null);
  const [view, setView] = useState("home"); // "home" | "saved" | "filter"
  const [confirmClear, setConfirmClear] = useState(false);
  const pollRef = useRef(null);

  const fetchStats = () =>
    fetch("/api/stats").then((r) => r.json()).then(setStats).catch(() => {});

  const fetchJobs = () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (minScore > 0) params.set("min_score", minScore);
    fetch(`/api/jobs?${params}`)
      .then((r) => r.json())
      .then((data) => { setJobs(data.filter((j) => !j.is_saved)); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchStats();
    fetchJobs();
  }, [statusFilter, minScore]);

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch("/api/run/status");
        const data = await res.json();
        if (data.running) {
          if (data.progress) {
            const { current, total, label } = data.progress;
            setPipelineMsg(`Scoring ${current}/${total} — ${label}`);
          } else {
            setPipelineMsg("Fetching jobs from portals...");
          }
        } else {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setPipelineRunning(false);
          setPipelineMsg(
            data.last_result === "success"
              ? "Pipeline finished — jobs updated!"
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
      const res = await fetch("/api/run", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setPipelineRunning(true);
        setPipelineMsg("Fetching jobs & scoring with Groq AI...");
        startPolling();
      } else {
        setPipelineMsg(data.message);
      }
    } catch {
      setPipelineMsg("Could not start pipeline — is the server running?");
    }
  };

  const handleClearJobs = async () => {
    await fetch("/api/jobs", { method: "DELETE" });
    setJobs([]);
    setSelectedJob(null);
    setConfirmClear(false);
    fetchStats();
  };

  const handleJobUpdate = () => {
    fetchStats();
    fetchJobs();
    if (selectedJob) {
      fetch(`/api/jobs/${selectedJob.job_id}`)
        .then((r) => r.json()).then(setSelectedJob);
    }
  };

  const handleSaveToggle = (jobId, isSaved) => {
    if (isSaved) {
      // Move to Saved — remove from All Jobs list immediately
      setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
    } else {
      setJobs((prev) => prev.map((j) => j.job_id === jobId ? { ...j, is_saved: 0 } : j));
    }
  };

  const handleDelete = (jobId) => {
    setJobs((prev) => prev.filter((j) => j.job_id !== jobId));
    fetchStats();
  };

  const counts = stats?.counts ?? {};

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>

      {/* Header */}
      <header style={styles.header}>
        <div style={styles.headerInner}>
          <div>
            <h1 style={styles.title}>Job Search Engine</h1>
            <p style={styles.subtitle}>Groq AI · Remotive · WWR · Gmail · Remote USA</p>
          </div>

          {/* Stats chips */}
          {stats && (
            <div style={styles.statsBar}>
              {Object.entries(counts).map(([status, count]) => (
                <span key={status} style={{ ...styles.statChip, borderColor: STATUS_COLORS[status] ?? "#64748b" }}>
                  <span style={{ color: STATUS_COLORS[status] ?? "#64748b", fontWeight: 600 }}>{count}</span>
                  {" "}{status}
                </span>
              ))}
              {stats.last_run && (
                <span style={styles.lastRun}>
                  Last run: {new Date(stats.last_run.run_at).toLocaleString()}
                </span>
              )}
            </div>
          )}

          {/* Nav tabs */}
          <div style={styles.navTabs}>
            <button
              onClick={() => { setView("home"); if (view !== "home") fetchJobs(); }}
              style={{ ...styles.navTab, ...(view === "home" ? styles.navTabActive : {}) }}
            >
              All Jobs
            </button>
            <button
              onClick={() => setView("saved")}
              style={{ ...styles.navTab, ...(view === "saved" ? styles.navTabActive : {}) }}
            >
              ★ Saved
            </button>
            <button
              onClick={() => setView("filter")}
              style={{ ...styles.navTab, ...(view === "filter" ? styles.navTabActive : {}) }}
            >
              Job Filter
            </button>
          </div>

          {/* Action buttons */}
          {confirmClear ? (
            <div style={styles.confirmRow}>
              <span style={{ color: "#f87171", fontSize: 12 }}>Clear all jobs?</span>
              <button onClick={handleClearJobs} style={styles.confirmYes}>Yes, clear</button>
              <button onClick={() => setConfirmClear(false)} style={styles.confirmNo}>Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmClear(true)} style={styles.clearBtn} title="Clear all jobs">
              🗑 Clear All
            </button>
          )}

          <button
            onClick={handleRunPipeline}
            disabled={pipelineRunning}
            style={{ ...styles.runBtn, opacity: pipelineRunning ? 0.7 : 1, cursor: pipelineRunning ? "not-allowed" : "pointer" }}
          >
            {pipelineRunning ? (<><span style={styles.spinner} /> Running...</>) : "▶ Run Pipeline"}
          </button>
        </div>

        {pipelineMsg && (
          <div style={{
            ...styles.pipelineMsg,
            background: pipelineMsg.startsWith("error") ? "#7f1d1d" : "#1e3a2e",
            borderColor: pipelineMsg.startsWith("error") ? "#ef4444" : "#22c55e",
            color: pipelineMsg.startsWith("error") ? "#fca5a5" : "#86efac",
          }}>
            {pipelineMsg}
          </div>
        )}
      </header>

      {/* Saved Jobs view */}
      {view === "saved" && <SavedJobs />}

      {/* Job Filter page */}
      {view === "filter" && <SettingsPage />}

      {/* Job detail modal */}
      {selectedJob && (
        <JobModal
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onUpdate={handleJobUpdate}
          onDelete={handleDelete}
        />
      )}

      {/* Home view */}
      {view === "home" && <>
        {/* Filters */}
        <div style={styles.filters}>
          <div style={styles.filterGroup}>
            <label style={styles.label}>Status</label>
            <select style={styles.select} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All</option>
              {["new", "pending", "approved", "sent", "skipped", "error"].map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div style={styles.filterGroup}>
            <label style={styles.label}>Min score: {minScore}</label>
            <input type="range" min={0} max={10} value={minScore}
              onChange={(e) => setMinScore(Number(e.target.value))}
              style={{ width: 120, accentColor: "#6366f1" }} />
          </div>
          <span style={{ marginLeft: "auto", color: "#64748b", fontSize: 13 }}>
            {jobs.length} job{jobs.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Full-width table */}
        <div style={styles.tableWrap}>
          {loading ? (
            <p style={styles.empty}>Loading...</p>
          ) : jobs.length === 0 ? (
            <div style={styles.emptyBox}>
              <p style={{ color: "#64748b", fontSize: 15 }}>No jobs found.</p>
              <p style={{ color: "#475569", fontSize: 13, marginTop: 6 }}>
                {!statusFilter && minScore === 0
                  ? "Click ▶ Run Pipeline to fetch and score jobs."
                  : "Try adjusting the filters."}
              </p>
            </div>
          ) : (
            <JobTable
              jobs={jobs}
              onSelect={setSelectedJob}
              onSaveToggle={handleSaveToggle}
              onDelete={handleDelete}
            />
          )}
        </div>
      </>}
    </div>
  );
}

const styles = {
  header: { background: "#1e293b", borderBottom: "1px solid #334155", padding: "14px 24px" },
  headerInner: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" },
  title: { fontSize: 20, fontWeight: 700, color: "#f1f5f9" },
  subtitle: { fontSize: 11, color: "#64748b", marginTop: 2 },
  statsBar: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", flex: 1 },
  statChip: { fontSize: 12, padding: "3px 10px", border: "1px solid", borderRadius: 20, background: "transparent", color: "#94a3b8" },
  lastRun: { fontSize: 11, color: "#475569" },
  navTabs: { display: "flex", gap: 0, border: "1px solid #334155", borderRadius: 8, overflow: "hidden" },
  navTab: { background: "transparent", color: "#94a3b8", border: "none", padding: "7px 16px", fontSize: 13, fontWeight: 500, cursor: "pointer" },
  navTabActive: { background: "#334155", color: "#f1f5f9" },
  confirmRow: { display: "flex", alignItems: "center", gap: 8 },
  confirmYes: { background: "#7f1d1d", color: "#fca5a5", border: "1px solid #ef4444", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer" },
  confirmNo:  { background: "transparent", color: "#94a3b8", border: "1px solid #334155", borderRadius: 6, padding: "5px 12px", fontSize: 12, cursor: "pointer" },
  clearBtn: { background: "transparent", color: "#94a3b8", border: "1px solid #334155", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer" },
  runBtn: { display: "flex", alignItems: "center", gap: 6, background: "#4f46e5", color: "#fff", border: "none", borderRadius: 8, padding: "8px 18px", fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" },
  spinner: { display: "inline-block", width: 12, height: 12, border: "2px solid #ffffff44", borderTopColor: "#fff", borderRadius: "50%", animation: "spin 0.7s linear infinite" },
  pipelineMsg: { marginTop: 10, padding: "7px 14px", borderRadius: 6, border: "1px solid", fontSize: 13 },
  filters: { display: "flex", alignItems: "center", gap: 20, padding: "12px 24px", background: "#161b27", borderBottom: "1px solid #1e293b", flexWrap: "wrap" },
  filterGroup: { display: "flex", alignItems: "center", gap: 8 },
  label: { fontSize: 13, color: "#94a3b8" },
  select: { background: "#1e293b", border: "1px solid #334155", color: "#e2e8f0", borderRadius: 6, padding: "4px 8px", fontSize: 13, cursor: "pointer" },
  tableWrap: { flex: 1, overflowY: "auto" },
  emptyBox: { padding: 60, textAlign: "center" },
  empty: { padding: 32, textAlign: "center", color: "#64748b", fontSize: 14 },
};
