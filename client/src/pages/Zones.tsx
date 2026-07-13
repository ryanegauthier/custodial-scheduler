import { useState, useEffect } from "react";
import { api } from "../api";
import type { ZoneWithBuildings } from "@shared/types";

export default function Zones() {
  const [zones, setZones] = useState<ZoneWithBuildings[]>([]);

  useEffect(() => {
    api.getZones().then(setZones);
  }, []);

  const totalHrs = zones.reduce((s, z) => s + (z.total_hours || 0), 0);

  return (
    <>
      <div className="page-header">
        <div>
          <div className="page-title">Campus Zones</div>
          <div className="page-subtitle">{zones.length} zones · {totalHrs.toFixed(1)} total daily hours</div>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {zones.map(z => (
          <div key={z.id} className="card" style={{ padding: 0 }}>
            <div style={{
              padding: "12px 16px",
              background: "var(--surface-3)",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}>
              <span style={{
                width: 12, height: 12,
                borderRadius: 3,
                background: z.color || "#666",
                display: "inline-block",
                flexShrink: 0,
              }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontWeight: 600 }}>{z.name}</span>
                {z.description && (
                  <span className="text-muted" style={{ fontSize: 12, marginLeft: 10 }}>
                    {z.description}
                  </span>
                )}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--gold)" }}>
                {z.total_hours?.toFixed(1)} hrs/day
              </div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                {z.buildings?.length || 0} buildings
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Building</th>
                  <th>Category</th>
                  <th>SqFt</th>
                  <th>Daily Hrs (L2)</th>
                </tr>
              </thead>
              <tbody>
                {(z.buildings || []).map(b => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 500 }}>{b.name}</td>
                    <td><span className="badge badge-blue">{b.category}</span></td>
                    <td className="text-mono">{b.total_sqft?.toLocaleString()}</td>
                    <td className="text-mono" style={{ color: "var(--green)" }}>
                      {b.daily_hours_l2?.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </>
  );
}
