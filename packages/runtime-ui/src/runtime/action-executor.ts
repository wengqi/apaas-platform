/**
 * 事件动作执行器(运行时 MVP)。
 *
 * 实现 PRD §6.2 的 12 种 ActionType,以及 §6.4 的动作链串行执行
 * (含 condition 条件跳过与 confirm 取消中断)。动作参数中的
 * `{ __bind }` / `{ __expr }` 在执行时实时求值(§6.4 规则 5)。
 *
 * 数据动作调用 objectsApi(records.list/create/update/delete);
 * UI 动作调用前端路由 / AntD 弹窗;`set_variable` 更新视图模型。
 */

import { Modal, message } from 'antd';
import { objectsApi } from '../api/objects.js';
import apiClient from '../api/client.js';
import type { ActionConfig, ActionType, PropValue } from '../api/pages.js';
import { evalExpr, resolvePropValue } from './expression-engine.js';
import type { EvalContext } from './expression-engine.js';

// ---------------------------------------------------------------------------
// 上下文
// ---------------------------------------------------------------------------

/** 动作执行上下文:视图模型状态 + 变量写入 + 跳转 + 关联对象。 */
export interface ActionContext {
  /** 视图模型变量值(运行时)。 */
  vm: Record<string, unknown>;
  /** 设置视图模型变量(支持 'vm.x.y' / 'x.y' 路径)。 */
  setVariable: (path: string, value: unknown) => void;
  /** 页面跳转(接收最终路径)。 */
  navigate: (path: string) => void;
  /** 当前关联对象 ID(动作参数未指定 objectId 时回退)。 */
  objectId?: string;
}

// ---------------------------------------------------------------------------
// 动作链中断信号
// ---------------------------------------------------------------------------

/** confirm 取消时抛出,用于中断动作链(不作为错误提示)。 */
export class ActionChainInterrupt extends Error {
  constructor() {
    super('ActionChainInterrupt');
    this.name = 'ActionChainInterrupt';
  }
}

// ---------------------------------------------------------------------------
// 动作条件(扩展字段,PRD §6.3)
// ---------------------------------------------------------------------------

/** 带条件的动作(ActionConfig 类型未含 condition,这里宽松扩展)。 */
type ChainAction = ActionConfig & {
  condition?: { __expr?: string };
};

// ---------------------------------------------------------------------------
// 参数解析
// ---------------------------------------------------------------------------

/** 解析单个动作参数(字面量 / 绑定 / 表达式 → 实际值)。 */
function resolveParam(
  params: Record<string, PropValue> | undefined,
  key: string,
  context: ActionContext,
): unknown {
  const raw = params?.[key];
  if (raw === undefined) return undefined;
  const evalCtx: EvalContext = { vm: context.vm };
  return resolvePropValue(raw, evalCtx);
}

/** 解析参数为字符串。 */
function paramAsString(
  params: Record<string, PropValue> | undefined,
  key: string,
  context: ActionContext,
): string {
  const v = resolveParam(params, key, context);
  if (v == null) return '';
  return String(v);
}

/** 解析参数为普通对象。 */
function paramAsObject(
  params: Record<string, PropValue> | undefined,
  key: string,
  context: ActionContext,
): Record<string, unknown> {
  const v = resolveParam(params, key, context);
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return {};
}

// ---------------------------------------------------------------------------
// 记录扁平化
// ---------------------------------------------------------------------------

/** 将 RecordItem({ id, data }) 扁平化为 { id, ...data },便于表格 / 表单直接取值。 */
function flattenRecord(item: {
  id: string;
  data: Record<string, unknown>;
}): Record<string, unknown> {
  return { id: item.id, ...item.data };
}

// ---------------------------------------------------------------------------
// 单动作执行
// ---------------------------------------------------------------------------

/**
 * 执行单个动作。
 *
 * - `confirm` 用户取消时抛出 `ActionChainInterrupt`(供动作链捕获)。
 * - 其他失败抛出原始错误(供动作链捕获并提示)。
 */
