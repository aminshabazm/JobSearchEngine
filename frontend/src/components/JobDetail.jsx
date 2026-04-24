import EmailPreview from "./EmailPreview.jsx";

function Tag({ label, color }) {
  return (
    <span
      style={{
        display: "inline-block",
        fontSize: 11,
        padding: "2px 8px",
        borderRadius: 10,
        background: color + "22",
        color,
        marginRight: 6,
        marginBottom: 4,
      }}
    >
      {label}
    </span>
  );
}

function ScoreBlock({ score, reasoning, keyMatches, keyGaps }) {
  const color = score >= 8 ? "#22c55e" : score >= 6 ? "#f59e0b" : "#ef4444";
  return (
    <div style={styles.scoreBlock}>
      <div style={styles.scoreRow}>
        <span style={{ ...styles.scoreBig, color }}>{score}</span>
        <span style={{ color: "#64748b", fontSize: 14 }}>/10</span>
        <span
          style={{
            marginLeft: 12,
            fontSize: 12,
            padding: "3px 10px",
            borderRadius: 12,
            background: color + "22",
            color,
          }}
        >
          {score >= 8 ? "Excellent fit" : score >= 6 ? "Good fit" : score >= 4 ? "Partial fit" : "Poor fit"}
        </span>
      </div>
      {reasoning && <p style={styles.reasoning}>{reasoning}</p>}
      {keyMatches?.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <p style={styles.tagLabel}>Matches</p>
          <div>{keyMatches.map((m) => <Tag key={m} label={m} color="#22c55e" />)}</div>
        </div>
      )}
      {keyGaps?.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <p style={styles.tagLabel}>Gaps</p>
          <div>{keyGaps.map((g) => <Tag key={g} label={g} color="#f59e0b" />)}</div>
        </div>
      )}
    </div>
  );
}

export default function JobDetail({ job, onUpdate }) {
  // Parse key_matches / key_gaps from score_reasoning JSON if stored there
  let keyMatches = [];
  let keyGaps = [];
  try {
    const parsed = JSON.parse(job.score_reasoning ?? "{}");
    keyMatches = parsed.key_matches ?? [];
    keyGaps = parsed.key_gaps ?? [];
  } catch {
    // score_reasoning is plain text, not JSON — that's fine
  }

  return (
    <div style={styles.container}>
      {/* Job header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>{job.title}</h2>
          <p style={styles.company}>{job.company}</p>
        </div>
        <div style={styles.meta}>
          {job.salary_snippet && (
            <span style={styles.metaChip}>{job.salary_snippet}</span>
          )}
          {job.job_type && (
            <span style={styles.metaChip}>{job.job_type}</span>
          )}
          {job.remote_model && (
            <span style={{ ...styles.metaChip, color: "#22c55e", borderColor: "#22c55e33" }}>
              {job.remote_model}
            </span>
          )}
        </div>
      </div>

      {/* Links */}
      <div style={styles.links}>
        {job.job_url && (
          <a href={job.job_url} target="_blank" rel="noreferrer" style={styles.linkBtn}>
            View Listing ↗
          </a>
        )}
        {job.apply_url && job.apply_url !== job.job_url && (
          <a href={job.apply_url} target="_blank" rel="noreferrer" style={{ ...styles.linkBtn, ...styles.linkBtnGreen }}>
            Apply Now ↗
          </a>
        )}
        {job.apply_url && (
          <span style={styles.applyNote}>
            Opens the job portal — apply there or use the email draft below
          </span>
        )}
      </div>

      {/* AI Score */}
      {job.score != null && (
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>AI Assessment</h3>
          <ScoreBlock
            score={job.score}
            reasoning={job.score_reasoning}
            keyMatches={keyMatches}
            keyGaps={keyGaps}
          />
        </section>
      )}

      {/* Job Description */}
      {job.description && (
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>Job Description</h3>
          <pre style={styles.description}>{job.description}</pre>
        </section>
      )}

      {/* Email Draft */}
      {(job.status === "pending" || job.status === "approved") && (
        <section style={styles.section}>
          <h3 style={styles.sectionTitle}>Drafted Email</h3>
          <EmailPreview job={job} onUpdate={onUpdate} />
        </section>
      )}
    </div>
  );
}

const styles = {
  container: { padding: 24, maxWidth: 720 },
  header: { marginBottom: 12 },
  title: { fontSize: 20, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.3 },
  company: { fontSize: 14, color: "#94a3b8", marginTop: 4 },
  meta: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 },
  metaChip: {
    fontSize: 12,
    padding: "3px 10px",
    borderRadius: 12,
    border: "1px solid #334155",
    color: "#94a3b8",
  },
  links: { display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 20 },
  linkBtn: {
    fontSize: 13, color: "#6366f1", textDecoration: "none",
    border: "1px solid #4f46e5", borderRadius: 6,
    padding: "5px 14px", fontWeight: 500,
  },
  linkBtnGreen: { color: "#22c55e", borderColor: "#16a34a" },
  applyNote: { fontSize: 11, color: "#475569", marginLeft: 4 },
  section: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#64748b",
    marginBottom: 10,
    paddingBottom: 6,
    borderBottom: "1px solid #1e293b",
  },
  scoreBlock: {
    background: "#1e293b",
    borderRadius: 8,
    padding: 16,
  },
  scoreRow: { display: "flex", alignItems: "baseline", gap: 6 },
  scoreBig: { fontSize: 36, fontWeight: 800, lineHeight: 1 },
  reasoning: { fontSize: 13, color: "#94a3b8", marginTop: 10, lineHeight: 1.6 },
  tagLabel: { fontSize: 11, color: "#64748b", marginBottom: 4, fontWeight: 600 },
  description: {
    fontSize: 12,
    color: "#94a3b8",
    lineHeight: 1.7,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    background: "#1e293b",
    borderRadius: 8,
    padding: 16,
    maxHeight: 300,
    overflowY: "auto",
  },
};
