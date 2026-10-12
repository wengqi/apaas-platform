/**
 * 从 constants/process.ts 拆分（AGENTS.md 单文件 400 行规范）。
 *
 * 节点元数据表(10 种 aPaaS 业务节点,对齐 ApaasNodeRegistries),
 * 驱动节点面板、节点配置头。
 */

import { TOKENS as T, PRESET as P } from '@apaas/shared/design';
import {
  ThunderboltOutlined,
  PlayCircleOutlined,
  StopOutlined,
  DatabaseOutlined,
  BranchesOutlined,
  SolutionOutlined,
  BellOutlined,
  ApiOutlined,
  EditOutlined,
  ClockCircleOutlined,
  ApartmentOutlined,
  ClusterOutlined,
  SyncOutlined,
  PauseCircleOutlined,
  ForwardOutlined,
  UnorderedListOutlined,
  DeploymentUnitOutlined,
} from '@ant-design/icons';
import type { NodeCategory, ProcessNodeMeta } from './types.js';

/**
 * 节点类型元数据表 —— 驱动节点面板、节点配置头。
 * type 与 features/process/simplified/src/nodes 下各 index.ts 的注册表 type 对齐。
 */
export const NODE_META: Record<string, ProcessNodeMeta> = {
  // —— 触发与起止 ——
  trigger: {
    type: 'trigger',
    label: '触发器',
    icon: ThunderboltOutlined,
    color: T.colorWarning,
    category: 'trigger',
    description: '流程入口:记录增删改/定时/手动/按钮触发',
  },
  start: {
    type: 'start',
    label: '开始',
    icon: PlayCircleOutlined,
    color: T.colorSuccess,
    category: 'trigger',
    description: '流程开始节点,定义输入参数',
  },
  end: {
    type: 'end',
    label: '结束',
    icon: StopOutlined,
    color: T.colorTextTertiary,
    category: 'trigger',
    description: '流程结束节点',
  },
  // —— 数据操作 ——
  objectOperation: {
    type: 'objectOperation',
    label: '对象操作',
    icon: DatabaseOutlined,
    color: T.colorPrimary,
    category: 'data',
    description: '创建/更新/查询/删除记录',
  },
  // —— 流程控制 ——
  condition: {
    type: 'condition',
    label: '条件分支',
    icon: BranchesOutlined,
    color: `${P.purple6}`,
    category: 'control',
    description: 'if/else 条件分支',
  },
  // —— 业务操作 ——
  userTask: {
    type: 'userTask',
    label: '人工任务',
    icon: SolutionOutlined,
    color: `${P.cyan6}`,
    category: 'business',
    description: '审批/人工任务,流程暂停等待处理',
  },
  notification: {
    type: 'notification',
    label: '通知',
    icon: BellOutlined,
    color: `${P.magenta6}`,
    category: 'business',
    description: '发送邮件/站内/Webhook 通知',
  },
  httpRequest: {
    type: 'httpRequest',
    label: 'HTTP 请求',
    icon: ApiOutlined,
    color: `${P.geekblue6}`,
    category: 'business',
    description: '调用外部 HTTP 接口/连接器',
  },
  assign: {
    type: 'assign',
    label: '赋值',
    icon: EditOutlined,
    color: T.colorGold,
    category: 'business',
    description: '设置流程变量',
  },
  delay: {
    type: 'delay',
    label: '延时',
    icon: ClockCircleOutlined,
    color: T.colorWarning,
    category: 'business',
    description: '等待指定时长',
  },
  // —— 流程控制扩展（snake_case 注册名，与引擎执行器一致） ——
  inclusive: {
    type: 'inclusive',
    label: '包容分支',
    icon: ApartmentOutlined,
    color: `${P.purple5}`,
    category: 'control',
    description: '所有满足条件的分支并行执行（OR）',
  },
  parallel: {
    type: 'parallel',
    label: '并行分支',
    icon: ClusterOutlined,
    color: P.daybreakBlue,
    category: 'control',
    description: '所有分支同时执行，汇聚等待全部完成（AND）',
  },
  loop: {
    type: 'loop',
    label: '循环',
    icon: SyncOutlined,
    color: P.mint,
    category: 'control',
    description: '遍历集合并对每个元素执行循环体',
  },
  wait_for_condition: {
    type: 'wait_for_condition',
    label: '等待条件',
    icon: PauseCircleOutlined,
    color: `${P.gold4}`,
    category: 'business',
    description: '暂停直到条件成立或超时',
  },
  break: {
    type: 'break',
    label: '跳出循环',
    icon: StopOutlined,
    color: `${P.red4}`,
    category: 'control',
    description: '终止所在循环',
  },
  continue: {
    type: 'continue',
    label: '继续循环',
    icon: ForwardOutlined,
    color: `${P.blue4}`,
    category: 'control',
    description: '跳过本次迭代剩余节点',
  },
  batch_operation: {
    type: 'batch_operation',
    label: '批量操作',
    icon: UnorderedListOutlined,
    color: `${P.cyan5}`,
    category: 'data',
    description: '批量创建/更新/删除记录',
  },
  sub_process: {
    type: 'sub_process',
    label: '子流程',
    icon: DeploymentUnitOutlined,
    color: `${P.purple4}`,
    category: 'business',
    description: '调用另一个已发布流程（默认同步等待）',
  },
  // —— snake_case 别名（SSOT 存储名；序列化器将驼峰标准化为 snake_case） ——
  object_operation: {
    type: 'object_operation',
    label: '对象操作',
    icon: DatabaseOutlined,
    color: T.colorPrimary,
    category: 'data',
    description: '创建/更新/查询/删除记录',
  },
  user_task: {
    type: 'user_task',
    label: '人工任务',
    icon: SolutionOutlined,
    color: `${P.cyan6}`,
    category: 'business',
    description: '审批/人工任务,流程暂停等待处理',
  },
  http_request: {
    type: 'http_request',
    label: 'HTTP 请求',
    icon: ApiOutlined,
    color: `${P.geekblue6}`,
    category: 'business',
    description: '调用外部 HTTP 接口/连接器',
  },
};

/** 节点面板分组(顺序即展示顺序)。 */
export const NODE_GROUPS: { title: string; category: NodeCategory; types: string[] }[] = [
  { title: '触发与起止', category: 'trigger', types: ['trigger', 'start', 'end'] },
  {
    title: '数据操作',
    category: 'data',
    types: ['objectOperation', 'batch_operation'],
  },
  { title: '流程控制', category: 'control', types: ['condition', 'inclusive', 'parallel', 'loop'] },
  {
    title: '业务操作',
    category: 'business',
    types: [
      'userTask',
      'notification',
      'httpRequest',
      'assign',
      'delay',
      'wait_for_condition',
      'sub_process',
      'break',
      'continue',
    ],
  },
];

/**
 * 即将支持的扩展节点(灰态展示)。
 * 历史灰态节点（parallel/inclusive/loop/sub_process）已实现并移入 NODE_GROUPS。
 */
export const NODE_COMING_SOON: { type: string; label: string }[] = [];

/**
 * 安全获取节点元数据(兼容 noUncheckedIndexedAccess,提供兜底)。
 */
export function getNodeMeta(type: string): ProcessNodeMeta {
  const meta = NODE_META[type];
  if (meta) return meta;
  return {
    type,
    label: type,
    icon: ThunderboltOutlined,
    color: T.colorTextTertiary,
    category: 'business',
    description: '',
  };
}
