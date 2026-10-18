import { describe, expect, it } from 'vitest';
import { BUILDER_RULES, END_USER_RULES, hasStudioAccess } from './builtin-roles.js';

/** 规则集合 → 'TYPE:ACTION' 去重集合（防两处口径漂移的锚定断言）。 */
function codes(rules: readonly { type: string; action: string }[]): Set<string> {
  return new Set(rules.map((r) => `${r.type}:${r.action}` as const));
}

describe('BUILTIN_ROLE_RULES — 内置角色规则 SSOT 锚点', () => {
  it('BUILDER 恰好 24 条且不含重复', () => {
    expect(BUILDER_RULES).toHaveLength(24);
    expect(codes(BUILDER_RULES).size).toBe(24);
  });

  it('BUILDER 具备搭建全链路：PAGE:MANAGE / CONNECTOR:VIEW / DATA_MODEL:EXECUTE', () => {
    // 2026-10-04 教训：缺 DATA_MODEL:EXECUTE → 能建数据流却无权执行；
    // 2026-10-18 教训：tenant.service 漏 CONNECTOR×5 → 新租户 BUILDER 连接器页 403。
    const set = codes(BUILDER_RULES);
    expect(set.has('PAGE:MANAGE')).toBe(true);
    expect(set.has('CONNECTOR:VIEW')).toBe(true);
    expect(set.has('CONNECTOR:EXECUTE')).toBe(true);
    expect(set.has('DATA_MODEL:EXECUTE')).toBe(true);
  });

  it('END_USER 恰好 6 条且含 PROCESS:VIEW（2026-10-10 规约：运行时角色必含 VIEW）', () => {
    const set = codes(END_USER_RULES);
    expect(END_USER_RULES).toHaveLength(6);
    expect(set.has('PROCESS:VIEW')).toBe(true);
    expect(set.has('PROCESS:APPROVE')).toBe(true);
    // 终端用户不授予任何管理类动作
    for (const rule of END_USER_RULES) {
      expect(rule.action).not.toBe('MANAGE');
    }
  });

  describe('hasStudioAccess — studio 用户域（END_USER-only 不进搭建器）', () => {
    it('平台超管恒可进入（落租户管理控制台）', () => {
      expect(hasStudioAccess(true, [])).toBe(true);
    });

    it('租户管理员/搭建者可进入', () => {
      expect(hasStudioAccess(false, ['TENANT_ADMIN'])).toBe(true);
      expect(hasStudioAccess(false, ['BUILDER'])).toBe(true);
    });

    it('终端用户/仅应用级角色/无角色不可进入', () => {
      expect(hasStudioAccess(false, ['END_USER'])).toBe(false);
      expect(hasStudioAccess(false, ['EXPENSE_USER'])).toBe(false);
      expect(hasStudioAccess(false, [])).toBe(false);
    });
  });
});
