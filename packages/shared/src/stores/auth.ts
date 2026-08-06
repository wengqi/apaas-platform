/**
 * 统一认证 Store — 跨 studio / runtime-ui 共享。
 *
 * 使用 Zustand persist 中间件自动同步 localStorage，
 * 替代两包各自手写 localStorage 的重复逻辑。
 *
 * 存储键统一为 `apaas:auth`（单 JSON 对象），启动时自动从旧键迁移。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// ---------------------------------------------------------------------------
// 类型定义（studio User + runtime-ui AuthUser 的超集）
// ---------------------------------------------------------------------------

/** 用户角色。 */
export interface AuthRole {
  id: string;
  code: string;
  name: string;
}

/**
 * 登录用户信息（对应网关 LoginUserDto）。
 * studio 和 runtime-ui 共用此类型。
 */
export interface AuthUser {
  id: string;
  /** 租户 ID。null = 平台超管（跨租户） */
  tenantId: string | null;
  email: string;
  name: string;
  avatar: string | null;
  /** 是否平台超管 */
  isPlatformAdmin: boolean;
  roles: AuthRole[];
}

/** 后端 /api/v1/auth/login 响应体（data 部分）。 */
export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    tenantId?: string | null;
    avatar?: string | null;
    isPlatformAdmin?: boolean;
    roles?: Array<{ id: string; code: string; name: string }>;
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  /** 登录成功后写入 token + user（persist 自动同步 localStorage）。 */
  login: (token: string, user: AuthUser | null) => void;
  /** 设置 token（user 可后续获取，用于 hash token / SSO 场景）。 */
  setToken: (token: string) => void;
  /** 退出登录，清空内存与 localStorage。 */
  logout: () => void;
}

/** 旧存储键（迁移用）。 */
const OLD_TOKEN_KEYS = ['apaas:token', 'apaas_runtime_token'];
const OLD_USER_KEYS = ['apaas:user', 'apaas_runtime_user'];

/**
 * 认证 Store（Zustand + persist）。
 * token 和 user 持久化到 localStorage 键 `apaas:auth`。
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      login: (token, user) => set({ token, user }),
      setToken: (token) => set({ token }),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: 'apaas:auth',
      // 启动时从旧键迁移（一次性）
      onRehydrateStorage: () => (state) => {
        if (state?.token) return; // 已有数据，无需迁移

        // 尝试从旧键读取
        let oldToken: string | null = null;
        let oldUserRaw: string | null = null;
        for (let i = 0; i < OLD_TOKEN_KEYS.length && !oldToken; i++) {
          oldToken = localStorage.getItem(OLD_TOKEN_KEYS[i]!);
          oldUserRaw = localStorage.getItem(OLD_USER_KEYS[i]!);
        }

        if (oldToken) {
          let user: AuthUser | null = null;
          if (oldUserRaw) {
            try {
              user = JSON.parse(oldUserRaw) as AuthUser;
            } catch {
              user = null;
            }
          }
          // 写入新 store
          useAuthStore.setState({ token: oldToken, user });
          // 清理旧键
          for (const key of [...OLD_TOKEN_KEYS, ...OLD_USER_KEYS]) {
            localStorage.removeItem(key);
          }
        }
      },
    },
  ),
);

// ---------------------------------------------------------------------------
// 派生 selector
// ---------------------------------------------------------------------------

/** 是否已认证（token 存在即视为已认证，user 可能为 null 如 hash token 场景）。 */
export const useIsAuthenticated = (): boolean => useAuthStore((s) => s.token !== null);

// ---------------------------------------------------------------------------
// Hash token 初始化（SSO / 测试用）
// ---------------------------------------------------------------------------

/**
 * 从 URL hash 读取 token 并写入 store（用于 SSO / 测试场景）。
 * 格式：`#token=xxx`
 * 读取后自动清理 URL hash。
 *
 * 应在应用启动时（main.tsx 或 router.tsx）调用。
 */
export function initAuthFromHash(): void {
  try {
    const hash = window.location.hash;
    if (hash.startsWith('#token=')) {
      const token = hash.slice(7);
      const currentState = useAuthStore.getState();
      useAuthStore.getState().login(token, currentState.user);
      // 清理 URL
      window.history.replaceState(null, '', window.location.pathname);
    }
  } catch {
    // SSR 或无 window 环境，忽略
  }
}
