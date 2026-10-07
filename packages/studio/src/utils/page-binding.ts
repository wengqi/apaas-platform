/**
 * 页面表单控件 ↔ 对象字段绑定校验（纯函数，无 React/DOM 依赖）。
 *
 * 绑定语义：amis 控件经 `name` 写入所在 form 的数据域，form 提交时按 name 打平
 * 发送到 form.api.url（平台约定 = /objects/:id/records，name 即字段 apiName）。
 * 多表语义（2026-10-07 升级）：每个 form 绑定各自的对象——优先从该 form 的
 * api.url 解析 objectId，缺省回退页面级 data.objectId；服务端写路径不拒绝未知键
 * （实测：错误键原样静默存入记录 JSONB，不落任何字段），故在 studio 保存侧对
 * 「表单内控件 name ∈ 所属对象字段 apiName」做显式比对，错配列出告警（非阻断）。
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
  /** 该控件所在 form 解析出的绑定对象 ID */
  objectId?: string;
}

/**
 * 表单内不承载记录字段数据的结构/展示/动作节点（其 name 仅为布局或子区域标识）。
 * 这些节点不做字段比对；其余带 name 的节点都按"提交写入键"参与比对。
 * 判定口径与编辑器插件共用（isBindableControlType）。
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
 * 从 form 的 api 配置解析绑定对象 ID。
 * 平台生成/约定的提交地址形如 /objects/:objectId/records（string 或 {url} 两态）。
 */
export function extractObjectIdFromApiUrl(api: unknown): string | null {
  const url =
    typeof api === 'string'
      ? api
      : typeof api === 'object' &&
          api !== null &&
          typeof (api as Record<string, unknown>)['url'] === 'string'
        ? ((api as Record<string, unknown>)['url'] as string)
        : '';
  const match = url.match(/\/objects\/([A-Za-z0-9_-]+)\/records/);
  return match ? (match[1] as string) : null;
}

/** 读取页面级缺省绑定对象（schema.data.objectId）。 */
function extractPageObjectId(schema: Record<string, unknown>): string | null {
  const data = schema['data'];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const oid = (data as Record<string, unknown>)['objectId'];
  return typeof oid === 'string' && oid !== '' ? oid : null;
}

/**
 * 收集页面内全部绑定对象 ID（去重）：每个 form 优先解析自身 api.url，
 * 缺省回退页面级 data.objectId。
 */
export function collectBoundObjectIds(schema: unknown): string[] {
  const ids = new Set<string>();
  const pageFallback =
    typeof schema === 'object' && schema !== null
      ? extractPageObjectId(schema as Record<string, unknown>)
      : null;
  if (pageFallback) ids.add(pageFallback);

  const walk = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    const rec = node as Record<string, unknown>;
    if (rec['type'] === 'form') {
      const oid = extractObjectIdFromApiUrl(rec['api']);
      if (oid) ids.add(oid);
      return;
    }
    for (const value of Object.values(rec)) {
      if (value !== null && typeof value === 'object') walk(value);
    }
  };
  walk(schema);
  return Array.from(ids);
}

/**
 * 收集页面 schema 中「表单内控件 name 未命中所属对象字段」的错配项。
 *
 * 规则：
 * - 逐 form 解析绑定对象（api.url 优先，页面级 data.objectId 兜底）；
 *   无法解析对象的 form 跳过（无法判定，避免误报）；
 * - form 自身 name、结构容器 name、actions 内按钮不比对；
 * - 嵌套容器（grid/panel/dialog 等）递归，dialog 内的 form 同样检出。
 */
export function collectFieldBindingIssues(
  schema: unknown,
  fieldsByObject: ReadonlyMap<string, ReadonlySet<string>>,
): FieldBindingIssue[] {
  const issues: FieldBindingIssue[] = [];
  const pageFallback =
    typeof schema === 'object' && schema !== null
      ? extractPageObjectId(schema as Record<string, unknown>)
      : null;

  const pushIfMismatch = (
    rec: Record<string, unknown>,
    path: string,
    objectId: string,
    apiNames: ReadonlySet<string> | undefined,
  ): void => {
    if (!apiNames) return;
    const name = rec['name'];
    if (typeof name !== 'string' || name === '' || apiNames.has(name)) return;
    const label = typeof rec['label'] === 'string' ? rec['label'] : undefined;
    const title = typeof rec['title'] === 'string' ? rec['title'] : undefined;
    issues.push({
      path,
      name,
      label: label ?? title,
      type: typeof rec['type'] === 'string' ? rec['type'] : undefined,
      objectId,
    });
  };

  const walk = (node: unknown, path: string, inForm: boolean, objectId: string | null): void => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, path ? `${path}[${i}]` : `[${i}]`, inForm, objectId));
      return;
    }
    if (typeof node !== 'object' || node === null) return;
    const rec = node as Record<string, unknown>;
    const type = typeof rec['type'] === 'string' ? rec['type'] : undefined;

    if (type === 'form') {
      // form 是独立数据域：自身 name 不比对；对象 = 自身 api.url 解析优先，页面级兜底
      const formObjectId = extractObjectIdFromApiUrl(rec['api']) ?? pageFallback;
      if (Array.isArray(rec['body'])) {
        (rec['body'] as unknown[]).forEach((item, i) =>
          walk(item, path ? `${path}.body[${i}]` : `body[${i}]`, true, formObjectId),
        );
      }
      return;
    }
    if (inForm && isBindableControlType(type) && objectId) {
      pushIfMismatch(rec, path, objectId, fieldsByObject.get(objectId));
    }
    for (const [key, value] of Object.entries(rec)) {
      if (value !== null && typeof value === 'object') {
        walk(value, path ? `${path}.${key}` : key, inForm, objectId);
      }
    }
  };

  walk(schema, '', false, null);
  return issues;
}
