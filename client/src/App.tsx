import { useState, useEffect } from "react";
import ScheduleBoard from "./pages/ScheduleBoard.tsx";
import Buildings from "./pages/Buildings.tsx";
import Custodians from "./pages/Custodians.tsx";
import Zones from "./pages/Zones.tsx";
import CampusMap from "./pages/CampusMap.tsx";

type PageId = "schedule" | "custodians" | "buildings" | "zones" | "map";
type Theme = "dark" | "light";

const NAV: { id: PageId; label: string; icon: string }[] = [
  { id: "schedule",   label: "Daily Schedule",  icon: "📋" },
  { id: "custodians", label: "Custodians",       icon: "👥" },
  { id: "buildings",  label: "Buildings",        icon: "🏛️" },
  { id: "zones",      label: "Zones",            icon: "🗺️" },
  { id: "map",        label: "Campus Map",       icon: "📍" },
];

function getInitialTheme(): Theme {
  return localStorage.getItem("theme") === "light" ? "light" : "dark";
}

export default function App() {
  const [page, setPage] = useState<PageId>("schedule");
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <div className="app-layout">
      <header className="topbar">
        <div className="topbar-logo">
          <div className="wordmark">Custodial</div>
          <div className="sub">Whitworth University</div>
        </div>
        <nav className="topbar-nav">
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
        </nav>
        <button
          className="theme-toggle"
          onClick={() => setTheme(t => (t === "dark" ? "light" : "dark"))}
        >
          {theme === "dark" ? "☀️ Light" : "🌙 Dark"}
        </button>
      </header>

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
