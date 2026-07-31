/**
 * aPaaS 简化流程画布 — 对外入口
 *
 * 基于 flowgram.ai Fixed Layout (npm 依赖) + aPaaS 业务节点物料 (自建)。
 * 替代全量 fork Rush monorepo 的方案，核心包通过 npm 引入，物料层自建。
 *
 * Copyright (c) 2025 Bytedance Ltd. and/or its affiliates — flowgram.ai 核心包 MIT 许可
 */

export { SimplifiedProcessEditor, default } from './SimplifiedProcessEditor.js';
export type { SimplifiedProcessEditorProps } from './SimplifiedProcessEditor.js';
export { ApaasNodeRegistries } from './nodes/index.js';
export { flowToWorkflowSchema, workflowToFlowSchema } from './schema-serializer.js';
export { initialData } from './initial-data.js';
export type { FlowNodeRegistry, FlowDocumentJSON, FlowNodeJSON, FlowEdgeJSON } from './typings.js';
