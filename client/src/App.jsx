import { useState } from "react";
import ScheduleBoard from "./pages/ScheduleBoard.jsx";
import Buildings from "./pages/Buildings.jsx";
import Custodians from "./pages/Custodians.jsx";
import Zones from "./pages/Zones.jsx";
import CampusMap from "./pages/CampusMap.jsx";

const NAV = [
  { id: "schedule",   label: "Daily Schedule",  icon: "📋" },
  { id: "custodians", label: "Custodians",       icon: "👥" },
  { id: "buildings",  label: "Buildings",        icon: "🏛️" },
  { id: "zones",      label: "Zones",            icon: "🗺️" },
  { id: "map",        label: "Campus Map",       icon: "📍" },
];

export default function App() {
  const [page, setPage] = useState("schedule");

  return (
    <div className="app-layout">
      <nav className="sidebar">
        <div className="sidebar-logo">
          <div className="wordmark">Custodial</div>
          <div className="sub">Whitworth University</div>
        </div>
        <div className="sidebar-nav">
          {NAV.map(n => (
            <button
              key={n.id}
              className={`nav-item ${page === n.id ? "active" : ""}`}
              onClick={() => setPage(n.id)}
            >
              <span>{n.icon}</span>
              <span>{n.label}</span>
            </button>
          ))}
        </div>
      </nav>

      <main className="main-content">
        {page === "schedule"   && <ScheduleBoard />}
        {page === "custodians" && <Custodians />}
        {page === "buildings"  && <Buildings />}
        {page === "zones"      && <Zones />}
        {page === "map"        && <CampusMap />}
      </main>
    </div>
  );
}
