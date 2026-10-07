import { useState, useEffect } from "react";
import { api } from "../api";
import type { DailySchedule } from "@shared/types";
import type { AIRebalanceResult } from "@shared/schemas";

const today = () => new Date().toISOString().slice(0, 10);

// Hardcoded per the "7hr productive limit" indicator spec - distinct from
// shift_templates.productive_min (7.5hr), which describes shift capacity,
// not this UI warning threshold.
const NEAR_LIMIT_HOURS = 6.5;
const AT_LIMIT_HOURS = 7;

export default function ScheduleBoard() {
  const [date, setDate] = useState(today());
  const [schedule, setSchedule] = useState<DailySchedule | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSummary, setAiSummary] = useState<AIRebalanceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function fetchSchedule(d: string) {
    setLoading(true);
    setError(null);
    try {
      setSchedule(await api.getSchedule(d));
    } catch {
      setError("Could not load schedule.");
    } finally {
      setLoading(false);
    }
  }

  async function generateSchedule(force = false) {
    setGenerating(true);
    try {
      const { status } = await api.generateSchedule(date, force);
      if (status === 409) {
        setError("Schedule already exists for this date.");
      } else {
        setError(null);
        await fetchSchedule(date);
      }
    } finally {
      setGenerating(false);
    }
  }

  function regenerateSchedule() {
    if (!confirm(`Regenerate the schedule for ${date}? This replaces all current assignments for that day.`)) return;
    generateSchedule(true);
  }

  async function handleCalloutRebalance() {
    setAiLoading(true);
    setAiSummary(null);
    try {
      const { data } = await api.aiRebalance(date);
      setAiSummary(data);
    } finally {
      setAiLoading(false);
    }
  }

  useEffect(() => { fetchSchedule(date); }, [date]);

  const hasSchedule = Boolean(schedule && schedule.tasks && schedule.tasks.length > 0);
  const disruptions = schedule?.disruptions || [];
  const gaps = schedule?.coverage_gaps || [];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Daily Schedule</div>
          <div className="page-subtitle">Standing assignments, with today's exceptions</div>
        </div>
        <div className="flex gap-8 items-center">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
          {!hasSchedule && (
            <button className="btn-primary" onClick={() => generateSchedule(false)} disabled={generating}>
              {generating ? "Generating…" : "Generate Schedule"}
            </button>
          )}
          {hasSchedule && (
            <button className="btn-secondary" onClick={regenerateSchedule} disabled={generating}>
              {generating ? "Regenerating…" : "Regenerate"}
            </button>
          )}
          {hasSchedule && disruptions.length > 0 && (
            <button className="btn-secondary" onClick={handleCalloutRebalance} disabled={aiLoading}>
              {aiLoading ? "AI thinking…" : "⚡ AI Rebalance"}
            </button>
          )}
        </div>
      </div>

      {/* Disruption alerts */}
      {disruptions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {disruptions.map(d => (
            <div key={d.id} className="alert alert-warn">
              ⚠️ <strong>{d.custodian_name || d.building_name}</strong> - {d.type}
              {d.description && `: ${d.description}`}
            </div>
          ))}
        </div>
      )}

      {/* AI rebalance result */}
      {aiSummary && (
        <div className="card">
          <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
            <strong style={{ color: "var(--gold)" }}>⚡ AI Rebalance Suggestion</strong>
            <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => setAiSummary(null)}>Dismiss</button>
          </div>
          <p style={{ fontSize: 13, marginBottom: 10 }}>{aiSummary.summary}</p>
          {aiSummary.warnings?.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {aiSummary.warnings.map((w, i) => (
                <div key={i} className="alert alert-err" style={{ fontSize: 12 }}>⚠️ {w}</div>
              ))}
            </div>
          )}
          {aiSummary.reassignments?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Suggested Reassignments
              </div>
              {aiSummary.reassignments.map((r, i) => (
                <div key={i} style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px solid var(--border)" }}>
                  Task #{r.task_id} → Custodian #{r.new_custodian_id} - {r.reason}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {loading && <div className="text-muted">Loading…</div>}
      {error && <div className="alert alert-err">{error}</div>}

      {!loading && !hasSchedule && (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
          No schedule for {date}. Generate one to get started.
        </div>
      )}

      {hasSchedule && schedule && (
        <div className="schedule-columns">
          {/* Left: custodians on today, with their standing buildings */}
          <div>
            <div className="column-heading">On Today ({schedule.custodians.length})</div>
            <div className="schedule-grid">
              {schedule.custodians.map(c => {
                const hrs = c.assigned_hours || 0;
                const limitClass = hrs >= AT_LIMIT_HOURS ? "at-limit" : hrs >= NEAR_LIMIT_HOURS ? "near-limit" : "";
                return (
                  <div key={c.id} className="custodian-card">
                    <div className="custodian-card-header">
                      <div>
                        <div className="custodian-name">{c.name}</div>
                        <div className={`custodian-hours ${limitClass}`} style={{ fontSize: 11, marginTop: 2 }}>
                          {hrs.toFixed(1)} hrs
                          {limitClass === "at-limit" && " · at 7hr limit"}
                          {limitClass === "near-limit" && " · near 7hr limit"}
                        </div>
                      </div>
                      <div className="custodian-shift">{c.start_time}</div>
                    </div>
                    <div className="custodian-tasks">
                      {c.tasks.length === 0 && (
                        <div style={{ color: "var(--text-muted)", fontSize: 12, padding: "8px 4px" }}>No buildings today</div>
                      )}
                      {c.tasks.map(t => (
                        <div key={t.id} className="task-row">
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div className="task-building">{t.building_name}</div>
                          </div>
                          <div className="task-hours">{t.estimated_hours?.toFixed(1)}h</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: coverage gaps - buildings whose custodian is out */}
          <div>
            <div className="column-heading">Coverage Gaps ({gaps.length})</div>
            {gaps.length === 0 && (
              <div className="card" style={{ textAlign: "center", padding: 24, color: "var(--text-muted)" }}>
                No gaps - every standing assignment is covered today.
              </div>
            )}
            {gaps.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {gaps.map(g => (
                  <div key={g.building_id} className="card gap-card">
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="gap-building">{g.building_name}</div>
                        {g.zone_name && (
                          <div style={{ fontSize: 12, color: g.zone_color ?? "var(--text-muted)", marginTop: 2 }}>
                            {g.zone_name}
                          </div>
                        )}
                      </div>
                      <div>
                        <div className="gap-hours">{(g.daily_hours ?? 0).toFixed(1)}h</div>
                        <div style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "right", marginTop: 2 }}>L{g.target_appa_level}</div>
                      </div>
                    </div>
                    <div className="gap-reason">
                      {g.unavailable.map(u => `${u.custodian_name} (${u.status})`).join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
