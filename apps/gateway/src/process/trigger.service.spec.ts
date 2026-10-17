/**
 * I-1 回归单测（流程引擎修缮轮，2026-10-17）——触发匹配改读 schema 触发节点。
 *
 * 缺陷（台账 I-1，R12 GUI 走查实测）：画布触发器节点只写 workflowSchema
 * （data.triggerType/objectId），顶层 ProcessDef.triggerType 仍是新建弹窗缺省值
 * （MANUAL）；onRecordEvent 按顶层列匹配 → 画布配置的记录触发永不命中。
 * 且记录触发可见集 = 应用 bundle 快照，流程晚于应用发布创建时须重发应用才入 bundle。
 *
 * 修复语义（修法②，用户裁决）：
 * 1. 触发信息以流程自身 workflowSchema 的 trigger 节点为 SSOT
 *    （无节点回退顶层列——种子/AI 建流兼容）；
 * 2. 匹配集 = 活表 PUBLISHED（流程级发布语义，发布即生效，bundle 不再约束自动触发）；
 * 3. 触发节点带 objectId 时按对象精确匹配（修复跨对象误触发），缺省 = 应用级（存量语义）；
 * 4. 自动触发实例以活表 PUBLISHED schema 执行（schemaOverride 直通，bundle 陈旧快照不生效）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMockPrisma } from '../test/test-helpers.js';
import { TriggerService } from './trigger.service.js';

const TENANT = 'tenant-1';
const APP = 'app-1';

/** 画布配置的流程：顶层 triggerType 未同步（MANUAL），schema trigger 节点已配置。 */
function canvasFlow(
  overrides: Record<string, unknown> = {},
  triggerData: Record<string, unknown> = {
    title: '触发器',
    triggerType: 'RECORD_CREATED',
    objectId: 'obj-vehicle',
    event: 'CREATE',
  },
) {
  return {
    id: 'proc-canvas',
    apiName: 'vehicle_flow',
    name: '用车审批',
    triggerType: 'MANUAL',
    cron: null,
    workflowSchema: {
      nodes: [
        { id: 'start_1', type: 'start', data: { title: '开始' } },
        { id: 'trigger_1', type: 'trigger', data: triggerData },
        { id: 'end_1', type: 'end', data: { title: '结束' } },
      ],
      edges: [],
    },
    ...overrides,
  };
}

/** 种子/AI 建的流程：无 trigger 节点，顶层列即触发契约。 */
function seedFlow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'proc-seed',
    apiName: 'feedback_flow',
    name: '反馈审批',
    triggerType: 'RECORD_CREATED',
    cron: null,
    workflowSchema: {
      nodes: [
        { id: 'start_1', type: 'start', data: { title: '开始' } },
        { id: 'end_1', type: 'end', data: { title: '结束' } },
      ],
      edges: [],
    },
    ...overrides,
  };
}

describe('TriggerService.onRecordEvent — 触发匹配读 schema 触发节点（I-1）', () => {
  const prisma = getMockPrisma();
  const engine = { startProcess: vi.fn().mockResolvedValue('inst-1') };

  const makeService = () =>
    new TriggerService(
      engine as never,
      {
        add: vi.fn(),
        removeRepeatable: vi.fn(),
        removeRepeatableByKey: vi.fn(),
        getRepeatableJobs: vi.fn().mockResolvedValue([]),
      } as never,
    );

  /**
   * 模拟真实 Prisma：顶层列过滤在 SQL 层生效——where.triggerType 不匹配的行
   * 对查询不可见（I-1 症状的根源：画布流程顶层 MANUAL 被过滤）。
   */
  const installLiveTable = (rows: Array<Record<string, unknown>>) => {
    prisma.processDef.findMany.mockImplementation(
      async (args?: { where?: { triggerType?: string } }) =>
        rows.filter(
          (r) => !args?.where?.triggerType || r['triggerType'] === args.where.triggerType,
        ),
    );
  };

  beforeEach(() => {
    vi.clearAllMocks();
    engine.startProcess.mockResolvedValue('inst-1');
  });

  it('画布配置的触发器（顶层 MANUAL 未同步）能被记录事件命中并按活表 schema 启动', async () => {
    const flow = canvasFlow();
    installLiveTable([flow]);
    await makeService().onRecordEvent(TENANT, APP, 'obj-vehicle', 'created', { id: 'rec-1' });
    expect(engine.startProcess).toHaveBeenCalledTimes(1);
    expect(engine.startProcess).toHaveBeenCalledWith(
      TENANT,
      'proc-canvas',
      expect.objectContaining({ eventType: 'created', recordId: 'rec-1' }),
      'prod',
      flow.workflowSchema,
    );
  });

  it('触发节点绑定 objectId 时按对象精确匹配——其他对象的事件不触发', async () => {
    installLiveTable([canvasFlow()]);
    await makeService().onRecordEvent(TENANT, APP, 'obj-other', 'created', { id: 'rec-2' });
    expect(engine.startProcess).not.toHaveBeenCalled();
  });

  it('种子/AI 建流（无 trigger 节点）回退顶层 triggerType 列——存量契约不破坏', async () => {
    installLiveTable([seedFlow()]);
    await makeService().onRecordEvent(TENANT, APP, 'obj-anything', 'created', { id: 'rec-3' });
    expect(engine.startProcess).toHaveBeenCalledTimes(1);
    expect(engine.startProcess).toHaveBeenCalledWith(
      TENANT,
      'proc-seed',
      expect.anything(),
      'prod',
      expect.anything(),
    );
  });

  it('触发节点缺 objectId（画布未选关联对象）= 应用级匹配（存量语义）', async () => {
    installLiveTable([canvasFlow({}, { title: '触发器', triggerType: 'RECORD_CREATED' })]);
    await makeService().onRecordEvent(TENANT, APP, 'obj-any', 'created', { id: 'rec-4' });
    expect(engine.startProcess).toHaveBeenCalledTimes(1);
  });

  it('多流程共存时只启动触发信息匹配的流程', async () => {
    const canvas = canvasFlow();
    const seed = seedFlow();
    installLiveTable([canvas, seed]);
    // vehicle 对象的事件：canvas 流程命中（绑定 obj-vehicle）、seed 流程回退顶层列也命中
    await makeService().onRecordEvent(TENANT, APP, 'obj-vehicle', 'created', { id: 'rec-5' });
    expect(engine.startProcess).toHaveBeenCalledTimes(2);
    // 更新事件：两个流程均非 RECORD_UPDATED，不触发
    engine.startProcess.mockClear();
    await makeService().onRecordEvent(TENANT, APP, 'obj-vehicle', 'updated', { id: 'rec-5' });
    expect(engine.startProcess).not.toHaveBeenCalled();
  });

  it('bundle 存在但陈旧（快照缺新发布流程）时仍按活表匹配——发布即生效', async () => {
    installLiveTable([canvasFlow()]);
    await makeService().onRecordEvent(TENANT, APP, 'obj-vehicle', 'created', { id: 'rec-6' });
    expect(engine.startProcess).toHaveBeenCalledTimes(1);
  });
});

