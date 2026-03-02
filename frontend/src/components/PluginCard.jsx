import React, { useState } from "react";
import ToggleSwitch from "./ToggleSwitch";
import SettingsEditor from "./SettingsEditor";
import { updatePlugin } from "../api";

export default function PluginCard({ plugin, onUpdate, readOnly }) {
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);

  const handleToggle = async () => {
    if (readOnly) return;
    setSaving(true);
    try {
      await updatePlugin(plugin.id, { is_active: !plugin.is_active });
      onUpdate();
    } catch (err) {
      alert("Failed to toggle plugin: " + (err.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleSettingsSave = async (newSettings) => {
    if (readOnly) return;
    setSaving(true);
    try {
      await updatePlugin(plugin.id, { settings: newSettings });
      onUpdate();
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (err) {
      alert("Failed to save settings: " + (err.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`plugin-card ${plugin.is_active ? "active" : "inactive"}`}>
      <div className="card-header">
        <div className="card-title-row">
          <h3 className="card-title">{plugin.name}</h3>
          <ToggleSwitch checked={plugin.is_active} onChange={handleToggle} disabled={saving || readOnly} />
        </div>
        <span className={`badge badge-${plugin.consumer}`}>{plugin.consumer}</span>
        {plugin.description && <p className="card-desc">{plugin.description}</p>}
      </div>

      <div className="card-body">
        <button
          type="button"
          className="expand-btn"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? "Hide Settings" : readOnly ? "View Settings" : "Edit Settings"}
        </button>

        {expanded && (
          <SettingsEditor
            settings={plugin.settings}
            onSave={handleSettingsSave}
            disabled={saving || readOnly}
          />
        )}

        {settingsSaved && (
          <div className="settings-success">Settings saved.</div>
        )}
      </div>
    </div>
  );
}
