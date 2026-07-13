import { useState, useEffect } from "react";
import { api } from "../api";
import type { DailySchedule } from "@shared/types";
import type { AIRebalanceResult } from "@shared/schemas";

const today = () => new Date().toISOString().slice(0, 10);

const TASK_COLORS: Record<number, string> = { 1: "priority-1", 2: "priority-2", 3: "priority-3", 4: "priority-4", 5: "priority-5" };
const TASK_LABELS: Record<number, string> = { 1: "Floors/Vac", 2: "Restrooms", 3: "Trash (Class)", 4: "Trash (Common)", 5: "Spot Clean" };

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

  async function generateSchedule() {
    setGenerating(true);
    try {
      const { status } = await api.generateSchedule(date);
      if (status === 409) {
        setError("Schedule already exists for this date.");
      } else {
        await fetchSchedule(date);
      }
    } finally {
      setGenerating(false);
    }
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
  const unassigned  = schedule?.unassigned_tasks || [];

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Daily Schedule</div>
          <div className="page-subtitle">Assign custodians to buildings and tasks</div>
        </div>
        <div className="flex gap-8 items-center">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
          {!hasSchedule && (
            <button className="btn-primary" onClick={generateSchedule} disabled={generating}>
              {generating ? "Generating…" : "Generate Schedule"}
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

      {/* Zone coverage summary */}
      {schedule?.zone_coverage && (
        <div className="card">
          <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 12 }}>
            Zone Coverage
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {schedule.zone_coverage.map(z => {
              const pct = z.hours_needed > 0 ? Math.min(100, (z.hours_assigned / z.hours_needed) * 100) : 100;
              const cls = pct < 50 ? "crit" : pct < 80 ? "warn" : "";
              return (
                <div key={z.zone.id}>
                  <div className="flex justify-between items-center" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 13 }}>
                      <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: z.zone.color ?? undefined, marginRight: 8, verticalAlign: "middle" }} />
                      {z.zone.name}
                    </span>
                    <span style={{ fontSize: 12, fontFamily: "var(--font-mono)", color: pct < 80 ? "var(--yellow)" : "var(--text-muted)" }}>
                      {z.hours_assigned.toFixed(1)} / {z.hours_needed.toFixed(1)} hrs
                    </span>
                  </div>
                  <div className="coverage-bar">
                    <div className={`coverage-bar-fill ${cls}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading && <div className="text-muted">Loading…</div>}
      {error && <div className="alert alert-err">{error}</div>}

      {/* Custodian schedule cards */}
      {!loading && !hasSchedule && (
        <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
          No schedule for {date}. Generate one to get started.
        </div>
      )}

      {hasSchedule && schedule && (
        <>
          <div className="schedule-grid">
            {schedule.custodians.map(c => (
              <div key={c.id} className="custodian-card">
                <div className="custodian-card-header">
                  <div>
                    <div className="custodian-name">{c.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
                      {c.assigned_hours?.toFixed(1) || "0.0"} hrs assigned
                    </div>
                  </div>
                  <div className="custodian-shift">{c.start_time}</div>
                </div>
                <div className="custodian-tasks">
                  {c.tasks.length === 0 && (
                    <div style={{ color: "var(--text-muted)", fontSize: 12, padding: "8px 4px" }}>No tasks assigned</div>
                  )}
                  {c.tasks.map(t => (
                    <div key={t.id} className={`task-row ${TASK_COLORS[t.priority ?? -1] || ""}`}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="task-building">{t.building_name}</div>
                        <div className="task-type">{TASK_LABELS[t.task_type_id] || t.task_name}</div>
                      </div>
                      <div className="task-hours">{t.estimated_hours?.toFixed(1)}h</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Unassigned tasks */}
          {unassigned.length > 0 && (
            <div className="card">
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--red)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
                ⚠️ {unassigned.length} Unassigned Tasks
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Building</th>
                    <th>Zone</th>
                    <th>Task</th>
                    <th>Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {unassigned.map(t => (
                    <tr key={t.id}>
                      <td>{t.building_name}</td>
                      <td><span style={{ color: t.zone_color ?? undefined, fontWeight: 500 }}>{t.zone_name}</span></td>
                      <td>{TASK_LABELS[t.task_type_id] || t.task_name}</td>
                      <td className="text-mono">{t.estimated_hours?.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
