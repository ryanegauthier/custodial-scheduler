import { useState, useEffect, useRef } from "react";
import { api } from "../api";
import type { Custodian } from "@shared/types";
import type { CustodianCreateRequest } from "@shared/schemas";

const SHIFTS = [
  { id: 1, label: "4am Shift" },
  { id: 2, label: "5am Shift" },
  { id: 3, label: "6am Shift" },
  { id: 4, label: "2pm Shift" },
  { id: 5, label: "3pm Shift" },
];

// Same UTC-based "today" as ScheduleBoard.tsx, so a callout toggled here
// lands on the same date the Schedule Board regenerates by default.
const today = () => new Date().toISOString().slice(0, 10);

// Browsers (Chrome/Edge on Windows especially) ignore the mouse wheel
// during a native HTML5 drag, so a long roster can't be scrolled to reach
// a far shift. Instead, dragging within EDGE_PX of the scroll container's
// top/bottom edge auto-scrolls it, faster the closer to the edge.
const EDGE_PX = 80;
const MAX_SCROLL_PX_PER_FRAME = 18;

export default function Custodians() {
  const [custodians, setCustodians] = useState<Custodian[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<CustodianCreateRequest>({ name: "", shift_template_id: 1 });
  const [hoveredShift, setHoveredShift] = useState<string | null>(null);
  // Set after any Out/In toggle - the day's schedule was generated against
  // the old roster and stays stale until regenerated.
  const [scheduleStale, setScheduleStale] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  // Edge auto-scroll state for the current drag, if one is in progress.
  const autoScroll = useRef<{ stop: () => void } | null>(null);

  useEffect(() => () => autoScroll.current?.stop(), []);

  async function load() {
    setCustodians(await api.getCustodians(today()));
  }

  useEffect(() => { load(); }, []);

  async function addCustodian() {
    await api.addCustodian(form);
    setForm({ name: "", shift_template_id: 1 });
    setAdding(false);
    load();
  }

  async function deactivate(id: number) {
    if (!confirm("Remove this custodian?")) return;
    await api.deactivateCustodian(id);
    load();
  }

  // Approval only affects future generate runs, so unlike toggleOut this
  // doesn't mark today's schedule stale.
  async function toggleCoverage(c: Custodian) {
    await api.updateCustodian(c.id, { coverage_approved: c.coverage_approved ? 0 : 1 });
    load();
  }

  async function toggleOut(c: Custodian) {
    if (c.callout_id) {
      await api.deleteCustodianStatus(c.id, c.callout_id);
    } else {
      const d = today();
      await api.setCustodianStatus(c.id, { status: "callout", effective_date: d, end_date: d });
    }
    setScheduleStale(true);
    load();
  }

  async function regenerateToday() {
    const d = today();
    if (!confirm(`Regenerate the schedule for ${d}? This replaces all current assignments for that day.`)) return;
    setRegenerating(true);
    try {
      await api.generateSchedule(d, true);
      setScheduleStale(false);
    } finally {
      setRegenerating(false);
    }
  }

  function handleDragStart(e: React.DragEvent, custodianId: number) {
    e.dataTransfer.setData("text/plain", String(custodianId));
    e.dataTransfer.effectAllowed = "move";
    startAutoScroll(e.currentTarget.closest(".main-content"));
  }

  function startAutoScroll(scroller: Element | null) {
    autoScroll.current?.stop();
    if (!scroller) return;
    let pointerY: number | null = null;
    let frame = 0;

    // dragover keeps firing on the document while the pointer is held
    // still, but not often enough for smooth scrolling - it only records
    // the position, and the animation frame loop does the scrolling.
    const onDragOver = (ev: DragEvent) => { pointerY = ev.clientY; };
    const tick = () => {
      if (pointerY !== null) {
        const { top, bottom } = scroller.getBoundingClientRect();
        const fromTop = pointerY - top;
        const fromBottom = bottom - pointerY;
        if (fromTop < EDGE_PX) {
          scroller.scrollTop -= MAX_SCROLL_PX_PER_FRAME * (1 - Math.max(fromTop, 0) / EDGE_PX);
        } else if (fromBottom < EDGE_PX) {
          scroller.scrollTop += MAX_SCROLL_PX_PER_FRAME * (1 - Math.max(fromBottom, 0) / EDGE_PX);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("dragend", stop);
      document.removeEventListener("drop", stop);
      autoScroll.current = null;
    };

    document.addEventListener("dragover", onDragOver);
    // dragend fires on the source row even when dropped outside a shift
    // card or cancelled with Esc; drop covers the source row having been
    // re-rendered away by load() before dragend reaches the document.
    document.addEventListener("dragend", stop);
    document.addEventListener("drop", stop);
    frame = requestAnimationFrame(tick);
    autoScroll.current = { stop };
  }

  function handleDragOver(e: React.DragEvent, shiftKey: string) {
    e.preventDefault();
    if (hoveredShift !== shiftKey) setHoveredShift(shiftKey);
  }

  async function handleDrop(e: React.DragEvent, shiftId: number | null) {
    e.preventDefault();
    setHoveredShift(null);
    const custodianId = Number(e.dataTransfer.getData("text/plain"));
    if (!custodianId) return;
    await api.updateCustodian(custodianId, { shift_template_id: shiftId });
    load();
  }

  const byShift = [...SHIFTS, { id: null, label: "Unassigned Shift" }].map(s => ({
    ...s,
    members: custodians.filter(c => c.shift_template_id === s.id),
  }));

  const outCount = custodians.filter(c => c.callout_id).length;
  const coverageCount = custodians.filter(c => c.coverage_approved).length;

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Custodians</div>
          <div className="page-subtitle">
            {custodians.length} active staff
            {outCount > 0 && <> &middot; <span style={{ color: "var(--red)" }}>{outCount} out today</span></>}
            {" "}&middot; {coverageCount} approved for coverage
          </div>
        </div>
        <button className="btn-primary" onClick={() => setAdding(!adding)}>
          {adding ? "Cancel" : "+ Add Custodian"}
        </button>
      </div>

      {scheduleStale && (
        <div className="card flex gap-12 items-center" style={{ borderLeft: "3px solid var(--yellow)" }}>
          <span style={{ flex: 1, fontSize: 13 }}>
            Today's roster changed. Regenerate today's schedule to pick it up.
          </span>
          <button className="btn-secondary" onClick={() => setScheduleStale(false)} disabled={regenerating}>
            Dismiss
          </button>
          <button className="btn-primary" onClick={regenerateToday} disabled={regenerating}>
            {regenerating ? "Regenerating…" : "Regenerate Today"}
          </button>
        </div>
      )}

      {adding && (
        <div className="card flex gap-12 items-center">
          <input
            type="text"
            placeholder="Name"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            style={{ flex: 1 }}
          />
          <select
            value={form.shift_template_id}
            onChange={e => setForm(f => ({ ...f, shift_template_id: +e.target.value }))}
          >
            {SHIFTS.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
          <button className="btn-primary" onClick={addCustodian} disabled={!form.name.trim()}>
            Add
          </button>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {byShift.map(shift => {
          const shiftKey = String(shift.id);
          const isHovered = hoveredShift === shiftKey;
          return (
            <div
              key={shiftKey}
              className="card"
              style={{
                padding: 0,
                outline: isHovered ? "2px dashed var(--gold)" : "none",
                outlineOffset: -2,
              }}
              onDragOver={e => handleDragOver(e, shiftKey)}
              onDragLeave={() => setHoveredShift(null)}
              onDrop={e => handleDrop(e, shift.id)}
            >
              <div style={{
                padding: "10px 16px",
                background: "var(--surface-3)",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}>
                <span style={{ fontFamily: "var(--font-mono)", color: "var(--gold)", fontWeight: 600 }}>
                  {shift.label}
                </span>
                <span className="text-muted" style={{ fontSize: 12 }}>
                  {shift.members.length} custodian{shift.members.length !== 1 ? "s" : ""}
                </span>
              </div>
              {shift.members.length === 0 ? (
                <div style={{ padding: "16px", color: "var(--text-muted)", fontSize: 13 }}>
                  Drag a custodian here to assign this shift
                </div>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Shift</th>
                      <th>Productive Hours</th>
                      <th>Today</th>
                      <th>Coverage</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {shift.members.map(c => (
                      <tr
                        key={c.id}
                        draggable
                        onDragStart={e => handleDragStart(e, c.id)}
                        style={{ cursor: "grab" }}
                      >
                        <td style={{ fontWeight: 500 }}>{c.name}</td>
                        <td className="text-mono" style={{ color: "var(--gold)" }}>{c.start_time}</td>
                        <td className="text-mono">{((c.productive_min || 450) / 60).toFixed(1)} hrs</td>
                        <td>
                          <button
                            className={`badge ${c.callout_id ? "badge-red" : "badge-green"}`}
                            style={{ border: "none", cursor: "pointer" }}
                            title={c.callout_id ? "Called out today - click to mark in" : "Click to mark out for today"}
                            onClick={() => toggleOut(c)}
                          >
                            {c.callout_id ? "Out" : "In"}
                          </button>
                        </td>
                        <td>
                          <button
                            className={c.coverage_approved ? "badge badge-blue" : "badge"}
                            style={{ border: "none", cursor: "pointer", opacity: c.coverage_approved ? 1 : 0.5 }}
                            title={c.coverage_approved
                              ? "Approved to cover called-out custodians' restrooms and trash - click to remove"
                              : "Click to approve for coverage"}
                            onClick={() => toggleCoverage(c)}
                          >
                            {c.coverage_approved ? "Approved" : "No"}
                          </button>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            className="btn-ghost"
                            style={{ fontSize: 11, padding: "3px 10px", color: "var(--red)" }}
                            onClick={() => deactivate(c.id)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
