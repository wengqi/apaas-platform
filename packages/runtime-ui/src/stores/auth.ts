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

/** /api/auth/login 响应体。 */
export interface LoginResponse {
  token: string;
  user: AuthUser;
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
