/**
 * Studio 运行时状态 Provider — 轻量包装，注入 studio 专用 adapter。
 *
 * 核心逻辑在 @apaas/shared/stores 的 RuntimeStoreProvider 中，
 * 此文件仅提供 studio 的 API 适配器（objectsApi / processesApi）。
 */

import { useNavigate, useParams } from 'react-router-dom';
import {
  RuntimeStoreProvider as SharedRuntimeStoreProvider,
  type RuntimeStoreAdapter,
} from '@apaas/shared/stores';
import { objectsApi } from '../../api/objects.js';
import { processesApi } from '../../api/processes.js';
import { useDebugStore } from '../../stores/page-builder/debug.js';
import type { ViewModel } from '../../api/pages.js';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Studio 专用 Adapter（含调试面板埋点：请求时间轴 + 控制台）
// ---------------------------------------------------------------------------

/** 包装一个 API 调用：记录请求时间轴 + 成功/失败控制台日志。 */
function withDebugLog<T>(
  label: string,
  run: () => Promise<T>,
  onDone?: (result: T) => void,
): Promise<T> {
  const debug = useDebugStore.getState();
  const id = debug.beginRequest('CALL', label);
  const start = performance.now();
  return run()
    .then((result) => {
      useDebugStore.getState().completeRequest(id, true, Math.round(performance.now() - start));
      useDebugStore
        .getState()
        .pushLog('success', `${label} 成功（${Math.round(performance.now() - start)}ms）`);
      onDone?.(result);
      return result;
    })
    .catch((err: unknown) => {
      useDebugStore.getState().completeRequest(id, false, Math.round(performance.now() - start));
      useDebugStore
        .getState()
        .pushLog('error', `${label} 失败：${err instanceof Error ? err.message : String(err)}`);
      throw err;
    });
}

/**
 * 创建 studio 适配器。
 * 使用 studio 的 API 模块（objectsApi / processesApi）。
 * 每个调用经 withDebugLog 包装，驱动底部面板「请求时间轴 / 控制台」。
 */
function useStudioAdapter(): RuntimeStoreAdapter {
  const navigateImpl = useNavigate();
  const { appId } = useParams<{ appId: string }>();

  const navigate = (path: string) => {
    if (!path) return;
    if (path.startsWith('/') || /^https?:\/\//.test(path)) {
      navigateImpl(path);
    } else if (appId) {
      navigateImpl(`/app/${appId}/p/${path}`);
    } else {
      navigateImpl(`/${path}`);
    }
  };

  return {
    queryRecords: (objectId, params) =>
      withDebugLog(`查询记录 ${objectId}`, () => objectsApi.records.list(objectId, params)),
    createRecord: (objectId, data) =>
      withDebugLog(`新增记录 ${objectId}`, () => objectsApi.records.create(objectId, data)),
    updateRecord: (recordId, data) =>
      withDebugLog(`更新记录 ${recordId}`, () => objectsApi.records.update(recordId, data)),
    deleteRecord: (recordId) =>
      withDebugLog(`删除记录 ${recordId}`, () => objectsApi.records.delete(recordId)),
    startProcess: (processId, variables) =>
      withDebugLog(`启动流程 ${processId}`, () =>
        processesApi.start(processId, { processKey: processId, variables }),
      ),
    navigate,
  };
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface RuntimeStoreProviderProps {
  viewModel: ViewModel;
  objectId?: string;
  children: ReactNode;
}

/** Studio 运行时 Provider — 注入 studio adapter 后委托给共享 Provider。 */
export function RuntimeStoreProvider({ viewModel, objectId, children }: RuntimeStoreProviderProps) {
  const adapter = useStudioAdapter();
  return (
    <SharedRuntimeStoreProvider viewModel={viewModel} objectId={objectId} adapter={adapter}>
      {children}
    </SharedRuntimeStoreProvider>
  );
}

// ---------------------------------------------------------------------------
// 消费 Hook（从 shared 重新导出，保持消费方 import 路径不变）
// ---------------------------------------------------------------------------

export { useRuntimeCtx, type RuntimeState } from '@apaas/shared/stores';
