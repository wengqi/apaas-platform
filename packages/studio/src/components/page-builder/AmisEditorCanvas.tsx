/**
 * AmisEditorCanvas — amis-editor 画布包装（R1.7 第二轮，页面唯一搭建器方言）。
 *
 * 定位：v1 自有画布（dnd-kit 三栏）已随删旧优先退役，本组件是搭建器画布唯一实现。
 * 编辑产物 = amis page schema（type:'page'），保存走 pagesApi.update（服务端 G3 硬闸）。
 *
 * 集成红线（与 runtime-ui AmisRenderer 同源，见 docs/knowledge-base/SPIKE-AMIS-ADOPTION-2026-09-30.md）：
 * - amis-editor 基于 mobx-state-tree，组件树不得置于 React.StrictMode 下
 *   （studio main.tsx 已随本批次移除 StrictMode）
 * - mobx 必须锁 4.x（package.json 已锁 4.15.7 + mobx-react-lite 2.2.2，与 runtime-ui 一致）
 * - 编辑态预览为设计时呈现，不发真实数据请求；运行时预览走 runtime-ui 链接
 */

import { lazy, Suspense } from 'react';
import { Spin } from 'antd';
import 'amis/lib/themes/antd.css';
import 'amis-ui/lib/themes/antd';
import 'amis-ui/lib/locale/zh-CN';
import 'amis-editor-core/lib/style.css';

const AmisEditorInner = lazy(() => import('./AmisEditorInner.js'));

interface AmisEditorCanvasProps {
  value: Record<string, unknown>;
  onChange: (schema: Record<string, unknown>) => void;
}

/** amis-editor 懒加载兜底态。 */
function EditorFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
      <Spin size="large" />
    </div>
  );
}

export default function AmisEditorCanvas({ value, onChange }: AmisEditorCanvasProps) {
  return (
    <Suspense fallback={<EditorFallback />}>
      <div style={{ height: '100%' }}>
        <AmisEditorInner value={value} onChange={onChange} />
      </div>
    </Suspense>
  );
}
