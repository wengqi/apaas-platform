import { useEffect, useRef, useState } from 'react';
import { Button, Skeleton, Typography } from 'antd';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  pointerWithin,
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
import { findParent, findNode } from '../stores/page-builder/utils.js';
import { pagesApi, type ComponentType } from '../api/pages.js';
import { getComponentMeta } from '../constants/pageComponents.js';
import BuilderToolbar from '../components/page-builder/BuilderToolbar.js';
import LeftPanel from '../components/page-builder/LeftPanel.js';
import type { PanelDragData } from '../components/page-builder/ComponentPanel.js';
import Canvas from '../components/page-builder/Canvas.js';
import PropertyPanel from '../components/page-builder/PropertyPanel.js';
import ViewModelPanel from '../components/page-builder/ViewModelPanel.js';
import BottomPanel from '../components/page-builder/BottomPanel.js';
import { isTextEntryTarget, matchShortcut } from '../utils/designer-shortcuts.js';
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
  const moveComponent = usePageBuilderStore((s) => s.moveComponent);

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

  // 快捷键（批次D）：Delete 删除选中 / Ctrl(Cmd)+Z 撤销 / Ctrl(Cmd)+Y 或 +Shift+Z 重做。
  // 文本输入中的按键不拦截（isTextEntryTarget）；仅编辑模式生效。
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const shortcut = matchShortcut(e);
      if (!shortcut || isTextEntryTarget(e.target)) return;
      const st = usePageBuilderStore.getState();
      if (st.mode !== 'edit') return;
      if (shortcut === 'undo') {
        if (st.past.length > 0) {
          e.preventDefault();
          st.undo();
        }
      } else if (shortcut === 'redo') {
        if (st.future.length > 0) {
          e.preventDefault();
          st.redo();
        }
      } else if (
        shortcut === 'delete' &&
        st.selectedNodeId &&
        st.selectedNodeId !== st.schema?.root.id
      ) {
        e.preventDefault();
        st.removeComponent(st.selectedNodeId);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

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

  /** 画布内节点拖拽的碰撞策略（E2-3 跨容器）：
   * 候选 = 画布节点 + 容器放置区并集；节点命中优先（放置区包裹子节点、面积大易抢命中）；
   * 仅放置区命中时取面积最小的最内层容器——若它就是当前父容器，回退「仅同级节点最近中心」
   * 维持原同层排序手感，否则为跨容器放置（移动到该容器末尾）。 */
  const collisionDetection: CollisionDetection = (args) => {
    const activeData = args.active.data.current as CanvasNodeDragData | undefined;
    if (activeData?.source !== 'canvas-node') return closestCenter(args);

    const candidates = args.droppableContainers.filter((c) => {
      const src = c.data.current?.source;
      return src === 'canvas-node' || src === 'dropzone';
    });
    const nodeOnly = candidates.filter((c) => c.data.current?.source === 'canvas-node');
    const within = pointerWithin({ ...args, droppableContainers: candidates });
    const nodeHits = within.filter(
      (c) => c.data?.droppableContainer.data.current?.source === 'canvas-node',
    );
    if (nodeHits.length > 0) return nodeHits;

    const zoneHits = within.filter(
      (c) => c.data?.droppableContainer.data.current?.source === 'dropzone',
    );
    if (zoneHits.length > 0) {
      const areaOf = (c: (typeof zoneHits)[number]) => {
        const rect = c.data?.droppableContainer.rect.current;
        return rect ? rect.width * rect.height : Number.MAX_SAFE_INTEGER;
      };
      const innermost = zoneHits.reduce((best, cur) => (areaOf(cur) < areaOf(best) ? cur : best));
      const innerParentId = String(innermost.id).startsWith('dropzone-')
        ? String(innermost.id).slice('dropzone-'.length)
        : null;
      const activeParentId = activeParentOf(activeData.node.id);
      if (innerParentId === activeParentId) {
        return closestCenter({ ...args, droppableContainers: nodeOnly });
      }
      return [innermost];
    }
    return closestCenter({ ...args, droppableContainers: nodeOnly });
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

    // 画布内节点 → 同层节点：同父排序；跨父则按飞书语义——目标是容器节点时
    // 放入该容器末尾，普通节点则移动至其父容器中该节点之前
    if (activeData?.source === 'canvas-node' && overData?.source === 'canvas-node') {
      const st = usePageBuilderStore.getState();
      if (!st.schema) return;
      const activeParent = findParent(st.schema.root, activeData.node.id);
      const overParent = findParent(st.schema.root, overData.node.id);
      if (!activeParent || !overParent) return;
      if (activeParent.id === overParent.id) {
        reorderSibling(activeData.node.id, overData.node.id);
      } else if (getComponentMeta(overData.node.type).isContainer) {
        moveComponent(activeData.node.id, overData.node.id, 0);
      } else {
        const idx = (overParent.children ?? []).findIndex((c) => c.id === overData.node.id);
        moveComponent(activeData.node.id, overParent.id, idx === -1 ? 0 : idx);
      }
      return;
    }

    // 画布内节点 → 容器放置区：移动至该容器末尾（空容器承接 + 跨容器追加）
    if (activeData?.source === 'canvas-node' && overData?.source === 'dropzone') {
      const st = usePageBuilderStore.getState();
      if (!st.schema) return;
      const parent = findNode(st.schema.root, overData.parentId);
      moveComponent(activeData.node.id, overData.parentId, parent?.children?.length ?? 0);
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
// 拖拽辅助
// ---------------------------------------------------------------------------

/** 查询节点当前父容器 id（碰撞策略判定同层/跨容器用）。 */
function activeParentOf(nodeId: string): string | null {
  const schema = usePageBuilderStore.getState().schema;
  if (!schema) return null;
  return findParent(schema.root, nodeId)?.id ?? null;
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
