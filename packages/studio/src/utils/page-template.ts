/**
 * 页面模板生成 — 新建表单/列表页时基于关联对象字段产出 amis 初始 schema。
 *
 * QA 交互评审（2026-10-03）：CreatePageModal 承诺「基于所选对象的字段自动生成
 * 页面模板」但实现产出空白页——本模块兑现该承诺。口径与 seed-procurement 的
 * amisFieldControl 同源（字段类型 → amis 控件映射），模板进入画布后可继续编辑。
 *
 * 范围界定（诚实边界）：form_page / list_page 生成可用模板；detail_page 需要
 * 路由级记录上下文（:id 参数）、dashboard 需要数据集语义，均保持空白 scaffold。
 */

import type { PageType } from '../api/pages.js';

/**
 * 模板生成所需的字段最小结构 —— studio 本地 Field（api/objects/types）与
 * shared Field 双轨并存，结构化最小合同让两侧调用方都可直接传入。
 */
export interface TemplateField {
  apiName: string;
  label: string;
  /** 字段类型（字符串值域与 shared FieldType 一致，结构化兼容两侧枚举） */
  type: string;
  required?: boolean;
  isSystem?: boolean;
  config?: unknown;
}

/** 支持模板生成的页面类型。 */
export const TEMPLATE_SUPPORTED_TYPES: readonly PageType[] = ['form_page', 'list_page'];

export function supportsTemplate(type: PageType | undefined): boolean {
  return TEMPLATE_SUPPORTED_TYPES.includes(type as PageType);
}

/** 单选选项（FieldConfig.options 存储值合同：value 缺省回退 label——业务可读值，
 *  绝不回退选项 id/UUID：UUID 存库后台账与流程条件均不可用，A 旅程 2026-10-03 实测踩坑）。 */
function selectOptions(f: TemplateField): Array<{ label: string; value: string }> {
  const cfg = f.config as { options?: Array<{ id: string; label: string; value?: string }> };
  return (cfg.options ?? []).map((o) => ({ label: o.label, value: o.value ?? o.label }));
}

/** 字段类型 → amis 表单控件（与 seed-procurement amisFieldControl 同口径）。 */
function fieldToFormControl(f: TemplateField): Record<string, unknown> {
  const base: Record<string, unknown> = {
    name: f.apiName,
    label: f.label,
    required: f.required === true,
  };
  switch (f.type) {
    case 'long_text':
      return { type: 'textarea', ...base };
    case 'currency':
      return { type: 'input-number', ...base, kilobitSeparator: true, precision: 2 };
    case 'number':
    case 'percent':
      return { type: 'input-number', ...base };
    case 'single_select':
      return { type: 'select', ...base, options: selectOptions(f) };
    case 'multi_select':
      return { type: 'select', ...base, multiple: true, options: selectOptions(f) };
    case 'date':
      return { type: 'input-date', ...base, format: 'YYYY-MM-DD' };
    case 'date_time':
      return { type: 'input-datetime', ...base, format: 'YYYY-MM-DD HH:mm:ss' };
    case 'auto_number':
      return { type: 'static', name: f.apiName, label: f.label };
    case 'checkbox':
      return { type: 'switch', name: f.apiName, label: f.label };
    case 'attachment':
      return { type: 'input-file', ...base };
    default:
      return { type: 'input-text', ...base };
  }
}

/** 业务字段（排除系统字段）。 */
function businessFields(fields: TemplateField[]): TemplateField[] {
  return (fields ?? []).filter((f) => f.isSystem !== true);
}

/**
 * 构建页面初始模板。
 *
 * @param type 页面类型（仅 form_page / list_page 产出模板，其余返回空白页）
 * @param obj  关联对象（含字段定义）
 * @param name 页面显示名（作为页面标题）
 */
export function buildPageTemplate(
  type: PageType | undefined,
  obj: { id: string; apiName: string; label?: string; fields: TemplateField[] },
  name: string,
): Record<string, unknown> {
  const emptyPage = { type: 'page', title: name, body: [] };
  if (!supportsTemplate(type) || !obj?.fields) return emptyPage;
  const objLabel = obj.label ?? obj.apiName;

  const fields = businessFields(obj.fields);
  if (type === 'form_page') {
    // 提交表单：业务字段输入 + 提交按钮（submit 为 amis form 原生 actions 类型，
    // 已入 G3 白名单——QA 回归 schema-contract.service.spec）。
    // messages.success 必须显式给：amis saveRemote 的成功 notify 是条件触发
    // （api.messages.success ?? fetcher msg，全空则静默——A 旅程实测连点 3 次
    // 产生 3 条重复记录）；resetAfterSubmit 提交后清空表单，配合必填校验防重复提交。
    return {
      type: 'page',
      title: name,
      data: { objectId: obj.id },
      body: [
        {
          type: 'form',
          title: `${objLabel}表单`,
          api: { url: `/objects/${obj.id}/records`, method: 'post' },
          messages: { success: '提交成功', failed: '提交失败，请稍后重试' },
          resetAfterSubmit: true,
          body: fields.map(fieldToFormControl),
          actions: [{ type: 'submit', label: '提交', level: 'primary' }],
        },
      ],
    };
  }
  // list_page：CRUD 表格（取数走平台相对路径，fetcher 带认证与响应适配）
  return {
    type: 'page',
    title: name,
    data: { objectId: obj.id },
    body: [
      {
        type: 'crud',
        name: `${obj.apiName}_crud`,
        api: {
          url: `/objects/${obj.id}/records?page=$page&pageSize=$perPage`,
          method: 'get',
        },
        perPage: 20,
        columns: fields.slice(0, 6).map((f) => {
          const col: Record<string, unknown> = {
            name: f.apiName,
            label: f.label,
            sortable: true,
          };
          // 交互评审（2026-10-04）：单选/多选列用 amis mapping 显示选项标签——
          // 此前台账直接显示存储值（approved），申请人看不懂
          if (f.type === 'single_select' || f.type === 'multi_select') {
            const map: Record<string, { label: string }> = {};
            for (const o of selectOptions(f)) map[o.value] = { label: o.label };
            col.type = 'mapping';
            col.map = map;
          }
          return col;
        }),
        features: ['create', 'filter'],
      },
    ],
  };
}
