/**
 * amis 渲染器类型注册表（G3 amis_page 校验器的真值来源）。
 *
 * 白名单 = amis 文档组件清单（components/*.md + form/*.md，约 150 型），
 * 即"渲染器实际行为"——与官方 schema.json 不同（spike 实证其与渲染器不一致）。
 * 黑名单 = 平台实测不可用项（spike 渲染失败）。
 * 新类型加入：随 amis 版本升级维护本表（锁 6.13.0，升级需回归）。
 */

/** amis 组件类型白名单（容器/展示/数据/动作类）。 */
export const AMIS_CONTAINER_TYPES: readonly string[] = [
  'page',
  'container',
  'wrapper',
  'panel',
  'grid',
  'hbox',
  'flex',
  'grid-2d',
  'tabs',
  'collapse',
  'fieldset',
  'group',
  'portlet',
  'steps',
  'wizard',
  'dialog',
  'drawer',
  'popover',
  'iframe',
  'service',
  'each',
  'web-component',
  'switch-container',
];

/** amis 表单与表单项类型白名单（73+ form 控件族的核心集）。 */
export const AMIS_FORM_TYPES: readonly string[] = [
  'form',
  'formitem',
  'control',
  'group',
  'input-group',
  'hidden',
  'input-text',
  'input-password',
  'textarea',
  'input-url',
  'input-email',
  'input-number',
  'input-range',
  'input-rating',
  'input-color',
  'input-city',
  'select',
  'nested-select',
  'chain-select',
  'list-select',
  'picker',
  'transfer',
  'transfer-picker',
  'tabs-transfer',
  'tabs-transfer-picker',
  'radios',
  'radio',
  'checkbox',
  'checkboxes',
  'switch',
  'button-group-select',
  'input-date',
  'input-datetime',
  'input-time',
  'input-month',
  'input-quarter',
  'input-year',
  'input-date-range',
  'input-datetime-range',
  'input-time-range',
  'input-month-range',
  'input-quarter-range',
  'input-year-range',
  'input-file',
  'input-image',
  'input-rich-text',
  'input-tag',
  'input-tree',
  'tree-select',
  'input-sub-form',
  'input-table',
  'input-array',
  'input-kv',
  'input-kvs',
  'input-excel',
  'input-formula',
  'input-repeat',
  'input-verification-code',
  'input-signature',
  'condition-builder',
  'diff-editor',
  'editor',
  'matrix-checkboxes',
  'location-picker',
  'json-schema',
  'json-schema-editor',
  'combo',
  'formula',
  'options',
  'uuid',
  'static',
  'search-box',
  'chain',
  'location',
];

/** amis 展示/数据/动作类型白名单。 */
export const AMIS_DISPLAY_TYPES: readonly string[] = [
  'action',
  'button',
  'button-toolbar',
  'button-group',
  'dropdown-button',
  'tpl',
  'html',
  'markdown',
  'json',
  'link',
  'mapping',
  'status',
  'tag',
  'image',
  'images',
  'carousel',
  'date',
  'datetime',
  'time',
  'number',
  'divider',
  'alert',
  'remark',
  'spinner',
  'progress',
  'qrcode',
  'barcode',
  'avatar',
  'badge',
  'icon',
  'code',
  'log',
  'diff',
  'shape',
  'color',
  'property',
  'table-view',
  'anchor-nav',
  'breadcrumb',
  'nav',
  'app-nav',
  'crud',
  'table',
  'table2',
  'list',
  'cards',
  'card',
  'chart',
  'sparkline',
  'timeline',
  'tasks',
  'calendar',
  'pagination',
  'pagination-wrapper',
  'tooltip-wrapper',
  'custom',
  'video',
  'audio',
  'iframe-renderer',
  'office-viewer',
  'office-viewer-excel',
  'pdf-viewer',
  'grid-nav',
  'amis-theme-editor',
];

/** 全量白名单（派生）。 */
export const AMIS_ALL_TYPES: ReadonlySet<string> = new Set([
  ...AMIS_CONTAINER_TYPES,
  ...AMIS_FORM_TYPES,
  ...AMIS_DISPLAY_TYPES,
]);

/** 平台实测黑名单：渲染失败/行为不符项 → message 给出替代方案。 */
export const AMIS_FORBIDDEN_TYPES: ReadonlyMap<string, string> = new Map([
  [
    'static-file',
    'static-file 在 amis 6.13 渲染失败（spike 实证）；查看态附件请改用 {"type":"input-file","static":true}',
  ],
  ['input-cascader', 'amis 无此类型；级联选择请使用 nested-select 或 chain-select'],
]);

/** 容器类节点承载 children/body 的属性名。 */
export const AMIS_CONTAINER_BODY_KEYS: ReadonlySet<string> = new Set([
  'body',
  'items',
  'columns',
  'tabs',
  'controls',
  'rows',
  'fields',
  'definitions',
  'actions',
  'toolbar',
  'headerToolbar',
  'aside',
  'messages',
]);

/** 跨框架混淆别名表：AI 常用其他组件库的类型名（训练语料干扰），映射到 amis 真实类型。 */
export const AMIS_ALIAS_SUGGESTIONS: ReadonlyMap<string, string> = new Map([
  ['input-cascader', 'nested-select'],
  ['cascader', 'nested-select'],
  ['cascader-multi', 'nested-select'],
  ['cascader-single', 'nested-select'],
  ['tree-select-multi', 'tree-select'],
  ['select-tree', 'tree-select'],
  ['date-picker', 'input-date'],
  ['datetime-picker', 'input-datetime'],
  ['date-range', 'input-date-range'],
  ['upload', 'input-file'],
  ['file-upload', 'input-file'],
  ['image-upload', 'input-image'],
  ['rich-text', 'input-rich-text'],
  ['rich-text-input', 'input-rich-text'],
  ['multi-select', 'checkboxes'],
  ['user-picker', 'input-tag'],
  ['sub-form', 'input-sub-form'],
  ['sub-form-table', 'input-table'],
  ['number-input', 'input-number'],
  ['text-input', 'input-text'],
  ['switch-input', 'switch'],
]);

/** 最长公共前缀/编辑距离近似建议：先查混淆别名，再从白名单找最接近的类型名。 */
export function suggestAmisType(unknownType: string): string | null {
  const alias = AMIS_ALIAS_SUGGESTIONS.get(unknownType.toLowerCase());
  if (alias) return alias;
  const lower = unknownType.toLowerCase();
  let best: string | null = null;
  let bestScore = Infinity;
  for (const candidate of AMIS_ALL_TYPES) {
    const score = levenshtein(lower, candidate);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  // 阈值：编辑距离 ≤ 4 或前缀匹配才算"疑似"
  const prefixHit = best !== null && (best.startsWith(lower) || lower.startsWith(best.slice(0, 6)));
  return bestScore <= 4 || prefixHit ? best : null;
}

/** 经典 DP 编辑距离（仅用于建议，规模小无性能问题）。 */
function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array<number>(b.length).fill(0),
  ]);
  for (let j = 0; j <= b.length; j++) dp[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length]![b.length]!;
}
