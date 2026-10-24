/**
 * 流程节点配置完整性检查单测（跨端 SSOT，用户反馈 2026-10-06）。
 */

import { describe, expect, it } from 'vitest';
import {
  collectNodeIssues,
  isNodeIncomplete,
  nodeIncompleteReason,
  collectErrorEdgeConflicts,
} from './node-check.js';

describe('isNodeIncomplete', () => {
  it('user_task：审批人与审批模式齐备才算完成', () => {
    expect(
      isNodeIncomplete('user_task', {
        candidateGroups: ['role-1'],
        approvalMode: 'SINGLE',
      }),
    ).toBe(false);
    // 只有审批模式没有审批人 → 不完整
    expect(isNodeIncomplete('user_task', { approvalMode: 'SINGLE' })).toBe(true);
    // 会签 approveUsers 路径
    expect(
      isNodeIncomplete('user_task', { approveUsers: ['u1'], approvalMode: 'COUNTERSIGN' }),
    ).toBe(false);
  });

  it('notification：recipients 为数组且非空才算完成（旧判定误用单数导致误报）', () => {
    expect(isNodeIncomplete('notification', { channel: 'IN_APP', recipients: ['u1'] })).toBe(false);
    expect(isNodeIncomplete('notification', { channel: 'IN_APP', recipients: [] })).toBe(true);
    expect(isNodeIncomplete('notification', { channel: 'IN_APP' })).toBe(true);
  });

  it('结构类节点（start/end/parallel 等）恒完整', () => {
    for (const t of ['start', 'end', 'parallel', 'inclusive', 'break', 'continue', 'assign']) {
      expect(isNodeIncomplete(t, {})).toBe(false);
    }
  });

  it('object_operation / http_request / delay 等必填缺失 → 不完整', () => {
    expect(isNodeIncomplete('object_operation', { operation: 'create' })).toBe(true);
    expect(isNodeIncomplete('http_request', { method: 'get' })).toBe(true);
    expect(isNodeIncomplete('delay', {})).toBe(true);
  });
});

describe('collectNodeIssues — 整图收集', () => {
  it('收集多问题节点并给中文原因，递归 blocks', () => {
    const issues = collectNodeIssues([
      { id: 'n1', type: 'start', data: { title: '开始' } },
      { id: 'n2', type: 'user_task', data: { title: '审批' } },
      {
        id: 'n3',
        type: 'parallel',
        blocks: [{ id: 'n4', type: 'notification', data: { title: '通知', channel: 'IN_APP' } }],
      },
    ]);
    expect(issues).toHaveLength(2);
    expect(issues[0]).toMatchObject({ nodeId: 'n2', reason: '审批人或审批模式未配置' });
    expect(issues[1]).toMatchObject({ nodeId: 'n4', reason: '通知渠道或收件人未配置' });
  });

  it('全部完整 → 空数组', () => {
    const issues = collectNodeIssues([
      { id: 's', type: 'start', data: { title: '开始' } },
      {
        id: 't',
        type: 'user_task',
        data: { title: '审批', assignee: 'u1', approvalMode: 'SINGLE' },
      },
      { id: 'e', type: 'end', data: { title: '结束' } },
    ]);
    expect(issues).toEqual([]);
  });
});

describe('nodeIncompleteReason — 中文原因', () => {
  it('各类型有可读原因，未知类型兜底', () => {
    expect(nodeIncompleteReason('user_task')).toContain('审批人');
    expect(nodeIncompleteReason('mystery')).toBe('配置不完整');
  });
});

describe('user_task INITIATOR（发起人审批，专题 R1-A1）', () => {
  it('assigneeType=INITIATOR 免填审批人 → 完整', () => {
    expect(
      isNodeIncomplete('user_task', { assigneeType: 'INITIATOR', approvalMode: 'SINGLE' }),
    ).toBe(false);
  });
});

describe('collectErrorEdgeConflicts — S2 歧义检测（P1-15）', () => {
  it('同节点双 error 出边 → error 级冲突', () => {
    const issues = collectErrorEdgeConflicts([
      { sourceNodeID: 'a', targetNodeID: 'b', label: 'error' },
      { sourceNodeID: 'a', targetNodeID: 'c', label: 'Error' },
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual(
      expect.objectContaining({
        sourceNodeId: 'a',
        severity: 'error',
        conflictingTargets: ['b', 'c'],
      }),
    );
  });

  it("归一匹配：trim/大小写差异也算 error 边（'Error ' 与 error 冲突）", () => {
    const issues = collectErrorEdgeConflicts([
      { sourceNodeID: 'a', targetNodeID: 'b', label: 'error' },
      { sourceNodeID: 'a', targetNodeID: 'c', label: ' Error ' },
    ]);
    expect(issues).toHaveLength(1);
  });

  it('中文「失败」出边同样纳入归一口径', () => {
    const issues = collectErrorEdgeConflicts([
      { sourceNodeID: 'a', targetNodeID: 'b', label: '失败' },
      { sourceNodeID: 'a', targetNodeID: 'c', label: '失败' },
    ]);
    expect(issues).toHaveLength(1);
  });

  it('单 error 边与普通条件边 → 无冲突', () => {
    const issues = collectErrorEdgeConflicts([
      { sourceNodeID: 'a', targetNodeID: 'b', label: 'error' },
      { sourceNodeID: 'a', targetNodeID: 'c', label: '通过' },
    ]);
    expect(issues).toEqual([]);
  });

  it('不同节点的 error 边互不冲突', () => {
    const issues = collectErrorEdgeConflicts([
      { sourceNodeID: 'a', targetNodeID: 'b', label: 'error' },
      { sourceNodeID: 'x', targetNodeID: 'c', label: 'error' },
    ]);
    expect(issues).toEqual([]);
  });
});
