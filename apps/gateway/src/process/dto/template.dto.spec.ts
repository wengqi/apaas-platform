/**
 * 通知模版 DTO 校验契约测试。
 *
 * 交互评审（2026-10-04）回归：variables 曾用 @IsObject()，与 service 默认值 []
 * 及 studio 载荷（数组）矛盾——UI 创建模版必然 400"variables must be an object"。
 * 本测试钉死：数组（含空数组）合法、对象非法、字段名必须为 bodyTemplate。
 */

import { describe, it, expect } from 'vitest';
import { validate, ValidationError } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateTemplateDto, UpdateTemplateDto } from './template.dto.js';

async function validateDto<T>(cls: new () => T, payload: Record<string, unknown>) {
  const dto = plainToInstance(cls, payload);
  const errors: ValidationError[] = await validate(dto as object);
  return errors;
}

describe('CreateTemplateDto', () => {
  const base = {
    name: '审批结果通知',
    channel: 'EMAIL',
    titleTemplate: '你的申请${result}',
    bodyTemplate: '您提交的申请已${result}。',
  };

  it('合法载荷（含空数组 variables）通过——UI 空变量定义行被过滤后即发 []', async () => {
    const errors = await validateDto(CreateTemplateDto, { ...base, variables: [] });
    expect(errors).toHaveLength(0);
  });

  it('合法载荷（非空数组 variables）通过——studio 变量定义为 [{name,...}]', async () => {
    const errors = await validateDto(CreateTemplateDto, {
      ...base,
      variables: [{ name: 'result', description: '审批结果', sampleValue: '通过' }],
    });
    expect(errors).toHaveLength(0);
  });

  it('省略 variables 通过（IsOptional）', async () => {
    const errors = await validateDto(CreateTemplateDto, { ...base });
    expect(errors).toHaveLength(0);
  });

  it('variables 为对象时拒绝——钉死数组契约，防回退 @IsObject', async () => {
    const errors = await validateDto(CreateTemplateDto, { ...base, variables: { result: 'x' } });
    expect(errors.some((e) => e.property === 'variables')).toBe(true);
  });

  it('缺 bodyTemplate 拒绝——钉死字段名（曾误写 contentTemplate 致 UI 全挂）', async () => {
    const { bodyTemplate: _omit, ...withoutBody } = base;
    const errors = await validateDto(CreateTemplateDto, withoutBody);
    expect(errors.some((e) => e.property === 'bodyTemplate')).toBe(true);
  });
});

describe('UpdateTemplateDto', () => {
  it('部分字段 + 空数组 variables 通过', async () => {
    const errors = await validateDto(UpdateTemplateDto, { titleTemplate: 't', variables: [] });
    expect(errors).toHaveLength(0);
  });
});
