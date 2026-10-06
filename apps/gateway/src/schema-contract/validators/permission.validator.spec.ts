/**
 * 权限规则集校验器单测（G3 第五类，AI 主线第四轮）。
 */

import { describe, expect, it } from 'vitest';
import { validatePermission } from './permission.validator.js';

function validDraft(): Record<string, unknown> {
  return {
    apiName: 'END_USER',
    name: '终端用户',
    rules: [
      { type: 'PAGE', action: 'VIEW', targetId: 'page-1' },
      {
        type: 'RECORD',
        action: 'VIEW',
        targetId: 'obj-1',
        condition: { '==': [{ var: 'created_by' }, 'current-user'] },
      },
      { type: 'DATA_MODEL', action: 'VIEW', targetId: 'obj-1', fieldScope: ['item', 'amount'] },
    ],
  };
}

describe('validatePermission — 合法输入', () => {
  it('混合维度规则集通过', () => {
    expect(validatePermission(validDraft())).toEqual([]);
  });

  it('空规则集（清空语义）通过', () => {
    const draft = validDraft();
    draft['rules'] = [];
    expect(validatePermission(draft)).toEqual([]);
  });
});

describe('validatePermission — 结构缺失与值域', () => {
  it('缺 rules / 缺 apiName → MISSING_REQUIRED', () => {
    const d = validDraft();
    delete d['rules'];
    const d2 = validDraft();
    delete d2['apiName'];
    expect(validatePermission(d).some((i) => i.path === 'rules')).toBe(true);
    expect(validatePermission(d2).some((i) => i.path === 'apiName')).toBe(true);
  });

  it('非法维度/动作/效果 → INVALID_VALUE', () => {
    const d = validDraft();
    const rules = d['rules'] as Array<Record<string, unknown>>;
    rules[0]!['type'] = 'TENANT';
    rules[1]!['action'] = 'OWN';
    rules[2]!['effect'] = 'MAYBE';
    const issues = validatePermission(d);
    expect(issues.some((i) => i.path === 'rules/0/type')).toBe(true);
    expect(issues.some((i) => i.path === 'rules/1/action')).toBe(true);
    expect(issues.some((i) => i.path === 'rules/2/effect')).toBe(true);
  });

  it('缺 targetId → MISSING_REQUIRED（含获取 ID 的建议）', () => {
    const d = validDraft();
    delete (d['rules'] as Array<Record<string, unknown>>)[0]!['targetId'];
    const issues = validatePermission(d);
    expect(issues.some((i) => i.path === 'rules/0/targetId' && i.code === 'MISSING_REQUIRED')).toBe(
      true,
    );
  });
});

describe('validatePermission — condition/fieldScope 形态', () => {
  it('condition 字符串形态被拒（须 JsonLogic 对象或 null）', () => {
    const d = validDraft();
    (d['rules'] as Array<Record<string, unknown>>)[1]!['condition'] = 'status == approved';
    expect(
      validatePermission(d).some(
        (i) => i.path === 'rules/1/condition' && i.code === 'INVALID_VALUE',
      ),
    ).toBe(true);
  });

  it('fieldScope 非字符串数组被拒', () => {
    const d = validDraft();
    (d['rules'] as Array<Record<string, unknown>>)[2]!['fieldScope'] = ['item', 3];
    expect(
      validatePermission(d).some(
        (i) => i.path === 'rules/2/fieldScope' && i.code === 'INVALID_VALUE',
      ),
    ).toBe(true);
  });
});
