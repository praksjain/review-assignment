import React, { useState, useEffect } from "react";

export default function SettingsEditor({ settings, onSave, disabled }) {
  const [raw, setRaw] = useState(() =>
    typeof settings !== "undefined" && settings !== null
      ? JSON.stringify(settings, null, 2)
      : "{}"
  );
  const [parseError, setParseError] = useState(null);

  useEffect(() => {
    const safe = settings != null ? settings : {};
    setRaw(JSON.stringify(safe, null, 2));
    setParseError(null);
  }, [settings]);

  const handleChange = (e) => {
    setRaw(e.target.value);
    try {
      JSON.parse(e.target.value);
      setParseError(null);
    } catch {
      setParseError("Invalid JSON");
    }
  };

  const handleSave = () => {
    try {
      const parsed = JSON.parse(raw);
      onSave(parsed);
    } catch {
      setParseError("Invalid JSON — cannot save");
    }
  };

  return (
    <div className="settings-editor">
      <textarea
        className="settings-textarea"
        value={raw ?? ""}
        onChange={handleChange}
        rows={8}
        spellCheck={false}
      />
      {parseError && <span className="parse-error">{parseError}</span>}
      <button type="button" className="save-btn" onClick={handleSave} disabled={disabled || !!parseError}>
        Save Settings
      </button>
    </div>
  );
}
