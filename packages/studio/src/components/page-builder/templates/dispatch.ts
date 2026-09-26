/**
 * 从 components/page-builder/templates.ts 拆分（AGENTS.md 单文件 400 行规范）。
 *
 * 模板分发:按页面类型选择生成策略。
 */

import type { PageSchema, PageType } from '../../../api/pages.js';
import type { ObjectWithFields } from '../../../api/objects.js';
import { createDefaultSchema } from '../../../stores/pageBuilder.js';
import { generateDashboardTemplate } from './dashboard-template.js';
import {
  generateDetailPageTemplate,
  generateFormPageTemplate,
  generateListPageTemplate,
} from './object-page-templates.js';

/**
 * 按页面类型生成模板。
 * - list_page / detail_page / form_page: 基于对象字段自动生成
 * - dashboard / custom: 空白 Schema
 */
export function generatePageTemplate(
  pageType: PageType,
  meta: ObjectWithFields | null,
): PageSchema {
  if (!meta) {
    return createDefaultSchema(pageType);
  }

  switch (pageType) {
    case 'list_page':
      return generateListPageTemplate(meta);
    case 'detail_page':
      return generateDetailPageTemplate(meta);
    case 'form_page':
      return generateFormPageTemplate(meta);
    case 'dashboard':
      return generateDashboardTemplate();
    default:
      return createDefaultSchema(pageType);
  }
}

/** 判断页面类型是否需要关联对象。 */
export function pageTypeRequiresObject(pageType: PageType): boolean {
  return pageType === 'list_page' || pageType === 'detail_page' || pageType === 'form_page';
}
