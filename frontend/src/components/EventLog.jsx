import React, { useState, useMemo } from "react";
import { deleteAllEvents } from "../api";

export default function EventLog({ events, onRefresh, isAdmin }) {
  const [clearing, setClearing] = useState(false);
  const [pluginFilter, setPluginFilter] = useState("all");
  const [consumerFilter, setConsumerFilter] = useState("all");
  const [eventTypeFilter, setEventTypeFilter] = useState("all");

  const pluginNames = useMemo(() => {
    if (!events) return [];
    return [...new Set(events.map((e) => e.plugin_name))].sort();
  }, [events]);

  const consumerNames = useMemo(() => {
    if (!events) return [];
    return [...new Set(events.map((e) => e.consumer))].sort();
  }, [events]);

  const eventTypes = useMemo(() => {
    if (!events) return [];
    return [...new Set(events.map((e) => e.event_type))].sort();
  }, [events]);

  const filtered = useMemo(() => {
    if (!events) return [];
    return events.filter((e) => {
      if (pluginFilter !== "all" && e.plugin_name !== pluginFilter) return false;
      if (consumerFilter !== "all" && e.consumer !== consumerFilter) return false;
      if (eventTypeFilter !== "all" && e.event_type !== eventTypeFilter) return false;
      return true;
    });
  }, [events, pluginFilter, consumerFilter, eventTypeFilter]);

  const handleClear = async () => {
    if (!window.confirm("Delete all events from the log? This cannot be undone.")) return;
    setClearing(true);
    try {
      await deleteAllEvents();
      if (onRefresh) onRefresh();
    } catch (err) {
      alert("Failed to clear events: " + (err.response?.data?.detail || err.message));
    } finally {
      setClearing(false);
    }
  };

  const resetFilters = () => {
    setPluginFilter("all");
    setConsumerFilter("all");
    setEventTypeFilter("all");
  };

  const hasActiveFilter = pluginFilter !== "all" || consumerFilter !== "all" || eventTypeFilter !== "all";

  return (
    <div className="event-log">
      {events && events.length > 0 && (
        <>
          <div className="event-log-filters">
            <div className="filter-group">
              <label>Plugin</label>
              <select value={pluginFilter} onChange={(e) => setPluginFilter(e.target.value)}>
                <option value="all">All Plugins</option>
                {pluginNames.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>Consumer</label>
              <select value={consumerFilter} onChange={(e) => setConsumerFilter(e.target.value)}>
                <option value="all">All Consumers</option>
                {consumerNames.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="filter-group">
              <label>Event Type</label>
              <select value={eventTypeFilter} onChange={(e) => setEventTypeFilter(e.target.value)}>
                <option value="all">All Types</option>
                {eventTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            {hasActiveFilter && (
              <button className="reset-filters-btn" onClick={resetFilters}>Reset</button>
            )}
          </div>

          <div className="event-log-toolbar">
            <span className="event-count">
              {hasActiveFilter
                ? `${filtered.length} of ${events.length} event(s)`
                : `${events.length} event(s)`}
            </span>
            {isAdmin && (
              <button className="clear-btn" onClick={handleClear} disabled={clearing}>
                {clearing ? "Clearing..." : "Clear All Events"}
              </button>
            )}
          </div>
        </>
      )}

      {!events || events.length === 0 ? (
        <p className="empty-state">No processed events yet. Use the POS Terminal to generate events.</p>
      ) : filtered.length === 0 ? (
        <p className="empty-state">No events match the selected filters.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Event Type</th>
              <th>Transaction ID</th>
              <th>Plugin</th>
              <th>Consumer</th>
              <th>Processed At</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td>{e.id}</td>
                <td><code>{e.event_type}</code></td>
                <td className="mono">{e.transaction_id ? e.transaction_id.slice(0, 8) + "..." : "—"}</td>
                <td>{e.plugin_name}</td>
                <td><span className={`badge badge-${e.consumer}`}>{e.consumer}</span></td>
                <td>{new Date(e.processed_at).toLocaleTimeString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
