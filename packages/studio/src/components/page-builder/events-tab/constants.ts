/**
 * 事件配置 Tab — 常量表（从 EventsTab.tsx 拆分，AGENTS.md 单文件 400 行规范）。
 */

import type { ActionType } from '../../../api/pages.js';

/** 组件类型 → 可用事件列表。 */
export const COMPONENT_EVENTS: Partial<Record<string, string[]>> = {
  button: ['onClick'],
  form: ['onSubmit', 'onReset'],
  data_table: ['onRowClick'],
  page: ['onLoad'],
};

/** 动作类型 → 中文标签 + 描述。 */
export const ACTION_TYPE_OPTIONS: { value: ActionType; label: string; desc: string }[] = [
  { value: 'trigger_process', label: '触发流程', desc: '启动一个流程实例' },
  { value: 'navigate', label: '页面跳转', desc: '跳转到指定页面或 URL' },
  { value: 'open_modal', label: '打开弹窗', desc: '打开一个弹窗组件' },
  { value: 'close_modal', label: '关闭弹窗', desc: '关闭当前弹窗' },
  { value: 'confirm', label: '弹出确认框', desc: '弹出确认对话框' },
  { value: 'toast', label: '弹出提示', desc: '显示一条提示消息' },
  { value: 'set_variable', label: '设置变量', desc: '设置视图模型变量的值' },
  { value: 'query_records', label: '查询记录', desc: '查询对象记录并填充到变量' },
  { value: 'create_record', label: '新增记录', desc: '创建一条新记录' },
  { value: 'update_record', label: '更新记录', desc: '更新一条记录' },
  { value: 'delete_record', label: '删除记录', desc: '删除一条记录' },
  { value: 'call_api', label: '调用 API', desc: '调用自定义 API' },
  { value: 'run_script', label: 'JS 扩展', desc: '执行页面级 JavaScript 脚本（可读写 vm）' },
];
