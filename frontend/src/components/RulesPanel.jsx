import React, { useEffect, useState } from "react";
import { usePosTerminal } from "../context/PosTerminalContext";
import { useAuth } from "../context/AuthContext";
import { getEmployeeTimeSummary } from "../timeTracker";
import ToggleSwitch from "./ToggleSwitch";

function formatDuration(ms) {
  if (!ms || ms <= 0) return "0 minutes";
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
}

function formatTime(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "—";
  }
}

export default function RulesPanel() {
  const { rules, setRules } = usePosTerminal();
  const { user } = useAuth();
  const [timeSummary, setTimeSummary] = useState(null);

  useEffect(() => {
    if (!user?.employeeId) {
      setTimeSummary(null);
      return;
    }
    const update = () => {
      setTimeSummary(getEmployeeTimeSummary(user.employeeId));
    };
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, [user]);

  const handleToggleAgeVerification = () => {
    setRules((prev) => ({
      ...prev,
      ageVerification: {
        ...prev.ageVerification,
        enabled: !prev.ageVerification.enabled,
      },
    }));
  };

  const handleMinAgeChange = (e) => {
    const value = parseInt(e.target.value, 10);
    setRules((prev) => ({
      ...prev,
      ageVerification: {
        ...prev.ageVerification,
        minAge: Number.isNaN(value) ? "" : value,
      },
    }));
  };

  const minAge = rules?.ageVerification?.minAge ?? 21;

  return (
    <div className="rules-panel">
      <section className="pos-card">
        <h3>Miscellaneous Rules</h3>
        <p>Configure runtime rules that affect how the POS terminal behaves.</p>

        <div className="rule-row">
          <div className="rule-info">
            <h4>Age verification for restricted items</h4>
            <p>
              When enabled, adding age-restricted products (for example, Beer) to the cart will
              require the employee to enter the customer&apos;s age before proceeding.
            </p>
          </div>
          <div className="rule-controls">
            <ToggleSwitch
              checked={!!rules?.ageVerification?.enabled}
              onChange={handleToggleAgeVerification}
            />
            <label className="rule-min-age">
              Minimum age
              <input
                type="number"
                min="0"
                value={minAge}
                onChange={handleMinAgeChange}
              />
            </label>
          </div>
        </div>

        <div className="rule-row" style={{ marginTop: "1.25rem" }}>
          <div className="rule-info">
            <h4>Purchase recommender</h4>
            <p>
              When enabled, the POS will suggest additional items whenever certain products are
              added to the cart. For example, adding Soy Milk can recommend Bananas.
            </p>
          </div>
          <div className="rule-controls">
            <ToggleSwitch
              checked={!!rules?.purchaseRecommender?.enabled}
              onChange={() =>
                setRules((prev) => ({
                  ...prev,
                  purchaseRecommender: {
                    ...prev.purchaseRecommender,
                    enabled: !prev.purchaseRecommender?.enabled,
                  },
                }))
              }
            />
          </div>
        </div>
      </section>

      <section className="pos-card" style={{ marginTop: "1.5rem" }}>
        <h3>Employee Time Tracker</h3>
        <p>
          Logs and calculates total time spent by employees at this POS from the moment they log in
          until they log out.
        </p>

        {!user && (
          <p>No employee is currently logged in.</p>
        )}

        {user && (
          <div className="time-tracker-summary">
            <p><strong>Employee</strong>: {user.displayName || user.username}</p>
            <p><strong>Total time on POS</strong>: {formatDuration(timeSummary?.totalMs)}</p>
            <p><strong>Current session</strong>: {timeSummary?.inProgress ? "Active" : "Not active"}</p>
            <p><strong>Last login</strong>: {formatTime(timeSummary?.lastLoginAt)}</p>
            <p><strong>Last logout</strong>: {formatTime(timeSummary?.lastLogoutAt)}</p>
          </div>
        )}
      </section>
    </div>
  );
}

