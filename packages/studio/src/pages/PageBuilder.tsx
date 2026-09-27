import { useEffect, useRef, useState } from 'react';
import { Button, Skeleton, Typography } from 'antd';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { qk } from '@apaas/shared/stores';
import { usePageBuilderStore } from '../stores/pageBuilder.js';
import { pagesApi, type ComponentType } from '../api/pages.js';
import { getComponentMeta } from '../constants/pageComponents.js';
import BuilderToolbar from '../components/page-builder/BuilderToolbar.js';
import LeftPanel from '../components/page-builder/LeftPanel.js';
import type { PanelDragData } from '../components/page-builder/ComponentPanel.js';
import Canvas from '../components/page-builder/Canvas.js';
import PropertyPanel from '../components/page-builder/PropertyPanel.js';
import ViewModelPanel from '../components/page-builder/ViewModelPanel.js';
import BottomPanel from '../components/page-builder/BottomPanel.js';
import {
  type DropzoneData,
  type CanvasNodeDragData,
} from '../components/page-builder/ComponentRenderer.js';
import type { CompositePanelDragData } from '../components/page-builder/ComponentPanel.js';

const { Text } = Typography;

/**
 * 页面设计器(三栏布局 + DndContext) — 对齐飞书 aPaaS v3 搭建器布局。
 *
 * 路由:/app/:appId/pages/:pageId
 * 布局:顶栏 + 组件面板(左 280px,组件/大纲树页签)+ 画布(中 flex,960px 页面卡)
 *      + 属性面板(右 360px,单列分组)
 */
export default function PageBuilder() {
  const { pageId } = useParams<{ appId: string; pageId: string }>();

  const schema = usePageBuilderStore((s) => s.schema);
  const loadPage = usePageBuilderStore((s) => s.loadPage);
  const addComponent = usePageBuilderStore((s) => s.addComponent);
  const reorderSibling = usePageBuilderStore((s) => s.reorderSibling);
  const insertSubtree = usePageBuilderStore((s) => s.insertSubtree);

  const loadedPageIdRef = useRef<string | null>(null);

  /** 加载页面详情(含 Schema)。 */
  const {
    data: page,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: qk.page(pageId!),
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

  // 评审 P1-2：此前 API 失败会静默回退到空 Schema，用户随后"保存/发布"
  // 会用伪造的空页面覆盖真实已发布页面（数据覆盖事故路径）。
  // 现在改为显式错误态 + 重试，绝不写入来源不明的 Schema。

  // —— DnD ——
  const [activeDrag, setActiveDrag] = useState<{ componentType: ComponentType } | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as PanelDragData | undefined;
    if (data?.source === 'panel') {
      setActiveDrag({ componentType: data.componentType });
    }
  };

  /** 画布内节点拖拽时只与同级节点碰撞（容器放置区会因面积大抢走最近命中）。 */
  const collisionDetection: CollisionDetection = (args) => {
    const activeData = args.active.data.current as CanvasNodeDragData | undefined;
    if (activeData?.source === 'canvas-node') {
      return closestCenter({
        ...args,
        droppableContainers: args.droppableContainers.filter(
          (c) => c.data.current?.source === 'canvas-node',
        ),
      });
    }
    return closestCenter(args);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDrag(null);
    if (!over) return;

    const activeData = active.data.current as
      PanelDragData | CanvasNodeDragData | CompositePanelDragData | undefined;
    const overData = over.data.current as DropzoneData | CanvasNodeDragData | undefined;

    // 物料面板 → 画布放置区：新增组件
    if (activeData?.source === 'panel' && overData?.source === 'dropzone') {
      addComponent(activeData.componentType, overData.parentId);
      return;
    }

    // 复合组件 → 画布放置区：插入子树
    if (activeData?.source === 'panel-composite' && overData?.source === 'dropzone') {
      insertSubtree(overData.parentId, activeData.node);
      return;
    }

    // 画布内节点 → 同层节点：同父排序（store 内校验同父）
    if (activeData?.source === 'canvas-node' && overData?.source === 'canvas-node') {
      reorderSibling(activeData.node.id, overData.node.id);
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

  // 评审 P1-2：加载失败必须显式暴露，禁止静默降级为空页面
  if (isError) {
    return (
      <div style={{ padding: 48, textAlign: 'center' }}>
        <Text type="danger" style={{ display: 'block', marginBottom: 12 }}>
          页面加载失败，为避免覆盖线上内容，编辑器已停止加载。
        </Text>
        <Button onClick={() => void refetch()}>重新加载</Button>
      </div>
    );
  }

  return (
    <div
      style={{
        height: 'calc(100vh - 56px)',
        display: 'flex',
        flexDirection: 'column',
        background: '#eff1f3',
      }}
    >
      <BuilderToolbar />
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <LeftPanel />
          <Canvas />
          <PropertyPanel />
        </div>
        <DragOverlay>
          {activeDrag && <DragGhost componentType={activeDrag.componentType} />}
        </DragOverlay>
      </DndContext>
      <BottomPanel />
      <ViewModelPanel />
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
