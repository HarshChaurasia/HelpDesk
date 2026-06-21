import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { api, setToken, doRefresh } from './api';
import { getStoredRefreshToken, setStoredRefreshToken } from './token-store';

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
      try {
        const data = await doRefresh();
        setUser(data.user);
      } catch (e: any) {
        // Only drop the stored token if the server actually rejected it as
        // invalid/revoked (400/401). Transient failures — throttle (429), 5xx,
        // or a network blip — must NOT log the user out, otherwise a single
        // hiccup forces a re-login on every page refresh.
        const status = e?.response?.status;
        if (status === 400 || status === 401) {
          setToken(null);
          setStoredRefreshToken(null);
        }
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