export async function executeAction(
  action: ActionConfig,
  context: ActionContext,
): Promise<void> {
  const params = action.params;
  const type = action.type as ActionType;

  switch (type) {
    // —— 数据类 ——
    case 'query_records': {
      const objectId = paramAsString(params, 'objectId', context) || context.objectId || '';
      const targetVariable = paramAsString(params, 'targetVariable', context);
      const pagination = resolveParam(params, 'pagination', context);
      const pageVal =
        pagination && typeof pagination === 'object'
          ? (pagination as Record<string, unknown>).page
          : undefined;
      const pageSizeVal =
        pagination && typeof pagination === 'object'
          ? (pagination as Record<string, unknown>).pageSize
          : undefined;
      const page = typeof pageVal === 'number' ? pageVal : 1;
      const pageSize = typeof pageSizeVal === 'number' ? pageSizeVal : 50;

      if (!objectId) {
        message.warning('query_records 缺少 objectId');
        return;
      }
      const res = await objectsApi.records.list(objectId, { page, pageSize });
      const records = res.items.map(flattenRecord);
      const target = targetVariable || 'vm.list';
      context.setVariable(target, {
        records,
        total: res.total,
        page: res.page,
        pageSize: res.pageSize,
      });
      return;
    }

    case 'create_record': {
      const objectId = paramAsString(params, 'objectId', context) || context.objectId || '';
      const data = paramAsObject(params, 'data', context);
      if (!objectId) {
        message.warning('create_record 缺少 objectId');
        return;
      }
      await objectsApi.records.create(objectId, data);
      return;
    }

    case 'update_record': {
      const recordId = paramAsString(params, 'recordId', context);
      const data = paramAsObject(params, 'data', context);
      if (!recordId) {
        message.warning('update_record 缺少 recordId');
        return;
      }
      await objectsApi.records.update(recordId, data);
      return;
    }

    case 'delete_record': {
      const recordId = paramAsString(params, 'recordId', context);
      if (!recordId) {
        message.warning('delete_record 缺少 recordId');
        return;
      }
      await objectsApi.records.delete(recordId);
      return;
    }

    // —— 导航 / 弹窗 ——
    case 'navigate': {
      const slug = paramAsString(params, 'pageSlug', context);
      const path = paramAsString(params, 'path', context);
      const url = paramAsString(params, 'url', context);
      const target = slug || path || url;
      if (target) context.navigate(target);
      return;
    }

    case 'open_modal': {
      const pageSlug = paramAsString(params, 'pageSlug', context);
      context.setVariable('vm.modalVisible', true);
      context.setVariable('vm.modalPage', pageSlug);
      return;
    }

    case 'close_modal': {
      context.setVariable('vm.modalVisible', false);
      return;
    }

    // —— 交互提示 ——
    case 'confirm': {
      const title = paramAsString(params, 'title', context) || '确认';
      const content = paramAsString(params, 'content', context);
      await new Promise<void>((resolve, reject) => {
        Modal.confirm({
          title,
          content: content || undefined,
          okText: '确认',
          cancelText: '取消',
          onOk: () => resolve(),
          onCancel: () => reject(new ActionChainInterrupt()),
        });
      });
      return;
    }

    case 'toast': {
      const msg = paramAsString(params, 'message', context) || '';
      const toastType = paramAsString(params, 'type', context) || 'success';
      const fn = (message as unknown as Record<string, (m: string) => void>)[toastType];
      if (fn) fn(msg);
      else message.success(msg);
      return;
    }

    // —— 自定义 API ——
    case 'call_api': {
      const url = paramAsString(params, 'url', context);
      const method = (paramAsString(params, 'method', context) || 'GET').toUpperCase();
      const headers = paramAsObject(params, 'headers', context);
      const body = resolveParam(params, 'body', context);
      if (!url) {
        message.warning('call_api 缺少 url');
        return;
      }
      await fetch(url, {
        method,
        headers: Object.keys(headers).length ? { 'Content-Type': 'application/json', ...headers } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      return;
    }

    // —— 流程触发 ——
    case 'trigger_process': {
      const processId = paramAsString(params, 'processId', context);
      if (!processId) {
        message.warning('trigger_process 缺少 processId');
        return;
      }
      try {
        await apiClient.post(`/api/processes/${processId}/start`, {
          processKey: processId,
          variables: { ...context.vm },
        });
      } catch {
        message.error('流程启动失败');
      }
      return;
    }

    // —— 变量 ——
    case 'set_variable': {
      const variable = paramAsString(params, 'variable', context);
      const value = resolveParam(params, 'value', context);
      if (variable) context.setVariable(variable, value);
      return;
    }

    default: {
      // eslint-disable-next-line no-console
      console.warn('[action-executor] 未知动作类型:', type);
    }
  }
}

// ---------------------------------------------------------------------------
// 动作链执行
// ---------------------------------------------------------------------------

/** 错误提示(动作链失败时统一 toast)。 */
function toastError(err: unknown): void {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : '动作执行失败';
  message.error(msg);
}

/**
 * 串行执行动作链(§6.4 / §8.5)。
 *
 * 规则:
 * 1. 按数组顺序串行执行。
 * 2. 每个动作执行前检查 `condition`,为 false 则跳过。
 * 3. `confirm` 取消(抛 ActionChainInterrupt)→ 中断链,不提示错误。
 * 4. 其他失败 → toast 错误并中断。
 */
export async function executeActionChain(
  actions: ActionConfig[],
  context: ActionContext,
): Promise<void> {
  for (const action of actions) {
    const chainAction = action as ChainAction;

    // 条件判断
    if (chainAction.condition?.__expr) {
      const ok = evalExpr(chainAction.condition.__expr, { vm: context.vm });
      if (!ok) continue;
    }

    try {
      await executeAction(action, context);
    } catch (err) {
      if (err instanceof ActionChainInterrupt) break; // confirm 取消,静默中断
      toastError(err);
      break; // 失败中断
    }
  }
}
