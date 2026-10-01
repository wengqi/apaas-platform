/**
 * 审核域（R1.2 版本模型 G1）——资源级 草稿→提交→发布 的共享契约。
 *
 * - types：提交单/快照/diff 的 DTO 形态
 * - schema-diff：结构化 diff 纯函数（gateway 摘要 + studio 渲染共用）
 */

export * from './types.js';
export * from './schema-diff.js';
