/**
 * 节点元数据辅助函数 — 配置完整性检查 + 摘要生成。
 *
 * 从 SimplifiedEditor.tsx 提取。
 */

/** 检查节点配置是否完整（必填字段是否已填写）。 */
export function checkNodeIncomplete(type: string, data: Record<string, unknown>): boolean {
  switch (type) {
    case 'trigger':
      return !data.triggerType;
    case 'userTask':
      return !data.assigneeId || !data.approvalMode;
    case 'notification':
      return !data.channel || !data.recipient;
    case 'objectOperation':
      return !data.operation || !data.objectId;
    case 'httpRequest':
      return !data.method || !data.url;
    case 'delay':
      return !data.duration;
    case 'start':
    case 'end':
    case 'assign':
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
      const a = data.assigneeId as string;
      const m = data.approvalMode as string;
      const p: string[] = [];
      if (a) p.push(`审批人: ${a}`);
      if (m) p.push(m);
      return p.join(' · ');
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
    case 'assign':
      return '变量赋值';
    default:
      return '';
  }
}
