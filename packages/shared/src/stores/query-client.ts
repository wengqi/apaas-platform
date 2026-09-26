/**
 * 统一 QueryClient 工厂。
 *
 * 跨 studio / runtime-ui 共享，避免两包各自 new QueryClient 配置不一致。
 * queryKey 规范定义见 ./query-keys.ts（评审 P2-1：原零引用注册表已移除）。
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
