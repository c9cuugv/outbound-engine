import axios from "axios";

// ── Session-scoped token store (cleared when tab closes) ──
const ACCESS_KEY = "access_token";
const REFRESH_KEY = "refresh_token";

let _accessToken: string | null = sessionStorage.getItem(ACCESS_KEY);
let _refreshToken: string | null = sessionStorage.getItem(REFRESH_KEY);

export function setTokens(access: string, refresh: string) {
  _accessToken = access;
  _refreshToken = refresh;
  sessionStorage.setItem(ACCESS_KEY, access);
  if (refresh) sessionStorage.setItem(REFRESH_KEY, refresh);
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function clearTokens() {
  _accessToken = null;
  _refreshToken = null;
  sessionStorage.removeItem(ACCESS_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
}

/** Configured Axios instance for all API calls */
const api = axios.create({
  baseURL: "/api/v1",
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

// Request interceptor — attach JWT token from memory
api.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers.Authorization = `Bearer ${_accessToken}`;
  }
  return config;
});

// Response interceptor — handle 401 token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const { data } = await axios.post("/api/v1/auth/refresh", {
          refresh_token: _refreshToken,
        });
        setTokens(data.access_token, data.refresh_token ?? _refreshToken ?? "");
        original.headers.Authorization = `Bearer ${_accessToken}`;
        return api(original);
      } catch {
        clearTokens();
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

export default api;
