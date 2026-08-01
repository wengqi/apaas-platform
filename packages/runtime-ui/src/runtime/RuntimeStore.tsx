/**
 * 运行时状态管理(预览模式)。
 *
 * 基于 React Context 提供运行时视图模型状态:
 *   - 页面加载时遍历 ViewModel,对 autoQuery=true 的变量触发数据查询(§8.1 步骤 1)。
 *   - setVariable 更新 vm,触发依赖组件重渲染(§8.3 响应式)。
 *   - executeAction / executeActions 执行事件动作 / 动作链(§8.5)。
 *
 * 仅在预览模式由 Canvas 包裹 Provider;编辑模式使用默认 no-op 上下文。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { objectsApi } from '../api/objects.js';
import type { ActionConfig, ViewModel } from '../api/pages.js';
import {
  executeAction as runAction,
  executeActionChain,
  type ActionContext,
} from './action-executor.js';

// ---------------------------------------------------------------------------
// 上下文类型
// ---------------------------------------------------------------------------

/** 运行时上下文:视图模型状态 + 变量读写 + 数据查询 + 动作执行。 */
export interface RuntimeContext {
  /** 视图模型变量值(运行时状态树)。 */
  vm: Record<string, unknown>;
  /** 设置变量(支持 'vm.x.y' / 'x.y' 路径,不可变更新)。 */
  setVariable: (path: string, value: unknown) => void;
  /** 按变量名查询数据源,结果写入 vm[variableName]。 */
  queryData: (variableName: string) => Promise<void>;
  /** 执行单个事件动作。 */
  executeAction: (action: ActionConfig) => Promise<void>;
  /** 执行动作链(串行 / condition / confirm 中断)。 */
  executeActions: (actions: ActionConfig[]) => Promise<void>;
}

// ---------------------------------------------------------------------------
// 默认 no-op 上下文(编辑模式 / Provider 未挂载时使用)
// ---------------------------------------------------------------------------

const noop = (): void => {
  /* 编辑模式不执行运行时动作 */
};

const noopAsync = async (): Promise<void> => {
  /* 编辑模式不执行运行时动作 */
};

const DEFAULT_RUNTIME: RuntimeContext = {
  vm: {},
  setVariable: noop,
  queryData: noopAsync,
  executeAction: noopAsync,
  executeActions: noopAsync,
};

const RuntimeContext = createContext<RuntimeContext>(DEFAULT_RUNTIME);

// ---------------------------------------------------------------------------
// ViewModel 初始化
// ---------------------------------------------------------------------------

/** 判断 PropValue 是否为普通对象字面量(非绑定/表达式/动作/数组)。 */
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

/** 根据 ViewModel 定义初始化 vm 状态(应用 initialValue / 空结构)。 */
function initVm(viewModel: ViewModel): Record<string, unknown> {
  const vm: Record<string, unknown> = {};
  for (const [key, def] of Object.entries(viewModel.variables)) {
    switch (def.type) {
      case 'record_list':
        vm[key] = { records: [], total: 0, page: 1, pageSize: 50 };
        break;
      case 'record':
        vm[key] = isPlainObjectLiteral(def.initialValue)
          ? { ...def.initialValue }
          : {};
        break;
      case 'array':
        vm[key] = Array.isArray(def.initialValue) ? [...def.initialValue] : [];
        break;
      case 'scalar':
      case 'object':
      default:
        vm[key] =
          def.initialValue !== undefined && def.initialValue !== null
            ? def.initialValue
            : null;
        break;
    }
  }
  return vm;
}

// ---------------------------------------------------------------------------
// 路径写入(不可变)
// ---------------------------------------------------------------------------

/** 去除路径前缀 'vm.'。 */
function stripVmPrefix(path: string): string {
  return path.startsWith('vm.') ? path.slice(3) : path;
}

/** 不可变地按路径写入值,返回新的 vm 对象。 */
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
// Provider
// ---------------------------------------------------------------------------

