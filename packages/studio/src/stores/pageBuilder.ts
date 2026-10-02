/**
 * 页面搭建器 Zustand Store —— 组件树编辑 / 视图模型 / 撤销重做。
 *
 * 拆分说明（AGENTS.md 单文件 400 行规范）：
 * - 纯工具（快照 / ID 生成 / 树操作 / Schema 工厂）位于 ./page-builder/utils.js
 * - 状态与动作类型位于 ./page-builder/types.js
 * 本文件保持原有导出面（usePageBuilderStore + createDefaultSchema）不变。
 */

import { create } from 'zustand';
import type { ComponentProps, PageSchema } from '../api/pages.js';
import { COMPONENT_META } from '../constants/pageComponents.js';
import type { PageBuilderState } from './page-builder/types.js';
import {
  cloneSchema,
  createComponentNode,
  createDefaultSchema,
  deepCloneWithNewIds,
  findNode,
  findParent,
  isAncestorOf,
  pushHistory,
  snapshotOf,
} from './page-builder/utils.js';

export { createDefaultSchema } from './page-builder/utils.js';

// ---------------------------------------------------------------------------
// Store 实现
// ---------------------------------------------------------------------------

export const usePageBuilderStore = create<PageBuilderState>((set, get) => ({
  currentPage: null,
  schema: null,
  selectedNodeId: null,
  mode: 'edit',
  vmPanelOpen: false,
  formGeneratorNodeId: null,
  canvasZoom: 1,
  canvasWidth: null,
  past: [],
  future: [],
  savedSnapshot: null,

  // —— 页面级动作 ——

  loadPage: (page) => {
    // 评审整改：API 创建的页面可能带空 schema（{}），缺 root 时直接使用会
    // 让 Canvas 读取 schema.root.children 崩溃（整页白屏）。此处规范化。
    const incoming = page.schema as PageSchema | undefined;
    const schema = incoming?.root ? incoming : createDefaultSchema(page.type);
    set({
      currentPage: page,
      schema,
      selectedNodeId: null,
      mode: 'edit',
      past: [],
      future: [],
    });
    // 评审 P2-5：加载完成即记录快照
    set({ savedSnapshot: snapshotOf(get()) });
  },

  markSaved: () =>
    set((state) => ({
      savedSnapshot: snapshotOf(state),
    })),
  isDirty: () => {
    const state = get();
    if (!state.savedSnapshot || !state.currentPage) return false;
    return snapshotOf(state) !== state.savedSnapshot;
  },
  loadSchema: (schema) => {
    set({
      schema,
      selectedNodeId: null,
      past: [],
      future: [],
    });
  },

  getSchema: () => get().schema,

  patchSchema: (partial) => {
    const state = get();
    if (!state.schema) return;
    const past = pushHistory(state.past, state.schema);
    const schema = cloneSchema(state.schema);
    set({ schema: { ...schema, ...partial }, past, future: [] });
  },

  updatePageMeta: (updates) => {
    const state = get();
    if (!state.currentPage) return;
    set({ currentPage: { ...state.currentPage, ...updates } });
  },

  // —— 组件树动作 ——

  addComponent: (type, parentId, index) => {
    const state = get();
    if (!state.schema) return null;

    const past = pushHistory(state.past, state.schema);
    const schema = cloneSchema(state.schema);
    const parent = findNode(schema.root, parentId);
    if (!parent) return null;

    // 非容器组件不可添加子节点
    if (!parent.children && !COMPONENT_META[parent.type]?.isContainer) return null;

    const newNode = createComponentNode(type);
    if (!parent.children) parent.children = [];

    if (index === undefined || index < 0 || index > parent.children.length) {
      parent.children.push(newNode);
    } else {
      parent.children.splice(index, 0, newNode);
    }

    set({ schema, past, future: [], selectedNodeId: newNode.id });
    return newNode.id;
  },

  moveComponent: (id, newParentId, newIndex) => {
    const state = get();
    if (!state.schema) return;

    // 防止将节点移动到自身或其后代中
    if (id === newParentId || isAncestorOf(state.schema.root, id, newParentId)) return;

    const past = pushHistory(state.past, state.schema);
    const schema = cloneSchema(state.schema);

    const oldParent = findParent(schema.root, id);
    const newParent = findNode(schema.root, newParentId);
    if (!oldParent || !newParent || !oldParent.children) {
      set({ past });
      return;
    }

    // 新父节点必须是容器
    if (!COMPONENT_META[newParent.type]?.isContainer) {
      set({ past });
      return;
    }

    const oldIndex = oldParent.children.findIndex((c) => c.id === id);
    if (oldIndex === -1) {
      set({ past });
      return;
    }

    // 从旧位置移除
    const removed = oldParent.children.splice(oldIndex, 1);
    const moved = removed[0];
    if (!moved) {
      set({ past });
      return;
    }

    // 如果在同一父节点内且 oldIndex < newIndex,需要补偿索引
    let targetIndex = newIndex;
    if (oldParent.id === newParent.id && oldIndex < newIndex) {
      targetIndex = newIndex - 1;
    }

    if (!newParent.children) newParent.children = [];
    targetIndex = Math.max(0, Math.min(targetIndex, newParent.children.length));
    newParent.children.splice(targetIndex, 0, moved);

    set({ schema, past, future: [] });
  },

  reorderSibling: (activeId, overId) => {
    const state = get();
    if (!state.schema || activeId === overId) return;

    const schema = cloneSchema(state.schema);
    const parent = findParent(schema.root, activeId);
    const overParent = findParent(schema.root, overId);
    // 仅支持同父节点内排序（跨容器拖拽暂不支持）
    if (!parent || !overParent || parent.id !== overParent.id || !parent.children) return;

    const fromIndex = parent.children.findIndex((c) => c.id === activeId);
    const toIndex = parent.children.findIndex((c) => c.id === overId);
    if (fromIndex === -1 || toIndex === -1) return;

    const past = pushHistory(state.past, state.schema);
    const [moved] = parent.children.splice(fromIndex, 1);
    if (!moved) {
      set({ past });
      return;
    }
    parent.children.splice(toIndex, 0, moved);
    set({ schema, past, future: [] });
  },

  replaceChildren: (parentId, children) => {
    const state = get();
    if (!state.schema) return;

    const schema = cloneSchema(state.schema);
    const parent = findNode(schema.root, parentId);
    if (!parent) return;

    const past = pushHistory(state.past, state.schema);
    parent.children = children.map((child) => structuredClone(child));
    set({ schema, past, future: [], selectedNodeId: parentId });
  },

  insertSubtree: (parentId, node) => {
    const state = get();
    if (!state.schema) return null;

    const past = pushHistory(state.past, state.schema);
    const schema = cloneSchema(state.schema);
    const parent = findNode(schema.root, parentId);
    if (!parent) {
      set({ past });
      return null;
    }
    if (!parent.children && !COMPONENT_META[parent.type]?.isContainer) {
      set({ past });
      return null;
    }

    const newNode = deepCloneWithNewIds(node);
    if (!parent.children) parent.children = [];
    parent.children.push(newNode);
    set({ schema, past, future: [], selectedNodeId: newNode.id });
    return newNode.id;
  },

  removeComponent: (id) => {
    const state = get();
    if (!state.schema) return;

    // 根节点不可删除
    if (state.schema.root.id === id) return;

    const past = pushHistory(state.past, state.schema);
    const schema = cloneSchema(state.schema);
    const parent = findParent(schema.root, id);
    if (!parent || !parent.children) {
      set({ past });
      return;
    }

    parent.children = parent.children.filter((c) => c.id !== id);

    set({
      schema,
      past,
      future: [],
      selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
    });
  },

  duplicateNode: (id) => {
    const state = get();
    if (!state.schema) return;

    // 根节点不可复制
    if (state.schema.root.id === id) return;

    const past = pushHistory(state.past, state.schema);
    const schema = cloneSchema(state.schema);
    const parent = findParent(schema.root, id);
    if (!parent || !parent.children) {
      set({ past });
      return;
    }

    const index = parent.children.findIndex((c) => c.id === id);
    if (index === -1) {
      set({ past });
      return;
    }

    const original = parent.children[index];
    if (!original) {
      set({ past });
      return;
    }

    const clone = deepCloneWithNewIds(original);
    parent.children.splice(index + 1, 0, clone);

    set({ schema, past, future: [], selectedNodeId: clone.id });
  },

  updateComponentProps: (id, props) => {
    const state = get();
    if (!state.schema) return;

    const past = pushHistory(state.past, state.schema);
    const schema = cloneSchema(state.schema);
    const node = findNode(schema.root, id);
    if (!node) {
      set({ past });
      return;
    }

    node.props = { ...node.props, ...props } as ComponentProps;
    set({ schema, past, future: [] });
  },

  updateNode: (id, updates) => {
    const state = get();
    if (!state.schema) return;

    const past = pushHistory(state.past, state.schema);
    const schema = cloneSchema(state.schema);
    const node = findNode(schema.root, id);
    if (!node) {
      set({ past });
      return;
    }

    if (updates.name !== undefined) node.name = updates.name;
    if (updates.hidden !== undefined) node.hidden = updates.hidden;
    set({ schema, past, future: [] });
  },

  // —— 视图模型动作 ——

  addVariable: (key, def) => {
    const state = get();
    if (!state.schema) return;
    if (key in state.schema.viewModel.variables) return;

    const past = pushHistory(state.past, state.schema);
    const schema = cloneSchema(state.schema);
    schema.viewModel.variables[key] = def;
    set({ schema, past, future: [] });
  },

  ensureRecordVariable: (objectId) => {
    const state = get();
    if (!state.schema) return;

    const existing = state.schema.viewModel.variables.record;
    if (existing?.datasource?.objectId === objectId) return;

    const past = pushHistory(state.past, state.schema);
    const schema = cloneSchema(state.schema);
    schema.viewModel.variables.record = {
      type: 'record',
      initialValue: existing?.initialValue ?? {},
      datasource: { objectId, autoQuery: false },
    };
    set({ schema, past, future: [] });
  },

  removeVariable: (key) => {
    const state = get();
    if (!state.schema) return;
    if (!(key in state.schema.viewModel.variables)) return;

    const past = pushHistory(state.past, state.schema);
    const schema = cloneSchema(state.schema);
    delete schema.viewModel.variables[key];
    set({ schema, past, future: [] });
  },

  updateVariable: (oldKey, newKey, def) => {
    const state = get();
    if (!state.schema) return;
    if (!(oldKey in state.schema.viewModel.variables)) return;

    const past = pushHistory(state.past, state.schema);
    const schema = cloneSchema(state.schema);
    const variables = schema.viewModel.variables;
    // 重命名:删除旧 key,写入新 key
    delete variables[oldKey];
    variables[newKey] = def;
    set({ schema, past, future: [] });
  },

  updateViewModel: (updater) => {
    const state = get();
    if (!state.schema) return;

    const past = pushHistory(state.past, state.schema);
    const schema = cloneSchema(state.schema);
    updater(schema.viewModel);
    set({ schema, past, future: [] });
  },

  // —— 选择 / 模式 ——

  selectNode: (id) => set({ selectedNodeId: id }),

  setMode: (mode) => set({ mode }),

  setVmPanelOpen: (open) => set({ vmPanelOpen: open }),

  setFormGeneratorNodeId: (id) => set({ formGeneratorNodeId: id }),

  setCanvasZoom: (zoom) => set({ canvasZoom: zoom }),
  setCanvasWidth: (width) => set({ canvasWidth: width }),

  // —— 历史 ——

  undo: () => {
    const state = get();
    if (!state.schema || state.past.length === 0) return;

    const previous = state.past[state.past.length - 1];
    if (!previous) return;

    const newPast = state.past.slice(0, -1);
    const newFuture = [cloneSchema(state.schema), ...state.future];

    set({
      schema: previous,
      past: newPast,
      future: newFuture,
      selectedNodeId: null,
    });
  },

  redo: () => {
    const state = get();
    if (!state.schema || state.future.length === 0) return;

    const next = state.future[0];
    if (!next) return;

    const newFuture = state.future.slice(1);
    const newPast = pushHistory(state.past, state.schema);

    set({
      schema: next,
      past: newPast,
      future: newFuture,
      selectedNodeId: null,
    });
  },
}));

// e2e 调试钩子：测试通过 window 句柄读取 store 真实状态（只读），
// 规避 UI 时序竞态（R1.7 代码页签写回测试用）
(window as unknown as Record<string, unknown>).__pageBuilderDebug = {
  get schema() {
    return usePageBuilderStore.getState().schema as unknown as { globalCss?: string };
  },
};
