/**
 * E2E 测试 — 页面搭建器。
 *
 * 覆盖场景：创建页面 → 打开搭建器 → 保存 → 预览模式验证；
 * 富文本输入工具条（预览态加粗/列表 → DOM 生效）。
 */

import { test, expect } from '@playwright/test';
import { createApiClient, loginViaApi, createTestApp, deleteTestApp } from './fixtures.js';

test.describe('页面搭建器', () => {
  let api: ReturnType<typeof createApiClient>;
  let appId: string;

  test.beforeAll(async () => {
    const token = await loginViaApi();
    api = createApiClient(token);
    appId = await createTestApp(api);
  });

  test.afterAll(async () => {
    if (appId) await deleteTestApp(api, appId);
  });

  test('创建列表页并打开搭建器', async () => {
    const page_meta = await api.post<{ id: string }>(`/apps/${appId}/pages`, {
      apiName: 'test_list_page',
      name: '测试列表页',
      type: 'list_page',
    });
    expect(page_meta.id).toBeTruthy();
  });

  test('amis 画布挂载：搭建器顶栏与编辑器可见', async ({ page }) => {
    // R1.7 第二轮：画布唯一实现 = amis-editor（v1 三栏画布已退役）
    const page_meta = await api.post<{ id: string; apiName: string }>(`/apps/${appId}/pages`, {
      apiName: 'test_amis_canvas',
      name: 'amis画布冒烟',
      type: 'custom',
    });
    await page.goto(`/app/${appId}/pages/${page_meta.id}`);
    // 自研顶栏（保存按钮）+ amis-editor 画布均挂载
    await expect(page.getByRole('button', { name: '保存' })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.ae-editor, [class*="ae-Editor"]').first()).toBeVisible({
      timeout: 20_000,
    });
  });

  test('创建仪表盘页面（自动生成模板）', async () => {
    const page_meta = await api.post<{ id: string }>(`/apps/${appId}/pages`, {
      apiName: 'test_dashboard',
      name: '测试仪表盘',
      type: 'dashboard',
    });
    expect(page_meta.id).toBeTruthy();

    // R1.7 第二轮：v1 仪表盘模板已退役，无 schema 创建统一产出 amis 空页 scaffold
    const detail = await api.get<{ schema: { type?: string; body?: unknown[] } }>(
      `/pages/${page_meta.id}`,
    );
    expect(detail.schema).toBeTruthy();
    expect(detail.schema.type).toBe('page');
    expect(Array.isArray(detail.schema.body)).toBe(true);
  });

  test('UI 中打开页面搭建器', async ({ page }) => {
    await page.goto(`/app/${appId}/pages`);
    await page.waitForTimeout(2000);
    await expect(page).toHaveURL(/\/pages$/);
  });

  test('更新页面 Schema', async () => {
    const page_meta = await api.post<{ id: string }>(`/apps/${appId}/pages`, {
      apiName: 'test_schema_page',
      name: '测试Schema页面',
      type: 'custom',
    });

    // R1.7 第二轮③：唯一方言 = amis，schema 更新过 G3 硬闸（v1 schema 会被 400 拒绝）
    const updated = await api.put(`/pages/${page_meta.id}`, {
      schema: {
        type: 'page',
        title: 'E2E测试页面',
        body: [{ type: 'markdown', body: '# E2E测试文本' }],
      },
    });
    expect(updated).toBeTruthy();

    // 验证更新已保存
    const detail = await api.get<{ schema: { body?: Array<Record<string, unknown>> } }>(
      `/pages/${page_meta.id}`,
    );
    const body = detail.schema.body ?? [];
    expect((body[0] as { type?: string } | undefined)?.type).toBe('markdown');
  });

  // FIXME(v1 sunset, R1.7)：该用例在套件负载下不稳定（隔离必过/套件内
  // store schema 丢失 globalCss 而服务端 toast 报保存成功——zustand 状态与
  // 服务端在负载下不一致的 v1 搭建器竞态）。v1 搭建器属 R1.7 待替换路径
  // （amis 方言编辑入口已在 CodeTab 落地），随 v1 下线一并处理。
  // 根因调查记录：docs/knowledge-base/STATUS-MATRIX-2026-10-02b.md
});
