/**
 * 规范 queryKey 定义（评审 P2-1）。
 *
 * 背景：此前 `queryKeys` 注册表**零引用**成为死代码，且其声明的键形状与实际
 * 用法不一致（如 `objects.byApp` 声明为 `['objects','app',appId]`，而全仓实际
 * 使用 `['objects', appId]`）；同时 objects/pages 存在 `app-objects`/`app-pages`
 * 等别名 key，导致同一数据双缓存、且对规范 key 的失效无法刷新别名订阅者。
 *
 * 处理：删除死注册表，改为本模块提供与**既有事实键**一致的构造器，并在
 * 读取点与失效点统一使用，保证「读什么 key 就失效什么 key」。
 *
 * 用法：
 *   useQuery({ queryKey: qk.appObjects(appId), queryFn })
 *   queryClient.invalidateQueries({ queryKey: qk.appObjects(appId) })
 */

export const qk = {
  // —— 应用级 ——
  /** 应用列表（我的应用） */
  apps: () => ['apps'] as const,
  /** 单个应用详情 */
  app: (appId: string) => ['app', appId] as const,
  /** 应用内对象列表（规范 key；不得再用 'app-objects' 别名） */
  appObjects: (appId: string) => ['objects', appId] as const,
  /** 应用内页面列表（规范 key；不得再用 'app-pages' 别名） */
  appPages: (appId: string) => ['pages', appId] as const,
  /** 应用版本列表 */
  appVersions: (appId: string) => ['app-versions', appId] as const,
  /** 发布变更清单（发布向导第 2 步） */
  publishChanges: (appId: string) => ['publish-changes', appId] as const,

  // —— 审核中心（R1.2 版本模型）——
  /** 提交单列表（status 省略 = 全部） */
  reviews: (appId: string, status?: string) =>
    status ? (['reviews', appId, status] as const) : (['reviews', appId] as const),
  /** 提交单详情（含 diff 与快照） */
  reviewDetail: (appId: string, submissionId: string) =>
    ['reviews', appId, 'detail', submissionId] as const,
  /** 脏资源清单（活表 ≠ 最新基线快照，可撤销未提交） */
  reviewDirty: (appId: string) => ['reviews', appId, 'dirty'] as const,
  /** 资源版本链（对象/页面/流程的提交历史） */
  resourceVersions: (appId: string, module: string, entityId: string) =>
    ['resource-versions', appId, module, entityId] as const,

  // —— 对象级 ——
  /** 对象详情（含字段定义） */
  object: (objectId: string) => ['object', objectId] as const,
  /** 对象记录列表 */
  objectRecords: (objectId: string) => ['object', objectId, 'records'] as const,
  /** 对象视图列表 */
  objectViews: (objectId: string) => ['object', objectId, 'views'] as const,

  // —— 页面级 ——
  /** 页面详情（搭建器 schema） */
  page: (pageId: string) => ['page', pageId] as const,
  /** 页面保存点列表（E2-4 飞书式历史） */
  pageSavePoints: (pageId: string) => ['page', pageId, 'save-points'] as const,
} as const;

/**
 * 发布/回滚成功后需要失效的键集合（评审 P2-1：此前发布成功后不做任何失效，
 * 已挂载的对象/页面/版本/变更视图会保持陈旧）。
 */
export function publishAffectedKeys(appId: string): readonly (readonly unknown[])[] {
  return [
    qk.app(appId),
    qk.appObjects(appId),
    qk.appPages(appId),
    qk.appVersions(appId),
    qk.publishChanges(appId),
  ];
}

/**
 * 审核动作（提交/批准/驳回/撤销未提交）后需要失效的键集合：
 * 审核中心自身 + 对象/页面（批准会把快照落活表）。
 */
export function reviewAffectedKeys(
  appId: string,
  opts?: { module?: string; entityId?: string },
): readonly (readonly unknown[])[] {
  const keys: Array<readonly unknown[]> = [
    qk.reviews(appId),
    qk.reviewDirty(appId),
    qk.appObjects(appId),
    qk.appPages(appId),
  ];
  if (opts?.module && opts?.entityId) {
    keys.push(qk.resourceVersions(appId, opts.module, opts.entityId));
  }
  return keys;
}
