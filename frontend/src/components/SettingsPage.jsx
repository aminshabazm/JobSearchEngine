import { useEffect, useState } from "react";
import { apiFetch } from "../api.js";

const WORK_MODES = [
  { value: "Remote",    label: "Remote",          color: "#22c55e" },
  { value: "Hybrid",    label: "Hybrid",           color: "#f59e0b" },
  { value: "On-site",   label: "On-site / Office", color: "#6366f1" },
  { value: "Any",       label: "Any",              color: "#64748b" },
];

const CITIES = [
  "Remote USA",
  "San Francisco Bay Area, CA",
  "Seattle, WA",
  "New York City, NY",
  "Washington D.C. / Northern VA",
  "Austin, TX",
  "Dallas / Plano, TX",
  "Atlanta, GA",
  "Boston, MA",
  "Los Angeles, CA",
  "Raleigh-Durham, NC",
  "Denver / Boulder, CO",
  "Chicago, IL",
  "Miami, FL",
  "Phoenix, AZ",
];

const PORTAL_META = {
  remotive: { label: "Remotive",            icon: "🌐", desc: "Remote-only jobs, free, no key needed" },
  wwr:      { label: "We Work Remotely",    icon: "💼", desc: "Remote jobs RSS feed, free, no key needed" },
  jsearch:  { label: "LinkedIn (JSearch)",  icon: "🔗", desc: "LinkedIn + Indeed + Glassdoor — needs free RapidAPI key" },
};

