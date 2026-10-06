/**
 * 审核域共享类型（R1.2 版本模型 G1）。
 *
 * 资源级三态 draft → submitted → published 的 DTO 与 diff 输出契约：
 * gateway 生成 diff（评审摘要）、studio 渲染 diff（快审 UX），共用本模块。
 */

/** 提交单状态：PENDING 待审（仅 AI）→ APPROVED 已批生效 / REJECTED 已驳 / SUPERSEDED 被新提交取代 */
export type ResourceVersionStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUPERSEDED';

/** 提交来源：AI_MCP 走人审闸门；HUMAN 即时生效并落基线快照 */
export type ResourceVersionSource = 'HUMAN' | 'AI_MCP';

/** 资源模块（R1.2 统一范围：对象/数据集/页面/流程/权限规则集） */
export type ReviewModule = 'OBJECT' | 'DATASET' | 'PAGE' | 'PROCESS' | 'PERMISSION';

/** 资源快照（ResourceVersion.snapshot 的规范形态，按 module 区分） */
export interface ObjectResourceSnapshot {
  apiName: string;
  name: string;
  description?: string;
  icon?: string;
  /** 仅业务字段（系统字段批准落地时注入，不参与 diff） */
  fields: Array<Record<string, unknown>>;
}

export interface PageResourceSnapshot {
  apiName: string;
  name: string;
  type: string;
  objectId?: string | null;
  schema: Record<string, unknown>;
}

export interface ProcessResourceSnapshot {
  apiName: string;
  name: string;
  workflowSchema: Record<string, unknown>;
  triggerType?: string | null;
  cron?: string | null;
}

/** 数据流资源快照（AI 主线第三轮：config 复用 shared DataFlowConfig 结构） */
export interface DatasetResourceSnapshot {
  apiName: string;
  name: string;
  description?: string;
  /** 数据流 pipeline 配置（sources/join/filter/aggregation/outputFields） */
  config: Record<string, unknown>;
}

/** 权限规则集快照（AI 主线第四轮：以角色为治理单元，批准=全量替换角色规则） */
export interface PermissionResourceSnapshot {
  /** 角色 code（租户内唯一，作为 ResourceVersion.apiName） */
  apiName: string;
  name: string;
  description?: string;
  roleId: string;
  /** 目标规则集（批准时全量替换该角色现有规则） */
  rules: Array<{
    type: string;
    action: string;
    targetId: string;
    targetNodeId?: string;
    condition?: object | null;
    fieldScope?: string[] | null;
    effect?: string;
  }>;
}

export type ResourceSnapshot =
  | ObjectResourceSnapshot
  | DatasetResourceSnapshot
  | PageResourceSnapshot
  | ProcessResourceSnapshot
  | PermissionResourceSnapshot;

/** diff 条目操作 */
export type ReviewDiffOp = 'ADDED' | 'REMOVED' | 'MODIFIED';

/** 单条结构化差异（路径 + 人读标签 + 摘要） */
export interface ReviewDiffItem {
  op: ReviewDiffOp;
  /** 结构路径，如 fields.amount / schema.body.2 / nodes.approve_1 */
  path: string;
  /** 人读标签，如 "字段 amount（金额）" */
  label: string;
  /** 变更摘要（MODIFIED 时为 "旧 → 新" 截断展示） */
  detail?: string;
}

/** 资源级结构化 diff（提交单 vs 基线） */
export interface ResourceDiff {
  changeCount: number;
  /** 一行摘要，如 "新增 2 · 修改 1 · 删除 0" */
  summary: string;
  items: ReviewDiffItem[];
}

/** 提交单 DTO（列表/详情通用，detail 时附 diff） */
export interface ResourceVersionDto {
  id: string;
  appId: string;
  module: ReviewModule;
  entityId: string | null;
  apiName: string;
  name: string;
  versionNumber: number;
  status: ResourceVersionStatus;
  source: ResourceVersionSource;
  submittedBy: string;
  submittedVia: string;
  baselineVersionId: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewComment: string | null;
  /** 批量提交组（submit_app_drafts 单波生成完整应用）；单资源提交为 null */
  batchId: string | null;
  createdAt: string;
}

/** 列表条目（PENDING 单附 diff 摘要；非 PENDING 的 diff 为空壳） */
export interface ResourceVersionListItemDto extends ResourceVersionDto {
  diff: ResourceDiff;
}

/** 提交单详情（含快照与 diff） */
export interface ResourceVersionDetailDto extends ResourceVersionDto {
  diff: ResourceDiff;
  snapshot: ResourceSnapshot;
}

/** 脏资源（活表 ≠ 最新基线快照，可撤销未提交） */
export interface DirtyResourceDto {
  module: ReviewModule;
  entityId: string;
  apiName: string;
  name: string;
  /** 最新基线版本号（null = 尚无任何提交基线） */
  baselineVersionNumber: number | null;
}
