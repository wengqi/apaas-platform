/**
 * @apaas/shared/stores — 跨前端包共享的状态管理层。
 *
 * 统一 Zustand（认证）+ React Query（服务端状态）双层架构。
 * studio 和 runtime-ui 通过 `@apaas/shared/stores` 引用同一份实现。
 *
 * 注：v1 渲染器集群（component-renderer / renderers 系列 / runtime-store /
 * action-executor / expression-engine）已随 R1.7 第二轮③ 物理删除——页面唯一方言 = amis（ADR-0003）。
 */

// 认证 Store（Zustand + persist）
export * from './auth.js';

// QueryClient 工厂 + queryKey 注册表
export * from './query-client.js';
export * from './query-keys.js';
