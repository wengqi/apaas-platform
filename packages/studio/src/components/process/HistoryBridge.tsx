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
  // usePlaygroundTools() 每次渲染返回新实例，不能作为 effect 依赖——否则
  // "effect → setState → 重渲染 → 新 tools → effect" 形成死循环（曾在 dev
  // 构建下画布饿死为空白）。实例经 ref 读取，effect 只随撤销/重做可用性变化。
  const toolsRef = useRef(tools);
  toolsRef.current = tools;
  useEffect(() => {
    onReadyRef.current?.({
      undo: () => toolsRef.current.undo(),
      redo: () => toolsRef.current.redo(),
      canUndo: tools.canUndo,
      canRedo: tools.canRedo,
    });
  }, [tools.canUndo, tools.canRedo]);
  return null;
}
