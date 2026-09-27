/**
 * 从 stores/pageBuilder.ts 拆分（AGENTS.md 单文件 400 行规范）。
 *
 * 页面搭建器 store 的状态与动作类型定义。
 */

import type {
  ComponentNode,
  ComponentType,
  PageMeta,
  PageSchema,
  VariableDef,
  ViewModel,
} from '../../api/pages.js';

export interface PageBuilderState {
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
  /** 表单生成器目标表单节点（null = 关闭；画布空态与属性面板共用入口） */
  formGeneratorNodeId: string | null;
  /** 画布缩放（0.5-1.5；控件在顶栏，画布消费） */
  canvasZoom: number;
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
  /** 同父节点内拖拽排序：把 active 移动到 over 所在位置（飞书式画布内排序） */
  reorderSibling: (activeId: string, overId: string) => void;
  /** 整体替换容器子节点（表单生成器写回） */
  replaceChildren: (parentId: string, children: ComponentNode[]) => void;
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
  /** 幂等写入 vm.record 变量（表单生成器用；已存在时更新 datasource.objectId） */
  ensureRecordVariable: (objectId: string) => void;
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
  /** 打开/关闭表单生成器（传表单节点 ID 或 null） */
  setFormGeneratorNodeId: (id: string | null) => void;
  /** 设置画布缩放 */
  setCanvasZoom: (zoom: number) => void;

  // —— 历史 ——
  /** 撤销 */
  undo: () => void;
  /** 重做 */
  redo: () => void;
}
