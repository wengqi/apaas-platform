import { useEffect } from 'react';
import { applyGlobalCss, runGlobalJs } from '@apaas/shared/page';
import { Space, Typography } from 'antd';
import { isAmisPage } from '@apaas/shared';
import { usePageBuilderStore } from '../../stores/pageBuilder.js';
import { useDebugStore } from '../../stores/page-builder/debug.js';
import { useRuntimeCtx } from './RuntimeStore.js';
import ComponentRenderer from './ComponentRenderer.js';
import { RuntimeStoreProvider } from './RuntimeStore.js';

const { Text } = Typography;

/** 页面卡宽度（桌面，对齐飞书「自动 960px」）。 */
const PAGE_CARD_WIDTH = 960;

/** 手机/平板画布宽度预设（E2-6 移动端预览；独立移动端配置按 ADR-0002 暂缓）。 */
export const CANVAS_WIDTH_PRESETS = { mobile: 375, tablet: 768 } as const;

/**
 * 画布(中栏) — 对齐飞书 aPaaS：灰底 + 白色页面卡片(960px、圆角、阴影)；
 * 点击空白区域取消选中。缩放控件已移至顶栏（store.canvasZoom），画布零占用。
 */
export default function Canvas() {
  const schema = usePageBuilderStore((s) => s.schema);
  const mode = usePageBuilderStore((s) => s.mode);
  const currentPage = usePageBuilderStore((s) => s.currentPage);
  const selectNode = usePageBuilderStore((s) => s.selectNode);
  const zoom = usePageBuilderStore((s) => s.canvasZoom);
  const canvasWidth = usePageBuilderStore((s) => s.canvasWidth);

  const handleBackgroundClick = () => {
    selectNode(null);
  };

  // 预览模式用 RuntimeStoreProvider 包裹;以 mode 为 key,
  // 切换到预览时重新挂载 Provider(初始化 vm + 触发 autoQuery),
  // 切回编辑时卸载(清理运行时状态)。
  const viewModel = schema?.viewModel ?? { variables: {} };
  const objectId = currentPage?.objectId;

  // 全局代码（批次C7）：预览态注入 CSS / 执行一次 JS，切回编辑时清理
  useEffect(() => {
    if (mode !== 'preview' || !schema) return;
    applyGlobalCss(schema);
    runGlobalJs(schema);
    return () => applyGlobalCss(null);
  }, [mode, schema]);

  return (
    <div
      onClick={handleBackgroundClick}
      style={{
        flex: 1,
        minWidth: 0,
        height: '100%',
        background: '#eff1f3',
        overflow: 'auto',
        position: 'relative',
        padding: 24,
      }}
    >
      {/* 页面画布(居中,白底 960px 卡片,缩放) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          minHeight: '100%',
        }}
      >
        <div
          data-canvas-card
          style={{
            width: canvasWidth ?? PAGE_CARD_WIDTH,
            maxWidth: '100%',
            minHeight: 720,
            background: '#fff',
            borderRadius: 12,
            boxShadow: '0 2px 12px rgba(31,35,41,0.08)',
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            padding: 20,
          }}
        >
          {schema && isAmisPage(schema) ? (
            <div style={{ padding: 48, textAlign: 'center' }}>
              <Typography.Title level={4}>amis 方言页面</Typography.Title>
              <Typography.Text type="secondary">
                该页面为 amis 方言（v2），画布暂不支持可视化编辑——请使用左栏「代码」页签编辑，
                或打开 runtime 预览查看渲染效果。
              </Typography.Text>
            </div>
          ) : schema ? (
            mode === 'preview' ? (
              <RuntimeStoreProvider key="preview" viewModel={viewModel} objectId={objectId}>
                <RuntimeVmBridge />
                <ComponentRenderer node={schema.root} isRoot />
              </RuntimeStoreProvider>
            ) : (
              <ComponentRenderer node={schema.root} isRoot />
            )
          ) : (
            <Space
              direction="vertical"
              align="center"
              style={{ width: '100%', padding: '120px 0' }}
            >
              <Text type="secondary">加载页面中...</Text>
            </Space>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 运行时 vm 桥接 — 把预览态 vm 快照同步到调试 store，
 * 供左栏「状态数据」页签展示运行时值；卸载（切回编辑）时清空。
 */
function RuntimeVmBridge(): null {
  const vm = useRuntimeCtx((s) => s.vm);
  const setRuntimeVm = useDebugStore((s) => s.setRuntimeVm);
  useEffect(() => {
    setRuntimeVm(vm);
  }, [vm, setRuntimeVm]);
  useEffect(() => () => setRuntimeVm(null), [setRuntimeVm]);
  return null;
}
