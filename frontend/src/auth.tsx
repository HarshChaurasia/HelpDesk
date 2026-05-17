import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react';
import { api, setToken } from './api';

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
        const { data } = await api.post('/auth/refresh');
        setToken(data.accessToken);
        setUser(data.user);
      } catch {
        /* not logged in */
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function login(email: string, password: string) {
    const { data } = await api.post('/auth/login', { email, password });
    setToken(data.accessToken);
    setUser(data.user);
  }
  async function register(email: string, password: string, fullName: string) {
    const { data } = await api.post('/auth/register', {
      email,
      password,
      fullName,
    });
    setToken(data.accessToken);
    setUser(data.user);
  }
  async function logout() {
    await api.post('/auth/logout');
    setToken(null);
    setUser(null);
  }

  return (
    <Ctx.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </Ctx.Provider>
  );
}
