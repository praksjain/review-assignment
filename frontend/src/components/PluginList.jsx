import React from "react";
import PluginCard from "./PluginCard";

export default function PluginList({ plugins, onRefresh, readOnly }) {
  const pythonPlugins = plugins.filter((p) => p.consumer === "python");
  const nodePlugins = plugins.filter((p) => p.consumer === "node");

  return (
    <div className="plugin-list">
      <section>
        <h2 className="section-title">Python Consumer</h2>
        <div className="card-grid">
          {pythonPlugins.map((p) => (
            <PluginCard key={p.id ?? `python-${p.name}`} plugin={p} onUpdate={onRefresh} readOnly={readOnly} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">Node.js Consumer</h2>
        <div className="card-grid">
          {nodePlugins.map((p) => (
            <PluginCard key={p.id ?? `node-${p.name}`} plugin={p} onUpdate={onRefresh} readOnly={readOnly} />
          ))}
        </div>
      </section>
    </div>
  );
}
