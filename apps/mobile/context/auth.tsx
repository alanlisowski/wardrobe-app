import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import { api, type ApiUser } from '../lib/api';
import { clearSession, loadSession, saveSession } from '../lib/storage';

interface AuthContextValue {
  user: ApiUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(async () => {
    // TODO: remove before shipping
    console.log('[auth] logout() called');
    await api.logout();
    await clearSession();
    api.setToken(null);
    setUser(null);
  }, []);

  // Restore session on mount
  useEffect(() => {
    api.setUnauthorizedHandler(() => {
      // TODO: remove before shipping
      console.log('[auth] onUnauthorized fired — clearing session and user');
      clearSession().catch(() => {});
      api.setToken(null);
      setUser(null);
    });

    async function restore() {
      try {
        const token = await loadSession();
        // TODO: remove before shipping
        console.log('[auth] restore() — stored token:', token ? 'present' : 'none');
        if (token) {
          api.setToken(token);
          const me = await api.me();
          // TODO: remove before shipping
          console.log('[auth] restore() — me() succeeded, user:', me.email);
          setUser(me);
        }
      } catch (err) {
        // TODO: remove before shipping
        console.log('[auth] restore() failed:', err instanceof Error ? err.message : String(err));
        await clearSession();
        api.setToken(null);
      } finally {
        setIsLoading(false);
      }
    }
    restore();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: u, token } = await api.login(email, password);
    await saveSession(token);
    api.setToken(token);
    setUser(u);
  }, []);

  const signup = useCallback(async (email: string, password: string) => {
    const { user: u, token } = await api.signup(email, password);
    await saveSession(token);
    api.setToken(token);
    setUser(u);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}
