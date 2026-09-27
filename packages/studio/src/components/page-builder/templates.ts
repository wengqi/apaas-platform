/**
 * 页面模板生成 —— 根据 PRD 第 4 节,基于对象元数据自动生成列表/详情/表单页 Schema。
 *
 * 字段类型 → 表单组件映射、ViewModel 自动创建、组件树自动布局均在此实现。
 * 模板产出标准 PageSchema,搭建者可在此基础上微调。
 *
 * 拆分说明（AGENTS.md 单文件 400 行规范）：
 * - 模板辅助(节点工厂/字段映射) → ./templates/helpers.js
 * - 列表/详情/表单页模板 → ./templates/object-page-templates.js
 * - 仪表盘模板 → ./templates/dashboard-template.js
 * - 模板分发 → ./templates/dispatch.js
 * 本文件保持原有导出面不变,继续作为兼容入口。
 */

export type { VariableDef } from '../../api/pages.js';

export {
  generateListPageTemplate,
  generateDetailPageTemplate,
  generateFormPageTemplate,
} from './templates/object-page-templates.js';
export { generateDashboardTemplate } from './templates/dashboard-template.js';
export { generatePageTemplate, pageTypeRequiresObject } from './templates/dispatch.js';
