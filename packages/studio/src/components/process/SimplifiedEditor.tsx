/**
 * 简化模式编辑器 —— 基于 flowgram.ai Fixed Layout 引擎。
 *
 * 对齐 flowgram.ai 官方最佳实践 (fixed-feature-overview):
 *  - 使用 defaultFixedSemiMaterials 作为基础材质,仅覆盖 ADDER
 *  - 使用 materials.renderDefaultNode 注册节点渲染器
 *  - 条件分支节点使用 extend: 'dynamicSplit'(在 condition registry 中)
 *  - 不覆盖几何常量(SPICING/ROUNDED_LINE_RADIUS 等),使用默认值
 *  - 不设 meta.size,继承 DEFAULT_SIZE (280x60)
 *  - 启用 nodeEngine
 *  - 选中节点时显示浮动配置侧边栏
 *
 * 本文件为入口 barrel，实际逻辑拆分到：
 *  - conditionBranchUtils.ts: 条件分支操作（getBranchBlocks / isElseBlock / reconcile / merge）
 *  - nodeMetadata.ts: 节点配置检查 + 摘要生成
 *  - nodeCreation.ts: 拖放创建 + 条件分支 extInfo 同步
 *  - nodeRenderers.tsx: 节点渲染器（BlockOrderIconLabel / ApaasNodeRenderer / BusinessNodeRenderer）
 *  - ApaasAdder.tsx: 节点间"+"按钮
 *  - ConfigSidebar.tsx: 配置侧边栏
 *  - EventBridge.tsx: 事件驱动桥接器
 *  - CanvasColumn.tsx: 中栏（画布 + 缩放工具 + 配置侧边栏 + 事件桥接）
 *  - HistoryBridge.tsx: 撤销/重做桥接
 */

import { TOKENS as T } from '@apaas/shared/design';
import { useEffect, useMemo } from 'react';
import { FixedLayoutEditorProvider } from '@flowgram.ai/fixed-layout-editor';
import { FlowRendererKey } from '@flowgram.ai/renderer';
import { defaultFixedSemiMaterials } from '@flowgram.ai/fixed-semi-materials';
import type { WorkflowSchema } from '../../api/processes.js';
import {
  ApaasNodeRegistries,
  workflowToFlowSchema,
  type FlowDocumentJSON,
} from '../../../features/process/simplified/src/index.js';

import '@flowgram.ai/fixed-layout-editor/index.css';
// Semi UI 样式：flowgram fixed-semi-materials 的面板/下拉/按钮依赖 semi.min.css。
// 此前经 index.html 以 /node_modules/... 直链引入——仅 dev 可伺服，生产构建该
// 文件不在 dist，请求被 SPA fallback 以 text/html 兜底、浏览器按 MIME 拒绝应用，
// 画布 Semi 组件全部裸奔（2026-10-12 impeccable 审计 P0）。改为 JS 导入：deep
// import 会被 semi-ui 的 exports map 拦截（完整 css 不在表内），由 vite.config
// alias 指到物理文件解决；样式随本 chunk（ProcessEditor 路由懒加载）打包。
import '@douyinfe/semi-ui/dist/css/semi.min.css';
import { ApaasNodeRenderer } from './nodeRenderers.js';
import { ApaasAdder } from './ApaasAdder.js';
import { HistoryBridge, type HistoryApi } from './HistoryBridge.js';
import { CanvasColumn } from './CanvasColumn.js';

export type { HistoryApi };

export interface SimplifiedEditorProps {
  initialSchema?: WorkflowSchema;
  readonly?: boolean;
  onSchemaChange?: (schema: WorkflowSchema) => void;
  objectOptions?: { label: string; value: string }[];
  formOptions?: { label: string; value: string }[];
  templateOptions?: { label: string; value: string }[];
  processOptions?: { label: string; value: string }[];
  onHistoryReady?: (api: HistoryApi) => void;
}

export default function SimplifiedEditor({
  initialSchema,
  readonly = false,
  onSchemaChange,
  objectOptions = [],
  formOptions = [],
  templateOptions = [],
  processOptions = [],
  onHistoryReady,
}: SimplifiedEditorProps) {
  const initialDoc = useMemo<FlowDocumentJSON>(() => {
    if (initialSchema && initialSchema.nodes.length > 0) {
      return workflowToFlowSchema(initialSchema);
    }
    return { nodes: [], edges: [], groups: [] };
  }, [initialSchema]);

  const editorProps = useMemo(
    () => ({
      initialData: initialDoc,
      nodeRegistries: ApaasNodeRegistries,
      readonly,
      history: { enable: true },
      dragdrop: { enable: true },
      nodeEngine: { enable: true },
      constants: {
        BASE_COLOR: T.colorLineBase,
        BASE_ACTIVATED_COLOR: T.colorLineActive,
      },
      materials: {
        components: {
          ...defaultFixedSemiMaterials,
          [FlowRendererKey.ADDER]: ApaasAdder,
        },
        renderDefaultNode: ApaasNodeRenderer,
      },
    }),
    [initialDoc, readonly],
  );

  useEffect(() => {
    const w = window as unknown as {
      __apaasConfigOptions?: {
        objectOptions: typeof objectOptions;
        formOptions: typeof formOptions;
        templateOptions: typeof templateOptions;
        processOptions: typeof processOptions;
      };
    };
    w.__apaasConfigOptions = { objectOptions, formOptions, templateOptions, processOptions };
  }, [objectOptions, formOptions, templateOptions, processOptions]);

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, background: T.colorBgLayout }}>
      <FixedLayoutEditorProvider {...editorProps}>
        <HistoryBridge onHistoryReady={onHistoryReady} />
        <CanvasColumn readonly={readonly} onSchemaChange={onSchemaChange} />
      </FixedLayoutEditorProvider>
    </div>
  );
}
