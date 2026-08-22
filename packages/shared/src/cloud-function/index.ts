/**
 * 云函数类型契约 — 用户自定义 JavaScript 代码，在 isolated-vm 沙箱中执行。
 *
 * 飞书对齐 Module G：云函数与扩展。
 * 云函数可通过流程节点调用，也可通过页面事件触发。
 */

// ---------------------------------------------------------------------------
// 枚举
// ---------------------------------------------------------------------------

/** 云函数状态。 */
export type CloudFunctionStatus = 'DRAFT' | 'PUBLISHED' | 'DISABLED';

/** 代码语言（当前仅支持 JavaScript）。 */
export type CloudFunctionLanguage = 'javascript';

// ---------------------------------------------------------------------------
// 实体接口
// ---------------------------------------------------------------------------

/** 云函数代码存储结构。 */
export interface CloudFunctionCode {
  /** 源代码（handler 函数体）。 */
  source: string;
  /** 语言（当前仅 javascript）。 */
  language: CloudFunctionLanguage;
}

/** 输入参数定义。 */
export interface CloudFunctionInputParam {
  /** 参数名。 */
  name: string;
  /** 参数类型。 */
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  /** 是否必填。 */
  required: boolean;
  /** 默认值。 */
  defaultValue?: unknown;
  /** 描述。 */
  description?: string;
}

/** 云函数实体。 */
export interface CloudFunction {
  id: string;
  tenantId: string;
  appId: string;
  apiName: string;
  name: string;
  description?: string;
  code: CloudFunctionCode;
  inputSchema?: CloudFunctionInputParam[];
  status: CloudFunctionStatus;
  version: number;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// 请求 DTO
// ---------------------------------------------------------------------------

/** 创建云函数请求。 */
export interface CreateCloudFunctionRequest {
  apiName: string;
  name: string;
  description?: string;
  code?: CloudFunctionCode;
  inputSchema?: CloudFunctionInputParam[];
}

/** 更新云函数请求。 */
export interface UpdateCloudFunctionRequest {
  name?: string;
  description?: string;
  code?: CloudFunctionCode;
  inputSchema?: CloudFunctionInputParam[];
  status?: CloudFunctionStatus;
}

/** 调用云函数请求。 */
export interface InvokeCloudFunctionRequest {
  /** 输入参数（键值对）。 */
  input?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 响应 DTO
// ---------------------------------------------------------------------------

/** 云函数执行结果。 */
export interface CloudFunctionCallResult {
  /** 是否成功。 */
  success: boolean;
  /** 返回值（成功时）。 */
  result?: unknown;
  /** 错误信息（失败时）。 */
  error?: string;
  /** 执行日志。 */
  logs: string[];
  /** 执行耗时（毫秒）。 */
  durationMs: number;
}
