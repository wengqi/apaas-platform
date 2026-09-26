/**
 * 事件动作执行器 — 类型契约（从 action-executor.ts 拆分，
 * AGENTS.md 单文件 400 行规范）。
 */

// ---------------------------------------------------------------------------
// Adapter 接口（由各前端包实现并注入）
// ---------------------------------------------------------------------------

/** 记录列表查询结果。 */
export interface RecordListResult {
  items: Array<{ id: string; data: Record<string, unknown> }>;
  total: number;
  page: number;
  pageSize: number;
}

/**
 * 运行时 Store Adapter — 由 studio / runtime-ui 各自实现。
 * 将 API 调用与核心动作逻辑解耦。
 */
export interface RuntimeStoreAdapter {
  /** 查询记录列表。 */
  queryRecords: (
    objectId: string,
    params: { page: number; pageSize: number },
  ) => Promise<RecordListResult>;
  /** 创建记录。 */
  createRecord: (objectId: string, data: Record<string, unknown>) => Promise<unknown>;
  /** 更新记录。 */
  updateRecord: (recordId: string, data: Record<string, unknown>) => Promise<unknown>;
  /** 删除记录。 */
  deleteRecord: (recordId: string) => Promise<unknown>;
  /** 启动流程。 */
  startProcess: (processId: string, variables: Record<string, unknown>) => Promise<unknown>;
  /** 页面跳转。 */
  navigate: (path: string) => void;
}

// ---------------------------------------------------------------------------
// 动作执行上下文
// ---------------------------------------------------------------------------

/** 动作执行上下文：视图模型状态 + 变量写入 + 关联对象。 */
export interface ActionContext {
  /** 视图模型变量值（运行时）。 */
  vm: Record<string, unknown>;
  /** 设置视图模型变量（支持 'vm.x.y' / 'x.y' 路径）。 */
  setVariable: (path: string, value: unknown) => void;
  /** 当前关联对象 ID（动作参数未指定 objectId 时回退）。 */
  objectId?: string;
}
