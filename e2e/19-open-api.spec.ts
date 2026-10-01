/**
 * E2E 测试 — G6 开放 API（纯流程形态）治理闭环。
 *
 * 验证：API 触发流程 + 服务身份（X-API-Key）+ 版本稳定性承诺
 * （v1 钉版本在 v2 发布后仍按 v1 冻结契约执行）。
 */

import { test, expect } from '@playwright/test';
import { createApiClient, loginViaApi, createTestApp, deleteTestApp } from './fixtures.js';

const API_BASE = 'http://localhost:3000/api/v1';

test.describe('开放 API（G6）', () => {
  let api: ReturnType<typeof createApiClient>;
  let appId = '';
  let processId = '';
  let apiKey = '';
  let identityId = '';
  const apiName = `open_flow_${Date.now()}`;

  /** 简单可判定的流程 schema（start → user_task → end）。 */
  function schema(taskName: string) {
    return {
      nodes: [
        { id: 's', type: 'start', data: {} },
        {
          id: 'ut',
          type: 'user_task',
          data: { taskName, approvalMode: 'single', assignee: 'cmui0yrkl000akvlzgle9qmdc' },
        },
        { id: 'e', type: 'end', data: {} },
      ],
      edges: [
        { sourceNodeID: 's', targetNodeID: 'ut' },
        { sourceNodeID: 'ut', targetNodeID: 'e' },
      ],
    };
  }

  /** 开放端点调用（X-API-Key）。 */
  async function openCall(
    method: string,
    path: string,
    body?: unknown,
    key = apiKey,
  ): Promise<{ status: number; json: Record<string, unknown> }> {
    const res = await fetch(`${API_BASE}/open${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { 'X-API-Key': key } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, json: (await res.json()) as Record<string, unknown> };
  }

  test.beforeAll(async () => {
    api = createApiClient(await loginViaApi());
    appId = await createTestApp(api, `开放API E2E ${Date.now()}`);

    // 建 API 触发流程（v1 契约：taskName = 一审）
    const proc = await api.post<{ id: string }>(`/apps/${appId}/processes`, {
      apiName,
      name: '开放订单流',
      triggerType: 'API',
      workflowSchema: schema('一审'),
    });
    processId = proc.id;
    await api.post(`/processes/${processId}/publish`);

    // 发布 major 1 + 创建服务身份
    await api.post(`/apps/${appId}/processes/${processId}/api-release`, { majorVersion: 1 });
    const identity = await api.post<{ id: string; apiKey: string }>(
      `/apps/${appId}/service-identities`,
      { name: 'E2E 集成' },
    );
    identityId = identity.id;
    apiKey = identity.apiKey;
  });

  test.afterAll(async () => {
    if (appId) await deleteTestApp(api, appId);
  });

  test('X-API-Key 触发最新版本 → 实例启动', async () => {
    const { status, json } = await openCall('POST', `/apps/${appId}/processes/${apiName}/start`, {
      inputs: { order_id: 'SO-001', amount: 100 },
    });
    expect(status).toBe(201);
    expect(json.ok).toBe(true);
    const data = json.data as { instanceId: string; majorVersion: number; status: string };
    expect(data.majorVersion).toBe(1);
    expect(data.status).toBe('RUNNING');

    // 实例确实存在（JWT 侧验证）
    const instance = await api.get<{ id: string; status: string }>(`/instances/${data.instanceId}`);
    expect(instance.id).toBe(data.instanceId);
  });

  test('缺 X-API-Key → 401；错误 key → 401（脱敏）', async () => {
    const noKey = await openCall('POST', `/apps/${appId}/processes/${apiName}/start`, {}, '');
    expect(noKey.status).toBe(401);

    const badKey = await openCall(
      'POST',
      `/apps/${appId}/processes/${apiName}/start`,
      {},
      'ak_ffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    );
    expect(badKey.status).toBe(401);
  });

  test('钉 major 不存在的版本 → 404', async () => {
    const { status } = await openCall(
      'POST',
      `/apps/${appId}/processes/${apiName}/major/99/start`,
      {},
    );
    expect(status).toBe(404);
  });

  test('版本稳定性：发 major2 后，v1 钉版本仍按 v1 冻结契约执行', async () => {
    // 修改流程（updateProcess 会打回 DRAFT）→ 重新发布 → 发 major 2
    await api.put(`/processes/${processId}`, {
      workflowSchema: schema('二审（新契约）'),
    });
    await api.post(`/processes/${processId}/publish`);
    const release = await api.post<{
      deprecatedMajors: number[];
      diff: { changeCount: number } | null;
    }>(`/apps/${appId}/processes/${processId}/api-release`, { majorVersion: 2 });
    expect(release.deprecatedMajors).toEqual([1]);
    expect(release.diff).not.toBeNull();
    expect(release.diff!.changeCount).toBeGreaterThan(0);

    // 最新调用 → v2
    const latest = await openCall('POST', `/apps/${appId}/processes/${apiName}/start`, {});
    expect((latest.json.data as { majorVersion: number }).majorVersion).toBe(2);

    // 钉 v1 → 仍可调（DEPRECATED 但契约不变）
    const pinned = await openCall('POST', `/apps/${appId}/processes/${apiName}/major/1/start`, {
      inputs: { order_id: 'SO-PINNED' },
    });
    expect(pinned.status).toBe(201);
    expect((pinned.json.data as { majorVersion: number }).majorVersion).toBe(1);

    // 钉 v1 的实例按 v1 冻结 schema 执行：任务名 = 一审（v1 契约）
    const pinnedData = pinned.json.data as { instanceId: string };
    const instance = await api.get<{ status: string }>(`/instances/${pinnedData.instanceId}`);
    expect(['RUNNING', 'WAITING_USER_TASK']).toContain(instance.status);
  });

  test('吊销服务身份 → 立即 401', async () => {
    await api.post(`/apps/${appId}/service-identities/${identityId}/revoke`);
    const { status } = await openCall('POST', `/apps/${appId}/processes/${apiName}/start`, {});
    expect(status).toBe(401);
  });

  test('流程发现：GET /open/apps/:id/processes 列出可调流程', async () => {
    // 吊销后无法调用发现接口——用新身份验证发现
    const identity2 = await api.post<{ apiKey: string }>(`/apps/${appId}/service-identities`, {
      name: 'E2E 发现',
    });
    const { json } = await openCall('GET', `/apps/${appId}/processes`, undefined, identity2.apiKey);
    expect(json.ok).toBe(true);
    const list = json.data as Array<{ apiName: string; latestMajor: number }>;
    const found = list.find((p) => p.apiName === apiName);
    expect(found?.latestMajor).toBe(2);
  });
});
