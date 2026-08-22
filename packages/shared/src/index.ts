/**
 * @apaas/shared —— 跨服务共享类型契约、DTO、表达式引擎。
 * 所有 agent 的对接边界。
 */

// 通用类型
export * from './common/index.js';

// 应用（顶层业务容器）
export * from './application/index.js';

// 对象 / 数据建模
export * from './object/index.js';

// 页面搭建器
export * from './page/index.js';

// 流程引擎
export * from './process/index.js';

// 权限（Phase 4 补充）
export * from './permission/index.js';

// 站内信通知
export * from './notification/index.js';

// 连接器与集成
export * from './connector/index.js';

// 数据集与数据流
export * from './dataset/index.js';
