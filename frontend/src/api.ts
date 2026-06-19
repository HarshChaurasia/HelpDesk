import axios from 'axios';
import { getStoredRefreshToken, setStoredRefreshToken } from './token-store';

export const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '') + '/api/v1',
  timeout: 10000,
});

let accessToken: string | null = null;
export function setToken(t: string | null) { accessToken = t; }

api.interceptors.request.use((cfg) => {
  if (accessToken) cfg.headers.Authorization = `Bearer ${accessToken}`;
  return cfg;
});

let refreshing: Promise<string> | null = null;

api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const original = err.config;
    if (err.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const rt = getStoredRefreshToken();
        if (!rt) throw new Error('No refresh token');
        refreshing =
          refreshing ??
          api
            .post('/auth/refresh', { refreshToken: rt })
            .then((res) => {
              setStoredRefreshToken(res.data.refreshToken);
              return res.data.accessToken as string;
            });
        const token = await refreshing;
        refreshing = null;
        setToken(token);
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch {
        refreshing = null;
        setToken(null);
        setStoredRefreshToken(null);
        window.location.href = '/login';
        return Promise.reject(err);
      }
    }
    return Promise.reject(err);
  },
);
