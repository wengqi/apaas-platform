/**
 * 页面表单控件 ↔ 对象字段绑定校验（纯函数，无 React/DOM 依赖）。
 *
 * 绑定语义：amis 控件经 `name` 写入表单数据域，form 提交时按 name 打平发送到
 * form.api.url（平台约定 = /objects/:id/records，name 即字段 apiName）。
 * 服务端写路径不拒绝未知键（2026-10-07 实测：错误键原样静默存入记录 JSONB，
 * 不落任何字段），故在 studio 保存侧对「表单内控件 name ∈ 对象字段 apiName」
 * 做显式比对，错配列出告警（非阻断，可强制保存）。
 */

export interface FieldBindingIssue {
  /** 控件在页面 schema 中的路径（如 body[0].body[3]），便于在代码 Tab 定位 */
  path: string;
  /** 控件 name（即提交写入键） */
  name: string;
  /** 控件显示标题（label 或 title） */
  label?: string;
  /** 控件类型 */
  type?: string;
}

/**
 * 表单内不承载记录字段数据的结构/展示/动作节点（其 name 仅为布局或子区域标识）。
 * 这些节点不做字段比对；其余带 name 的节点都按"提交写入键"参与比对。
 * 判定口径与 FieldBindingPanelPlugin 共用（isBindableControlType）。
 */
const STRUCTURAL_TYPES: ReadonlySet<string> = new Set([
  // 布局容器
  'grid',
  'hbox',
  'vbox',
  'flex',
  'container',
  'wrapper',
  'group',
  'grid-2d',
  'tabs',
  'tab',
  'collapse',
  'collapse-group',
  'panel',
  'fieldset',
  'card',
  'card2',
  'anchor-nav',
  'service',
  'control',
  // 数据/展示容器（自身 name 不写记录）
  'page',
  'crud',
  'table',
  'table-view',
  'list',
  'each',
  'iframe',
  'custom',
  'plain',
  'tpl',
  'html',
  'divider',
  'pagination',
  'log',
  'nav',
  // 动作/弹层类（按钮 name 不参与记录提交；其 body 内的 form 会被独立检出）
  'button',
  'button-group',
  'dropdown-button',
  'action',
  'submit',
  'reset',
  'dialog',
  'drawer',
  'wizard',
]);

/** 该类型节点是否为"提交写入记录"的绑定候选控件。 */
export function isBindableControlType(type: unknown): boolean {
  return typeof type === 'string' && type.length > 0 && !STRUCTURAL_TYPES.has(type);
}

/**
 * 收集页面 schema 中「表单内控件 name 未命中对象字段」的错配项。
 *
 * 规则：
 * - 仅 type:'form' 数据域内的控件参与比对（form 外的 crud/static 等取数展示不受影响）；
 * - form 自身 name、结构容器 name 不比对；actions 内按钮（结构性类型）不比对；
 * - 嵌套容器（grid/panel/dialog 等）递归，dialog 内的 form 同样检出。
 */
export function collectFieldBindingIssues(
  schema: unknown,
  fieldApiNames: ReadonlySet<string>,
): FieldBindingIssue[] {
  const issues: FieldBindingIssue[] = [];

  const pushIfMismatch = (rec: Record<string, unknown>, path: string): void => {
    const name = rec['name'];
    if (typeof name !== 'string' || name === '' || fieldApiNames.has(name)) return;
    const label = typeof rec['label'] === 'string' ? rec['label'] : undefined;
    const title = typeof rec['title'] === 'string' ? rec['title'] : undefined;
    issues.push({
      path,
      name,
      label: label ?? title,
      type: typeof rec['type'] === 'string' ? rec['type'] : undefined,
    });
  };

  const walk = (node: unknown, path: string, inForm: boolean): void => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, path ? `${path}[${i}]` : `[${i}]`, inForm));
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    const rec = node as Record<string, unknown>;
    const type = typeof rec['type'] === 'string' ? rec['type'] : undefined;

    if (type === 'form') {
      // form 是独立数据域：自身 name 不比对；提交写入只来自其 body
      if (Array.isArray(rec['body'])) {
        (rec['body'] as unknown[]).forEach((item, i) =>
          walk(item, path ? `${path}.body[${i}]` : `body[${i}]`, true),
        );
      }
      return;
    }
    if (inForm && isBindableControlType(type)) pushIfMismatch(rec, path);
    for (const [key, value] of Object.entries(rec)) {
      if (value !== null && typeof value === 'object')
        walk(value, path ? `${path}.${key}` : key, inForm);
    }
  };

  walk(schema, '', false);
  return issues;
}
