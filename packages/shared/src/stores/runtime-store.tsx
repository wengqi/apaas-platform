/**
 * 运行时状态管理 — 基于 Zustand scoped store 的跨包共享实现。
 *
 * 替代原 Context + useState 的模式，解决：
 *   1. Context 值变化导致所有消费组件重渲染（无选择性订阅）
 *   2. 两包重复 285 行代码
 *   3. action-executor 分叉
 *
 * 架构：
 *   - createStore() 创建独立 store 实例（每次页面挂载一个，非全局单例）
 *   - Context 仅传递 store 引用（不传状态值，避免重渲染）
 *   - useStore(selector) 精确订阅
 *   - API 调用通过 RuntimeStoreAdapter 注入（studio/runtime-ui 各自实现）
 */

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createStore, useStore, type StoreApi } from 'zustand';
import type { ActionConfig, ViewModel } from './types.js';
import {
  executeAction as runAction,
  executeActionChain,
  type ActionContext,
  type RuntimeStoreAdapter,
} from './action-executor.js';

// ---------------------------------------------------------------------------
// State 类型
// ---------------------------------------------------------------------------

/** 运行时状态：视图模型变量 + 变量读写 + 数据查询 + 动作执行。 */
export interface RuntimeState {
  /** 视图模型变量值（运行时状态树）。 */
  vm: Record<string, unknown>;
  /** 设置变量（支持 'vm.x.y' / 'x.y' 路径，不可变更新）。 */
  setVariable: (path: string, value: unknown) => void;
  /** 按变量名查询数据源，结果写入 vm[variableName]。 */
  queryData: (variableName: string) => Promise<void>;
  /** 执行单个事件动作。 */
  executeAction: (action: ActionConfig) => Promise<void>;
  /** 执行动作链（串行 / condition / confirm 中断）。 */
  executeActions: (actions: ActionConfig[]) => Promise<void>;
}

// ---------------------------------------------------------------------------
// ViewModel 初始化工具
// ---------------------------------------------------------------------------

/** 判断 PropValue 是否为普通对象字面量（非绑定/表达式/动作/数组）。 */
function isPlainObjectLiteral(v: unknown): v is Record<string, unknown> {
  return (
    !!v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    !('__bind' in v) &&
    !('__expr' in v) &&
    !('__action' in v)
  );
}

/** 根据 ViewModel 定义初始化 vm 状态（应用 initialValue / 空结构）。 */
export function initVm(viewModel: ViewModel): Record<string, unknown> {
  const vm: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(viewModel.variables)) {
    switch (def.type) {
      case 'record_list':
        vm[key] = { records: [], total: 0, page: 1, pageSize: 50 };
        break;
      case 'record':
        vm[key] = isPlainObjectLiteral(def.initialValue) ? { ...def.initialValue } : {};
        break;
      case 'array':
        vm[key] = Array.isArray(def.initialValue) ? [...def.initialValue] : [];
        break;
      case 'scalar':
      case 'object':
      default:
        vm[key] =
          def.initialValue !== undefined && def.initialValue !== null ? def.initialValue : null;
        break;
    }
  }
  return vm;
}

// ---------------------------------------------------------------------------
// 路径写入（不可变）
// ---------------------------------------------------------------------------

/** 去除路径前缀 'vm.'。 */
function stripVmPrefix(path: string): string {
  return path.startsWith('vm.') ? path.slice(3) : path;
}

/** 不可变地按路径写入值，返回新的 vm 对象。 */
function setByPath(
  prev: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const next = structuredClone(prev);
  const parts = stripVmPrefix(path).split('.');
  if (parts.length === 1) {
    next[parts[0] as string] = value;
    return next;
  }
  let cur: Record<string, unknown> = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i] as string;
    if (cur[k] == null || typeof cur[k] !== 'object') {
      cur[k] = {};
    }
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1] as string] = value;
  return next;
}

// ---------------------------------------------------------------------------
// No-op store（编辑模式 / Provider 未挂载时使用）
// ---------------------------------------------------------------------------

const noop = (): void => {
  /* 编辑模式不执行运行时动作 */
};

const noopAsync = async (): Promise<void> => {
  /* 编辑模式不执行运行时动作 */
};

/** 静态 no-op store，编辑模式安全。 */
const noopStore: StoreApi<RuntimeState> = createStore<RuntimeState>(() => ({
  vm: {},
  setVariable: noop,
  queryData: noopAsync,
  executeAction: noopAsync,
  executeActions: noopAsync,
}));

