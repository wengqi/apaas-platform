import { useEffect, useRef, useState } from 'react';
import { Skeleton, Typography } from 'antd';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePageBuilderStore, createDefaultSchema } from '../stores/pageBuilder.js';
import { pagesApi, type ComponentType, type PageMeta } from '../api/pages.js';
import { getComponentMeta } from '../constants/pageComponents.js';
import BuilderToolbar from '../components/page-builder/BuilderToolbar.js';
import ComponentPanel, { type PanelDragData } from '../components/page-builder/ComponentPanel.js';
import Canvas from '../components/page-builder/Canvas.js';
import PropertyPanel from '../components/page-builder/PropertyPanel.js';
import { type DropzoneData } from '../components/page-builder/ComponentRenderer.js';

const { Text } = Typography;

/**
 * 页面搭建器(三栏布局 + DndContext)。
 *
 * 路由:/app/:appId/pages/:pageId
 * 布局:工具栏(顶部)+ 组件面板(左 280px)+ 画布(中 flex)+ 属性面板(右 360px)
 * 全屏布局,撑满 calc(100vh - 56px)(StudioLayout Header)。
 */
export default function PageBuilder() {
  const { appId, pageId } = useParams<{ appId: string; pageId: string }>();

  const schema = usePageBuilderStore((s) => s.schema);
  const loadPage = usePageBuilderStore((s) => s.loadPage);
  const addComponent = usePageBuilderStore((s) => s.addComponent);

  const loadedPageIdRef = useRef<string | null>(null);

  /** 加载页面详情(含 Schema)。 */
  const { data: page, isLoading, isError } = useQuery({
    queryKey: ['page', pageId],
    queryFn: () => pagesApi.get(pageId as string),
    enabled: !!pageId,
    retry: 1,
  });

  /** 页面加载成功 → 写入 store(仅当 pageId 变化时)。 */
  useEffect(() => {
    if (page && page.id !== loadedPageIdRef.current) {
      loadedPageIdRef.current = page.id;
      loadPage(page);
    }
  }, [page, loadPage]);

  /** API 失败时使用默认 Schema 回退(便于无后端时开发调试)。 */
  useEffect(() => {
    if (isError && !loadedPageIdRef.current && pageId) {
      loadedPageIdRef.current = pageId;
      const fallbackPage: PageMeta = {
        id: pageId,
        appId: appId ?? '',
        name: '未命名页面',
        slug: 'untitled',
        type: 'custom',
        schema: createDefaultSchema('custom'),
        published: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      loadPage(fallbackPage);
    }
  }, [isError, pageId, appId, loadPage]);

  // —— DnD ——
  const [activeDrag, setActiveDrag] = useState<{ componentType: ComponentType } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as PanelDragData | undefined;
    if (data?.source === 'panel') {
      setActiveDrag({ componentType: data.componentType });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDrag(null);
    if (!over) return;

    const activeData = active.data.current as PanelDragData | undefined;
    const overData = over.data.current as DropzoneData | undefined;

    if (activeData?.source === 'panel' && overData?.source === 'dropzone') {
      addComponent(activeData.componentType, overData.parentId);
    }
  };

  const handleDragCancel = () => {
    setActiveDrag(null);
  };

  // —— 渲染 ——

  if (!pageId) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Text type="secondary">缺少页面 ID</Text>
      </div>
    );
  }

  if (isLoading && !schema) {
    return (
      <div style={{ padding: 24 }}>
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  return (
    <div
      style={{
        height: 'calc(100vh - 56px)',
        display: 'flex',
        flexDirection: 'column',
        background: '#f5f7fa',
      }}
    >
      <BuilderToolbar />
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <ComponentPanel />
          <Canvas />
          <PropertyPanel />
        </div>
        <DragOverlay>
          {activeDrag && <DragGhost componentType={activeDrag.componentType} />}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 拖拽预览(DragOverlay 内容)
// ---------------------------------------------------------------------------

function DragGhost({ componentType }: { componentType: ComponentType }) {
  const meta = getComponentMeta(componentType);
  const Icon = meta.icon;
  return (
    <div
      style={{
        width: 80,
        height: 64,
        border: '1px solid #1677ff',
        borderRadius: 8,
        background: '#fff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
        opacity: 0.9,
        cursor: 'grabbing',
      }}
    >
      <Icon style={{ fontSize: 22, color: '#1677ff' }} />
      <Text style={{ fontSize: 12, marginTop: 4 }}>{meta.label}</Text>
    </div>
  );
}
