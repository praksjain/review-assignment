const SESSION_KEY = (employeeId) => `pos_time_start_${employeeId}`;
const TOTAL_KEY = (employeeId) => `pos_time_total_ms_${employeeId}`;
const LAST_LOGIN_KEY = (employeeId) => `pos_time_last_login_${employeeId}`;
const LAST_LOGOUT_KEY = (employeeId) => `pos_time_last_logout_${employeeId}`;

function safeNow() {
  return Date.now();
}

export function startSession(employeeId) {
  if (!employeeId) return;
  const now = safeNow();
  try {
    localStorage.setItem(SESSION_KEY(employeeId), String(now));
    localStorage.setItem(LAST_LOGIN_KEY(employeeId), String(now));
  } catch {
    // Ignore storage errors
  }
}

export function endSession(employeeId) {
  if (!employeeId) return null;
  try {
    const startRaw = localStorage.getItem(SESSION_KEY(employeeId));
    if (!startRaw) return null;
    const start = Number(startRaw);
    const now = safeNow();
    const duration = Math.max(0, now - start);

    const totalRaw = localStorage.getItem(TOTAL_KEY(employeeId));
    const total = Number(totalRaw) || 0;
    const newTotal = total + duration;

    localStorage.setItem(TOTAL_KEY(employeeId), String(newTotal));
    localStorage.setItem(LAST_LOGOUT_KEY(employeeId), String(now));
    localStorage.removeItem(SESSION_KEY(employeeId));

    return { start, end: now, duration, totalMs: newTotal };
  } catch {
    return null;
  }
}

export function getEmployeeTimeSummary(employeeId) {
  if (!employeeId) return null;
  try {
    const totalRaw = localStorage.getItem(TOTAL_KEY(employeeId));
    const storedTotal = Number(totalRaw) || 0;

    const startRaw = localStorage.getItem(SESSION_KEY(employeeId));
    const start = startRaw ? Number(startRaw) : null;

    const lastLoginRaw = localStorage.getItem(LAST_LOGIN_KEY(employeeId));
    const lastLogoutRaw = localStorage.getItem(LAST_LOGOUT_KEY(employeeId));

    const now = safeNow();
    const inProgress = !!start;
    const totalMs = inProgress ? storedTotal + Math.max(0, now - start) : storedTotal;

    return {
      totalMs,
      inProgress,
      currentSessionStart: start,
      lastLoginAt: lastLoginRaw ? Number(lastLoginRaw) : null,
      lastLogoutAt: lastLogoutRaw ? Number(lastLogoutRaw) : null,
    };
  } catch {
    return null;
  }
}

