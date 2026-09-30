/**
 * Schema 校验合同（G3）——平台元数据的合法性契约与结构化错误格式。
 *
 * 定位（ADR-0003）：AI 经 MCP 产出的一切元数据必须过本合同，非法即拒；
 * 错误格式面向 agent 自修正闭环设计（spike 实证：错误带路径 + 候选建议时
 * 一轮修正收敛率 100%，见 docs/knowledge-base/SPIKE-AMIS-ADOPTION-2026-09-30.md）。
 *
 * 三类受管 schema：
 * - amis_page：界面元数据（amis 方言，form 是其中组件类型——一切界面皆页面）
 * - workflow：WorkflowSchema（流程定义，20 节点执行器）
 * - object_meta：对象元数据（字段类型白名单）
 */

/** 受管 schema 种类。 */
export type SchemaKind = 'amis_page' | 'workflow' | 'object_meta';

/** 问题严重级：error 拒绝提交；warning 放行但提示。 */
export type SchemaIssueSeverity = 'error' | 'warning';

/** 校验问题 —— agent 自修正的最小反馈单元。 */
export interface SchemaIssue {
  /** 违规位置（JSON Pointer 风格，如 body/0/type 或 nodes/n1/data.approveUsers） */
  path: string;
  /** 机器可读错误码（agent 按码分类处理） */
  code: string;
  /** 人/机可读消息（含修复建议与候选值） */
  message: string;
  severity: SchemaIssueSeverity;
}

/** 校验结果。 */
export interface SchemaValidationResult {
  kind: SchemaKind;
  valid: boolean;
  issues: SchemaIssue[];
}

/** 错误码常量（跨端对齐，避免魔法字符串）。 */
export const SCHEMA_ISSUE_CODES = {
  ROOT_INVALID: 'ROOT_INVALID',
  UNKNOWN_TYPE: 'UNKNOWN_TYPE',
  TYPE_FORBIDDEN: 'TYPE_FORBIDDEN',
  MISSING_REQUIRED: 'MISSING_REQUIRED',
  INVALID_VALUE: 'INVALID_VALUE',
  UNKNOWN_FIELD: 'UNKNOWN_FIELD',
  DUPLICATE_KEY: 'DUPLICATE_KEY',
  REF_NOT_FOUND: 'REF_NOT_FOUND',
  STRUCTURE_LIMIT: 'STRUCTURE_LIMIT',
  JSON_PARSE: 'JSON_PARSE',
  ORPHAN_NODE: 'ORPHAN_NODE',
} as const;

export type SchemaIssueCode = (typeof SCHEMA_ISSUE_CODES)[keyof typeof SCHEMA_ISSUE_CODES];
