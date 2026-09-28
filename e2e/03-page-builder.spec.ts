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

  test('行政区划级联：预览态省→市→区县三级选择', async ({ page }) => {
    const page_meta = await api.post<{ id: string }>(`/apps/${appId}/pages`, {
      apiName: 'test_region_page',
      name: '测试行政区划页',
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
                  type: 'region_cascader_single',
                  props: { label: '所在地区', apiName: 'region_field' },
                },
              ],
            },
          ],
        },
      },
    });

    await page.goto(`/app/${appId}/pages/${page_meta.id}`);
    await page.locator('.ant-segmented-item', { hasText: '预览' }).click();
    await page.locator('.ant-cascader').first().click();
    const dropdown = page.locator('.ant-cascader-dropdown');
    await dropdown.getByTitle('广东省').click();
    await dropdown.getByTitle('深圳市').click();
    await dropdown.getByTitle('南山区').click();
    await expect(page.locator('.ant-cascader .ant-select-selection-item')).toHaveText(
      '广东省 / 深圳市 / 南山区',
    );
  });

  test('字段并排布局：表单 2 列时两个输入框同行', async ({ page }) => {
    const page_meta = await api.post<{ id: string }>(`/apps/${appId}/pages`, {
      apiName: 'test_columns_page',
      name: '测试并排布局页',
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
              props: { columns: 2 },
              children: [
                { id: 'a1', type: 'text_input', props: { label: '字段A', apiName: 'field_a' } },
                { id: 'a2', type: 'text_input', props: { label: '字段B', apiName: 'field_b' } },
              ],
            },
          ],
        },
      },
    });

    await page.goto(`/app/${appId}/pages/${page_meta.id}`);
    await page.locator('.ant-segmented-item', { hasText: '预览' }).click();
    const items = page.locator('.ant-form-item');
    await expect(items).toHaveCount(2);
    const boxA = await items.nth(0).boundingBox();
    const boxB = await items.nth(1).boundingBox();
    expect(boxA).toBeTruthy();
    expect(boxB).toBeTruthy();
    // 同一行（y 相近）且横向排列（B 在 A 右侧）
    expect(Math.abs((boxA?.y ?? 0) - (boxB?.y ?? 1))).toBeLessThan(5);
    expect((boxB?.x ?? 0) - (boxA?.x ?? 0)).toBeGreaterThan(100);
  });

  test('跨容器拖拽：表单内字段拖入空分区容器', async ({ page }) => {
    const page_meta = await api.post<{ id: string }>(`/apps/${appId}/pages`, {
      apiName: 'test_crossdrag_page',
      name: '测试跨容器拖拽页',
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
                { id: 't1', type: 'text_input', props: { label: '姓名', apiName: 'name' } },
              ],
            },
            { id: 's1', type: 'section', props: {}, children: [] },
          ],
        },
      },
    });

    await page.goto(`/app/${appId}/pages/${page_meta.id}`);
    // 悬停字段节点 → 胶囊工具条出现 → 取握把
    await page.getByPlaceholder('请输入').hover();
    const handle = page.locator('span[title="拖拽排序"]').first();
    await handle.waitFor({ state: 'visible' });
    const hb = await handle.boundingBox();
    const target = page.getByText('拖拽组件到此处');
    const tb = await target.boundingBox();
    expect(hb).toBeTruthy();
    expect(tb).toBeTruthy();
    await page.mouse.move(
      (hb?.x ?? 0) + (hb?.width ?? 0) / 2,
      (hb?.y ?? 0) + (hb?.height ?? 0) / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      (tb?.x ?? 0) + (tb?.width ?? 0) / 2,
      (tb?.y ?? 0) + (tb?.height ?? 0) / 2,
      { steps: 18 },
    );
    await page.mouse.up();

    // 保存后从 API 断言：t1 已归属 s1，f1 不再包含
    await page.getByRole('button', { name: '保存' }).click();
    await page.waitForTimeout(1200);
    const detail = await api.get<{
      schema: { root: { children: Array<Record<string, unknown>> } };
    }>(`/pages/${page_meta.id}`);
    const children = detail.schema.root.children;
    const f1 = children.find((c) => c.id === 'f1') as { children?: Array<{ id: string }> };
    const s1 = children.find((c) => c.id === 's1') as { children?: Array<{ id: string }> };
    expect((f1?.children ?? []).some((c) => c.id === 't1')).toBe(false);
    expect((s1?.children ?? []).some((c) => c.id === 't1')).toBe(true);
  });

  test('飞书式保存点历史：保存自动捕获 + 恢复回滚 + 历史抽屉', async ({ page }) => {
    const page_meta = await api.post<{ id: string }>(`/apps/${appId}/pages`, {
      apiName: 'test_savepoint_page',
      name: '测试保存点页',
      type: 'custom',
    });
    const schemaOf = (marker: string) => ({
      version: '1' as const,
      pageType: 'custom',
      viewModel: { variables: {} },
      root: {
        id: 'root',
        type: 'page',
        props: {},
        children: [{ id: marker, type: 'text', props: { content: marker } }],
      },
    });
    await api.put(`/pages/${page_meta.id}`, { schema: schemaOf('marker-a') });
    await api.put(`/pages/${page_meta.id}`, { schema: schemaOf('marker-b') });

    // 列表：保存点倒序，至少 2 条（marker-b 在前）
    const points = await api.get<Array<{ id: string; source: string; createdAt: string }>>(
      `/pages/${page_meta.id}/save-points`,
    );
    expect(points.length).toBeGreaterThanOrEqual(2);

    // 恢复到最早保存点（marker-a）
    const oldest = points[points.length - 1];
    expect(oldest).toBeTruthy();
    await api.post(`/pages/${page_meta.id}/save-points/${oldest?.id}/restore`, {});
    const detail = await api.get<{
      schema: { root: { children: Array<{ id: string }> } };
    }>(`/pages/${page_meta.id}`);
    expect(detail.schema.root.children[0]?.id).toBe('marker-a');

    // 恢复动作本身产生 restore 回滚点（可在历史中再次恢复以撤销）
    const points2 = await api.get<Array<{ source: string }>>(`/pages/${page_meta.id}/save-points`);
    expect(points2[0]?.source).toBe('restore');

    // UI：顶栏「历史」打开抽屉，保存点列表可见
    await page.goto(`/app/${appId}/pages/${page_meta.id}`);
    await page.locator('button', { hasText: /^历史$/ }).click();
    await expect(page.getByText('历史保存点')).toBeVisible();
    await expect(page.locator('.ant-drawer .ant-list-item').first()).toBeVisible();
  });

  test('代码页签：全局样式编辑写回 + Schema 查看', async ({ page }) => {
    const page_meta = await api.post<{ id: string }>(`/apps/${appId}/pages`, {
      apiName: 'test_codetab_page',
      name: '测试代码页签页',
      type: 'custom',
    });
    await page.goto(`/app/${appId}/pages/${page_meta.id}`);
    await page.getByText('代码', { exact: true }).click();
    await expect(page.getByText('页面 Schema')).toBeVisible();
    await page.getByPlaceholder(/预览与运行时页面注入/).fill('.demo-title { color: red; }');
    // 500ms 防抖落盘后再保存
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: '保存' }).click();
    await page.waitForTimeout(1000);
    const detail = await api.get<{ schema: { globalCss?: string } }>(`/pages/${page_meta.id}`);
    expect(detail.schema.globalCss).toContain('.demo-title');
  });

  test('画布宽度切换：手机 375 预设生效', async ({ page }) => {
    const page_meta = await api.post<{ id: string }>(`/apps/${appId}/pages`, {
      apiName: 'test_canvaswidth_page',
      name: '测试画布宽度页',
      type: 'custom',
    });
    // 放大视口：1280 下设计器画布被左右面板压缩（<960），无法断言桌面宽度
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(`/app/${appId}/pages/${page_meta.id}`);
    const card = page.locator('[data-canvas-card]');
    await expect(card).toHaveCount(1);
    // 桌面默认 960
    expect((await card.boundingBox())?.width).toBe(960);
    await page.locator('.ant-segmented-item:has(.anticon-mobile)').click();
    expect((await card.boundingBox())?.width).toBe(375);
    await page.locator('.ant-segmented-item:has(.anticon-tablet)').click();
    expect((await card.boundingBox())?.width).toBe(768);
    await page.locator('.ant-segmented-item:has(.anticon-desktop)').click();
    expect((await card.boundingBox())?.width).toBe(960);
  });
});
