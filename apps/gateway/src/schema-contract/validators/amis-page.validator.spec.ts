/**
 * amis 页面校验器（G3）单测 — 动作类型白名单（含平台自定义 embedEvent）
 * 与既有约束回归锚点。
 */

import { describe, it, expect } from 'vitest';
import { validateAmisPage } from './amis-page.validator.js';

const basePage = (body: unknown): unknown => ({
  type: 'page',
  title: 'embed 校验夹具',
  body,
});

describe('G3 动作类型白名单', () => {
  it('embedEvent（iframe 嵌入 page-event 出站动作）在 onEvent 中放行', () => {
    const issues = validateAmisPage(
      basePage([
        {
          type: 'button',
          label: '提交',
          onEvent: {
            'order-submitted': {
              actions: [
                {
                  actionType: 'embedEvent',
                  args: { name: 'order-submitted', data: { id: '${id}' } },
                },
              ],
            },
          },
        },
      ]),
    );
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('embedEvent 直接作为按钮动作类型同样放行（白名单显式成员）', () => {
    const issues = validateAmisPage(
      basePage([{ type: 'button', label: '上报', actionType: 'embedEvent' }]),
    );
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('未知动作类型仍被拒绝（白名单收紧语义不因 embedEvent 放松）', () => {
    const issues = validateAmisPage(
      basePage([{ type: 'button', label: '坏动作', actionType: 'teleport' }]),
    );
    const unknown = issues.find((i) => i.path.endsWith('/actionType'));
    expect(unknown?.message).toContain('未知动作类型 "teleport"');
  });

  it('回归锚点：api.url 平台相对路径约束不受影响（外联 URL 仍报错）', () => {
    const issues = validateAmisPage(
      basePage([
        { type: 'button', label: '外联', actionType: 'ajax', api: 'https://evil.example/x' },
      ]),
    );
    expect(issues.some((i) => i.path.includes('api'))).toBe(true);
  });
});

describe('G3 渲染契约软告警（R6 两缺口，warning 不拦截）', () => {
  const ctx = { selectFieldApiNames: new Set(['status', 'priority']) };

  it('crud 列引用选择类字段缺 mapping 契约：出 warning 且 valid 不受影响', () => {
    const issues = validateAmisPage(
      basePage([{ type: 'crud', columns: [{ name: 'status', label: '状态' }] }]),
      ctx,
    );
    const warn = issues.find((i) => i.severity === 'warning');
    expect(warn).toBeDefined();
    expect(warn?.path).toBe('/body/0/columns/0');
    expect(warn?.code).toBe('MISSING_REQUIRED');
    expect(warn?.message).toContain('mapping');
    expect(issues.every((i) => i.severity !== 'error')).toBe(true);
  });

  it('mapping 契约完整（type:mapping + 非空 map）：不告警', () => {
    const issues = validateAmisPage(
      basePage([
        {
          type: 'crud',
          columns: [
            {
              name: 'status',
              label: '状态',
              type: 'mapping',
              map: { approved: { label: '已通过' } },
            },
          ],
        },
      ]),
      ctx,
    );
    expect(issues.filter((i) => i.severity === 'warning')).toHaveLength(0);
  });

  it('type:mapping 但 map 为空对象：仍告警', () => {
    const issues = validateAmisPage(
      basePage([
        {
          type: 'crud',
          columns: [{ name: 'priority', label: '优先级', type: 'mapping', map: {} }],
        },
      ]),
      ctx,
    );
    expect(issues.some((i) => i.severity === 'warning')).toBe(true);
  });

  it('非选择类字段的列不告警；无 ctx（未传选择字段集）跳过该检查', () => {
    const plain = basePage([{ type: 'crud', columns: [{ name: 'status', label: '状态' }] }]);
    expect(validateAmisPage(plain, {}).filter((i) => i.severity === 'warning')).toHaveLength(0);
    expect(
      validateAmisPage(
        basePage([{ type: 'crud', columns: [{ name: 'unknown_field', label: '其他' }] }]),
        ctx,
      ).filter((i) => i.severity === 'warning'),
    ).toHaveLength(0);
  });

  it('input-datetime 缺 valueFormat：出 warning；带 valueFormat 不告警', () => {
    const missing = validateAmisPage(
      basePage([{ type: 'input-datetime', name: 'plan_time', label: '计划时间' }]),
    );
    const warn = missing.find((i) => i.severity === 'warning');
    expect(warn?.path).toBe('/body/0/valueFormat');
    expect(warn?.message).toContain('valueFormat');

    const ok = validateAmisPage(
      basePage([
        {
          type: 'input-datetime',
          name: 'plan_time',
          label: '计划时间',
          valueFormat: 'YYYY-MM-DD HH:mm:ss',
        },
      ]),
    );
    expect(ok.filter((i) => i.severity === 'warning')).toHaveLength(0);
  });
});
