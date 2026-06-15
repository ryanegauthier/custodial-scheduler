import { useState, useEffect, useRef } from "react";

export default function CampusMap() {
  const [buildings, setBuildings] = useState([]);
  const [zones, setZones] = useState([]);
  const [selected, setSelected] = useState(null);
  const [activeZone, setActiveZone] = useState(null);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const svgRef = useRef(null);

  useEffect(() => {
    fetch("/api/buildings/map").then(r => r.json()).then(setBuildings);
    fetch("/api/zones").then(r => r.json()).then(setZones);
  }, []);

  // Map bounds derived from actual coordinates
  const minLat = 47.7510, maxLat = 47.7560;
  const minLng = -117.4235, maxLng = -117.4105;
  const W = 640, H = 420, pad = 36;

  function toXY(lat, lng) {
    const x = pad + (lng - minLng) / (maxLng - minLng) * (W - pad * 2);
    const y = pad + (maxLat - lat) / (maxLat - minLat) * (H - pad * 2);
    return [x, y];
  }

  const maxHrs = Math.max(...buildings.map(b => b.daily_hours_l2 || 0), 1);
  const r = (hrs) => Math.max(6, Math.sqrt(hrs / maxHrs) * 20);

  const zoneMap = Object.fromEntries(zones.map(z => [z.id, z]));

  async function suggestZones() {
    setAiLoading(true);
    setAiSuggestion(null);
    try {
      const res = await fetch("/api/ai/suggest-zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setAiSuggestion(data);
    } finally {
      setAiLoading(false);
    }
  }

  const zoneTotals = zones.map(z => ({
    ...z,
    total_hours: buildings
      .filter(b => b.zone_id === z.id)
      .reduce((s, b) => s + (b.daily_hours_l2 || 0), 0),
    building_count: buildings.filter(b => b.zone_id === z.id).length,
  }));

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Campus Map</div>
          <div className="page-subtitle">
            {buildings.length} buildings · bubble size = daily hours needed
          </div>
        </div>
        <button
          className="btn-secondary"
          onClick={suggestZones}
          disabled={aiLoading}
        >
          {aiLoading ? "AI thinking…" : "⚡ AI Suggest Zones"}
        </button>
      </div>

      {aiSuggestion && (
        <div className="card">
          <div className="flex justify-between items-center" style={{ marginBottom: 10 }}>
            <strong style={{ color: "var(--gold)" }}>⚡ AI Zone Suggestions</strong>
            <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => setAiSuggestion(null)}>
              Dismiss
            </button>
          </div>
          <div style={{ fontSize: 12, maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {(aiSuggestion.assignments || []).slice(0, 15).map((a, i) => {
              const bldg = buildings.find(b => b.id === a.building_id);
              const zone = zoneMap[a.zone_id];
              return (
                <div key={i} style={{ padding: "4px 0", borderBottom: "1px solid var(--border)", display: "flex", gap: 8 }}>
                  <span style={{ flex: 1, fontWeight: 500 }}>{bldg?.name}</span>
                  {zone && (
                    <span style={{ color: zone.color }}>→ {zone.name}</span>
                  )}
                  <span style={{ color: "var(--text-muted)" }}>{a.reason}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SVG map */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: "block", background: "var(--navy)" }}
        >
          {/* Grid lines */}
          {[0, 1, 2, 3, 4].map(i => (
            <g key={i}>
              <line
                x1={pad + i * (W - pad * 2) / 4} y1={pad}
                x2={pad + i * (W - pad * 2) / 4} y2={H - pad}
                stroke="rgba(255,255,255,0.05)" strokeWidth={0.5}
              />
              <line
                x1={pad} y1={pad + i * (H - pad * 2) / 4}
                x2={W - pad} y2={pad + i * (H - pad * 2) / 4}
                stroke="rgba(255,255,255,0.05)" strokeWidth={0.5}
              />
            </g>
          ))}

          {/* Compass */}
          <text x={pad + 4} y={pad - 6} fontSize={9} fill="rgba(255,255,255,0.3)" fontFamily="sans-serif">N</text>
          <text x={pad + 4} y={H - pad + 12} fontSize={9} fill="rgba(255,255,255,0.3)" fontFamily="sans-serif">S</text>
          <text x={W - pad - 6} y={H / 2} fontSize={9} fill="rgba(255,255,255,0.3)" fontFamily="sans-serif" textAnchor="end">E</text>
          <text x={pad + 4} y={H / 2} fontSize={9} fill="rgba(255,255,255,0.3)" fontFamily="sans-serif">W</text>

          {/* Buildings */}
          {buildings.map(b => {
            const [x, y] = toXY(b.lat, b.lng);
            const zone = zoneMap[b.zone_id];
            const color = zone?.color || "#888";
            const radius = r(b.daily_hours_l2 || 0);
            const dimmed = activeZone && b.zone_id !== activeZone;
            const isSelected = selected?.id === b.id;

            return (
              <g
                key={b.id}
                transform={`translate(${x},${y})`}
                style={{ cursor: "pointer" }}
                onClick={() => setSelected(b)}
              >
                <circle
                  r={radius}
                  fill={color}
                  opacity={dimmed ? 0.1 : isSelected ? 1 : 0.82}
                  stroke={isSelected ? "#fff" : "rgba(255,255,255,0.4)"}
                  strokeWidth={isSelected ? 2 : 1}
                />
                {radius > 12 && (
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={radius > 16 ? 9 : 8}
                    fontWeight="600"
                    fontFamily="sans-serif"
                    fill="white"
                    pointerEvents="none"
                    opacity={dimmed ? 0.1 : 1}
                  >
                    {(b.daily_hours_l2 || 0).toFixed(1)}
                  </text>
                )}
                <title>{`${b.name}\n${(b.daily_hours_l2 || 0).toFixed(2)} hrs/day · ${(b.total_sqft || 0).toLocaleString()} sqft`}</title>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Selected building detail */}
      {selected && (
        <div className="card flex gap-12 items-center" style={{ padding: "10px 16px" }}>
          <span
            style={{
              width: 12, height: 12, borderRadius: "50%",
              background: zoneMap[selected.zone_id]?.color || "#888",
              flexShrink: 0,
            }}
          />
          <strong style={{ flex: 1 }}>{selected.name}</strong>
          <span style={{ color: zoneMap[selected.zone_id]?.color, fontSize: 12 }}>
            {zoneMap[selected.zone_id]?.name}
          </span>
          <span className="text-mono" style={{ color: "var(--gold)", fontSize: 13 }}>
            {(selected.daily_hours_l2 || 0).toFixed(2)} hrs/day
          </span>
          <span className="text-muted" style={{ fontSize: 12 }}>
            {(selected.total_sqft || 0).toLocaleString()} sqft
          </span>
          <span style={{ color: "var(--text-muted)", fontSize: 11, fontFamily: "var(--font-mono)" }}>
            {selected.lat?.toFixed(5)}, {selected.lng?.toFixed(5)}
          </span>
          <button className="btn-ghost" style={{ fontSize: 11, padding: "3px 8px" }} onClick={() => setSelected(null)}>
            ✕
          </button>
        </div>
      )}

      {/* Zone summary + filter */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {zoneTotals.map(z => (
          <button
            key={z.id}
            onClick={() => setActiveZone(activeZone === z.id ? null : z.id)}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "5px 12px", borderRadius: 20,
              border: `1.5px solid ${z.color}`,
              background: activeZone === z.id ? z.color + "22" : "transparent",
              cursor: "pointer", fontSize: 12,
              color: "var(--text)",
            }}
          >
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: z.color, display: "inline-block" }} />
            {z.name}
            <span style={{ fontFamily: "var(--font-mono)", color: z.color }}>
              {z.total_hours.toFixed(1)}h
            </span>
            <span style={{ color: "var(--text-muted)" }}>
              {z.building_count}b
            </span>
          </button>
        ))}
      </div>
    </>
  );
}