// ---------------------------------------------------------------------------
// Context（仅传递 store 引用）
// ---------------------------------------------------------------------------

const RuntimeStoreContext = createContext<StoreApi<RuntimeState> | null>(null);

// ---------------------------------------------------------------------------
// Store 工厂
// ---------------------------------------------------------------------------

/**
 * 创建运行时 store 实例。
 *
 * @param viewModel 页面视图模型定义
 * @param adapter API 适配器（由各包注入，含 navigate 方法）
 * @param objectId 当前关联对象 ID
 */
export function createRuntimeStore(
  viewModel: ViewModel,
  adapter: RuntimeStoreAdapter,
  objectId: string | undefined,
): StoreApi<RuntimeState> {
  return createStore<RuntimeState>((set, get) => ({
    vm: initVm(viewModel),

    setVariable: (path, value) => set((state) => ({ vm: setByPath(state.vm, path, value) })),

    queryData: async (variableName) => {
      const def = viewModel.variables[variableName];
      if (!def?.datasource) return;
      const objId = def.datasource.objectId || objectId;
      if (!objId) return;
      try {
        const res = await adapter.queryRecords(objId, { page: 1, pageSize: 50 });
        const records = res.items.map((r) => ({ id: r.id, ...r.data }));
        if (def.type === 'record_list') {
          get().setVariable(`vm.${variableName}`, {
            records,
            total: res.total,
            page: res.page,
            pageSize: res.pageSize,
          });
        } else if (def.type === 'record') {
          get().setVariable(`vm.${variableName}`, records[0] ?? null);
        }
      } catch (err) {
        console.error('[RuntimeStore] queryData failed:', err);
      }
    },

    executeAction: async (action) => {
      const state = get();
      const ctx: ActionContext = {
        vm: state.vm,
        setVariable: state.setVariable,
        objectId,
      };
      await runAction(action, ctx, adapter);
    },

    executeActions: async (actions) => {
      const state = get();
      const ctx: ActionContext = {
        vm: state.vm,
        setVariable: state.setVariable,
        objectId,
      };
      await executeActionChain(actions, ctx, adapter);
    },
  }));
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export interface RuntimeStoreProviderProps {
  /** 页面视图模型定义。 */
  viewModel: ViewModel;
  /** 当前关联对象 ID（数据查询 / 动作回退用）。 */
  objectId?: string;
  /** API 适配器（由各包注入，含 navigate 方法）。 */
  adapter: RuntimeStoreAdapter;
  children: ReactNode;
}

/**
 * 运行时状态 Provider。
 * 挂载时初始化 vm 并触发 autoQuery 数据加载；卸载时自动清理状态。
 */
export function RuntimeStoreProvider({
  viewModel,
  objectId,
  adapter,
  children,
}: RuntimeStoreProviderProps) {
  // 用 ref 持有最新 props，避免 store 重建
  const viewModelRef = useRef(viewModel);
  viewModelRef.current = viewModel;
  const objectIdRef = useRef(objectId);
  objectIdRef.current = objectId;
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;

  // 每次挂载创建独立 store 实例
  const [store] = useState(() =>
    createRuntimeStore(viewModelRef.current, adapterRef.current, objectIdRef.current),
  );

  // autoQuery：挂载时触发一次
  useEffect(() => {
    const vars = viewModelRef.current.variables;
    for (const [key, def] of Object.entries(vars)) {
      if (def?.datasource?.autoQuery) {
        void store.getState().queryData(key);
      }
    }
  }, [store]);

  return <RuntimeStoreContext.Provider value={store}>{children}</RuntimeStoreContext.Provider>;
}

// ---------------------------------------------------------------------------
// 消费 Hooks
// ---------------------------------------------------------------------------

/** 获取 store 实例（Provider 未挂载时返回 no-op store）。 */
export function useRuntimeStore(): StoreApi<RuntimeState> {
  const store = useContext(RuntimeStoreContext);
  return store ?? noopStore;
}

/**
 * 精确订阅运行时状态。
 *
 * 用法：
 *   const vm = useRuntimeCtx(s => s.vm);
 *   const setVariable = useRuntimeCtx(s => s.setVariable);
 *
 * 只有 selector 返回值变化时才触发重渲染。
 */
export function useRuntimeCtx<T>(selector: (state: RuntimeState) => T): T {
  return useStore(useRuntimeStore(), selector);
}
