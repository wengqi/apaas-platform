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
// 图标字体（2026-10-07 修复设计器图标空白）：
// - iconfont：amis 组件内置字形（数字框上下箭头/编辑器工具图标等），
//   @font-face 仅声明在 amis/sdk/iconfont.css（base64 woff2 自包含），
//   lib/themes/antd.css 只引用不声明——不引入则缺字形；
// - Font Awesome：物料面板/工具栏 fa 图标依赖 FA6 Free 字体与类定义，
//   @fortawesome/fontawesome-free 为 amis sdk 显式引用的资产（webfonts 路径），
//   按其引用补齐依赖（详见 package.json 依赖说明与提交说明）
import 'amis/sdk/iconfont.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
// FA6 改名了部分图标（如 fa-toggle-down→fa-circle-down），amis 物料面板用的是
// v4/v5 老名字——引入 shims（老名→新名映射）与 FA5 字体声明补齐
import '@fortawesome/fontawesome-free/css/v4-shims.min.css';
import '@fortawesome/fontawesome-free/css/v5-font-face.min.css';
import 'amis-ui/lib/themes/antd';
import 'amis-ui/lib/locale/zh-CN';
import 'amis-editor-core/lib/style.css';

// QA 交互评审（2026-10-03）：amis-editor 的物料面板/属性面板文案走 i18n-runtime，
// 其语言取 localStorage['suda-i18n-locale']（缺省随 navigator.language，英文系统
// 下整个编辑器变英文）。Editor 的 locale prop 不传导到 i18n-runtime——产品为
// 纯中文界面，挂载前显式钉死 zh-CN。
localStorage.setItem('suda-i18n-locale', 'zh-CN');

const AmisEditorInner = lazy(() => import('./AmisEditorInner.js'));

interface AmisEditorCanvasProps {
  value: Record<string, unknown>;
  onChange: (schema: Record<string, unknown>) => void;
  onEditorReady?: (editor: {
    undo(): void;
    redo(): void;
    store: { canUndo: boolean; canRedo: boolean };
  }) => void;
  /** 预览模式（受控）：画布切预览渲染，数据请求走真实平台 API */
  preview?: boolean;
  /** 编辑器内置预览切换回调——与宿主 state 同步 */
  onPreview?: (next: boolean) => void;
}

/** amis-editor 懒加载兜底态。 */
function EditorFallback() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 120 }}>
      <Spin size="large" />
    </div>
  );
}

export default function AmisEditorCanvas({
  value,
  onChange,
  onEditorReady,
  preview,
  onPreview,
}: AmisEditorCanvasProps) {
  return (
    <Suspense fallback={<EditorFallback />}>
      <div style={{ height: '100%' }}>
        <AmisEditorInner
          value={value}
          onChange={onChange}
          onEditorReady={onEditorReady}
          preview={preview}
          onPreview={onPreview}
        />
      </div>
    </Suspense>
  );
}
