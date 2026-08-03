import { create } from 'zustand';

/** localStorage 存储键。 */
export const TOKEN_KEY = 'apaas:token';
export const USER_KEY = 'apaas:user';

/** 用户角色。 */
export interface Role {
  id: string;
  code: string;
  name: string;
}

/** 登录后用户信息(对应网关 LoginUserDto)。 */
export interface User {
  id: string;
  /** 租户 ID。null = 平台超管（跨租户） */
  tenantId: string | null;
  email: string;
  name: string;
  avatar: string | null;
  /** 是否平台超管 */
  isPlatformAdmin: boolean;
  roles: Role[];
}

interface AuthState {
  token: string | null;
  user: User | null;
  /** 登录成功后写入 token + user(同步到 localStorage)。 */
  login: (token: string, user: User) => void;
  /** 退出登录,清空内存与 localStorage。 */
  logout: () => void;
}

/**
 * 认证 store (Zustand)。
 * token 同时持久化到 localStorage,供 axios 拦截器读取。
 */
export const useAuthStore = create<AuthState>((set) => ({
  token: localStorage.getItem(TOKEN_KEY),
  user: safeParseUser(localStorage.getItem(USER_KEY)),
  login: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    set({ token, user });
  },
  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    set({ token: null, user: null });
  },
}));

function safeParseUser(raw: string | null): User | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}
