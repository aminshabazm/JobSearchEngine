import { useEffect, useState } from "react";
import { apiFetch } from "../api.js";
import JobModal from "./JobModal.jsx";

const STATUS_COLORS = {
  new: "#64748b", scored: "#64748b", pending: "#f59e0b",
  approved: "#3b82f6", sent: "#22c55e", skipped: "#475569", error: "#ef4444",
};

export default function SavedJobs() {
  const [jobs, setJobs] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    apiFetch("/api/jobs/saved")
      .then((r) => r.json())
      .then((d) => { setJobs(d); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleUnsave = async (e, jobId) => {
    e.stopPropagation();
    await apiFetch(`/api/jobs/${jobId}/save`, { method: "PATCH" });
    setJobs((j) => j.filter((x) => x.job_id !== jobId));
    if (selected?.job_id === jobId) setSelected(null);
  };

  const handleDelete = async (e, jobId) => {
    e.stopPropagation();
    await apiFetch(`/api/jobs/${jobId}`, { method: "DELETE" });
    setJobs((j) => j.filter((x) => x.job_id !== jobId));
    if (selected?.job_id === jobId) setSelected(null);
  };

  const handleModalDelete = (jobId) => {
    setJobs((j) => j.filter((x) => x.job_id !== jobId));
  };

  const handleModalUpdate = () => {
    if (selected) {
      apiFetch(`/api/jobs/${selected.job_id}`).then((r) => r.json()).then(setSelected);
    }
    load();
  };

  return (
    <div style={s.wrap}>
      {selected && (
        <JobModal
          job={selected}
          onClose={() => setSelected(null)}
          onUpdate={handleModalUpdate}
          onDelete={handleModalDelete}
        />
      )}

      {loading ? (
        <p style={s.empty}>Loading...</p>
      ) : jobs.length === 0 ? (
        <div style={s.emptyBox}>
          <div style={s.emptyIcon}>★</div>
          <p style={{ color: "#64748b", fontSize: 15, marginTop: 8 }}>No saved jobs yet</p>
          <p style={{ color: "#475569", fontSize: 13, marginTop: 4 }}>
            Click ☆ on any job in the All Jobs tab to bookmark it here.
          </p>
        </div>
      ) : (
        <table style={s.table}>
          <thead>
            <tr style={s.thead}>
              <th style={{ ...s.th, width: 70 }}>Score</th>
              <th style={s.th}>Title & Company</th>
              <th style={{ ...s.th, width: 130 }}>Location</th>
              <th style={{ ...s.th, width: 90 }}>Status</th>
              <th style={{ ...s.th, width: 120 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => {
              const color = job.score >= 8 ? "#22c55e" : job.score >= 6 ? "#f59e0b" : "#ef4444";
              return (
                <tr
                  key={job.job_id}
                  onClick={() => setSelected(job)}
                  style={s.row}
                  onMouseEnter={(e) => e.currentTarget.style.background = "#1e293b"}
                  onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
                >
                  <td style={s.td}>
                    {job.score != null
                      ? <span style={{ fontWeight: 700, fontSize: 13, color, background: color + "22", padding: "2px 8px", borderRadius: 12 }}>{job.score}/10</span>
                      : <span style={{ color: "#475569" }}>—</span>}
                  </td>
                  <td style={s.td}>
                    <div style={s.title}>{job.title}</div>
                    <div style={s.company}>{job.company}</div>
                  </td>
                  <td style={s.td}><span style={s.loc}>{job.location || "Remote"}</span></td>
                  <td style={s.td}>
                    <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: (STATUS_COLORS[job.status] ?? "#64748b") + "22", color: STATUS_COLORS[job.status] ?? "#64748b", fontWeight: 500 }}>
                      {job.status}
                    </span>
                  </td>
                  <td style={s.td} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={(e) => handleUnsave(e, job.job_id)} style={s.unsaveBtn} title="Remove from saved">
                        ★ Unsave
                      </button>
                      <button onClick={(e) => handleDelete(e, job.job_id)} style={s.deleteBtn} title="Delete job">
                        🗑
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

const s = {
  wrap: { flex: 1, overflowY: "auto" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  thead: { position: "sticky", top: 0, background: "#161b27", zIndex: 1 },
  th: { padding: "11px 16px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid #1e293b" },
  row: { borderBottom: "1px solid #1e293b", cursor: "pointer", transition: "background 0.1s", background: "transparent" },
  td: { padding: "11px 16px", verticalAlign: "middle" },
  title: { fontWeight: 600, color: "#e2e8f0", fontSize: 14 },
  company: { fontSize: 12, color: "#64748b", marginTop: 2 },
  loc: { fontSize: 12, color: "#94a3b8" },
  unsaveBtn: { fontSize: 11, color: "#f59e0b", background: "transparent", border: "1px solid #f59e0b33", borderRadius: 4, padding: "3px 8px", cursor: "pointer" },
  deleteBtn: { background: "transparent", border: "1px solid #ef444433", color: "#ef444488", borderRadius: 4, padding: "3px 7px", cursor: "pointer", fontSize: 13 },
  emptyBox: { padding: 60, textAlign: "center" },
  emptyIcon: { fontSize: 36, color: "#334155" },
  empty: { padding: 32, textAlign: "center", color: "#64748b", fontSize: 14 },
};
