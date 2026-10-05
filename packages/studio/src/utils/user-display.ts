/**
 * 用户 ID 展示与时间格式化工具 —— 双视角评审（2026-10-04）R10：
 * 审核中心提交人 / 流程监控触发者 / 环境管理操作人此前显示裸 cuid，
 * 时间列用 ISO 字符串截断显示的是 UTC（本地差 8 小时）。
 * 统一在这里收敛：id→姓名解析 + dayjs 本地时区格式化。
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { qk } from '@apaas/shared/stores';
import { usersApi } from '../api/permissions.js';

/** 用户 id → 姓名映射（React Query 缓存全局共享；失败时返回空 Map，展示层回退原值）。 */
export function useUserNameMap(): Map<string, string> {
  const { data: users } = useQuery({
    queryKey: qk.users(),
    queryFn: () => usersApi.list(),
    staleTime: 5 * 60_000,
    retry: 1,
  });
  return useMemo(() => new Map((users ?? []).map((u) => [u.id, u.name])), [users]);
}

/** 解析用户展示名：命中映射用姓名，未命中（如服务身份/外部提交者）回退原值。 */
export function displayName(map: Map<string, string>, id: string | null | undefined): string {
  if (!id) return '—';
  return map.get(id) ?? id;
}

/** ISO 时间 → 本地时区 'YYYY-MM-DD HH:mm:ss'；空值 '—'，非法值原样返回。 */
export function formatDateTime(v: string | null | undefined): string {
  if (!v) return '—';
  const d = dayjs(v);
  return d.isValid() ? d.format('YYYY-MM-DD HH:mm:ss') : String(v);
}