interface RuntimeStoreProviderProps {
  /** 页面视图模型定义。 */
  viewModel: ViewModel;
  /** 当前关联对象 ID(数据查询 / 动作回退用)。 */
  objectId?: string;
  children: ReactNode;
}

/**
 * 运行时状态 Provider。
 * 挂载时初始化 vm 并触发 autoQuery 数据加载;卸载时自动清理状态。
 */
export function RuntimeStoreProvider({
  viewModel,
  objectId,
  children,
}: RuntimeStoreProviderProps) {
  const [vm, setVm] = useState<Record<string, unknown>>(() => initVm(viewModel));

  // ref:始终持有最新值,供异步回调(动作 / 查询)读取,避免闭包陈旧
  const vmRef = useRef(vm);
  vmRef.current = vm;
  const viewModelRef = useRef(viewModel);
  viewModelRef.current = viewModel;
  const objectIdRef = useRef(objectId);
  objectIdRef.current = objectId;

  // 路由跳转:slug → /app/:appId/p/:slug;绝对路径 / URL 原样
  const navigateImpl = useNavigate();
  const { appId } = useParams<{ appId: string }>();
  const navigate = useCallback(
    (path: string) => {
      if (!path) return;
      if (path.startsWith('/') || /^https?:\/\//.test(path)) {
        navigateImpl(path);
      } else if (appId) {
        navigateImpl(`/app/${appId}/p/${path}`);
      } else {
        navigateImpl(`/${path}`);
      }
    },
    [navigateImpl, appId],
  );
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;

  // —— 变量写入 ——
  const setVariable = useCallback((path: string, value: unknown) => {
    setVm((prev) => setByPath(prev, path, value));
  }, []);

  // —— 数据查询 ——
  const queryData = useCallback(
    async (variableName: string) => {
      const def = viewModelRef.current.variables[variableName];
      if (!def?.datasource) return;
      const objId = def.datasource.objectId || objectIdRef.current;
      if (!objId) return;
      try {
        const res = await objectsApi.records.list(objId, { page: 1, pageSize: 50 });
        const records = res.items.map((r) => ({ id: r.id, ...r.data }));
        if (def.type === 'record_list') {
          setVariable(`vm.${variableName}`, {
            records,
            total: res.total,
            page: res.page,
            pageSize: res.pageSize,
          });
        } else if (def.type === 'record') {
          // 无单记录详情 API,取首条作为近似(详情/表单页 autoQuery 默认 false)
          setVariable(`vm.${variableName}`, records[0] ?? null);
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[RuntimeStore] queryData failed:', err);
      }
    },
    [setVariable],
  );

  // —— 动作执行 ——
  const buildActionContext = useCallback((): ActionContext => {
    return {
      vm: vmRef.current,
      setVariable,
      navigate: (path: string) => navigateRef.current(path),
      objectId: objectIdRef.current,
    };
  }, [setVariable]);

  const executeAction = useCallback(
    async (action: ActionConfig) => {
      await runAction(action, buildActionContext());
    },
    [buildActionContext],
  );

  const executeActions = useCallback(
    async (actions: ActionConfig[]) => {
      await executeActionChain(actions, buildActionContext());
    },
    [buildActionContext],
  );

  // —— 页面加载:触发 autoQuery(§8.1 步骤 1) ——
  useEffect(() => {
    const variables = viewModelRef.current.variables;
    for (const [key, def] of Object.entries(variables)) {
      if (def.datasource?.autoQuery) {
        void queryData(key);
      }
    }
    // 仅挂载时触发一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo<RuntimeContext>(
    () => ({ vm, setVariable, queryData, executeAction, executeActions }),
    [vm, setVariable, queryData, executeAction, executeActions],
  );

  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

// ---------------------------------------------------------------------------
// 消费 Hook
// ---------------------------------------------------------------------------

/** 读取运行时上下文;Provider 未挂载时返回 no-op 默认值(编辑模式安全)。 */
export function useRuntimeCtx(): RuntimeContext {
  return useContext(RuntimeContext);
}
