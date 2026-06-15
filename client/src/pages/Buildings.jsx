import { useState, useEffect } from "react";

export default function Buildings() {
  const [buildings, setBuildings] = useState([]);
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("all");

  useEffect(() => {
    fetch("/api/buildings")
      .then(r => r.json())
      .then(setBuildings);
  }, []);

  const categories = [...new Set(buildings.map(b => b.category).filter(Boolean))].sort();

  const filtered = buildings.filter(b => {
    const matchSearch = b.name.toLowerCase().includes(search.toLowerCase());
    const matchCat = filterCat === "all" || b.category === filterCat;
    return matchSearch && matchCat;
  });

  const totalSqft = filtered.reduce((s, b) => s + (b.total_sqft || 0), 0);
  const totalHrs  = filtered.reduce((s, b) => s + (b.daily_hours_l2 || 0), 0);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Buildings</div>
          <div className="page-subtitle">{filtered.length} buildings · {totalSqft.toLocaleString()} sqft · {totalHrs.toFixed(1)} daily hrs (L2)</div>
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

      <div className="card" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Building</th>
              <th>Category</th>
              <th>Zone</th>
              <th>Total SqFt</th>
              <th>Daily Hrs L1</th>
              <th>Daily Hrs L2</th>
              <th>Daily Hrs L3</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(b => (
              <tr key={b.id}>
                <td style={{ fontWeight: 500 }}>{b.name}</td>
                <td>
                  <span className="badge badge-blue">{b.category}</span>
                </td>
                <td>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {b.zone_color && (
                      <span style={{ width: 8, height: 8, borderRadius: 2, background: b.zone_color, display: "inline-block" }} />
                    )}
                    {b.zone_name || <span className="text-muted">—</span>}
                  </span>
                </td>
                <td className="text-mono">{b.total_sqft?.toLocaleString()}</td>
                <td className="text-mono" style={{ color: "var(--blue)" }}>{b.daily_hours_l1?.toFixed(2)}</td>
                <td className="text-mono" style={{ color: "var(--green)", fontWeight: 600 }}>{b.daily_hours_l2?.toFixed(2)}</td>
                <td className="text-mono" style={{ color: "var(--text-muted)" }}>{b.daily_hours_l3?.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
