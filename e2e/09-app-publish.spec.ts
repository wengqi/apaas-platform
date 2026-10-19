/**
 * E2E 测试 — 应用发布与版本管理 (Phase 9.11 验收)。
 *
 * 覆盖场景：创建应用 → 开发（对象+页面）→ 预检 → 发布 → 运行态验证 → 版本回滚
 * 验收标准（ROADMAP）：创建应用→开发→检查→发布→运行态验证→版本回滚
 *
 * 设计决策：
 * - app check 需要应用内有内容（对象/页面），添加最小内容确保 check PASS
 * - 版本回滚测试：发布 2 个版本后回滚到第一个
 */

import { test, expect } from '@playwright/test';
import { createApiClient, loginViaApi, createTestApp, deleteTestApp } from './fixtures.js';

test.describe('应用发布与版本管理', () => {
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

  test('应用预检 + 发布 + 版本列表', async () => {
    // 开发：添加对象 + 页面
    const obj = await api.post<{ id: string }>(`/design/apps/${appId}/objects`, {
      apiName: 'e2e_publish_obj',
      name: '发布测试对象',
      icon: 'box',
    });

    await api.post(`/design/apps/${appId}/objects/${obj.id}/fields`, {
      apiName: 'name',
      label: '名称',
      type: 'TEXT',
      required: true,
    });

    const page = await api.post<{ id: string; slug: string }>(`/design/apps/${appId}/pages`, {
      apiName: 'e2e_publish_page',
      name: '发布测试页面',
      type: 'list_page',
      objectId: obj.id,
    });
    expect(page.id).toBeTruthy();

    // 预检
    const checkResult = await api.post<{
      status: string;
      issues: Array<{ level: string; message: string }>;
    }>(`/design/apps/${appId}/check`);
    expect(checkResult.status).toBe('PASS');

    // 发布
    const version = await api.post<{
      id: string;
      versionNumber: string;
      status: string;
    }>(`/design/apps/${appId}/publish`, {
      version: '1.0.0',
      description: 'E2E 首次发布',
    });
    expect(version.id).toBeTruthy();
    expect(version.versionNumber).toBe('1.0.0');
    expect(version.status).toBe('PUBLISHED');

    // 版本列表
    const versions = await api.get<Array<{ id: string; versionNumber: string }>>(
      `/design/apps/${appId}/versions`,
    );
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions.some((v) => v.versionNumber === '1.0.0')).toBe(true);
  });

  test('运行态验证 — 发布后通过 slug 访问页面', async () => {
    // 确保有对象和页面（上一个测试已创建，但 E2E 测试间数据可能不共享——这里自建）
    const obj = await api.post<{ id: string }>(`/design/apps/${appId}/objects`, {
      apiName: 'e2e_runtime_obj',
      name: '运行态测试对象',
      icon: 'box',
    });

    await api.post(`/design/apps/${appId}/objects/${obj.id}/fields`, {
      apiName: 'title',
      label: '标题',
      type: 'TEXT',
    });

    const page = await api.post<{ id: string; slug: string }>(`/design/apps/${appId}/pages`, {
      apiName: 'e2e_runtime_page',
      name: '运行态页面',
      type: 'list_page',
      objectId: obj.id,
    });

    // 发布页面
    await api.post(`/design/apps/${appId}/pages/${page.id}/publish`);

    // 发布应用
    await api.post(`/design/apps/${appId}/publish`, {
      version: '1.0.1',
      description: 'E2E 运行态验证发布',
    });

    // 通过 slug 访问运行时页面
    const runtimePage = await api.get<{ slug: string; schema: unknown }>(
      `/apps/${appId}/pages/slug/${page.slug}`,
    );
    expect(runtimePage.slug).toBe(page.slug);
    expect(runtimePage.schema).toBeTruthy();
  });

  test('版本回滚', async () => {
    // 确保有内容
    const obj = await api.post<{ id: string }>(`/design/apps/${appId}/objects`, {
      apiName: 'e2e_rollback_obj',
      name: '回滚测试对象',
      icon: 'box',
    });

    await api.post(`/design/apps/${appId}/objects/${obj.id}/fields`, {
      apiName: 'name',
      label: '名称',
      type: 'TEXT',
    });

    const _page = await api.post<{ id: string; slug: string }>(`/design/apps/${appId}/pages`, {
      apiName: 'e2e_rollback_page',
      name: '回滚测试页面',
      type: 'list_page',
      objectId: obj.id,
    });

    // 发布第一个版本
    await api.post(`/design/apps/${appId}/check`);
    await api.post(`/design/apps/${appId}/publish`, {
      version: '2.0.0',
      description: '回滚测试 — 版本一',
    });

    // 发布第二个版本
    await api.post(`/design/apps/${appId}/publish`, {
      version: '2.0.1',
      description: '回滚测试 — 版本二',
    });

    // 获取版本列表
    const versions = await api.get<Array<{ id: string; version: string }>>(
      `/design/apps/${appId}/versions`,
    );
    expect(versions.length).toBeGreaterThanOrEqual(2);

    // 找到第一个版本（2.0.0）并回滚
    const targetVersion = versions.find((v) => v.versionNumber === '2.0.0');
    expect(targetVersion).toBeTruthy();

    const rollbackResult = await api.post<{
      id: string;
      version: string;
      status: string;
    }>(`/design/apps/${appId}/versions/${targetVersion!.id}/rollback`);
    expect(rollbackResult.status).toBe('PUBLISHED');

    // 验证版本列表中有回滚产生的新版本
    const versionsAfter = await api.get<Array<{ id: string; version: string }>>(
      `/design/apps/${appId}/versions`,
    );
    expect(versionsAfter.length).toBeGreaterThan(versions.length);
  });
});
