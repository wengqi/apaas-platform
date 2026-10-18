/**
 * 顶栏导航模型 — 纯函数（供 AppHeader 消费与单测锚定）。
 *
 * 超管权限收敛（2026-10-18 用户裁决方案一）：平台超管 = 平台控制台（租户管理），
 * 不属于任何租户、无租户上下文（auth/tenant-context.ts 设计决策）——开发中心与
 * 五个租户级治理导航对超管不展示；超管直访 /apps 由路由层重定向 /platform/tenants。
 */

/** 顶栏导航项（租户级）。 */
export interface NavItem {
  key: string;
  label: string;
  /**
   * 可见角色（缺省=全员可见）：
   *   platform — 平台超管；tenant — 租户管理员（TENANT_ADMIN）；
   *   member — 租户普通成员（builder/业务用户，非超管非租户管理员）。
   */
  roles?: ('platform' | 'tenant' | 'member')[];
}

export const NAV_ITEMS: NavItem[] = [
  { key: '/apps', label: '开发中心', roles: ['tenant', 'member'] },
  { key: '/platform/users', label: '用户管理', roles: ['tenant'] },
  { key: '/platform/orgs', label: '组织架构', roles: ['tenant'] },
  { key: '/platform/audit-logs', label: '审计日志', roles: ['tenant'] },
  { key: '/platform/observability', label: '观测中心', roles: ['tenant'] },
  { key: '/platform/permission-debug', label: '权限调试', roles: ['tenant'] },
  { key: '/platform/tenants', label: '租户管理', roles: ['platform'] },
];

/**
 * 按身份过滤可见导航。
 * 身份判定：平台超管（tenantId=null）只看 platform 项；租户管理员看 tenant 项；
 * 其余租户成员看 member 项；无 roles 限制的项全员可见。
 */
export function visibleNavItems(
  items: NavItem[],
  isPlatformAdmin: boolean,
  isTenantAdmin: boolean,
): NavItem[] {
  return items.filter((item) => {
    if (!item.roles) return true;
    if (isPlatformAdmin) return item.roles.includes('platform');
    if (isTenantAdmin) return item.roles.includes('tenant');
    return item.roles.includes('member');
  });
}

/** 选中判定：精确命中或位于其子路由下（如 /platform/tenants/:id 选中「租户管理」）。 */
export function isNavActive(pathname: string, key: string): boolean {
  return pathname === key || pathname.startsWith(`${key}/`);
}
