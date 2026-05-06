import { useEffect } from "react";
import { apiFetch } from "../api.js";
import JobDetail from "./JobDetail.jsx";

export default function JobModal({ job, onClose, onUpdate, onDelete }) {
  // Close on Escape key
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleDelete = async () => {
    await apiFetch(`/api/jobs/${job.job_id}`, { method: "DELETE" });
    onDelete(job.job_id);
    onClose();
  };

  return (
    <div style={s.overlay} onClick={onClose}>
      <div style={s.modal} onClick={(e) => e.stopPropagation()}>
        {/* Modal header bar */}
        <div style={s.bar}>
          <div style={s.barMeta}>
            <span style={s.barTitle}>{job.title}</span>
            <span style={s.barCompany}>{job.company}</span>
          </div>
          <div style={s.barActions}>
            <button onClick={handleDelete} style={s.deleteBtn} title="Delete job">
              🗑 Delete
            </button>
            <button onClick={onClose} style={s.closeBtn} title="Close (Esc)">✕</button>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={s.body}>
          <JobDetail job={job} onUpdate={onUpdate} />
        </div>
      </div>
    </div>
  );
}

const s = {
  overlay: {
    position: "fixed", inset: 0,
    background: "rgba(0,0,0,0.75)",
    display: "flex", alignItems: "center", justifyContent: "center",
    zIndex: 1000, padding: "24px 16px",
  },
  modal: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 12,
    width: "100%",
    maxWidth: 820,
    maxHeight: "90vh",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
  },
  bar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "14px 20px",
    background: "#1e293b",
    borderBottom: "1px solid #334155",
    gap: 12,
    flexShrink: 0,
  },
  barMeta: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 },
  barTitle: { fontSize: 15, fontWeight: 700, color: "#f1f5f9", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  barCompany: { fontSize: 12, color: "#94a3b8" },
  barActions: { display: "flex", gap: 8, alignItems: "center", flexShrink: 0 },
  deleteBtn: {
    background: "transparent", color: "#f87171",
    border: "1px solid #ef444433", borderRadius: 6,
    padding: "5px 12px", fontSize: 12, cursor: "pointer",
  },
  closeBtn: {
    background: "transparent", color: "#94a3b8",
    border: "1px solid #334155", borderRadius: 6,
    padding: "5px 10px", fontSize: 14, cursor: "pointer", lineHeight: 1,
  },
  body: { overflowY: "auto", flex: 1 },
};
