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

  test('创建仪表盘页面（自动生成模板）', async () => {
    const page_meta = await api.post<{ id: string }>(`/apps/${appId}/pages`, {
      apiName: 'test_dashboard',
      name: '测试仪表盘',
      type: 'dashboard',
    });
    expect(page_meta.id).toBeTruthy();

    // 验证仪表盘模板已自动生成（schema 不为空）
    const detail = await api.get<{ schema: { root: { children?: unknown[] } } }>(
      `/pages/${page_meta.id}`,
    );
    expect(detail.schema).toBeTruthy();
    expect(detail.schema.root).toBeTruthy();
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

    const updated = await api.put(`/pages/${page_meta.id}`, {
      schema: {
        version: '1',
        pageType: 'custom',
        viewModel: { variables: {} },
        root: {
          id: 'root',
          type: 'page',
          props: {},
          children: [{ id: 't1', type: 'text', props: { content: 'E2E测试文本' } }],
        },
      },
    });
    expect(updated).toBeTruthy();

    // 验证更新已保存
    const detail = await api.get<{
      schema: { root: { children?: Array<Record<string, unknown>> } };
    }>(`/pages/${page_meta.id}`);
    const children = detail.schema.root.children ?? [];
    const firstChild = children[0] as { props?: { content?: string } } | undefined;
    expect(firstChild?.props?.content).toBe('E2E测试文本');
  });

  test('富文本输入工具条：预览态加粗与列表生效', async ({ page }) => {
    const page_meta = await api.post<{ id: string }>(`/apps/${appId}/pages`, {
      apiName: 'test_richtext_page',
      name: '测试富文本页',
      type: 'custom',
    });
    await api.put(`/pages/${page_meta.id}`, {
      schema: {
        version: '1',
        pageType: 'custom',
        viewModel: { variables: {} },
        root: {
          id: 'root',
          type: 'page',
          props: {},
          children: [
            {
              id: 'f1',
              type: 'form',
              props: {},
              children: [
                {
                  id: 'r1',
                  type: 'rich_text_input',
                  props: { label: '富文本', apiName: 'rich_field', rows: 4 },
                },
              ],
            },
          ],
        },
      },
    });

    await page.goto(`/app/${appId}/pages/${page_meta.id}`);
    // 切到预览模式（Canvas 以 mode 为 key 重挂载 RuntimeStoreProvider）
    await page.locator('.ant-segmented-item', { hasText: '预览' }).click();
    const editor = page.locator('.apaas-richtext [contenteditable="true"]');
    await editor.click();
    await page.keyboard.type('hello');
    await page.keyboard.press('ControlOrMeta+a');
    await page.getByRole('button', { name: '加粗' }).click();
    await expect(editor.locator('b')).toHaveCount(1);
    await expect(editor).toContainText('hello');
    await page.getByRole('button', { name: '有序列表' }).click();
    await expect(editor.locator('ol li')).toHaveCount(1);
  });
});
