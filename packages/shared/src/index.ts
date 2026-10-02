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

// Schema 校验合同（G3：AI 产出的元数据合法性契约）
export * from './schema-contract/index.js';

// 审核域（R1.2 版本模型：草稿→提交→发布 + diff 快审）
export * from './review/index.js';

// 多环境域（R1.4：环境指针 / 发布历史 / 应用环境变量 / ${env.*} 解析）
export * from './environment/index.js';

// 开放 API 域（G6：服务身份 / 流程 API 版本发布 / 开放触发契约）
export * from './open-api/index.js';

// 观测域（P1 运维治理：事件分类 SSOT + 审计动作分类映射）
export * from './observability/index.js';

// 权限（Phase 4 补充）
export * from './permission/index.js';

// 站内信通知
export * from './notification/index.js';

// 连接器与集成
export * from './connector/index.js';

// 数据集与数据流
export * from './dataset/index.js';

// 云函数与扩展
export * from './cloud-function/index.js';

// 记录模块（批量操作 + 导入导出）
export * from './record/index.js';
