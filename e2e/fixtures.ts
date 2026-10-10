/**
 * E2E 测试共享 fixtures — 登录 helper、API client、应用管理。
 */

import type { Page } from '@playwright/test';

const API_BASE = 'http://localhost:3000/api/v1';

/** 种子用户凭证（来自 pnpm db:seed）。 */
export const SUPERADMIN_EMAIL = 'admin@apaas.dev';
export const SUPERADMIN_PASSWORD = 'admin123';

/** 通过 UI 登录并等待跳转到应用列表。 */
export async function loginAsSuperAdmin(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByPlaceholder('邮箱').fill(SUPERADMIN_EMAIL);
  await page.getByPlaceholder('密码').fill(SUPERADMIN_PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();
  await page.waitForURL('**/apps', { timeout: 15_000 });
}

/** 带认证的 API 客户端。 */
export function createApiClient(token: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };

  async function request<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json();
    if (!res.ok || !json.ok) {
      throw new Error(`API ${method} ${path} failed: ${JSON.stringify(json)}`);
    }
    return json.data as T;
  }

  return {
    get: <T = unknown>(path: string) => request<T>('GET', path),
    post: <T = unknown>(path: string, body?: unknown) => request<T>('POST', path, body),
    put: <T = unknown>(path: string, body?: unknown) => request<T>('PUT', path, body),
    delete: <T = unknown>(path: string) => request<T>('DELETE', path),
    token,
  };
}

/** 通过 API 登录获取 JWT token。
 *
 * 2026-09-13 修复：admin@apaas.dev 是 demo 租户的租户管理员（非平台超管），
 * 旧实现不传 tenantSlug 会命中"平台管理员登录"分支而 401。
 */
/** 登录 token 缓存（auth 端点限流 10/min——e2e 多用例反复登录会触发 429）。 */
const loginTokenCache = new Map<string, { token: string; expiresAt: number }>();
const loginUserCache = new Map<string, unknown>();
const TOKEN_TTL_MS = 10 * 60_000;

interface LoginErrorBody {
  ok?: boolean;
  error?: { code?: number | string; message?: string };
}

/**
 * 登录撞 429 限流时直接给出排查指引——R5.5 复盘：429 伪装成
 * "登录失败/任务超时"（safeList 吞错后）极难定位，根因是本地常驻
 * gateway 以 apps/gateway 为 cwd 启动读不到根 .env 的 THROTTLE_* 放开值。
 */
function assertNotThrottled(json: LoginErrorBody): void {
  const code = json?.error?.code;
  const message = json?.error?.message ?? '';
  if (code === 429 || code === '429' || /429|throttler/i.test(message)) {
    throw new Error(
      '登录被限流（429 Throttler）：本地 gateway 未放开限流阈值。排查：' +
        '① gateway 若以 apps/gateway 为 cwd 启动，读不到根 .env 的 THROTTLE_*，' +
        '请在 apps/gateway/.env 补 THROTTLE_AUTH_LIMIT=10000 / THROTTLE_DEFAULT_LIMIT=10000；' +
        '② 补齐后重启 gateway（playwright webServer 自启场景已在 playwright.config 注入同款 env）。',
    );
  }
}

/** 组合登录：token（走缓存）+ user（登录响应原文，供注入 zustand persist）。 */
export async function loginViaApiWithUser(
  email = SUPERADMIN_EMAIL,
  password = SUPERADMIN_PASSWORD,
): Promise<{ token: string; user: unknown }> {
  const token = await loginViaApi(email, password);
  const key = `${email}:${password}`;
  if (!loginUserCache.has(key)) {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, tenantSlug: 'demo' }),
    });
    const json = await res.json();
    if (!json.ok) assertNotThrottled(json);
    if (json.ok) loginUserCache.set(key, json.data.user);
  }
  return { token, user: loginUserCache.get(key) ?? null };
}

export async function loginViaApi(
  email = SUPERADMIN_EMAIL,
  password = SUPERADMIN_PASSWORD,
): Promise<string> {
  const cacheKey = `${email}:${password}`;
  const cached = loginTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, tenantSlug: 'demo' }),
  });
  const json = await res.json();
  if (!json.ok) {
    assertNotThrottled(json);
    throw new Error(`Login failed: ${JSON.stringify(json)}`);
  }
  const token = json.data.accessToken as string;
  loginTokenCache.set(cacheKey, { token, expiresAt: Date.now() + TOKEN_TTL_MS });
  return token;
}

/** 创建测试应用并返回应用 ID。 */
export async function createTestApp(
  api: ReturnType<typeof createApiClient>,
  name = `E2E 测试应用 ${Date.now()}`,
): Promise<string> {
  const app = await api.post<{ id: string }>('/apps', {
    apiName: `e2e_${Date.now()}`,
    name,
    description: 'E2E 测试自动创建',
  });
  return app.id;
}

/** 删除测试应用。 */
export async function deleteTestApp(
  api: ReturnType<typeof createApiClient>,
  appId: string,
): Promise<void> {
  try {
    await api.delete(`/apps/${appId}`);
  } catch {
    // 清理失败不阻断测试
  }
}

/** 等待 API 健康检查通过。 */
export async function waitForApi(timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${API_BASE}/health`);
      if (res.ok) {
        const json = await res.json();
        if (json.status === 'ok') return;
      }
    } catch {
      // 服务未就绪，继续重试
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error('API health check timeout');
}
