import { describe, expect, it } from 'vitest';
import { NAV_ITEMS, isNavActive, visibleNavItems } from './app-header-nav.js';

/** 三类身份锚点：平台超管 / 租户管理员 / 租户普通成员（builder 或业务用户）。 */
const KEYS = (items: { key: string }[]) => items.map((i) => i.key);

describe('visibleNavItems — 顶栏导航按身份收敛', () => {
  it('平台超管：仅见「租户管理」（平台控制台定位，2026-10-18 方案一）', () => {
    expect(KEYS(visibleNavItems(NAV_ITEMS, true, false))).toEqual(['/platform/tenants']);
  });

  it('租户管理员：开发中心 + 五个租户级治理导航，无租户管理', () => {
    expect(KEYS(visibleNavItems(NAV_ITEMS, false, true))).toEqual([
      '/apps',
      '/platform/users',
      '/platform/orgs',
      '/platform/audit-logs',
      '/platform/observability',
      '/platform/permission-debug',
    ]);
  });

  it('租户普通成员：仅开发中心', () => {
    expect(KEYS(visibleNavItems(NAV_ITEMS, false, false))).toEqual(['/apps']);
  });
});

describe('isNavActive — 前缀匹配选中态', () => {
  it('精确命中', () => {
    expect(isNavActive('/platform/tenants', '/platform/tenants')).toBe(true);
  });

  it('二级路由保持父项选中（租户详情）', () => {
    expect(isNavActive('/platform/tenants/t1', '/platform/tenants')).toBe(true);
  });

  it('不同前缀不误亮', () => {
    expect(isNavActive('/platform/tenants-other', '/platform/tenants')).toBe(false);
    expect(isNavActive('/apps', '/platform/users')).toBe(false);
  });
});
