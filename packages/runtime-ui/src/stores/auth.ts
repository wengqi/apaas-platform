import { create } from 'zustand';

/** localStorage 存储 key。 */
export const TOKEN_KEY = 'apaas_runtime_token';
export const USER_KEY = 'apaas_runtime_user';

/** 登录用户信息。 */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

/** 后端 /api/auth/login 响应体（data 部分）。 */
export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    tenantId?: string;
    avatar?: string | null;
    roles?: Array<{ id: string; code: string; name: string }>;
  };
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  /** 持久化 token + user 到 store 与 localStorage。 */
  login: (token: string, user: AuthUser) => void;
  /** 清除 token + user。 */
  logout: () => void;
}

function readToken(): string | null {
  try {
    // Support URL hash token for testing/SSO: #token=xxx
    const hash = window.location.hash;
    if (hash.startsWith('#token=')) {
      const token = hash.slice(7);
      localStorage.setItem(TOKEN_KEY, token);
      // Clean the URL
      window.history.replaceState(null, '', window.location.pathname);
      return token;
    }
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function readUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  token: readToken(),
  user: readUser(),
  // Authenticated if token exists (user may be null when using hash token)
  isAuthenticated: readToken() !== null,
  login: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({ token: null, user: null, isAuthenticated: false });
  },
}));
