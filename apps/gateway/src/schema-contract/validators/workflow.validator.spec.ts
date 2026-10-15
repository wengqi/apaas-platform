/**
 * workflow.validator 单测——start.startPageId 发起页面绑定（R6 方案一）。
 *
 * 契约：startPageId 与 user_task.pageId 对称——提供 pageIds 上下文时校验
 * 页面存在（不存在 → REF_NOT_FOUND）；未配置不报错（可选绑定）。
 */

import { describe, it, expect } from 'vitest';
import { validateWorkflow } from './workflow.validator.js';

const PAGES = new Set(['page-1', 'page-2']);

function validate(schema: unknown) {
  const issues = validateWorkflow(schema, { pageIds: PAGES });
  return { issues, valid: issues.every((i) => i.severity !== 'error') };
}

function baseSchema(startData: Record<string, unknown>) {
  return {
    nodes: [
      { id: 'start_1', type: 'start', data: startData },
      { id: 'end_1', type: 'end', data: { title: '结束' } },
    ],
    edges: [{ sourceNodeID: 'start_1', targetNodeID: 'end_1' }],
  };
}

describe('start.startPageId 发起页面绑定校验（R6 方案一）', () => {
  it('startPageId 在页面白名单内 → 通过（无 REF_NOT_FOUND）', () => {
    const r = validate(baseSchema({ title: '开始', startPageId: 'page-1' }));
    expect(r.valid).toBe(true);
    expect(r.issues.some((i) => i.code === 'REF_NOT_FOUND')).toBe(false);
  });

  it('startPageId 不在白名单 → REF_NOT_FOUND（镜像 user_task.pageId 语义）', () => {
    const r = validate(baseSchema({ title: '开始', startPageId: 'ghost-page' }));
    expect(r.valid).toBe(false);
    const hit = r.issues.find((i) => i.code === 'REF_NOT_FOUND');
    expect(hit?.path).toBe('nodes/0/data/startPageId');
    expect(hit?.message).toContain('发起页面');
  });

  it('未配置 startPageId → 不报错（可选绑定）', () => {
    const r = validate(baseSchema({ title: '开始' }));
    expect(r.issues.some((i) => i.code === 'REF_NOT_FOUND')).toBe(false);
  });
});

describe('user_task assigneeType=INITIATOR（发起人审批，专题 R1-A1）', () => {
  const initiatorSchema = (assigneeType?: string) => ({
    nodes: [
      { id: 'start_1', type: 'start', data: { title: '开始' } },
      {
        id: 'ut_1',
        type: 'user_task',
        data: {
          taskName: '发起人确认',
          ...(assigneeType ? { assigneeType } : {}),
          approvalMode: 'single',
        },
      },
      { id: 'end_1', type: 'end', data: { title: '结束' } },
    ],
    edges: [
      { sourceNodeID: 'start_1', targetNodeID: 'ut_1' },
      { sourceNodeID: 'ut_1', targetNodeID: 'end_1' },
    ],
  });

  it('INITIATOR 无 assignee/candidateGroups → 通过', () => {
    const r = validate(initiatorSchema('INITIATOR'));
    expect(r.valid).toBe(true);
  });

  it('无审批人且非 INITIATOR → 仍报错（回归对照）', () => {
    const r = validate(initiatorSchema('USER'));
    expect(r.valid).toBe(false);
    expect(r.issues.some((i) => i.path.endsWith('/assignee'))).toBe(true);
  });
});
