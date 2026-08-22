/**
 * 撤销/重做桥接 — 暴露 flowgram history API 给父组件。
 *
 * 从 SimplifiedEditor.tsx 提取。
 */

import { useRef, useEffect } from 'react';
import { usePlaygroundTools } from '@flowgram.ai/fixed-layout-editor';

export interface HistoryApi {
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function HistoryBridge({ onHistoryReady }: { onHistoryReady?: (api: HistoryApi) => void }) {
  const tools = usePlaygroundTools();
  const onReadyRef = useRef(onHistoryReady);
  onReadyRef.current = onHistoryReady;
  useEffect(() => {
    onReadyRef.current?.({
      undo: () => tools.undo(),
      redo: () => tools.redo(),
      canUndo: tools.canUndo,
      canRedo: tools.canRedo,
    });
  }, [tools.canUndo, tools.canRedo, tools]);
  return null;
}
