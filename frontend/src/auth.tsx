import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { api, setToken } from './api';

const RT_KEY = 'hd_rt';

export function getStoredRefreshToken() { return localStorage.getItem(RT_KEY); }
export function setStoredRefreshToken(t: string | null) {
  if (t) localStorage.setItem(RT_KEY, t);
  else localStorage.removeItem(RT_KEY);
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: 'CUSTOMER' | 'AGENT' | 'ADMIN';
  notifPref: string;
}

interface AuthCtx {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const rt = getStoredRefreshToken();
      if (!rt) { setLoading(false); return; }
      try {
        const { data } = await api.post('/auth/refresh', { refreshToken: rt }, { timeout: 5000 });
        setToken(data.accessToken);
        setStoredRefreshToken(data.refreshToken);
        setUser(data.user);
      } catch {
        setStoredRefreshToken(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(email: string, password: string) {
    const { data } = await api.post('/auth/login', { email, password });
    setToken(data.accessToken);
    setStoredRefreshToken(data.refreshToken);
    setUser(data.user);
  }

  async function register(email: string, password: string, fullName: string) {
    const { data } = await api.post('/auth/register', { email, password, fullName });
    setToken(data.accessToken);
    setStoredRefreshToken(data.refreshToken);
    setUser(data.user);
  }

  async function logout() {
    const rt = getStoredRefreshToken();
    await api.post('/auth/logout', { refreshToken: rt ?? '' }).catch(() => {});
    setToken(null);
    setStoredRefreshToken(null);
    setUser(null);
  }

  return (
    <Ctx.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </Ctx.Provider>
  );
}
