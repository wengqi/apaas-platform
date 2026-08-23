/**
 * 记录模块共享类型 — 批量操作 + 导入导出结果契约。
 *
 * 前后端共享，确保批量操作和 CSV 导入导出的类型安全。
 */

/** 导入错误信息。 */
export interface ImportError {
  /** 行号（从 1 开始，0 表示全局错误如列头匹配失败） */
  row: number;
  /** 相关字段名（可选） */
  field?: string;
  /** 错误描述 */
  message: string;
}

/** 批量创建结果。 */
export interface BatchCreateResult {
  /** 成功创建数 */
  created: number;
  /** 错误列表 */
  errors: ImportError[];
}

/** 批量更新结果。 */
export interface BatchUpdateResult {
  /** 成功更新数 */
  updated: number;
  /** 错误列表 */
  errors: ImportError[];
}

/** 批量删除结果。 */
export interface BatchDeleteResult {
  /** 成功删除数 */
  deleted: number;
}

/** CSV 导入结果。 */
export interface ImportResult {
  /** 总行数（不含表头） */
  total: number;
  /** 成功导入数 */
  success: number;
  /** 错误列表 */
  errors: ImportError[];
}
