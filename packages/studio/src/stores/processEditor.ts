/**
 * 流程编辑器状态管理 (Zustand)。
 *
 * 对齐 DESIGN-process.md §10.7。
 * 持有当前流程定义、WorkflowSchema、选中节点、撤销/重做栈。
 * 自动保存由编辑器组件在 schema 变化时防抖触发。
 */

import { create } from 'zustand';
import type { ProcessDef, WorkflowSchema, WorkflowNode } from '@apaas/shared';

/** 深拷贝(支持嵌套对象/数组,JSON-safe 场景足够)。 */
function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      /* fall through */
    }
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

interface ProcessEditorState {
  /** 当前流程定义 */
  processDef: ProcessDef | null;
  /** 当前 WorkflowSchema(编辑中,SSOT) */
  schema: WorkflowSchema | null;
  /** 选中节点 ID */
  selectedNodeId: string | null;
  /** 撤销栈 */
  past: WorkflowSchema[];
  /** 重做栈 */
  future: WorkflowSchema[];
  /** 脏标记(有未保存变更) */
  dirty: boolean;

  // —— actions ——
  /** 加载流程定义,初始化 schema */
  loadProcess: (def: ProcessDef) => void;
  /** 重置(离开编辑器时) */
  reset: () => void;
  /** 设置当前 schema(并 push 撤销栈) */
  setSchema: (schema: WorkflowSchema, opts?: { skipHistory?: boolean }) => void;
  /** 选中节点 */
  setSelectedNode: (nodeId: string | null) => void;
  /** 更新单个节点 data */
  updateNodeData: (nodeId: string, data: Record<string, unknown>) => void;
  /** 删除节点 */
  deleteNode: (nodeId: string) => void;
  /** 撤销 */
  undo: () => void;
  /** 重做 */
  redo: () => void;
  /** 标记已保存 */
  markSaved: () => void;
}

const initialState = {
  processDef: null,
  schema: null,
  selectedNodeId: null,
  past: [] as WorkflowSchema[],
  future: [] as WorkflowSchema[],
  dirty: false,
};

export const useProcessEditorStore = create<ProcessEditorState>((set, _get) => ({
  ...initialState,

  loadProcess: (def) =>
    set({
      processDef: def,
      schema: def.workflowSchema ?? { nodes: [], edges: [] },
      selectedNodeId: null,
      past: [],
      future: [],
      dirty: false,
    }),

  reset: () => set({ ...initialState }),

  setSchema: (schema, opts) =>
    set((state) => {
      const skipHistory = opts?.skipHistory ?? false;
      if (!state.schema) {
        return { schema, dirty: true };
      }
      return {
        schema,
        past: skipHistory ? state.past : [...state.past, deepClone(state.schema)].slice(-50),
        future: [],
        dirty: true,
      };
    }),

  setSelectedNode: (nodeId) => set({ selectedNodeId: nodeId }),

  updateNodeData: (nodeId, data) =>
    set((state) => {
      if (!state.schema) return {};
      const schema = deepClone(state.schema);
      // 递归搜索节点（含嵌套在 condition blocks 内的节点）
      let changed = false;
      const findAndUpdate = (nodes: WorkflowNode[]): boolean => {
        for (const n of nodes) {
          if (n.id === nodeId) {
            const merged = { ...n.data, ...data };
            // 评审 P1-1：内容无变化时不置脏、不推撤销栈
            //（挂载期 reconcile 会对条件节点做等值回写，此前每次都产生假脏 + 历史污染）
            if (JSON.stringify(merged) !== JSON.stringify(n.data)) {
              n.data = merged;
              changed = true;
            }
            return true;
          }
          if (n.blocks) {
            if (findAndUpdate(n.blocks)) return true;
          }
        }
        return false;
      };
      if (!findAndUpdate(schema.nodes)) return {}; // 未找到不覆盖
      if (!changed) return {};
      return {
        schema,
        past: [...state.past, deepClone(state.schema as WorkflowSchema)].slice(-50),
        future: [],
        dirty: true,
      };
    }),

  deleteNode: (nodeId) =>
    set((state) => {
      if (!state.schema) return {};
      const schema = deepClone(state.schema);
      schema.nodes = schema.nodes.filter((n) => n.id !== nodeId);
      schema.edges = schema.edges.filter(
        (e) => e.sourceNodeID !== nodeId && e.targetNodeID !== nodeId,
      );
      return {
        schema,
        past: [...state.past, deepClone(state.schema as WorkflowSchema)].slice(-50),
        future: [],
        selectedNodeId: state.selectedNodeId === nodeId ? null : state.selectedNodeId,
        dirty: true,
      };
    }),

  undo: () =>
    set((state) => {
      if (!state.past.length) return {};
      const previous = state.past[state.past.length - 1] as WorkflowSchema;
      const newPast = state.past.slice(0, -1);
      return {
        schema: previous,
        past: newPast,
        future: state.schema
          ? [deepClone(state.schema), ...state.future].slice(0, 50)
          : state.future,
        dirty: true,
      };
    }),

  redo: () =>
    set((state) => {
      if (!state.future.length || !state.schema) return {};
      const next = state.future[0] as WorkflowSchema;
      const newFuture = state.future.slice(1);
      return {
        schema: next,
        past: [...state.past, deepClone(state.schema)].slice(-50),
        future: newFuture,
        dirty: true,
      };
    }),

  markSaved: () => set({ dirty: false }),
}));
