import { useState } from 'react';
import { Button, Space, Typography } from 'antd';
import {
  ZoomInOutlined,
  ZoomOutOutlined,
  BorderOutlined,
} from '@ant-design/icons';
import { usePageBuilderStore } from '../../stores/pageBuilder.js';
import ComponentRenderer from './ComponentRenderer.js';
import { RuntimeStoreProvider } from './RuntimeStore.js';

const { Text } = Typography;

/**
 * 画布(中栏)。
 * 缩放工具 + 页面画布(居中白底)+ 组件树渲染。
 * 点击空白区域取消选中。
 */
export default function Canvas() {
  const schema = usePageBuilderStore((s) => s.schema);
  const mode = usePageBuilderStore((s) => s.mode);
  const currentPage = usePageBuilderStore((s) => s.currentPage);
  const selectNode = usePageBuilderStore((s) => s.selectNode);
  const [zoom, setZoom] = useState(1);
  const [showGrid, setShowGrid] = useState(false);

  const handleBackgroundClick = () => {
    selectNode(null);
  };

  // 预览模式用 RuntimeStoreProvider 包裹;以 mode 为 key,
  // 切换到预览时重新挂载 Provider(初始化 vm + 触发 autoQuery),
  // 切回编辑时卸载(清理运行时状态)。
  const viewModel = schema?.viewModel ?? { variables: {} };
  const objectId = currentPage?.objectId;

  return (
    <div
      onClick={handleBackgroundClick}
      style={{
        flex: 1,
        minWidth: 0,
        height: '100%',
        background: '#f5f7fa',
        overflow: 'auto',
        position: 'relative',
        padding: 24,
      }}
    >
      {/* 缩放工具(右上浮动) */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'sticky',
          top: 0,
          float: 'right',
          zIndex: 5,
          background: '#fff',
          border: '1px solid #eef0f4',
          borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          padding: '4px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <Button
          type="text"
          size="small"
          icon={<ZoomOutOutlined />}
          disabled={zoom <= 0.5}
          onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
        />
        <Text style={{ fontSize: 13, minWidth: 40, textAlign: 'center' }}>
          {Math.round(zoom * 100)}%
        </Text>
        <Button
          type="text"
          size="small"
          icon={<ZoomInOutlined />}
          disabled={zoom >= 1.5}
          onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}
        />
        <Button
          type="text"
          size="small"
          icon={<BorderOutlined />}
          style={{ color: showGrid ? '#1677ff' : undefined }}
          onClick={() => setShowGrid((v) => !v)}
        />
      </div>

      {/* 页面画布(居中,白底,缩放) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          minHeight: '100%',
        }}
      >
        <div
          style={{
            width: 1200,
            maxWidth: '100%',
            minHeight: 800,
            background: '#fff',
            border: '1px solid #eef0f4',
            borderRadius: 8,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            transform: `scale(${zoom})`,
            transformOrigin: 'top center',
            padding: 16,
            ...(showGrid
              ? {
                  backgroundImage:
                    'radial-gradient(circle, #eef0f4 1px, transparent 1px)',
                  backgroundSize: '20px 20px',
                }
              : {}),
          }}
        >
          {schema ? (
            mode === 'preview' ? (
              <RuntimeStoreProvider
                key="preview"
                viewModel={viewModel}
                objectId={objectId}
              >
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
