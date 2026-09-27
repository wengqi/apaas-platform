/**
 * 节点元数据辅助函数 — 配置完整性检查 + 摘要生成。
 *
 * 从 SimplifiedEditor.tsx 提取。
 */

import { APPROVAL_MODE_OPTIONS, ASSIGNEE_TYPE_OPTIONS } from './configs/UserTaskConfigForm.js';

/** 评审整改：按选项表把枚举值翻译为中文标签(未知值回退原值，空值返回空串)。 */
function toOptionLabel(
  options: Array<{ label: string; value: string }>,
  value: string | undefined,
): string {
  if (!value) return '';
  return options.find((o) => o.value === value)?.label ?? value;
}

/** 检查节点配置是否完整（必填字段是否已填写）。 */
export function checkNodeIncomplete(type: string, data: Record<string, unknown>): boolean {
  switch (type) {
    case 'trigger':
      return !data.triggerType;
    case 'userTask':
    case 'user_task':
      // 评审整改：配置表单(UserTaskConfigForm)写入 assignee/assigneeType/approvalMode，
      // 历史数据可能存 assigneeId —— 两者任一有值即视为已配置审批人，
      // 保留判定强度：审批人 + 审批模式 都有值才算完成。
      return !(data.assignee || data.assigneeId) || !data.approvalMode;
    case 'notification':
      return !data.channel || !data.recipient;
    case 'objectOperation':
    case 'object_operation':
      return !data.operation || !data.objectId;
    case 'httpRequest':
    case 'http_request':
      return !data.method || !data.url;
    case 'delay':
      return !data.duration;
    case 'loop':
      return !data.collection;
    case 'wait_for_condition':
      return !data.condition;
    case 'sub_process':
      return !data.subProcessKey && !data.subProcessDefId;
    case 'batch_operation':
      return !data.operation || !data.objectId;
    case 'start':
    case 'end':
    case 'assign':
    case 'parallel':
    case 'inclusive':
    case 'break':
    case 'continue':
      return false;
    default:
      return false;
  }
}

/** 生成节点摘要文本（显示在节点卡片底部）。 */
export function getNodeSummary(type: string, data: Record<string, unknown>): string {
  switch (type) {
    case 'trigger': {
      const t = data.triggerType as string;
      return t ? `触发: ${t}` : '';
    }
    case 'userTask': {
      // 评审整改：摘要读取配置表单实际写入的 assignee(原 assigneeId 不存在导致摘要缺失)；
      // assigneeType/approvalMode 直接渲染原始枚举(如 "SINGLE")，统一映射为中文标签。
      const assignee = data.assignee as string;
      const assigneeTypeLabel = toOptionLabel(ASSIGNEE_TYPE_OPTIONS, data.assigneeType as string);
      const approvalModeLabel = toOptionLabel(APPROVAL_MODE_OPTIONS, data.approvalMode as string);
      const parts: string[] = [];
      if (assignee) parts.push(`审批人: ${assignee}`);
      if (assigneeTypeLabel) parts.push(assigneeTypeLabel);
      if (approvalModeLabel) parts.push(approvalModeLabel);
      return parts.join(' · ');
    }
    case 'notification': {
      const c = data.channel as string;
      const r = data.recipient as string;
      const p: string[] = [];
      if (c) p.push(`渠道: ${c}`);
      if (r) p.push(`接收人: ${r}`);
      return p.join(' · ');
    }
    case 'objectOperation': {
      const o = data.operation as string;
      const obj = data.objectId as string;
      const p: string[] = [];
      if (o) p.push(o);
      if (obj) p.push(obj);
      return p.join(' · ');
    }
    case 'httpRequest': {
      const m = data.method as string;
      const u = data.url as string;
      if (m && u) return `${m} ${u}`;
      return m ?? '';
    }
    case 'delay': {
      const d = data.duration as string | number;
      const u = data.unit as string;
      if (d) return `等待 ${d}${u ?? ''}`;
      return '';
    }
    case 'condition':
      return '条件分支';
    case 'inclusive':
      return '包容分支（满足条件的分支并行执行）';
    case 'parallel':
      return '并行分支（汇聚等待全部完成）';
    case 'loop': {
      const c = data.collection as string | undefined;
      return c ? `遍历 ${c}` : '循环';
    }
    case 'wait_for_condition':
      return '等待条件成立';
    case 'break':
      return '跳出循环';
    case 'continue':
      return '继续下一次循环';
    case 'batch_operation': {
      const o = data.operation as string | undefined;
      return o ? `批量${o === 'create' ? '创建' : o === 'update' ? '更新' : '删除'}` : '批量操作';
    }
    case 'sub_process': {
      const k = (data.subProcessKey as string) || (data.subProcessDefId as string);
      return k ? `调用子流程 ${k}` : '调用子流程';
    }
    case 'assign':
      return '变量赋值';
    default:
      return '';
  }
}
