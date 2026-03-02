import React from "react";

export default function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <label className="toggle-switch">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
      />
      <span className="slider" />
    </label>
  );
}
