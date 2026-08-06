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
import type { ViewModel } from '../../api/pages.js';
import type { ReactNode } from 'react';

// ---------------------------------------------------------------------------
// Studio 专用 Adapter
// ---------------------------------------------------------------------------

/**
 * 创建 studio 适配器。
 * 使用 studio 的 API 模块（objectsApi / processesApi）。
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
    queryRecords: (objectId, params) => objectsApi.records.list(objectId, params),
    createRecord: (objectId, data) => objectsApi.records.create(objectId, data),
    updateRecord: (recordId, data) => objectsApi.records.update(recordId, data),
    deleteRecord: (recordId) => objectsApi.records.delete(recordId),
    startProcess: (processId, variables) =>
      processesApi.start(processId, { processKey: processId, variables }),
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
