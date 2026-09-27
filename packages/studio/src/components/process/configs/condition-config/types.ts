/**
 * 条件分支配置表单 — 类型契约（从 ConditionConfigForm.tsx 拆分，AGENTS.md 单文件 400 行规范）。
 */

import type { WorkflowSchema } from '@apaas/shared';

export interface ConditionBranchItem {
  /** 分支唯一标识（用于 React key，避免删除/添加时复用错误的编辑器实例） */
  id?: string;
  label: string;
  /** JsonLogic JSON 规则（空 = else/default） */
  condition?: object | null;
}

export interface ConditionConfigData {
  conditions?: ConditionBranchItem[];
  title?: string;
}

export interface ConditionConfigFormProps {
  data: ConditionConfigData;
  onChange: (data: ConditionConfigData) => void;
  disabled?: boolean;
  schema?: WorkflowSchema;
  currentNodeId?: string;
}
