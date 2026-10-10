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
        retry: (failureCount, error) => {
          // 4xx 客户端错误（含 429 限流）不重试——重试只会放大限流与无效请求
          // （R5.5 用户实测：429 后默认重试呈请求风暴，页面定义连续 4 次 429）
          const status = (error as { response?: { status?: number } } | null)?.response?.status;
          if (status !== undefined && status >= 400 && status < 500) return false;
          return failureCount < 1;
        },
        refetchOnWindowFocus: false,
      },
    },
  });
}
