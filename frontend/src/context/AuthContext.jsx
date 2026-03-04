import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { jwtDecode } from "jwt-decode";
import { setAuthTokens, clearAuthTokens, apiClient } from "../api";
import { startSession, endSession } from "../timeTracker";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const logoutTimerRef = useRef(null);

  const logout = useCallback(async () => {
    try {
      await apiClient.post("/auth/logout");
    } catch {
      // Ignore errors
    } finally {
      if (user?.employeeId) {
        endSession(user.employeeId);
      }
      clearAuthTokens();
      setUser(null);
      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current);
        logoutTimerRef.current = null;
      }
    }
  }, []);

  const scheduleAutoLogout = useCallback((exp) => {
    if (logoutTimerRef.current) clearTimeout(logoutTimerRef.current);
    const msUntilExpiry = exp * 1000 - Date.now() - 30000;
    if (msUntilExpiry > 0) {
      logoutTimerRef.current = setTimeout(logout, msUntilExpiry);
    }
  }, [logout]);

  const login = useCallback(async (username, password) => {
    const { data } = await apiClient.post("/auth/login", { username, password });
    setAuthTokens(data.access_token, data.refresh_token);
    const decoded = jwtDecode(data.access_token);
    const userData = {
      employeeId: data.employee_id,
      username: data.username,
      displayName: data.display_name,
      roles: data.roles,
    };
    setUser(userData);
    startSession(userData.employeeId);
    scheduleAutoLogout(decoded.exp);
    return userData;
  }, [scheduleAutoLogout]);

  const hasRole = useCallback((role) => {
    return user?.roles?.includes(role) ?? false;
  }, [user]);

  useEffect(() => {
    const stored = localStorage.getItem("pos_access_token");
    if (stored) {
      try {
        const decoded = jwtDecode(stored);
        if (decoded.exp * 1000 > Date.now()) {
          setUser({
            employeeId: parseInt(decoded.sub),
            username: decoded.username,
            roles: decoded.roles,
          });
          setAuthTokens(stored, localStorage.getItem("pos_refresh_token"));
          scheduleAutoLogout(decoded.exp);
        } else {
          clearAuthTokens();
        }
      } catch {
        clearAuthTokens();
      }
    }
    setLoading(false);
  }, [scheduleAutoLogout]);

  useEffect(() => {
    const handleLogout = () => logout();
    window.addEventListener("pos-force-logout", handleLogout);
    return () => window.removeEventListener("pos-force-logout", handleLogout);
  }, [logout]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasRole, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
