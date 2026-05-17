import axios from 'axios';

export const api = axios.create({
  baseURL: (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '') + '/api/v1',
  withCredentials: true,
  timeout: 10000,
});

let accessToken: string | null = null;
export function setToken(t: string | null) {
  accessToken = t;
}

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
        refreshing =
          refreshing ??
          api
            .post('/auth/refresh')
            .then((res) => res.data.accessToken as string);
        const token = await refreshing;
        refreshing = null;
        setToken(token);
        original.headers.Authorization = `Bearer ${token}`;
        return api(original);
      } catch (e) {
        refreshing = null;
        setToken(null);
        window.location.href = '/login';
        return Promise.reject(e);
      }
    }
    return Promise.reject(err);
  },
);
