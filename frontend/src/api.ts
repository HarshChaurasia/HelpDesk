import axios from 'axios';
import { getStoredRefreshToken, setStoredRefreshToken } from './token-store';

const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '') + '/api/v1';

export const api = axios.create({ baseURL: BASE, timeout: 10000 });

let accessToken: string | null = null;
export function setToken(t: string | null) { accessToken = t; }

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

// Single shared refresh promise — both AuthProvider bootstrap and 401 interceptor use this.
// Using plain axios (not api) for the refresh call itself to avoid recursive interception.
let refreshing: Promise<{ accessToken: string; refreshToken: string; user: any }> | null = null;

export function doRefresh(): Promise<{ accessToken: string; refreshToken: string; user: any }> {
  if (refreshing) return refreshing;
  const rt = getStoredRefreshToken();
  if (!rt) return Promise.reject(new Error('No refresh token'));
  refreshing = axios
    .post(`${BASE}/auth/refresh`, { refreshToken: rt }, { timeout: 8000 })
    .then((res) => {
      setToken(res.data.accessToken);
      setStoredRefreshToken(res.data.refreshToken);
      return res.data as { accessToken: string; refreshToken: string; user: any };
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const data = await doRefresh();
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        setToken(null);
        setStoredRefreshToken(null);
        window.location.href = '/login';
        return Promise.reject(err);
      }
    }
    return Promise.reject(err);
  },
);
