import { useState, useEffect } from "react";
import { api } from "../api";
import type { Building } from "@shared/types";

const LEVELS = [1, 2, 3] as const;
type Level = (typeof LEVELS)[number];

function hoursAtLevel(b: Building, level: number): number | null {
  return level === 1 ? b.daily_hours_l1 : level === 3 ? b.daily_hours_l3 : b.daily_hours_l2;
}

export default function Buildings() {
  const [buildings, setBuildings] = useState<Building[]>([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkLevel, setBulkLevel] = useState<Level>(2);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    api.getBuildings().then(setBuildings);
  }, []);

  const categories = [...new Set(buildings.map(b => b.category).filter((c): c is string => Boolean(c)))].sort();

  const filtered = buildings.filter(b => {
    const matchSearch = b.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || b.category === filterCat;
    return matchSearch && matchCat;
  });

  const totalSqft = filtered.reduce((s, b) => s + (b.total_sqft || 0), 0);
  const totalHrs  = filtered.reduce((s, b) => s + (hoursAtLevel(b, b.target_appa_level ?? 2) || 0), 0);

  async function setLevel(id: number, level: Level) {
    setBuildings(bs => bs.map(b => (b.id === id ? { ...b, target_appa_level: level } : b)));
    await api.updateBuilding(id, { target_appa_level: level });
  }

  function toggleSelected(id: number) {
    setSelected(s => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAllFiltered() {
    const filteredIds = filtered.map(b => b.id);
    const allSelected = filteredIds.every(id => selected.has(id));
    setSelected(allSelected ? new Set() : new Set(filteredIds));
  }

  async function applyBulkLevel() {
    if (selected.size === 0) return;
    setApplying(true);
    try {
      const ids = [...selected];
      await Promise.all(ids.map(id => api.updateBuilding(id, { target_appa_level: bulkLevel })));
      setBuildings(bs => bs.map(b => (selected.has(b.id) ? { ...b, target_appa_level: bulkLevel } : b)));
      setSelected(new Set());
    } finally {
      setApplying(false);
    }
  }

  const allFilteredSelected = filtered.length > 0 && filtered.every(b => selected.has(b.id));

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Buildings</div>
          <div className="page-subtitle">{filtered.length} buildings · {totalSqft.toLocaleString()} sqft · {totalHrs.toFixed(1)} daily hrs (at each building's own level)</div>
        </div>
        <div className="flex gap-8 items-center">
          <input
            type="text"
            placeholder="Search buildings…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: 200 }}
          />
          <select value={filterCat} onChange={e => setFilterCat(e.target.value)}>
            <option value="all">All categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {selected.size > 0 && (
        <div className="card flex gap-12 items-center">
          <strong style={{ fontSize: 13 }}>{selected.size} selected</strong>
          <span className="text-muted" style={{ fontSize: 12 }}>Set APPA level to</span>
          <select value={bulkLevel} onChange={e => setBulkLevel(+e.target.value as Level)}>
            {LEVELS.map(l => <option key={l} value={l}>L{l}</option>)}
          </select>
          <button className="btn-primary" onClick={applyBulkLevel} disabled={applying}>
            {applying ? "Applying…" : `Apply to ${selected.size}`}
          </button>
          <button className="btn-ghost" onClick={() => setSelected(new Set())}>Clear selection</button>
        </div>
      )}

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 32 }}>
                <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAllFiltered} />
              </th>
              <th>Building</th>
              <th>Category</th>
              <th>Zone</th>
              <th>Total SqFt</th>
              <th>Daily Hrs L1</th>
              <th>Daily Hrs L2</th>
              <th>Daily Hrs L3</th>
              <th>APPA Level</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(b => (
              <tr key={b.id}>
                <td>
                  <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleSelected(b.id)} />
                </td>
                <td style={{ fontWeight: 500 }}>{b.name}</td>
                <td>
                  <span className="badge badge-blue">{b.category}</span>
                </td>
                <td>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {b.zone_color && (
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: b.zone_color, display: "inline-block" }} />
                    )}
                    {b.zone_name || <span className="text-muted">-</span>}
                  </span>
                </td>
                <td className="text-mono">{b.total_sqft?.toLocaleString()}</td>
                <td className="text-mono" style={{ color: (b.target_appa_level ?? 2) === 1 ? "var(--gold)" : "var(--blue)" }}>{b.daily_hours_l1?.toFixed(2)}</td>
                <td className="text-mono" style={{ color: (b.target_appa_level ?? 2) === 2 ? "var(--gold)" : "var(--green)", fontWeight: 600 }}>{b.daily_hours_l2?.toFixed(2)}</td>
                <td className="text-mono" style={{ color: (b.target_appa_level ?? 2) === 3 ? "var(--gold)" : "var(--text-muted)" }}>{b.daily_hours_l3?.toFixed(2)}</td>
                <td>
                  <select
                    value={b.target_appa_level ?? 2}
                    onChange={e => setLevel(b.id, +e.target.value as Level)}
                  >
                    {LEVELS.map(l => <option key={l} value={l}>L{l}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
