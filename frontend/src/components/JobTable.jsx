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

export default function JobTable({ jobs, onSelect, onSaveToggle, onDelete }) {
  const handleSave = async (e, job) => {
    e.stopPropagation();
    const res = await fetch(`/api/jobs/${job.job_id}/save`, { method: "PATCH" });
    const data = await res.json();
    if (data.ok && onSaveToggle) onSaveToggle(job.job_id, data.is_saved);
  };

  const handleDelete = async (e, job) => {
    e.stopPropagation();
    await fetch(`/api/jobs/${job.job_id}`, { method: "DELETE" });
    if (onDelete) onDelete(job.job_id);
  };

  return (
    <table style={s.table}>
      <thead>
        <tr style={s.thead}>
          <th style={{ ...s.th, width: 70 }}>Score</th>
          <th style={s.th}>Title & Company</th>
          <th style={{ ...s.th, width: 110 }}>Location</th>
          <th style={{ ...s.th, width: 90 }}>Status</th>
          <th style={{ ...s.th, width: 80 }}>Actions</th>
        </tr>
      </thead>
      <tbody>
        {jobs.map((job) => (
          <tr
            key={job.job_id}
            onClick={() => onSelect(job)}
            style={s.row}
            onMouseEnter={(e) => e.currentTarget.style.background = "#1e293b"}
            onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
          >
            <td style={s.td}><ScoreBadge score={job.score} /></td>
            <td style={s.td}>
              <div style={s.jobTitle}>{job.title}</div>
              <div style={s.jobCompany}>{job.company}</div>
            </td>
            <td style={s.td}>
              <span style={s.location}>{job.location || "Remote"}</span>
            </td>
            <td style={s.td}>
              <span style={{
                fontSize: 11, padding: "2px 8px", borderRadius: 10,
                background: (STATUS_COLORS[job.status] ?? "#64748b") + "22",
                color: STATUS_COLORS[job.status] ?? "#64748b", fontWeight: 500,
              }}>
                {job.status}
              </span>
            </td>
            <td style={s.td} onClick={(e) => e.stopPropagation()}>
              <div style={s.actions}>
                <button
                  onClick={(e) => handleSave(e, job)}
                  title={job.is_saved ? "Remove bookmark" : "Save job"}
                  style={{ ...s.iconBtn, color: job.is_saved ? "#f59e0b" : "#475569", fontSize: 17 }}
                >
                  {job.is_saved ? "★" : "☆"}
                </button>
                <button
                  onClick={(e) => handleDelete(e, job)}
                  title="Delete job"
                  style={{ ...s.iconBtn, color: "#ef444488", fontSize: 14 }}
                >
                  🗑
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const s = {
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 },
  thead: { position: "sticky", top: 0, background: "#161b27", zIndex: 1 },
  th: {
    padding: "11px 16px", textAlign: "left", color: "#64748b",
    fontWeight: 600, fontSize: 11, textTransform: "uppercase",
    letterSpacing: "0.05em", borderBottom: "1px solid #1e293b",
  },
  row: {
    borderBottom: "1px solid #1e293b", cursor: "pointer",
    transition: "background 0.1s", background: "transparent",
  },
  td: { padding: "11px 16px", verticalAlign: "middle" },
  jobTitle: { fontWeight: 600, color: "#e2e8f0", fontSize: 14 },
  jobCompany: { fontSize: 12, color: "#64748b", marginTop: 2 },
  location: { fontSize: 12, color: "#94a3b8" },
  actions: { display: "flex", gap: 6, alignItems: "center" },
  iconBtn: { background: "transparent", border: "none", cursor: "pointer", padding: "2px 4px", lineHeight: 1 },
};
