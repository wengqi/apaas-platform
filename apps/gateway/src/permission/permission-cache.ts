/**
 * 权限决策缓存（P1-21，对抗审查 R2-scale-05）。
 *
 * PermissionService 每请求 ~8-9 条语句（角色映射 + 组织树全量载入），200 节点毫秒级
 * 但万节点成天花板。短 TTL 缓存（默认 30s）+ 写路径主动失效：
 *   - 键 `perm:<tenantId>:<userId>` → 有效角色 ID 集
 *   - 键 `orgtree:<tenantId>` → 组织树快照（getEffectiveOrgIds 的 BFS 输入）
 * 失效点（写路径调用 invalidatePermissionCache）：
 *   角色/成员绑定变更 → invalidateUser；组织树/授权/成员增删 → invalidateTenant（影响面大）。
 * 语义边界：进程内缓存——多副本部署下失效只达本进程，跨副本最迟 TTL 过期收敛
 * （撤权最迟 30s 生效；需要严格即时语义的租户应配置反向代理粘滞或缩短 TTL）。
 */

type CacheEntry = { value: unknown; expiresAt: number };

const cache = new Map<string, CacheEntry>();

let timerId: ReturnType<typeof setTimeout> | null = null;

/** TTL 可配（测试）；默认 30s */
function ttlMs(): number {
  return Number(process.env.PERMISSION_CACHE_TTL_MS) || 30_000;
}

export function cacheGet<T>(key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function cacheSet(key: string, value: unknown): void {
  cache.set(key, { value, expiresAt: Date.now() + ttlMs() });
  // 顺手清扫过期键（懒清理：仅在写入时触发，非定时轮询）
  if (cache.size > 10_000) {
    const now = Date.now();
    for (const [k, e] of cache) {
      if (now > e.expiresAt) cache.delete(k);
    }
  }
}

/**
 * 权限缓存主动失效。
 * - (tenantId, userId) → 精确清单用户（成员/角色绑定变更）
 * - 仅 tenantId → 清该租户全部（组织树/授权/成员增删——影响全部用户的有效角色集）
 */
export function invalidatePermissionCache(tenantId?: string, userId?: string): void {
  if (tenantId === undefined) {
    cache.clear();
    return;
  }
  if (userId !== undefined) {
    cache.delete(`perm:${tenantId}:${userId}`);
    return;
  }
  const prefix = `perm:${tenantId}:`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix) || key === `orgtree:${tenantId}`) cache.delete(key);
  }
}

/** 测试/关停用：清空全部并停清理定时器 */
export function resetPermissionCacheForTest(): void {
  cache.clear();
  if (timerId) {
    clearTimeout(timerId);
    timerId = null;
  }
}

// 供 lint 保留引用（timerId 预留周期清扫能力，当前为纯懒清理）
void timerId;
