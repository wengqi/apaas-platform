/**
 * AiAnalyticsService 单测（ADR-0004 决策 5 / R5 主线）——遥测聚合口径。
 *
 * 核心断言：
 * 1. G3 首拦率：按资源类型事件行聚合（total/accepted/rejected/blockRate）
 * 2. 一次人审通过率：批次终局计数（rejected 优先），pending 批次不入分母
 * 3. 返工轮次：REJECTED+SUPERSEDED 相对 APPROVED 的摊薄均值
 * 4. 零分母保护：无数据时全部比率为 0（不出 NaN）
 * 5. 参数化契约：tenant_id 恒在 $1，appId/since/until 依次 $2-$4
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AiAnalyticsService } from './ai-analytics.service.js';
import { getMockQueryRawUnsafe } from '../test/test-helpers.js';

function makeService() {
  return new AiAnalyticsService();
}

/** 按 SQL 片段把一次 analytics() 的四路查询分派到各自 fixture。 */
function arrangeQueries(fixtures: {
  kindRows?: Array<{ kind: string; accepted: number; rejected: number }>;
  issueRows?: Array<{ code: string; count: number }>;
  batchRows?: Array<{ batch_id: string; approved: boolean; rejected: boolean }>;
  moduleRows?: Array<{ module: string; approved: number; rework: number }>;
}) {
  const q = getMockQueryRawUnsafe();
  q.mockImplementation(async (sql: string) => {
    if (sql.includes('issueCodes')) return fixtures.issueRows ?? [];
    if (sql.includes('BOOL_OR')) return fixtures.batchRows ?? [];
    if (sql.includes('GROUP BY module')) return fixtures.moduleRows ?? [];
    if (sql.includes("source LIKE 'mcp:submit-%'")) return fixtures.kindRows ?? [];
    throw new Error(`未预期的 SQL: ${sql.slice(0, 120)}`);
  });
  return q;
}

describe('AI 生成质量聚合（ai-analytics）', () => {
  beforeEach(() => vi.clearAllMocks());

  it('比率数学：G3 拦截率 / 一次人审通过率 / 平均返工轮次', async () => {
    arrangeQueries({
      kindRows: [
        { kind: 'PAGE', accepted: 7, rejected: 3 },
        { kind: 'OBJECT', accepted: 5, rejected: 0 },
      ],
      issueRows: [
        { code: 'TYPE_FORBIDDEN', count: 2 },
        { code: 'MISSING_REQUIRED', count: 1 },
      ],
      batchRows: [
        { batch_id: 'b1', approved: true, rejected: false },
        { batch_id: 'b2', approved: true, rejected: false },
        { batch_id: 'b3', approved: false, rejected: true },
        { batch_id: 'b4', approved: false, rejected: false }, // 仍 PENDING，不入分母
      ],
      moduleRows: [
        { module: 'PAGE', approved: 3, rework: 2 },
        { module: 'OBJECT', approved: 1, rework: 0 },
      ],
    });

    const data = await makeService().analytics('t1');
    expect(data.attempts).toEqual({ total: 15, accepted: 12, rejected: 3, blockRate: 0.2 });
    expect(data.batches).toEqual({
      verdictTotal: 3,
      approved: 2,
      rejected: 1,
      firstPassRate: Math.round((2 / 3) * 10000) / 10000,
    });
    expect(data.rework).toEqual({
      approvedVersions: 4,
      reworkVersions: 2,
      avgReworkPerApproved: 0.5,
    });
    expect(data.topIssueCodes[0]).toEqual({ code: 'TYPE_FORBIDDEN', count: 2 });
  });

  it('零分母保护：无数据时全部比率为 0（不出 NaN）', async () => {
    arrangeQueries({});
    const data = await makeService().analytics('t1');
    expect(data.attempts).toEqual({ total: 0, accepted: 0, rejected: 0, blockRate: 0 });
    expect(data.batches).toEqual({ verdictTotal: 0, approved: 0, rejected: 0, firstPassRate: 0 });
    expect(data.rework).toEqual({
      approvedVersions: 0,
      reworkVersions: 0,
      avgReworkPerApproved: 0,
    });
    expect(data.byKind).toEqual([]);
    expect(data.byModule).toEqual([]);
  });

  it('参数化契约：tenant_id 恒在 $1，appId/since/until 依次 $2-$4（raw SQL 不经 $extends）', async () => {
    const q = arrangeQueries({});
    const since = new Date('2026-10-01T00:00:00Z');
    const until = new Date('2026-10-09T00:00:00Z');
    await makeService().analytics('t1', { appId: 'app-9', since, until });

    expect(q).toHaveBeenCalledTimes(4);
    for (const call of q.mock.calls) {
      const [sql, ...params] = call as [string, ...unknown[]];
      expect(sql).toContain('tenant_id = $1');
      expect(sql).toContain('app_id = $2');
      expect(sql).toContain('created_at >= $3');
      expect(sql).toContain('created_at <= $4');
      expect(params[0]).toBe('t1');
      expect(params[1]).toBe('app-9');
      expect(params[2]).toBe(since);
      expect(params[3]).toBe(until);
    }
  });

  it('批次终局语义：同批既有 REJECTED 又有 APPROVED 时计为驳回（部分成功优先悲观）', async () => {
    arrangeQueries({
      batchRows: [{ batch_id: 'b1', approved: true, rejected: true }],
    });
    const data = await makeService().analytics('t1');
    expect(data.batches).toEqual({ verdictTotal: 1, approved: 0, rejected: 1, firstPassRate: 0 });
  });
});
