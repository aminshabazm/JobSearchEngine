import { useEffect, useState } from "react";
import { apiFetch } from "../api.js";

export default function TokenMeter() {
  const [stats, setStats] = useState(null);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    const load = () =>
      apiFetch("/api/token-usage")
        .then((r) => r.json())
        .then(setStats)
        .catch(() => {});
    load();
    const id = setInterval(load, 8000);
    return () => clearInterval(id);
  }, []);

  if (!stats) return null;

  const totalPct = stats.total_available > 0
    ? Math.min(100, (stats.total_used / stats.total_available) * 100)
    : 0;

  const allExhausted = stats.keys.every((k) => k.exhausted);
  const usingGemini = stats.gemini_active;
  const statusColor = usingGemini ? "#a78bfa" : allExhausted ? "#ef4444" : totalPct > 70 ? "#f59e0b" : "#22c55e";

  return (
    <div
      style={s.wrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {/* Compact summary row */}
      <div style={s.row}>
        <span style={{ ...s.label, color: statusColor }}>⚡</span>
        {usingGemini ? (
          <span style={{ ...s.label, color: "#a78bfa", fontWeight: 600 }}>Gemini</span>
        ) : (
          <span style={s.label}>Key {stats.active_key}/{stats.keys_total}</span>
        )}
        <span style={{ ...s.label, color: "#475569" }}>·</span>
        <span style={s.label}>
          {(stats.total_used / 1000).toFixed(1)}k
          <span style={{ color: "#475569" }}> / {(stats.total_available / 1000).toFixed(0)}k</span>
        </span>
      </div>

      {/* Per-key mini bars */}
      <div style={s.bars}>
        {stats.keys.map((k) => {
          const isActive = k.key === stats.active_key && !k.exhausted;
          const barColor = k.exhausted ? "#ef4444" : isActive ? "#22c55e" : "#3b82f6";
          return (
            <div key={k.key} style={s.barTrack} title={`Key ${k.key}: ${(k.tokens_used / 1000).toFixed(1)}k / 100k`}>
              <div style={{ ...s.barFill, width: `${k.pct}%`, background: barColor }} />
            </div>
          );
        })}
      </div>

      {/* Hover tooltip — per-key breakdown */}
      {hover && (
        <div style={s.tooltip}>
          <div style={s.tooltipTitle}>Groq Token Usage (resets midnight UTC)</div>
          {stats.keys.map((k) => {
            const isActive = k.key === stats.active_key && !k.exhausted;
            const barColor = k.exhausted ? "#ef4444" : isActive ? "#22c55e" : "#3b82f6";
            return (
              <div key={k.key} style={s.tooltipRow}>
                <div style={s.tooltipLeft}>
                  <span style={{ ...s.keyDot, background: barColor }} />
                  <span style={{ color: isActive ? "#f1f5f9" : "#94a3b8", fontSize: 12 }}>
                    Key {k.key}
                    {isActive && <span style={s.activeBadge}>active</span>}
                    {k.exhausted && <span style={s.exhaustedBadge}>exhausted</span>}
                  </span>
                </div>
                <div style={s.tooltipBarWrap}>
                  <div style={s.tooltipBarTrack}>
                    <div style={{ ...s.tooltipBarFill, width: `${k.pct}%`, background: barColor }} />
                  </div>
                  <span style={s.tooltipCount}>
                    {(k.tokens_used / 1000).toFixed(1)}k / 100k
                  </span>
                </div>
              </div>
            );
          })}
          {stats.gemini_configured && (
            <div style={{ ...s.tooltipRow, marginTop: 4 }}>
              <div style={s.tooltipLeft}>
                <span style={{ ...s.keyDot, background: usingGemini ? "#a78bfa" : "#334155" }} />
                <span style={{ color: usingGemini ? "#a78bfa" : "#475569", fontSize: 12 }}>
                  Gemini Flash
                  {usingGemini && <span style={{ ...s.activeBadge, color: "#a78bfa", background: "#a78bfa18", borderColor: "#a78bfa33" }}>active</span>}
                </span>
              </div>
              <span style={{ ...s.tooltipCount, color: usingGemini ? "#a78bfa" : "#475569" }}>
                {usingGemini ? `${(stats.gemini_tokens / 1000).toFixed(1)}k used` : "standby"}
              </span>
            </div>
          )}
          <div style={s.tooltipFooter}>
            {usingGemini
              ? "Groq exhausted — using Gemini Flash (1M tokens/day)"
              : `Total: ${(stats.total_used / 1000).toFixed(1)}k / ${(stats.total_available / 1000).toFixed(0)}k tokens today`}
          </div>
        </div>
      )}
    </div>
  );
}

const s = {
  wrap: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: 4,
    minWidth: 160,
    cursor: "default",
    userSelect: "none",
  },
  row: { display: "flex", alignItems: "center", gap: 5 },
  label: { fontSize: 11, color: "#94a3b8", whiteSpace: "nowrap" },
  bars: { display: "flex", gap: 3 },
  barTrack: {
    flex: 1, height: 5, background: "#1e293b",
    borderRadius: 3, overflow: "hidden",
  },
  barFill: { height: "100%", borderRadius: 3, transition: "width 0.4s ease" },

  tooltip: {
    position: "absolute",
    top: "calc(100% + 10px)",
    left: 0,
    background: "#1e293b",
    border: "1px solid #334155",
    borderRadius: 10,
    padding: "12px 14px",
    minWidth: 280,
    zIndex: 300,
    boxShadow: "0 12px 32px rgba(0,0,0,0.5)",
  },
  tooltipTitle: {
    fontSize: 11, color: "#64748b", fontWeight: 600,
    textTransform: "uppercase", letterSpacing: "0.05em",
    marginBottom: 10,
  },
  tooltipRow: {
    display: "flex", alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8, gap: 8,
  },
  tooltipLeft: { display: "flex", alignItems: "center", gap: 6, minWidth: 80 },
  keyDot: {
    width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
  },
  activeBadge: {
    fontSize: 9, fontWeight: 700, color: "#22c55e",
    background: "#22c55e18", border: "1px solid #22c55e33",
    borderRadius: 8, padding: "1px 5px", marginLeft: 5,
    textTransform: "uppercase", letterSpacing: "0.04em",
  },
  exhaustedBadge: {
    fontSize: 9, fontWeight: 700, color: "#ef4444",
    background: "#ef444418", border: "1px solid #ef444433",
    borderRadius: 8, padding: "1px 5px", marginLeft: 5,
    textTransform: "uppercase", letterSpacing: "0.04em",
  },
  tooltipBarWrap: { display: "flex", alignItems: "center", gap: 8, flex: 1 },
  tooltipBarTrack: {
    flex: 1, height: 6, background: "#0f172a",
    borderRadius: 4, overflow: "hidden",
  },
  tooltipBarFill: { height: "100%", borderRadius: 4, transition: "width 0.4s ease" },
  tooltipCount: { fontSize: 11, color: "#64748b", whiteSpace: "nowrap", minWidth: 70, textAlign: "right" },
  tooltipFooter: {
    marginTop: 10, paddingTop: 8, borderTop: "1px solid #1e293b",
    fontSize: 11, color: "#64748b",
  },
};
