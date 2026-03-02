import axios from "axios";

const BASE = window.location.hostname === "localhost"
  ? "http://localhost:8000"
  : `${window.location.protocol}//${window.location.hostname}:8000`;

export const apiClient = axios.create({ baseURL: BASE, timeout: 8000 });

let accessToken = null;
let refreshToken = null;
let isRefreshing = false;
let failedQueue = [];

function processQueue(error, token = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
}

export function setAuthTokens(access, refresh) {
  accessToken = access;
  refreshToken = refresh;
  if (access) localStorage.setItem("pos_access_token", access);
  if (refresh) localStorage.setItem("pos_refresh_token", refresh);
}

export function clearAuthTokens() {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem("pos_access_token");
  localStorage.removeItem("pos_refresh_token");
}

export function getAccessToken() {
  return accessToken || localStorage.getItem("pos_access_token");
}

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((token) => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return apiClient(originalRequest);
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const storedRefresh = refreshToken || localStorage.getItem("pos_refresh_token");
      if (!storedRefresh) {
        isRefreshing = false;
        clearAuthTokens();
        window.dispatchEvent(new Event("pos-force-logout"));
        return Promise.reject(error);
      }

      try {
        const { data } = await axios.post(`${BASE}/auth/refresh`, {
          refresh_token: storedRefresh,
        });
        setAuthTokens(data.access_token, data.refresh_token);
        processQueue(null, data.access_token);
        originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        return apiClient(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAuthTokens();
        window.dispatchEvent(new Event("pos-force-logout"));
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export async function fetchPlugins() {
  const { data } = await apiClient.get("/plugins");
  return data;
}

export async function updatePlugin(id, payload) {
  const { data } = await apiClient.put(`/plugins/${id}`, payload);
  return data;
}

export async function fetchEvents(limit = 30) {
  const { data } = await apiClient.get(`/events?limit=${limit}`);
  return data;
}

export async function deleteAllEvents() {
  const { data } = await apiClient.delete("/events");
  return data;
}
