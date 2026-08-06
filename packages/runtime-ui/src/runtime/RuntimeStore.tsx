/**
 * Runtime-UI 运行时状态 Provider — 轻量包装，注入 runtime-ui 专用 adapter。
 *
 * 核心逻辑在 @apaas/shared/stores 的 RuntimeStoreProvider 中，
 * 此文件仅提供 runtime-ui 的 API 适配器（apiClient）。
 */

import { useNavigate, useParams } from 'react-router-dom';
import {
  RuntimeStoreProvider as SharedRuntimeStoreProvider,
  type RuntimeStoreAdapter,
} from '@apaas/shared/stores';
import { objectsApi } from '../api/objects.js';
import apiClient from '../api/client.js';
import type { ViewModel } from '../api/pages.js';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Runtime-UI 专用 Adapter
// ---------------------------------------------------------------------------

/**
 * 创建 runtime-ui 适配器。
 * 使用 runtime-ui 的 API 模块（objectsApi / apiClient）。
 */
function useRuntimeAdapter(): RuntimeStoreAdapter {
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
    queryRecords: (objectId: string, params: { page: number; pageSize: number }) =>
      objectsApi.records.list(objectId, params),
    createRecord: (objectId: string, data: Record<string, unknown>) =>
      objectsApi.records.create(objectId, data),
    updateRecord: (recordId: string, data: Record<string, unknown>) =>
      objectsApi.records.update(recordId, data),
    deleteRecord: (recordId: string) => objectsApi.records.delete(recordId),
    startProcess: (processId: string, variables: Record<string, unknown>) =>
      apiClient.post(`/processes/${processId}/start`, { variables }),
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

/** Runtime-UI Provider — 注入 adapter 后委托给共享 Provider。 */
export function RuntimeStoreProvider({ viewModel, objectId, children }: RuntimeStoreProviderProps) {
  const adapter = useRuntimeAdapter();
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
