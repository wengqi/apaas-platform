/**
 * aPaaS 简化流程编辑器
 *
 * 基于 flowgram.ai Fixed Layout Editor，集成 aPaaS 业务节点。
 * 这是"飞书式简化流程画布"的主组件。
 *
 * 架构角色（ARCHITECTURE.md 层3）：
 *  - 简化模式：直接产出 WorkflowSchema（零翻译，flowgram 原生格式）
 *  - 通过 schema-serializer 双向转换 flowgram 内部格式 ↔ WorkflowSchema
 *  - 模式切换时调用 capability-check 判定可编辑/只读（Phase 3 实现）
 */

import { useMemo, useCallback } from 'react';
import {
  FixedLayoutEditorProvider,
  EditorRenderer,
  usePlaygroundTools,
  useClientContext,
} from '@flowgram.ai/fixed-layout-editor';
import { Button, Space } from 'antd';

import { ApaasNodeRegistries } from './nodes/index.js';
import { initialData } from './initial-data.js';
import { flowToWorkflowSchema } from './schema-serializer.js';
import type { FlowDocumentJSON } from './typings.js';
import type { WorkflowSchema } from '@apaas/shared';

import '@flowgram.ai/fixed-layout-editor/index.css';

export interface SimplifiedProcessEditorProps {
  /** 初始流程数据（FlowDocumentJSON 格式），不传则用内置示例 */
  initialData?: FlowDocumentJSON;
  /** 流程数据变化回调，返回 WorkflowSchema (SSOT) */
  onSchemaChange?: (schema: WorkflowSchema) => void;
  /** 只读模式（标准模式含高级元素时，简化模式降级为只读） */
  readonly?: boolean;
}

export function SimplifiedProcessEditor({
  initialData: initialDoc = initialData,
  onSchemaChange,
  readonly = false,
}: SimplifiedProcessEditorProps) {
  const editorProps = useMemo(
    () => ({
      initialData: initialDoc,
      nodeRegistries: ApaasNodeRegistries,
      readonly,
    }),
    [initialDoc, readonly],
  );

  return (
    <div className="apaas-simplified-editor" style={{ width: '100%', height: '100%' }}>
      <FixedLayoutEditorProvider {...editorProps}>
        <EditorRenderer />
        {!readonly && <EditorToolbar onExport={onSchemaChange} />}
      </FixedLayoutEditorProvider>
    </div>
  );
}

/**
 * 编辑器工具栏 — 导出 WorkflowSchema、撤销/重做等。
 */
function EditorToolbar({ onExport }: { onExport?: (schema: WorkflowSchema) => void }) {
  const tools = usePlaygroundTools();
  const clientContext = useClientContext();

  const handleExport = useCallback(() => {
    // 从 flowgram 文档模型导出 JSON
    const doc = clientContext.document.toJSON() as FlowDocumentJSON;
    const schema = flowToWorkflowSchema(doc);
    onExport?.(schema);
    console.log('[aPaaS] 导出 WorkflowSchema:', schema);
  }, [clientContext, onExport]);

  return (
    <div
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 1000,
      }}
    >
      <Space>
        <Button size="small" onClick={() => tools.undo()} disabled={!tools.canUndo}>
          撤销
        </Button>
        <Button size="small" onClick={() => tools.redo()} disabled={!tools.canRedo}>
          重做
        </Button>
        <Button size="small" onClick={() => tools.fitView()}>
          适应视区
        </Button>
        <Button size="small" type="primary" onClick={handleExport}>
          导出 Schema
        </Button>
      </Space>
    </div>
  );
}

export default SimplifiedProcessEditor;
