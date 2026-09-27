/**
 * E2E 测试 — Phase 10.4 Demo 应用验收（资产管理系统）。
 *
 * 验证种子数据创建的完整 Demo 应用：
 * 1. 应用已发布（PUBLISHED + publishedSnapshot）
 * 2. 3 个业务对象存在（asset / borrow_request / asset_category）
 * 3. 7 个已发布页面存在
 * 4. 审批流程已发布
 * 5. 示例记录存在（15 资产 + 4 分类 + 5 领用申请）
 * 6. 运行时页面通过 slug 可访问（publishedSnapshot 渲染）
 * 7. Studio 中应用可编辑
 *
 * 验收标准（ROADMAP）：从零搭建含对象/页面/审批流程/权限/仪表盘的完整应用。
 */

import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:3000/api/v1';

/** 通过 API 登录 demo 租户获取 JWT token */
async function loginViaApi(): Promise<string> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'admin@apaas.dev',
      password: 'admin123',
      tenantSlug: 'demo',
    }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(`Login failed: ${JSON.stringify(json)}`);
  return json.data.accessToken as string;
}

function createApiClient(token: string) {
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
  };
}

test.describe('Phase 10.4 — Demo 应用（资产管理系统）', () => {
  let api: ReturnType<typeof createApiClient>;
  let appId: string;

  test.beforeAll(async () => {
    const token = await loginViaApi();
    api = createApiClient(token);
    // appId 必须在此独立解析：Playwright 失败重试会更换 worker 并重跑 beforeAll，
    // 但不会重跑文件内其它测试——若依赖首个测试的副作用赋值，重试 worker 中
    // appId 恒为 undefined，一次失败会级联成多个 /app/undefined 的必然失败。
    const apps = await api.get<Array<{ id: string; apiName: string }>>('/apps');
    const app = apps.find((a) => a.apiName === 'asset_management');
    if (!app) throw new Error('Demo app asset_management not found — 请先执行 pnpm db:seed');
    appId = app.id;
  });

  test('应用已发布（PUBLISHED + publishedSnapshot）', async () => {
    const apps =
      await api.get<Array<{ id: string; apiName: string; status: string; version: number }>>(
        '/apps',
      );
    const app = apps.find((a) => a.apiName === 'asset_management');
    expect(app).toBeDefined();
    expect(app!.status).toBe('PUBLISHED');
    expect(app!.version).toBeGreaterThanOrEqual(1);
    // publishedSnapshot 仅在详情端点返回（列表端点为轻量摘要）
    const detail = await api.get<{ id: string; publishedSnapshot: { meta: unknown } | null }>(
      `/apps/${app!.id}`,
    );
    expect(detail.publishedSnapshot).toBeTruthy();
    expect(detail.publishedSnapshot!.meta).toBeTruthy();
  });

  test('3 个业务对象存在', async () => {
    const objects = await api.get<Array<{ id: string; apiName: string; name: string }>>(
      `/apps/${appId}/objects`,
    );
    const apiNames = objects.map((o) => o.apiName);
    expect(apiNames).toContain('asset');
    expect(apiNames).toContain('borrow_request');
    expect(apiNames).toContain('asset_category');
  });

  test('asset 对象包含业务字段', async () => {
    const objects = await api.get<
      Array<{
        id: string;
        apiName: string;
        fields: Array<{ apiName: string; type: string; label: string }>;
      }>
    >(`/apps/${appId}/objects`);
    const asset = objects.find((o) => o.apiName === 'asset');
    expect(asset).toBeDefined();
    const fieldApiNames = asset!.fields.map((f) => f.apiName);
    expect(fieldApiNames).toContain('asset_code');
    expect(fieldApiNames).toContain('asset_name');
    expect(fieldApiNames).toContain('category');
    expect(fieldApiNames).toContain('status');
    expect(fieldApiNames).toContain('purchase_price');
  });

  test('7 个已发布页面存在', async () => {
    // 页面接口字段映射：Prisma apiName→slug, isPublished→published
    const pages = await api.get<
      Array<{ id: string; slug: string; name: string; type: string; published: boolean }>
    >(`/apps/${appId}/pages`);
    const publishedPages = pages.filter((p) => p.published);
    expect(publishedPages.length).toBeGreaterThanOrEqual(7);

    const pageSlugs = publishedPages.map((p) => p.slug);
    expect(pageSlugs).toContain('asset_list');
    expect(pageSlugs).toContain('asset_detail');
    expect(pageSlugs).toContain('asset_form');
    expect(pageSlugs).toContain('borrow_list');
    expect(pageSlugs).toContain('borrow_form');
    expect(pageSlugs).toContain('category_list');
    expect(pageSlugs).toContain('dashboard');
  });

  test('审批流程已发布', async () => {
    const processes = await api.get<
      Array<{ id: string; apiName: string; name: string; status: string; triggerType: string }>
    >(`/apps/${appId}/processes`);
    const approval = processes.find((p) => p.apiName === 'asset_borrow_approval');
    expect(approval).toBeDefined();
    expect(approval!.status).toBe('PUBLISHED');
    expect(approval!.triggerType).toBe('RECORD_CREATED');
  });

  test('资产记录存在（15 条）', async () => {
    const objects = await api.get<Array<{ id: string; apiName: string }>>(`/apps/${appId}/objects`);
    const asset = objects.find((o) => o.apiName === 'asset');
    expect(asset).toBeDefined();
    const records = await api.get<{
      items: Array<{ id: string; data: Record<string, unknown> }>;
      total: number;
    }>(`/objects/${asset!.id}/records?page=1&pageSize=100`);
    expect(records.total).toBeGreaterThanOrEqual(15);
    // 验证第一条记录有业务字段
    const firstRecord = records.items[0]!;
    expect(firstRecord.data).toHaveProperty('asset_code');
    expect(firstRecord.data).toHaveProperty('asset_name');
    expect(firstRecord.data).toHaveProperty('category');
    expect(firstRecord.data).toHaveProperty('status');
  });

  test('资产分类记录存在（4 条）', async () => {
    const objects = await api.get<Array<{ id: string; apiName: string }>>(`/apps/${appId}/objects`);
    const category = objects.find((o) => o.apiName === 'asset_category');
    expect(category).toBeDefined();
    const records = await api.get<{ items: unknown[]; total: number }>(
      `/objects/${category!.id}/records?page=1&pageSize=100`,
    );
    expect(records.total).toBeGreaterThanOrEqual(4);
  });

  test('领用申请记录存在（5 条）', async () => {
    const objects = await api.get<Array<{ id: string; apiName: string }>>(`/apps/${appId}/objects`);
    const borrow = objects.find((o) => o.apiName === 'borrow_request');
    expect(borrow).toBeDefined();
    const records = await api.get<{ items: unknown[]; total: number }>(
      `/objects/${borrow!.id}/records?page=1&pageSize=100`,
    );
    expect(records.total).toBeGreaterThanOrEqual(5);
  });

  test('运行时页面通过 slug 可访问（publishedSnapshot 渲染）', async () => {
    // 获取已发布页面 schema（通过 slug — runtime-ui 使用此端点）
    const page = await api.get<{
      slug: string;
      schema: { root: { type: string }; pageType: string };
    }>(`/apps/${appId}/pages/slug/asset_list`);
    expect(page.slug).toBe('asset_list');
    expect(page.schema).toBeTruthy();
    expect(page.schema.root).toBeTruthy();
    expect(page.schema.root.type).toBe('page');
  });

  test('仪表盘页面通过 slug 可访问', async () => {
    const page = await api.get<{
      slug: string;
      schema: { root: { type: string; children?: Array<{ type: string }> } };
    }>(`/apps/${appId}/pages/slug/dashboard`);
    expect(page.slug).toBe('dashboard');
    expect(page.schema).toBeTruthy();
    expect(page.schema.root).toBeTruthy();
    expect(page.schema.root.type).toBe('page');
    // 仪表盘根节点应包含 dashboard_grid 子节点
    expect(page.schema.root.children).toBeDefined();
    const hasDashboardGrid = page.schema.root.children!.some((c) => c.type === 'dashboard_grid');
    expect(hasDashboardGrid).toBe(true);
  });

  test('Studio 中应用可见（UI 验证）', async ({ page }) => {
    // 使用已登录的 storageState，导航到应用列表
    await page.goto('/apps');
    await expect(page.getByText('资产管理')).toBeVisible({ timeout: 10_000 });
  });

  test('Studio 对象设计器可见（UI 验证）', async ({ page }) => {
    await page.goto(`/app/${appId}/objects`);
    // filter(visible)：AntD Typography ellipsis 在字体测量窗口期会渲染隐藏的
    // 副本节点，慢环境（CI）下存活时间更长，exact 文本定位会把它们计入
    // strict 匹配导致误报——只断言可见元素。
    await expect(
      page.getByText('资产', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText('领用申请', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.getByText('资产分类', { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 30_000 });
  });

  test('Studio 页面列表可见（UI 验证）', async ({ page }) => {
    await page.goto(`/app/${appId}/pages`);
    await expect(page.getByText('资产列表').first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('资产仪表盘').first()).toBeVisible({ timeout: 30_000 });
  });
});
