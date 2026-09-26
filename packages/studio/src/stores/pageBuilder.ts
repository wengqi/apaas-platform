import { create } from 'zustand';
import type {
  ComponentNode,
  ComponentProps,
  ComponentType,
  PageMeta,
  PageSchema,
  PageType,
  VariableDef,
  ViewModel,
} from '../api/pages.js';
import { COMPONENT_META } from '../constants/pageComponents.js';

/** 评审 P2-5：当前可保存内容的快照（schema + 可保存元数据） */
function snapshotOf(state: { schema: PageSchema | null; currentPage: PageMeta | null }): string {
  return JSON.stringify({
    schema: state.schema,
    name: state.currentPage?.name ?? null,
    apiName: state.currentPage?.apiName ?? null,
    type: state.currentPage?.type ?? null,
    objectId: state.currentPage?.objectId ?? null,
  });
}

// ---------------------------------------------------------------------------
// 辅助函数:ID 生成 / 深拷贝 / 树操作
// ---------------------------------------------------------------------------

/** 生成组件节点唯一 ID。 */
function generateNodeId(type: ComponentType): string {
  return `${type}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 深拷贝 Schema(用于历史栈快照)。 */
function cloneSchema(schema: PageSchema): PageSchema {
  return structuredClone(schema);
}

/** 历史栈上限 — 防止长编辑会话内存无限增长（与 processEditor 一致）。 */
const MAX_HISTORY = 50;

/** 推入历史栈（带上限截断）。 */
function pushHistory(past: PageSchema[], schema: PageSchema): PageSchema[] {
  return [...past, cloneSchema(schema)].slice(-MAX_HISTORY);
}

/** 创建一个新的组件节点(根据类型元数据填充默认值)。 */
function createComponentNode(type: ComponentType): ComponentNode {
  const meta = COMPONENT_META[type];
  return {
    id: generateNodeId(type),
    type,
    name: meta.label,
    props: { ...meta.defaultProps } as ComponentProps,
    children: meta.isContainer ? [] : undefined,
  };
}

/** 在树中按 ID 查找节点(递归)。 */
function findNode(node: ComponentNode, id: string): ComponentNode | undefined {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** 在树中查找节点的父节点(递归)。 */
function findParent(node: ComponentNode, id: string): ComponentNode | undefined {
  if (node.children) {
    for (const child of node.children) {
      if (child.id === id) return node;
      const found = findParent(child, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** 检查 ancestorId 是否是 descendantId 的祖先(用于循环检测)。 */
function isAncestorOf(node: ComponentNode, ancestorId: string, descendantId: string): boolean {
  if (node.id === ancestorId) {
    return containsId(node, descendantId);
  }
  if (node.children) {
    for (const child of node.children) {
      if (isAncestorOf(child, ancestorId, descendantId)) return true;
    }
  }
  return false;
}

/** 检查 node 的子树中是否包含指定 ID。 */
function containsId(node: ComponentNode, id: string): boolean {
  if (node.id === id) return true;
  if (node.children) {
    for (const child of node.children) {
      if (containsId(child, id)) return true;
    }
  }
  return false;
}

/** 深拷贝节点(递归),并为所有节点重新生成 ID。 */
function deepCloneWithNewIds(node: ComponentNode): ComponentNode {
  return {
    ...node,
    id: generateNodeId(node.type),
    props: { ...node.props },
    children: node.children?.map((child) => deepCloneWithNewIds(child)),
  };
}

// ---------------------------------------------------------------------------
// Schema 工厂
// ---------------------------------------------------------------------------

/** 创建默认空页面 Schema(仅含根 Page 节点)。 */
export function createDefaultSchema(pageType: PageType): PageSchema {
  return {
    version: '1',
    pageType,
    viewModel: { variables: {} },
    root: {
      id: generateNodeId('page'),
      type: 'page',
      name: '页面',
      props: {},
      children: [],
    },
  };
}

// ---------------------------------------------------------------------------
// Store 类型
// ---------------------------------------------------------------------------

interface PageBuilderState {
  /** 评审 P2-5：已保存快照（schema+元数据 JSON），用于派生脏标记 */
  savedSnapshot: string | null;
  /** 评审 P2-5：当前内容是否与已保存快照一致 */
  isDirty: () => boolean;
  /** 当前编辑的页面元数据 */
  currentPage: PageMeta | null;
  /** 当前页面 Schema(工作副本) */
  schema: PageSchema | null;
  /** 选中的组件节点 ID */
  selectedNodeId: string | null;
  /** 编辑 / 预览模式 */
  mode: 'edit' | 'preview';
  /** 视图模型面板是否展开 */
  vmPanelOpen: boolean;
  /** 撤销栈 */
  past: PageSchema[];
  /** 重做栈 */
  future: PageSchema[];

  // —— 页面级动作 ——
  /** 加载页面(设置 currentPage + schema,重置历史) */
  loadPage: (page: PageMeta) => void;
  /** 加载 Schema(重置历史) */
  loadSchema: (schema: PageSchema) => void;
  /** 评审 P2-5：保存/加载成功后刷新快照 */
  markSaved: () => void;
  /** 获取当前 Schema(命令式,用于保存) */
  getSchema: () => PageSchema | null;
  /** 更新页面元数据(名称/apiName/类型等) */
  updatePageMeta: (
    updates: Partial<Pick<PageMeta, 'name' | 'apiName' | 'type' | 'objectId' | 'published'>>,
  ) => void;

  // —— 组件树动作 ——
  /** 添加组件到指定父节点的 children */
  addComponent: (type: ComponentType, parentId: string, index?: number) => string | null;
  /** 移动组件到新的父节点和位置 */
  moveComponent: (id: string, newParentId: string, newIndex: number) => void;
  /** 删除组件 */
  removeComponent: (id: string) => void;
  /** 复制组件(同层级,新 ID) */
  duplicateNode: (id: string) => void;
  /** 更新组件 props(浅合并) */
  updateComponentProps: (id: string, props: Record<string, unknown>) => void;
  /** 更新节点顶层字段(name/hidden) */
  updateNode: (id: string, updates: Partial<Pick<ComponentNode, 'name' | 'hidden'>>) => void;

  // —— 视图模型动作 ——
  /** 添加视图模型变量(key 冲突时忽略) */
  addVariable: (key: string, def: VariableDef) => void;
  /** 删除视图模型变量 */
  removeVariable: (key: string) => void;
  /** 更新视图模型变量(可重命名 key) */
  updateVariable: (oldKey: string, newKey: string, def: VariableDef) => void;
  /** 通用视图模型更新(接受 mutator 直接修改副本) */
  updateViewModel: (updater: (vm: ViewModel) => void) => void;

  // —— 选择 / 模式 ——
  /** 选中组件(传 null 取消选中) */
  selectNode: (id: string | null) => void;
  /** 切换编辑/预览模式 */
  setMode: (mode: 'edit' | 'preview') => void;
  /** 切换视图模型面板展开 */
  setVmPanelOpen: (open: boolean) => void;

  // —— 历史 ——
  /** 撤销 */
  undo: () => void;
  /** 重做 */
  redo: () => void;
}

// ---------------------------------------------------------------------------
// Store 实现
// ---------------------------------------------------------------------------

export const usePageBuilderStore = create<PageBuilderState>((set, get) => ({
  currentPage: null,
  schema: null,
  selectedNodeId: null,
  mode: 'edit',
  vmPanelOpen: false,
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
