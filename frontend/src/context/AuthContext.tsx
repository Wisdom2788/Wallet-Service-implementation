import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { User, Wallet, authApi } from '../services/api';

interface AuthState {
  user: User | null;
  wallet: Wallet | null;
  token: string | null;
  isAuthenticated: boolean;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadPersistedAuth(): AuthState {
  try {
    const token = localStorage.getItem('wallet_token');
    const user = localStorage.getItem('wallet_user');
    const wallet = localStorage.getItem('wallet_wallet');
    if (token && user && wallet) {
      return {
        token,
        user: JSON.parse(user),
        wallet: JSON.parse(wallet),
        isAuthenticated: true,
      };
    }
  } catch {
    
    localStorage.clear();
  }
  return { token: null, user: null, wallet: null, isAuthenticated: false };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(loadPersistedAuth);

  const persistAuth = useCallback((user: User, wallet: Wallet, token: string) => {
    localStorage.setItem('wallet_token', token);
    localStorage.setItem('wallet_user', JSON.stringify(user));
    localStorage.setItem('wallet_wallet', JSON.stringify(wallet));
    setState({ user, wallet, token, isAuthenticated: true });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    const { user, wallet, token } = res.data.data;
    persistAuth(user, wallet, token);
  }, [persistAuth]);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const res = await authApi.register(name, email, password);
      const { user, wallet, token } = res.data.data;
      persistAuth(user, wallet, token);
    },
    [persistAuth]
  );

  const logout = useCallback(() => {
    localStorage.removeItem('wallet_token');
    localStorage.removeItem('wallet_user');
    localStorage.removeItem('wallet_wallet');
    setState({ token: null, user: null, wallet: null, isAuthenticated: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
