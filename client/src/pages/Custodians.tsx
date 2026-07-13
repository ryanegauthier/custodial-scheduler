import { useState, useEffect } from "react";
import { api } from "../api";
import type { Custodian } from "@shared/types";
import type { CustodianCreateRequest } from "@shared/schemas";

const SHIFTS = [
  { id: 1, label: "4am Shift" },
  { id: 2, label: "5am Shift" },
  { id: 3, label: "6am Shift" },
];

export default function Custodians() {
  const [custodians, setCustodians] = useState<Custodian[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<CustodianCreateRequest>({ name: "", shift_template_id: 1 });

  async function load() {
    setCustodians(await api.getCustodians());
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

  const byShift = SHIFTS.map(s => ({
    ...s,
    members: custodians.filter(c => c.shift_template_id === s.id),
  }));

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Custodians</div>
          <div className="page-subtitle">{custodians.length} active staff across 3 shifts</div>
        </div>
        <button className="btn-primary" onClick={() => setAdding(!adding)}>
          {adding ? "Cancel" : "+ Add Custodian"}
        </button>
      </div>

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
        {byShift.map(shift => (
          <div key={shift.id} className="card" style={{ padding: 0 }}>
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
                No custodians on this shift
              </div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Shift</th>
                    <th>Productive Hours</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {shift.members.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.name}</td>
                      <td className="text-mono" style={{ color: "var(--gold)" }}>{c.start_time}</td>
                      <td className="text-mono">{((c.productive_min || 420) / 60).toFixed(1)} hrs</td>
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
        ))}
      </div>
    </>
  );
}
