import { useState } from "react";

export default function EmailPreview({ job, onUpdate }) {
  const [subject, setSubject] = useState(job.email_subject ?? "");
  const [body, setBody] = useState(job.email_body ?? "");
  const [toAddress, setToAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [message, setMessage] = useState(null);

  const flash = (text, isError = false) => {
    setMessage({ text, isError });
    setTimeout(() => setMessage(null), 4000);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${job.job_id}/email`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body }),
      });
      if (res.ok) {
        flash("Draft saved");
        onUpdate();
      } else {
        flash("Failed to save", true);
      }
    } catch {
      flash("Network error", true);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!toAddress.trim()) {
      flash("Enter the recipient email address first", true);
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/jobs/${job.job_id}/approve`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, body, to_address: toAddress }),
      });
      const data = await res.json();
      if (data.sent) {
        flash(`Email sent to ${toAddress}`);
      } else {
        flash(data.message ?? "Approved but not sent — check logs", true);
      }
      onUpdate();
    } catch {
      flash("Network error", true);
    } finally {
      setSending(false);
    }
  };

  const handleSkip = async () => {
    setSkipping(true);
    try {
      await fetch(`/api/jobs/${job.job_id}/skip`, { method: "PATCH" });
      flash("Job skipped");
      onUpdate();
    } catch {
      flash("Network error", true);
    } finally {
      setSkipping(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Subject */}
      <div style={styles.field}>
        <label style={styles.label}>Subject</label>
        <input
          style={styles.input}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Email subject line"
        />
      </div>

      {/* Body */}
      <div style={styles.field}>
        <label style={styles.label}>Body</label>
        <textarea
          style={styles.textarea}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Email body..."
          rows={10}
        />
      </div>

      {/* Recipient */}
      <div style={styles.field}>
        <label style={styles.label}>Send to (recruiter / contact email)</label>
        <input
          style={styles.input}
          type="email"
          value={toAddress}
          onChange={(e) => setToAddress(e.target.value)}
          placeholder="hiring@company.com"
        />
      </div>

      {/* Flash message */}
      {message && (
        <div
          style={{
            ...styles.flash,
            background: message.isError ? "#7f1d1d" : "#14532d",
            borderColor: message.isError ? "#ef4444" : "#22c55e",
            color: message.isError ? "#fca5a5" : "#86efac",
          }}
        >
          {message.text}
        </div>
      )}

      {/* Actions */}
      <div style={styles.actions}>
        <button style={styles.btnSave} onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save edits"}
        </button>
        <button style={styles.btnApprove} onClick={handleApprove} disabled={sending}>
          {sending ? "Sending..." : "Approve & Send"}
        </button>
        <button style={styles.btnSkip} onClick={handleSkip} disabled={skipping}>
          {skipping ? "Skipping..." : "Skip"}
        </button>
      </div>
    </div>
  );
}

const base = {
  border: "1px solid #334155",
  borderRadius: 6,
  background: "#0f1824",
  color: "#e2e8f0",
  fontSize: 13,
  padding: "8px 12px",
  outline: "none",
  width: "100%",
  fontFamily: "inherit",
};

const btnBase = {
  padding: "8px 18px",
  borderRadius: 6,
  border: "none",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
  transition: "opacity 0.15s",
};

const styles = {
  container: {
    background: "#1e293b",
    borderRadius: 10,
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" },
  input: { ...base },
  textarea: { ...base, resize: "vertical", lineHeight: 1.6, fontFamily: "monospace" },
  flash: {
    fontSize: 13,
    padding: "8px 12px",
    borderRadius: 6,
    border: "1px solid",
  },
  actions: { display: "flex", gap: 10 },
  btnSave: { ...btnBase, background: "#334155", color: "#e2e8f0" },
  btnApprove: { ...btnBase, background: "#4f46e5", color: "#fff" },
  btnSkip: { ...btnBase, background: "transparent", color: "#64748b", border: "1px solid #334155" },
};