export default function SettingsPage() {
  const [portals, setPortals] = useState([]);
  const [queries, setQueries] = useState([]);
  const [newTerm, setNewTerm] = useState("");
  const [newLocation, setNewLocation] = useState("Remote USA");
  const [newMode, setNewMode] = useState("Remote");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    apiFetch("/api/settings/portals").then((r) => r.json()).then(setPortals).catch(() => {});
    apiFetch("/api/settings/queries")
      .then((r) => r.json())
      .then(setQueries)
      .catch(() => setMsg({ type: "error", text: "Failed to load queries" }));
  }, []);

  const handleTogglePortal = async (name, enabled) => {
    const res = await apiFetch(`/api/settings/portals/${name}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    if (res.ok) setPortals((p) => p.map((x) => x.name === name ? { ...x, enabled: !enabled ? 1 : 0 } : x));
  };

  const flash = (type, text) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 3000);
  };

  const handleAdd = async () => {
    if (!newTerm.trim()) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/settings/queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search_term: newTerm.trim(), location: newLocation, work_mode: newMode }),
      });
      const data = await res.json();
      if (res.ok) {
        setQueries((q) => [...q, data]);
        setNewTerm("");
        flash("success", "Query added");
      } else {
        flash("error", data.detail || "Failed to add");
      }
    } catch {
      flash("error", "Network error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const res = await apiFetch(`/api/settings/queries/${id}`, { method: "DELETE" });
      if (res.ok) setQueries((q) => q.filter((x) => x.id !== id));
    } catch {
      flash("error", "Failed to delete");
    }
  };

  const handleToggle = async (id, enabled) => {
    try {
      const res = await apiFetch(`/api/settings/queries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !enabled }),
      });
      if (res.ok)
        setQueries((q) =>
          q.map((x) => (x.id === id ? { ...x, enabled: !enabled ? 1 : 0 } : x))
        );
    } catch {
      flash("error", "Failed to toggle");
    }
  };

  return (
    <div style={s.page}>
      {/* Page header */}
      <div style={s.pageHeader}>
        <div style={{ maxWidth: 720, width: "100%", padding: "0 32px" }}>
          <h2 style={s.title}>Job Filter</h2>
          <p style={s.subtitle}>
            Manage job portals and search queries. Changes take effect on the next pipeline run.
          </p>
        </div>
      </div>

      <div style={s.content}>
        {/* Flash message */}
        {msg && (
          <div style={{
            ...s.flash,
            background: msg.type === "error" ? "#7f1d1d" : "#1e3a2e",
            borderColor: msg.type === "error" ? "#ef4444" : "#22c55e",
            color: msg.type === "error" ? "#fca5a5" : "#86efac",
          }}>
            {msg.text}
          </div>
        )}

        {/* Portals section */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Job Portals</h3>
          <div style={s.portalList}>
            {portals.map((p) => {
              const meta = PORTAL_META[p.name] || {};
              const on = Boolean(p.enabled);
              return (
                <div key={p.name} style={{ ...s.portalRow, opacity: on ? 1 : 0.5 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={s.portalIcon}>{meta.icon}</span>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={s.portalName}>{meta.label}</span>
                        {p.api_key_required ? (
                          <span style={s.keyBadge}>Needs API Key</span>
                        ) : (
                          <span style={s.freeBadge}>Free</span>
                        )}
                      </div>
                      <span style={s.portalDesc}>{meta.desc}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleTogglePortal(p.name, on)}
                    style={{ ...s.toggleBtn, background: on ? "#166534" : "#374151" }}
                  >
                    {on ? "ON ✓" : "OFF"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Add new query */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>Add Search Query</h3>
          <div style={s.addRow}>
            <input
              placeholder="Job title (e.g. Java Backend Developer)"
              value={newTerm}
              onChange={(e) => setNewTerm(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              style={s.input}
            />
            <select
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              style={s.select}
            >
              {CITIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div style={{ ...s.addRow, marginTop: 8 }}>
            <div style={s.modeGroup}>
              <span style={s.modeLabel}>Work Mode</span>
              <div style={s.modePills}>
                {WORK_MODES.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setNewMode(m.value)}
                    style={{
                      ...s.modePill,
                      borderColor: newMode === m.value ? m.color : "#334155",
                      background: newMode === m.value ? `${m.color}22` : "transparent",
                      color: newMode === m.value ? m.color : "#64748b",
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={handleAdd}
              disabled={saving || !newTerm.trim()}
              style={{ ...s.addBtn, opacity: saving || !newTerm.trim() ? 0.5 : 1, marginLeft: "auto" }}
            >
              + Add
            </button>
          </div>
        </div>

        {/* Queries list */}
        <div style={s.section}>
          <h3 style={s.sectionTitle}>
            Active Queries
            <span style={s.badge}>{queries.filter((q) => q.enabled).length} enabled</span>
          </h3>
          {queries.length === 0 ? (
            <p style={s.empty}>No search queries yet. Add one above.</p>
          ) : (
            <div style={s.list}>
              {queries.map((q) => (
                <div key={q.id} style={{ ...s.queryRow, opacity: q.enabled ? 1 : 0.45 }}>
                  <div style={s.queryInfo}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={s.queryTerm}>{q.search_term}</span>
                      {(() => {
                        const m = WORK_MODES.find((x) => x.value === q.work_mode) || WORK_MODES[0];
                        return (
                          <span style={{
                            fontSize: 10, fontWeight: 700, padding: "2px 7px",
                            borderRadius: 20, border: `1px solid ${m.color}44`,
                            background: `${m.color}18`, color: m.color,
                            letterSpacing: "0.04em",
                          }}>
                            {m.label}
                          </span>
                        );
                      })()}
                    </div>
                    <span style={s.queryLocation}>
                      <span style={s.locationDot} />
                      {q.location}
                    </span>
                  </div>
                  <div style={s.queryActions}>
                    <button
                      onClick={() => handleToggle(q.id, q.enabled)}
                      style={{ ...s.toggleBtn, background: q.enabled ? "#166534" : "#374151" }}
                      title={q.enabled ? "Disable" : "Enable"}
                    >
                      {q.enabled ? "ON" : "OFF"}
                    </button>
                    <button
                      onClick={() => handleDelete(q.id)}
                      style={s.deleteBtn}
                      title="Delete query"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info note */}
        <div style={s.infoBox}>
          <strong style={{ color: "#818cf8" }}>Note:</strong>
          <span style={{ color: "#94a3b8" }}>
            {" "}Jobs are fetched from Remotive (remote-only). City targeting helps you
            track which market you're targeting per query. Future updates will add
            city-specific job board searches (Adzuna, LinkedIn).
          </span>
        </div>
      </div>
    </div>
  );
}

const s = {
  page: { flex: 1, overflowY: "auto", background: "#0f172a" },
  pageHeader: {
    padding: "20px 32px",
    borderBottom: "1px solid #1e293b",
    background: "#161b27",
    display: "flex",
    justifyContent: "center",
  },
  title: { fontSize: 20, fontWeight: 700, color: "#f1f5f9", margin: 0 },
  subtitle: { fontSize: 12, color: "#64748b", marginTop: 4 },
  content: { maxWidth: 720, width: "100%", margin: "0 auto", padding: "24px 32px", display: "flex", flexDirection: "column", gap: 0 },
  flash: {
    marginBottom: 16, padding: "8px 14px", borderRadius: 6,
    border: "1px solid", fontSize: 13,
  },
  section: { padding: "20px 0", borderBottom: "1px solid #1e293b" },
  sectionTitle: {
    fontSize: 13, fontWeight: 600, color: "#94a3b8",
    textTransform: "uppercase", letterSpacing: "0.05em",
    marginBottom: 12, display: "flex", alignItems: "center", gap: 8,
  },
  badge: {
    fontSize: 11, background: "#1e293b", border: "1px solid #334155",
    color: "#64748b", borderRadius: 20, padding: "2px 8px",
    textTransform: "none", letterSpacing: 0,
  },
  addRow: { display: "flex", gap: 8, flexWrap: "wrap" },
  input: {
    flex: 1, minWidth: 200, background: "#1e293b", border: "1px solid #334155",
    color: "#e2e8f0", borderRadius: 6, padding: "8px 12px", fontSize: 13,
    outline: "none",
  },
  select: {
    background: "#1e293b", border: "1px solid #334155", color: "#e2e8f0",
    borderRadius: 6, padding: "8px 10px", fontSize: 13, cursor: "pointer",
    minWidth: 140,
  },
  addBtn: {
    background: "#4f46e5", color: "#fff", border: "none",
    borderRadius: 6, padding: "8px 16px", fontSize: 13,
    fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
  },
  list: { display: "flex", flexDirection: "column", gap: 8 },
  empty: { color: "#475569", fontSize: 13 },
  queryRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    background: "#1e293b", border: "1px solid #1e293b", borderRadius: 8,
    padding: "10px 14px", gap: 12,
  },
  queryInfo: { display: "flex", flexDirection: "column", gap: 3, flex: 1, minWidth: 0 },
  queryTerm: { fontSize: 14, fontWeight: 600, color: "#e2e8f0" },
  queryLocation: {
    fontSize: 12, color: "#64748b",
    display: "flex", alignItems: "center", gap: 5,
  },
  locationDot: {
    width: 6, height: 6, borderRadius: "50%",
    background: "#6366f1", display: "inline-block", flexShrink: 0,
  },
  queryActions: { display: "flex", gap: 6, alignItems: "center" },
  toggleBtn: {
    fontSize: 10, fontWeight: 700, color: "#fff",
    border: "none", borderRadius: 4, padding: "3px 8px",
    cursor: "pointer", letterSpacing: "0.05em",
  },
  deleteBtn: {
    background: "transparent", border: "1px solid #374151",
    color: "#64748b", borderRadius: 4, padding: "3px 8px",
    cursor: "pointer", fontSize: 12, lineHeight: 1,
  },
  portalList: { display: "flex", flexDirection: "column", gap: 8 },
  portalRow: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    background: "#1e293b", border: "1px solid #1e293b", borderRadius: 8, padding: "10px 14px",
  },
  portalIcon: { fontSize: 20 },
  portalName: { fontSize: 14, fontWeight: 600, color: "#e2e8f0" },
  portalDesc: { fontSize: 11, color: "#64748b", marginTop: 2, display: "block" },
  freeBadge: { fontSize: 10, fontWeight: 700, color: "#22c55e", background: "#22c55e18", border: "1px solid #22c55e33", borderRadius: 10, padding: "1px 6px" },
  keyBadge:  { fontSize: 10, fontWeight: 700, color: "#f59e0b", background: "#f59e0b18", border: "1px solid #f59e0b33", borderRadius: 10, padding: "1px 6px" },
  modeGroup: { display: "flex", alignItems: "center", gap: 10 },
  modeLabel: { fontSize: 12, color: "#64748b", whiteSpace: "nowrap" },
  modePills: { display: "flex", gap: 6 },
  modePill: {
    padding: "5px 12px", borderRadius: 20, border: "1px solid",
    fontSize: 12, fontWeight: 500, cursor: "pointer",
    transition: "all 0.15s",
  },
  infoBox: {
    marginTop: 24, padding: "12px 14px",
    background: "#1e1b4b", border: "1px solid #312e81",
    borderRadius: 6, fontSize: 12, lineHeight: 1.6,
  },
};
