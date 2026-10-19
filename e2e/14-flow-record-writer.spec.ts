/**
 * E2E 测试 — 流程写库复用记录写内核（评审 P1-5 回归）。
 *
 * 背景（2026-09-26 独立评审 P1-5）：流程节点执行器此前直接 `prisma.record.*`
 * 写库，绕过字段校验、AutoNumber/Formula/Rollup 计算与记录事件触发——
 * 流程写入的记录缺编号/公式、父记录汇总不更新、且不触发其他 RECORD_* 流程。
 * 现已统一走 RecordService（记录写内核）。
 *
 * 本 spec 通过真实引擎执行流程，验证三个可观测结论：
 *  1. 流程创建的记录带自动编号与公式计算结果（内核计算生效）
 *  2. 流程写入触发 RECORD_CREATED 流程（事件传播生效）
 *  3. 流程批量更新保留未提供的字段（merge 语义）并写入目标字段
 */

import { test, expect } from '@playwright/test';
import { createApiClient, loginViaApi, createTestApp, deleteTestApp } from './fixtures.js';

test.describe('流程写库复用记录写内核（P1-5 回归）', () => {
  let api: ReturnType<typeof createApiClient>;
  let appId = '';
  let objectId = '';
  let createFlowId = '';
  let batchFlowId = '';
  let recordTriggerFlowId = '';

  const minimalSchema = (
    extraNodes: Array<Record<string, unknown>>,
    extraEdges: Array<Record<string, unknown>> = [],
  ) => ({
    nodes: [
      { id: 'start_0', type: 'start', meta: {}, data: {} },
      ...extraNodes,
      { id: 'end_0', type: 'end', meta: {}, data: {} },
    ],
    edges: [
      { id: 'e1', sourceNodeID: 'start_0', targetNodeID: String(extraNodes[0]?.id ?? 'end_0') },
      ...extraEdges,
    ],
  });

  test.beforeAll(async () => {
    const token = await loginViaApi();
    api = createApiClient(token);
    appId = await createTestApp(api);

    const obj = await api.post<{ id: string }>(`/design/apps/${appId}/objects`, {
      apiName: 'writer_spec_object',
      name: '写内核验证',
      icon: 'box',
    });
    objectId = obj.id;

    await api.post(`/design/apps/${appId}/objects/${objectId}/fields`, {
      apiName: 'code',
      label: '编号',
      type: 'auto_number',
      config: { autoNumber: { format: 'ORD-{seq:0000}' } },
    });
    await api.post(`/design/apps/${appId}/objects/${objectId}/fields`, {
      apiName: 'qty',
      label: '数量',
      type: 'number',
      config: {},
    });
    await api.post(`/design/apps/${appId}/objects/${objectId}/fields`, {
      apiName: 'price',
      label: '单价',
      type: 'number',
      config: {},
    });
    await api.post(`/design/apps/${appId}/objects/${objectId}/fields`, {
      apiName: 'total',
      label: '总额',
      type: 'formula',
      config: { formula: { expression: 'qty * price', returnType: 'number' } },
    });

    // 1) 流程创建记录（不提供 code/total，应由内核计算）
    const createFlow = await api.post<{ id: string }>(`/apps/${appId}/processes`, {
      apiName: 'writer_create_flow',
      name: '写内核-建记录',
      triggerType: 'MANUAL',
      workflowSchema: minimalSchema(
        [
          {
            id: 'obj_op_0',
            type: 'object_operation',
            meta: {},
            data: {
              title: '建记录',
              operation: 'create',
              objectId,
              inputsValues: {
                qty: { type: 'constant', content: 3 },
                price: { type: 'constant', content: 5 },
              },
            },
          },
        ],
        [{ id: 'e2', sourceNodeID: 'obj_op_0', targetNodeID: 'end_0' }],
      ),
    });
    createFlowId = createFlow.id;
    await api.post(`/processes/${createFlowId}/publish`, {});

    // 2) 记录创建联动流程（用于验证事件传播；触发服务按 triggerType 匹配同应用流程）
    const trigFlow = await api.post<{ id: string }>(`/apps/${appId}/processes`, {
      apiName: 'writer_record_trigger',
      name: '写内核-记录联动',
      triggerType: 'RECORD_CREATED',
      workflowSchema: minimalSchema([]),
    });
    recordTriggerFlowId = trigFlow.id;
    await api.post(`/processes/${recordTriggerFlowId}/publish`, {});

    // 3) 批量更新流程（按 qty=3 过滤，写入 flag）
    const batchFlow = await api.post<{ id: string }>(`/apps/${appId}/processes`, {
      apiName: 'writer_batch_flow',
      name: '写内核-批量更新',
      triggerType: 'MANUAL',
      workflowSchema: minimalSchema(
        [
          {
            id: 'batch_0',
            type: 'batch_operation',
            meta: {},
            data: {
              title: '批量更新',
              operation: 'update',
              objectId,
              filter: { '==': [{ var: 'qty' }, 3] },
              inputsValues: { data: { type: 'constant', content: { flag: 'updated' } } },
            },
          },
        ],
        [{ id: 'e2', sourceNodeID: 'batch_0', targetNodeID: 'end_0' }],
      ),
    });
    batchFlowId = batchFlow.id;
    await api.post(`/processes/${batchFlowId}/publish`, {});
  });

  test.afterAll(async () => {
    if (appId) await deleteTestApp(api, appId);
  });

  /** 读取对象下全部记录（含业务字段）。 */
  async function listRecords() {
    const page = await api.get<{
      items: Array<{ id: string; data: Record<string, unknown> }>;
      total: number;
    }>(`/objects/${objectId}/records?page=1&pageSize=50`);
    return page;
  }

  test('流程创建记录：自动编号 + 公式由写内核计算，且触发 RECORD_CREATED 流程', async () => {
    await api.post(`/processes/${createFlowId}/start`, {});
    await expect
      .poll(async () => (await listRecords()).total, { timeout: 20_000 })
      .toBeGreaterThan(0);

    const { items } = await listRecords();
    const record = items[0]!;
    // 内核计算：自动编号 + 公式
    expect(String(record.data['code'] ?? '')).toMatch(/^ORD-\d{4}$/);
    expect(record.data['total']).toBe(15);

    // 事件传播：流程写入的记录触发了 RECORD_CREATED 联动流程
    await expect
      .poll(
        async () => {
          // 该端点直接返回实例数组（controller 以 items 作为 data）
          const instances = await api.get<Array<{ id: string }>>(
            `/processes/${recordTriggerFlowId}/instances`,
          );
          return Array.isArray(instances) ? instances.length : 0;
        },
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);
  });

  test('流程批量更新：保留未提供字段（merge 语义）并写入目标字段', async () => {
    await api.post(`/processes/${batchFlowId}/start`, {});
    await expect
      .poll(
        async () => {
          const { items } = await listRecords();
          return items.filter((r) => r.data['flag'] === 'updated').length;
        },
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);

    const { items } = await listRecords();
    const updated = items.find((r) => r.data['flag'] === 'updated')!;
    // merge：原有字段（编号/数量/单价/公式）必须保留
    expect(String(updated.data['code'] ?? '')).toMatch(/^ORD-\d{4}$/);
    expect(updated.data['qty']).toBe(3);
    expect(updated.data['price']).toBe(5);
    expect(updated.data['total']).toBe(15);
  });
});
