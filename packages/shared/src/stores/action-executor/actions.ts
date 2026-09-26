/**
 * 事件动作执行器 — 单动作执行（从 action-executor.ts 拆分，
 * AGENTS.md 单文件 400 行规范）。
 */

import { Modal, message } from 'antd';
import { useAuthStore } from '../auth.js';
import type { ActionConfig, ActionType } from '../types.js';
import { paramAsObject, paramAsString, resolveParam } from './params.js';
import { executePageScript } from './script.js';
import { ActionChainInterrupt } from './interrupt.js';
import type { ActionContext, RuntimeStoreAdapter } from './types.js';

// ---------------------------------------------------------------------------
// 记录扁平化
// ---------------------------------------------------------------------------

/** 将 RecordItem({ id, data }) 扁平化为 { id, ...data }，便于表格 / 表单直接取值。 */
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
 * - `confirm` 用户取消时抛出 `ActionChainInterrupt`（供动作链捕获）。
 * - 其他失败抛出原始错误（供动作链捕获并提示）。
 *
 * @param action 动作配置
 * @param context 动作上下文（vm + setVariable + objectId）
 * @param adapter API 适配器（queryRecords / createRecord / startProcess / navigate 等）
 */
export async function executeAction(
  action: ActionConfig,
  context: ActionContext,
  adapter: RuntimeStoreAdapter,
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
      const res = await adapter.queryRecords(objectId, { page, pageSize });
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
      await adapter.createRecord(objectId, data);
      return;
    }

    case 'update_record': {
      const recordId = paramAsString(params, 'recordId', context);
      const data = paramAsObject(params, 'data', context);
      if (!recordId) {
        message.warning('update_record 缺少 recordId');
        return;
      }
      await adapter.updateRecord(recordId, data);
      return;
    }

    case 'delete_record': {
      const recordId = paramAsString(params, 'recordId', context);
      if (!recordId) {
        message.warning('delete_record 缺少 recordId');
        return;
      }
      await adapter.deleteRecord(recordId);
      return;
    }

    // —— 导航 / 弹窗 ——
    case 'navigate': {
      const slug = paramAsString(params, 'pageSlug', context);
      const path = paramAsString(params, 'path', context);
      const url = paramAsString(params, 'url', context);
      const target = slug || path || url;
      if (target) adapter.navigate(target);
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
      // 注入认证 token + 状态检查：4xx/5xx 视为失败并 toast（fetch 对非 2xx 不 reject）
      const token = useAuthStore.getState().token;
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        message.error(`API 调用失败（${res.status}）`);
        return;
      }
      // 响应捕获到变量（供后续动作通过 vm 引用），仅 JSON 响应
      const responseVariable = paramAsString(params, 'responseVariable', context);
      if (responseVariable) {
        try {
          const data = await res.json();
          context.setVariable(responseVariable, data);
        } catch {
          // 非 JSON 响应，保持文本
          const text = await res.text();
          context.setVariable(responseVariable, text);
        }
      }
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
        await adapter.startProcess(processId, { ...context.vm });
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

    case 'run_script': {
      const code = paramAsString(params, 'code', context);
      if (!code) {
        message.warning('run_script 动作缺少 code');
        return;
      }
      executePageScript(code, context);
      return;
    }

    default: {
      console.warn('[action-executor] 未知动作类型:', type);
    }
  }
}
