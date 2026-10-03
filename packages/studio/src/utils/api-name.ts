/**
 * 显示名称 → API 名称自动转写（A 旅程 2026-10-03:对象/字段/页面三处 API 名称必填,
 * 新手每个资源都要手动起英文名——显示名称填完后自动带出）。
 *
 * 规则:中文转拼音、英数保留、其余字符作分隔,输出 snake_case;
 * 全部清洗后为空时返回空串(交由表单必填校验兜底)。
 */

import { pinyin } from 'pinyin-pro';

export function toApiName(label: string): string {
  const source = label.trim();
  if (!source) return '';
  const latin = pinyin(source, { toneType: 'none', type: 'array', nonZh: 'consecutive' });
  const joined = Array.isArray(latin) ? latin.join(' ') : String(latin);
  const slug = joined
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
  return slug;
}