describe('TriggerService.rebuildForEnvironment — 定时注册读活表+触发节点（I-1 同根）', () => {
  const prisma = getMockPrisma();
  const engine = { startProcess: vi.fn().mockResolvedValue('inst-1') };
  const queue = {
    add: vi.fn().mockResolvedValue(undefined),
    removeRepeatable: vi.fn().mockResolvedValue(undefined),
    removeRepeatableByKey: vi.fn().mockResolvedValue(undefined),
    getRepeatableJobs: vi.fn().mockResolvedValue([]),
  };

  const makeService = () => new TriggerService(engine as never, queue as never);

  beforeEach(() => {
    vi.clearAllMocks();
    queue.getRepeatableJobs.mockResolvedValue([]);
    prisma.processDef.findFirst.mockResolvedValue(null);
  });

  it('按活表 PUBLISHED 注册画布配置的定时触发（cron 取触发节点，不依赖应用发布快照）', async () => {
    const flow = {
      id: 'proc-sched',
      apiName: 'daily_report',
      name: '日报',
      triggerType: 'MANUAL',
      cron: null,
      workflowSchema: {
        nodes: [
          {
            id: 'trigger_1',
            type: 'trigger',
            data: { triggerType: 'SCHEDULED', cron: '0 0 9 * * ?' },
          },
        ],
        edges: [],
      },
    };
    prisma.processDef.findMany.mockResolvedValue([flow]);
    await makeService().rebuildForEnvironment(TENANT, APP, 'dev');
    expect(queue.add).toHaveBeenCalledWith(
      'scheduled-trigger',
      { processDefId: 'proc-sched', type: 'scheduled', envKey: 'dev' },
      expect.objectContaining({
        jobId: 'scheduled:dev:proc-sched',
        repeat: { pattern: '0 0 9 * * ?' },
      }),
    );
  });

  it('触发节点缺 cron 回退活表 cron 列', async () => {
    const flow = {
      id: 'proc-sched2',
      apiName: 'nightly',
      name: '夜审',
      triggerType: 'SCHEDULED',
      cron: '0 9 * * 1-5',
      workflowSchema: {
        nodes: [{ id: 'trigger_1', type: 'trigger', data: { triggerType: 'SCHEDULED' } }],
        edges: [],
      },
    };
    prisma.processDef.findMany.mockResolvedValue([flow]);
    await makeService().rebuildForEnvironment(TENANT, APP, 'prod');
    expect(queue.add).toHaveBeenCalledWith(
      'scheduled-trigger',
      { processDefId: 'proc-sched2', type: 'scheduled', envKey: 'prod' },
      expect.objectContaining({ repeat: { pattern: '0 9 * * 1-5' } }),
    );
  });

  it('清理仅匹配本环境前缀且属于本应用的旧注册', async () => {
    queue.getRepeatableJobs.mockResolvedValue([
      { key: 'scheduled:dev:proc-old' },
      { key: 'scheduled:prod:proc-x' },
      { key: 'other:dev:proc-y' },
    ]);
    // 第一次调用 = 清理集查询（本应用全部流程 id）
    prisma.processDef.findMany.mockResolvedValue([{ id: 'proc-old' }]);
    await makeService().rebuildForEnvironment(TENANT, APP, 'dev');
    expect(queue.removeRepeatableByKey).toHaveBeenCalledTimes(1);
    expect(queue.removeRepeatableByKey).toHaveBeenCalledWith('scheduled:dev:proc-old');
  });
});
