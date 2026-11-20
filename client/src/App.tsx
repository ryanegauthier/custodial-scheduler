import { useState, useEffect } from "react";
import ScheduleBoard from "./pages/ScheduleBoard.tsx";
import Buildings from "./pages/Buildings.tsx";
import Custodians from "./pages/Custodians.tsx";
import Assignments from "./pages/Assignments.tsx";
import Zones from "./pages/Zones.tsx";
import CampusMap from "./pages/CampusMap.tsx";
import { ApiError } from "./api";

type PageId = "schedule" | "custodians" | "assignments" | "buildings" | "zones" | "map";
type Theme = "dark" | "light";

const NAV: { id: PageId; label: string; icon: string }[] = [
  { id: "schedule",     label: "Daily Schedule",  icon: "📋" },
  { id: "custodians",   label: "Custodians",       icon: "👥" },
  { id: "assignments",  label: "Assignments",      icon: "📌" },
  { id: "buildings",    label: "Buildings",        icon: "🏛️" },
  { id: "zones",        label: "Zones",            icon: "🗺️" },
  { id: "map",          label: "Campus Map",       icon: "📍" },
];

const TOAST_MS = 6000;

function getInitialTheme(): Theme {
  return localStorage.getItem("theme") === "light" ? "light" : "dark";
}

export default function App() {
  const [page, setPage] = useState<PageId>("schedule");
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  // Latest failed API call, from any page. Pages' async handlers don't
  // catch ApiErrors, so they surface here as unhandled promise rejections -
  // one place to show them instead of a try/catch in every handler.
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);

  useEffect(() => {
    const onRejection = (e: PromiseRejectionEvent) => {
      if (!(e.reason instanceof ApiError)) return;
      e.preventDefault(); // shown in the UI, so skip the console's "Uncaught (in promise)"
      setToast({ id: Date.now(), message: e.reason.message });
    };
    window.addEventListener("unhandledrejection", onRejection);
    return () => window.removeEventListener("unhandledrejection", onRejection);
  }, []);

  // Keyed on toast.id so a repeat of the same message restarts the timer.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast?.id]);

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
        {page === "schedule"    && <ScheduleBoard />}
        {page === "custodians"  && <Custodians />}
        {page === "assignments" && <Assignments />}
        {page === "buildings"   && <Buildings />}
        {page === "zones"       && <Zones />}
        {page === "map"         && <CampusMap />}
      </main>

      {toast && (
        <div className="toast-err" role="alert" onClick={() => setToast(null)} title="Click to dismiss">
          <span style={{ flex: 1 }}>{toast.message}</span>
          <span aria-hidden="true">×</span>
        </div>
      )}
    </div>
  );
}
