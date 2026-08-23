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

/** 通过 API 登录获取 JWT token。 */
export async function loginViaApi(
  email = SUPERADMIN_EMAIL,
  password = SUPERADMIN_PASSWORD,
): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Login failed: ${JSON.stringify(json)}`);
  return json.data.accessToken as string;
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
