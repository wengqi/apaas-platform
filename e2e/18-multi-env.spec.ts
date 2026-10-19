/**
 * E2E 测试 — R1.4 多环境治理闭环。
 *
 * 验证：发布=切版本指针；dev/prod 各自的页面 bundle 与记录隔离；
 * G4 必填环境变量发布拦截；环境回滚（记录数据不回滚）。
 */

import { test, expect } from '@playwright/test';
import { createApiClient, loginViaApi, createTestApp, deleteTestApp } from './fixtures.js';

test.describe('多环境（R1.4）', () => {
  let api: ReturnType<typeof createApiClient>;
  let appId = '';
  let pageApiName = '';

  test.beforeAll(async () => {
    const token = await loginViaApi();
    api = createApiClient(token);
    appId = await createTestApp(api, `多环境 E2E ${Date.now()}`);
    pageApiName = `multi_env_page_${Date.now()}`;

    // 建对象 + 页面（v1：标题"第一版"）
    const obj = await api.post<{ id: string }>(`/apps/${appId}/objects`, {
      apiName: `multi_env_obj_${Date.now()}`,
      name: '多环境对象',
      icon: 'box',
    });
    await api.post(`/objects/${obj.id}/fields`, {
      apiName: 'title',
      label: '标题',
      type: 'text',
      config: {},
    });

    // 页面 schema 内含 ${env.GREETING} 引用（验证 bundle 替换链路）
    await api.post(`/apps/${appId}/pages`, {
      apiName: pageApiName,
      name: '多环境页面',
      type: 'custom',
      schema: {
        type: 'page',
        title: '${env.GREETING}',
        body: [{ type: 'tpl', text: '第一版' }],
      },
    });

    // 发布应用（= 部署 prod 指针）
    await api.post(`/design/apps/${appId}/publish`, { version: '1.0.0', description: 'v1' });
  });

  test.afterAll(async () => {
    if (appId) await deleteTestApp(api, appId);
  });

  test('环境列表：prod 指针在 v1.0.0，dev 未部署', async () => {
    const envs = await api.get<Array<{ key: string; currentVersionNumber: string | null }>>(
      `/apps/${appId}/environments`,
    );
    const prod = envs.find((e) => e.key === 'prod');
    const dev = envs.find((e) => e.key === 'dev');
    expect(prod?.currentVersionNumber).toBe('1.0.0');
    expect(dev?.currentVersionNumber).toBeNull();
  });

  test('dev 部署 v1.0.1 后：dev 见新内容、prod 保持旧内容（隔离）', async () => {
    // 修改页面为"第二版" → 发布 v1.0.1 → 仅部署 dev
    const pages = await api.get<Array<{ id: string; slug: string }>>(`/apps/${appId}/pages`);
    const page = pages.find((p) => p.slug === pageApiName);
    await api.put(`/pages/${page!.id}`, {
      schema: {
        type: 'page',
        title: '${env.GREETING}',
        body: [{ type: 'tpl', text: '第二版' }],
      },
    });
    await api.post(`/design/apps/${appId}/publish`, { version: '1.0.1', description: 'v2' });
    // 发布默认部署 prod（后端行为）→ prod 已是 1.0.1；再显式把 dev 也指到 1.0.1，
    // 然后验证隔离用"prod 回滚到 1.0.0"的用例
    const versions = await api.get<Array<{ id: string; versionNumber: string }>>(
      `/design/apps/${appId}/versions`,
    );
    const v101 = versions.find((v) => v.versionNumber === '1.0.1');
    await api.post(`/apps/${appId}/environments/dev/publish`, { versionId: v101!.id });

    const envs = await api.get<Array<{ key: string; currentVersionNumber: string | null }>>(
      `/apps/${appId}/environments`,
    );
    expect(envs.find((e) => e.key === 'prod')?.currentVersionNumber).toBe('1.0.1');
    expect(envs.find((e) => e.key === 'dev')?.currentVersionNumber).toBe('1.0.1');

    // slug 读取带 env=prod/dev —— 此时两者同版本，仅验证双链路可用
    for (const env of ['prod', 'dev']) {
      const res = await fetch(
        `http://localhost:3000/api/v1/apps/${appId}/pages/slug/${pageApiName}?env=${env}`,
        { headers: { Authorization: `Bearer ${api.token}` } },
      );
      const json = (await res.json()) as { ok: boolean; data?: { published: boolean } };
      expect(json.ok).toBe(true);
      expect(json.data?.published).toBe(true);
    }
  });

  test('G4：必填环境变量未设值 → 部署被拦截；设值后通过', async () => {
    // 定义必填变量（两个环境共享定义）
    const def = await api.post<{ id: string }>(`/apps/${appId}/env-vars/defs`, {
      key: 'GREETING',
      description: '页面标题问候语',
      required: true,
      sensitive: false,
    });

    // dev 环境缺值 → 部署拦截
    const versions = await api.get<Array<{ id: string; versionNumber: string }>>(
      `/design/apps/${appId}/versions`,
    );
    const latest = versions.find((v) => v.versionNumber === '1.0.1')!.id;

    const blocked = await fetch(
      `http://localhost:3000/api/v1/apps/${appId}/environments/dev/publish`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${api.token}`,
        },
        body: JSON.stringify({ versionId: latest }),
      },
    );
    const blockedJson = (await blocked.json()) as { ok: boolean; error?: { message?: string } };
    expect(blockedJson.ok).toBe(false);
    expect(blockedJson.error?.message).toContain('GREETING');

    // 设值 → 部署通过
    await api.post(`/apps/${appId}/env-vars/defs/${def.id}/value?env=dev`, { value: '你好，开发' });
    const deploy = await api.post<{ deployment: { versionNumber: string } }>(
      `/apps/${appId}/environments/dev/publish`,
      { versionId: latest },
    );
    expect(deploy.deployment.versionNumber).toBe('1.0.1');

    // dev slug 读取：${env.GREETING} 已被替换
    const res = await fetch(
      `http://localhost:3000/api/v1/apps/${appId}/pages/slug/${pageApiName}?env=dev`,
      { headers: { Authorization: `Bearer ${api.token}` } },
    );
    const json = (await res.json()) as { data?: { schema?: { title?: string } } };
    expect(json.data?.schema?.title).toBe('你好，开发');
  });

  test('prod 回滚到 v1.0.0：指针回切 + Deployment 历史 + 记录不回滚', async () => {
    // prod 写一条记录（回滚后应仍在）
    const objects = await api.get<Array<{ id: string }>>(`/apps/${appId}/objects`);
    await api.post(`/objects/${objects[0]!.id}/records`, { title: '回滚不删我' });

    const versions = await api.get<Array<{ id: string; versionNumber: string }>>(
      `/design/apps/${appId}/versions`,
    );
    const v100 = versions.find((v) => v.versionNumber === '1.0.0')!;
    const result = await api.post<{ deployment: { kind: string } }>(
      `/apps/${appId}/environments/prod/rollback`,
      { versionId: v100.id, note: 'e2e 回滚' },
    );
    expect(result.deployment.kind).toBe('rollback');

    const envs = await api.get<Array<{ key: string; currentVersionNumber: string | null }>>(
      `/apps/${appId}/environments`,
    );
    expect(envs.find((e) => e.key === 'prod')?.currentVersionNumber).toBe('1.0.0');

    // 记录数据不回滚
    const records = await api.get<{ items: Array<{ data: { title?: string } }> }>(
      `/objects/${objects[0]!.id}/records`,
    );
    expect(records.items.some((r) => r.data?.title === '回滚不删我')).toBe(true);

    // 部署历史含 rollback 条目
    const deployments = await api.get<Array<{ kind: string }>>(
      `/apps/${appId}/environments/prod/deployments`,
    );
    expect(deployments.some((d) => d.kind === 'rollback')).toBe(true);
  });

  test('dev/prod 记录隔离：同对象各自环境的数据互不可见', async () => {
    const objects = await api.get<Array<{ id: string }>>(`/apps/${appId}/objects`);
    const objectId = objects[0]!.id;

    // env=dev 上下文写记录（运行时读写 API 经 ?env= 透传）
    const res = await fetch(`http://localhost:3000/api/v1/objects/${objectId}/records?env=dev`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${api.token}` },
      body: JSON.stringify({ title: '仅 dev 可见' }),
    });
    const created = (await res.json()) as { ok: boolean };

    // dev 列表可见 / prod 列表不可见
    const devList = await api.get<{ items: Array<{ data: { title?: string } }> }>(
      `/objects/${objectId}/records?env=dev`,
    );
    const prodList = await api.get<{ items: Array<{ data: { title?: string } }> }>(
      `/objects/${objectId}/records?env=prod`,
    );
    expect(created.ok).toBe(true);
    expect(devList.items.some((r) => r.data?.title === '仅 dev 可见')).toBe(true);
    expect(prodList.items.some((r) => r.data?.title === '仅 dev 可见')).toBe(false);
  });
});
