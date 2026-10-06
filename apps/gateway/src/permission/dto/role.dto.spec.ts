/**
 * 角色 DTO 校验契约测试。
 *
 * QA D-007（2026-10-06）回归：角色编码大写约束此前未强制——
 * `lower_case` 经 GUI/API 均可创建成功。本测试钉死：
 * 大写字母开头、仅含大写字母/数字/下划线的编码合法，其余非法。
 */

import { describe, it, expect } from 'vitest';
import { validate, ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateRoleDto } from './role.dto.js';

async function validateDto(payload: Record<string, unknown>): Promise<ValidationError[]> {
  const dto = plainToInstance(CreateRoleDto, payload);
  return validate(dto as object);
}

describe('CreateRoleDto — 角色编码格式（QA D-007）', () => {
  const base = { name: '审批人', code: 'APPROVER' };

  it('大写编码合法', async () => {
    expect(await validateDto(base)).toHaveLength(0);
  });

  it('大写字母+数字+下划线合法（如 QA_TESTER_2）', async () => {
    expect(await validateDto({ ...base, code: 'QA_TESTER_2' })).toHaveLength(0);
  });

  it('小写字母非法', async () => {
    const errors = await validateDto({ ...base, code: 'lower_case' });
    expect(errors).toHaveLength(1);
    expect(errors[0]!.constraints).toHaveProperty('matches');
  });

  it('数字开头非法', async () => {
    const errors = await validateDto({ ...base, code: '2_APPROVER' });
    expect(errors).toHaveLength(1);
  });

  it('中划线非法（与下划线区分）', async () => {
    const errors = await validateDto({ ...base, code: 'APPROVER-ROLE' });
    expect(errors).toHaveLength(1);
  });
});
