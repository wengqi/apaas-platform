/**
 * @apaas/shared/stores — 跨前端包共享的状态管理层。
 *
 * 统一 Zustand（客户端状态）+ React Query（服务端状态）双层架构。
 * studio 和 runtime-ui 通过 `@apaas/shared/stores` 引用同一份实现。
 */

// 共享类型
export * from './types.js';

// 认证 Store（Zustand + persist）
export * from './auth.js';

// QueryClient 工厂 + queryKey 注册表
export * from './query-client.js';

// 表达式引擎（运行时绑定/表达式求值）
export * from './expression-engine.js';

// 动作执行器（adapter 模式）
export * from './action-executor.js';

// 运行时 Store（Zustand scoped store）
export * from './runtime-store.js';
