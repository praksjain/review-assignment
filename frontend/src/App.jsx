import React, { useState, useEffect, useCallback } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import PluginList from "./components/PluginList";
import EventLog from "./components/EventLog";
import PosTerminal from "./components/PosTerminal";
import RulesPanel from "./components/RulesPanel";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";
import { PosTerminalProvider } from "./context/PosTerminalContext";
import { fetchPlugins, fetchEvents } from "./api";

function Dashboard() {
  const { user, logout, hasRole } = useAuth();
  const [plugins, setPlugins] = useState([]);
  const [events, setEvents] = useState([]);
  const [tab, setTab] = useState("terminal");
  const [error, setError] = useState(null);

  const isAdmin = hasRole("ADMIN");

  const loadPlugins = useCallback(async () => {
    try {
      const data = await fetchPlugins();
      setPlugins(data);
      setError(null);
    } catch (err) {
      if (err.response?.status !== 401) {
        setError("Failed to load plugins. Is the API running?");
      }
    }
  }, []);

  const loadEvents = useCallback(async () => {
    try {
      const data = await fetchEvents(50);
      setEvents(data);
    } catch (_) {  }
  }, []);

  useEffect(() => {
    if (tab === "plugins") {
      loadPlugins();
      const interval = setInterval(loadPlugins, 5000);
      return () => clearInterval(interval);
    }
  }, [tab, loadPlugins]);

  useEffect(() => {
    if (tab === "events") {
      loadEvents();
      const interval = setInterval(loadEvents, 3000);
      return () => clearInterval(interval);
    }
  }, [tab, loadEvents]);

  return (
    <PosTerminalProvider>
      <div className="app">
        <header className="app-header">
        <div className="header-top">
          <div>
            <h1>POS Plugin Dashboard</h1>
            <p className="subtitle">Event-driven plugin management for point-of-sale systems</p>
          </div>
          <div className="user-info">
            <span className="user-badge">
              {user?.displayName || user?.username}
              <span className={`role-tag role-${isAdmin ? "admin" : "employee"}`}>
                {isAdmin ? "ADMIN" : "EMPLOYEE"}
              </span>
            </span>
            <button className="logout-btn" onClick={logout}>Sign Out</button>
          </div>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === "terminal" ? "active" : ""} onClick={() => setTab("terminal")}>
          POS Terminal
        </button>
        <button className={tab === "plugins" ? "active" : ""} onClick={() => setTab("plugins")}>
          Plugins
        </button>
        <button className={tab === "rules" ? "active" : ""} onClick={() => setTab("rules")}>
          Rules
        </button>
        <button className={tab === "events" ? "active" : ""} onClick={() => setTab("events")}>
          Event Log
        </button>
      </nav>

      {error && <div className="error-banner">{error}</div>}

      {!isAdmin && tab === "plugins" && (
        <div className="info-banner">
          You have read-only access. Only admins can toggle plugins or edit settings.
        </div>
      )}

      <main className="content">
        <div className={`tab-panel ${tab === "terminal" ? "tab-panel-active" : ""}`} aria-hidden={tab !== "terminal"}>
          <PosTerminal />
        </div>
        <div className={`tab-panel ${tab === "plugins" ? "tab-panel-active" : ""}`} aria-hidden={tab !== "plugins"}>
          <PluginList plugins={plugins} onRefresh={loadPlugins} readOnly={!isAdmin} />
        </div>
        <div className={`tab-panel ${tab === "rules" ? "tab-panel-active" : ""}`} aria-hidden={tab !== "rules"}>
          <RulesPanel />
        </div>
        <div className={`tab-panel ${tab === "events" ? "tab-panel-active" : ""}`} aria-hidden={tab !== "events"}>
          <EventLog events={events} onRefresh={loadEvents} isAdmin={isAdmin} />
        </div>
      </main>
    </div>
    </PosTerminalProvider>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
