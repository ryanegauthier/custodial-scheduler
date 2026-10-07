import { useState, useEffect } from "react";
import { api } from "../api";
import type { Building, Custodian, CustodianAssignment } from "@shared/types";
import type { AssignmentCreateRequest } from "@shared/schemas";

const emptyForm = (): AssignmentCreateRequest => ({
  custodian_id: 0,
  building_id: 0,
  assignment_type: "primary",
  days_of_week: "",
  notes: "",
});

function chipLabel(a: CustodianAssignment): string {
  let label = a.building_name ?? "";
  if (a.days_of_week) label += ` (${a.days_of_week})`;
  if (a.notes) label += ` - ${a.notes}`;
  return label;
}

export default function Assignments() {
  const [assignments, setAssignments] = useState<CustodianAssignment[]>([]);
  const [custodians, setCustodians] = useState<Custodian[]>([]);
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<AssignmentCreateRequest>(emptyForm());

  async function load() {
    const [a, c, b] = await Promise.all([
      api.getAssignments(),
      api.getCustodians(),
      api.getBuildings(),
    ]);
    setAssignments(a);
    setCustodians(c);
    setBuildings(b);
  }

  useEffect(() => { load(); }, []);

  async function addAssignment() {
    if (!form.custodian_id || !form.building_id) return;
    await api.addAssignment({
      ...form,
      days_of_week: form.days_of_week?.trim() ? form.days_of_week.trim() : null,
      notes: form.notes?.trim() ? form.notes.trim() : null,
    });
    setForm(emptyForm());
    setAdding(false);
    load();
  }

  async function removeAssignment(id: number) {
    await api.deleteAssignment(id);
    load();
  }

  // One row per custodian, like the whiteboard - including anyone with no
  // standing assignment yet (Amos, Isaiah, Hope, Oksana on the current
  // board), not just custodians who happen to have a row in
  // custodian_assignments.
  const byCustodian = new Map<number, CustodianAssignment[]>();
  for (const a of assignments) {
    const list = byCustodian.get(a.custodian_id) ?? [];
    list.push(a);
    byCustodian.set(a.custodian_id, list);
  }
  const roster = [...custodians].sort((x, y) => x.name.localeCompare(y.name));

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Assignments</div>
          <div className="page-subtitle">Standing building assignments - edit when they change (~once a semester)</div>
        </div>
        <button className="btn-primary" onClick={() => setAdding(!adding)}>
          {adding ? "Cancel" : "+ Add Assignment"}
        </button>
      </div>

      {adding && (
        <div className="card flex gap-12 items-center" style={{ flexWrap: "wrap" }}>
          <select
            value={form.custodian_id}
            onChange={e => setForm(f => ({ ...f, custodian_id: +e.target.value }))}
          >
            <option value={0}>Custodian…</option>
            {custodians.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select
            value={form.building_id}
            onChange={e => setForm(f => ({ ...f, building_id: +e.target.value }))}
          >
            <option value={0}>Building…</option>
            {buildings.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select
            value={form.assignment_type}
            onChange={e => setForm(f => ({ ...f, assignment_type: e.target.value as "primary" | "secondary" }))}
          >
            <option value="primary">Primary</option>
            <option value="secondary">Secondary</option>
          </select>
          <input
            type="text"
            placeholder="Days (e.g. tue,wed,thu,fri,sat - blank = all days)"
            value={form.days_of_week ?? ""}
            onChange={e => setForm(f => ({ ...f, days_of_week: e.target.value }))}
            style={{ flex: 1, minWidth: 220 }}
          />
          <input
            type="text"
            placeholder="Notes"
            value={form.notes ?? ""}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            style={{ flex: 1, minWidth: 160 }}
          />
          <button className="btn-primary" onClick={addAssignment} disabled={!form.custodian_id || !form.building_id}>
            Add
          </button>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <table style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: "10%" }} />
            <col style={{ width: "50%" }} />
            <col style={{ width: "40%" }} />
          </colgroup>
          <thead>
            <tr>
              <th>Custodian</th>
              <th>Building Coverage</th>
              <th>Additional Coverage</th>
            </tr>
          </thead>
          <tbody>
            {roster.map(c => {
              const rows = byCustodian.get(c.id) ?? [];
              const primary = rows.filter(r => r.assignment_type === "primary");
              const secondary = rows.filter(r => r.assignment_type === "secondary");
              return (
                <tr key={c.id}>
                  <td style={{ fontWeight: 600, verticalAlign: "top", wordBreak: "break-word" }}>{c.name}</td>
                  <td>
                    {primary.length === 0 && <span className="text-muted">-</span>}
                    {primary.map(a => (
                      <span key={a.id} className="coverage-chip">
                        {chipLabel(a)}
                        <button className="coverage-chip-remove" onClick={() => removeAssignment(a.id)} title="Remove">×</button>
                      </span>
                    ))}
                  </td>
                  <td>
                    {secondary.length === 0 && <span className="text-muted">-</span>}
                    {secondary.map(a => (
                      <span key={a.id} className="coverage-chip coverage-chip-secondary">
                        {chipLabel(a)}
                        <button className="coverage-chip-remove" onClick={() => removeAssignment(a.id)} title="Remove">×</button>
                      </span>
                    ))}
                  </td>
                </tr>
              );
            })}
            {roster.length === 0 && (
              <tr>
                <td colSpan={3} style={{ textAlign: "center", padding: 40, color: "var(--text-muted)" }}>
                  No custodians yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
