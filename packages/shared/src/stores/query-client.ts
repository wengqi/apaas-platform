/**
 * 统一 QueryClient 工厂 + queryKey 注册表。
 *
 * 跨 studio / runtime-ui 共享，避免两包各自 new QueryClient 配置不一致，
 * 以及 queryKey 内联字符串导致的冲突 / 失效遗漏。
 */

import { QueryClient } from '@tanstack/react-query';

/**
 * 创建配置统一的 QueryClient 实例。
 * 两个前端包在 main.tsx 中调用此函数替代 new QueryClient({...})。
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}

/**
 * 集中注册 queryKey，防止跨文件冲突。
 *
 * 用法：
 *   useQuery({ queryKey: queryKeys.objects.detail(id), queryFn: ... })
 *   queryClient.invalidateQueries({ queryKey: queryKeys.records.all })
 */
export const queryKeys = {
  apps: {
    all: ['apps'] as const,
    detail: (id: string) => ['apps', id] as const,
  },
  objects: {
    all: ['objects'] as const,
    byApp: (appId: string) => ['objects', 'app', appId] as const,
    detail: (id: string) => ['objects', id] as const,
  },
  records: {
    all: ['records'] as const,
    list: (objectId: string) => ['records', objectId, 'list'] as const,
    detail: (recordId: string) => ['records', recordId] as const,
  },
  pages: {
    all: ['pages'] as const,
    byApp: (appId: string) => ['pages', 'app', appId] as const,
    detail: (id: string) => ['pages', id] as const,
    bySlug: (appId: string, slug: string) => ['pages', 'slug', appId, slug] as const,
  },
  processes: {
    all: ['processes'] as const,
    byApp: (appId: string) => ['processes', 'app', appId] as const,
    detail: (id: string) => ['processes', id] as const,
    instances: (processId: string) => ['processes', processId, 'instances'] as const,
    instance: (id: string) => ['processes', 'instances', id] as const,
    trace: (instanceId: string) => ['processes', 'instances', instanceId, 'trace'] as const,
  },
  tasks: {
    all: ['tasks'] as const,
    detail: (id: string) => ['tasks', id] as const,
  },
  notifications: {
    all: ['notifications'] as const,
    templates: {
      byApp: (appId: string) => ['notifications', 'templates', appId] as const,
    },
  },
  permissions: {
    roles: {
      all: ['permissions', 'roles'] as const,
      byApp: (appId: string) => ['permissions', 'roles', appId] as const,
      detail: (id: string) => ['permissions', 'roles', id] as const,
    },
    orgs: {
      all: ['permissions', 'orgs'] as const,
      tree: ['permissions', 'orgs', 'tree'] as const,
      detail: (id: string) => ['permissions', 'orgs', id] as const,
    },
    users: {
      all: ['permissions', 'users'] as const,
      detail: (id: string) => ['permissions', 'users', id] as const,
    },
  },
  tenants: {
    all: ['tenants'] as const,
    detail: (id: string) => ['tenants', id] as const,
    users: (id: string) => ['tenants', id, 'users'] as const,
    apps: (id: string) => ['tenants', id, 'apps'] as const,
  },
  changes: {
    byApp: (appId: string) => ['changes', appId] as const,
  },
  checks: {
    byApp: (appId: string) => ['checks', appId] as const,
  },
  versions: {
    byApp: (appId: string) => ['versions', appId] as const,
    detail: (appId: string, versionId: string) => ['versions', appId, versionId] as const,
  },
} as const;
