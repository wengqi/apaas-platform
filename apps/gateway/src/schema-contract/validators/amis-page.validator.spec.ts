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
