/**
 * 通用类型 —— 所有模块共用的基础类型。
 *
 * 设计约定：
 * - 所有业务实体 ID 使用 string（branded 类型，运行时为 string，编译期区分）。
 * - API 响应统一包裹，便于前端统一处理错误。
 */

/** 品牌 ID 类型，编译期区分不同实体 ID，避免混用。运行时为 string。 */
declare const __brand: unique symbol;
export type Brand<T, B> = T & { readonly [__brand]: B };

export type ObjectId = Brand<string, 'ObjectId'>;
export type FieldId = Brand<string, 'FieldId'>;
export type RecordId = Brand<string, 'RecordId'>;
export type ViewId = Brand<string, 'ViewId'>;
export type PageId = Brand<string, 'PageId'>;
export type ProcessId = Brand<string, 'ProcessId'>;
export type TenantId = Brand<string, 'TenantId'>;
export type UserId = Brand<string, 'UserId'>;
export type RoleId = Brand<string, 'RoleId'>;
export type AppId = Brand<string, 'AppId'>;

/** 生成品牌 ID 的辅助函数（实现就是透传 string）。 */
export const asObjectId = (s: string): ObjectId => s as ObjectId;
export const asPageId = (s: string): PageId => s as PageId;
export const asTenantId = (s: string): TenantId => s as TenantId;
export const asUserId = (s: string): UserId => s as UserId;
export const asAppId = (s: string): AppId => s as AppId;

/** ISO 8601 时间戳字符串。 */
export type ISODateString = string;

/** 统一 API 响应包裹。 */
export type ApiResponse<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

export interface ApiError {
  /** 机器可读的错误码，如 'VALIDATION_ERROR' / 'NOT_FOUND' / 'FORBIDDEN'。 */
  code: string;
  /** 人类可读的错误信息。 */
  message: string;
  /** 字段级校验错误（表单提交场景）。 */
  fieldErrors?: Record<string, string>;
  /** 调试用 trace id。 */
  traceId?: string;
}

/** 分页响应。 */
export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** 通用排序参数。 */
export interface SortParam {
  field: string;
  order: 'asc' | 'desc';
}
