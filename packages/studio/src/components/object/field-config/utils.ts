/**
 * 字段配置 — 纯逻辑（从 FieldConfigDrawer.tsx 抽出）。
 *
 * 职责：字段 ID 生成、表单值类型、由字段计算表单初始值、由表单值构建字段配置、
 * 统一错误提示。均为无 UI 依赖的纯函数，便于单测。
 */

import { message } from 'antd';
import type { Field, FieldConfig, SelectOption } from '../../../api/objects.js';
import type { FieldType } from '../../../constants/fieldTypes.js';

export function genId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** 字段配置表单值(扁平化,便于动态表单)。 */
export interface FieldFormValues {
  label: string;
  apiName: string;
  required: boolean;
  unique: boolean;
  searchable: boolean;
  description?: string;
  defaultValue?: string | number | boolean;
  maxLength?: number;
  precision?: number;
  currencyCode?: string;
  autoNumberFormat?: string;
  format?: string;
  multi?: boolean;
  targetObjectId?: string;
  relationType?: string;
  inverseFieldName?: string;
  rollup?: {
    relationFieldId?: string;
    targetFieldId?: string;
    aggregate?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  };
}

export function computeInitialValues(type: FieldType, field?: Field): FieldFormValues {
  if (field) {
    const cfg = field.config ?? { type };
    const base: FieldFormValues = {
      label: field.label,
      apiName: field.apiName,
      required: field.required,
      unique: field.unique,
      searchable: field.searchable,
      description: field.description,
      defaultValue: field.defaultValue as string | number | boolean | undefined,
    };
    switch (type) {
      case 'text':
      case 'long_text':
      case 'rich_text':
        base.maxLength = cfg.maxLength;
        break;
      case 'number':
      case 'percent':
        base.precision = cfg.number?.precision;
        break;
      case 'currency':
        base.precision = cfg.currency?.precision;
        base.currencyCode = cfg.currency?.code;
        break;
      case 'auto_number':
        base.autoNumberFormat = cfg.autoNumber?.format;
        break;
      case 'date':
      case 'date_time':
        base.format = cfg.format;
        break;
      case 'user':
        base.multi = cfg.multi;
        break;
      case 'lookup':
        base.targetObjectId = cfg.lookup?.targetObjectId;
        base.relationType = cfg.lookup?.relationType;
        base.inverseFieldName = cfg.lookup?.inverseFieldName;
        break;
      case 'rollup':
        base.rollup = cfg.rollup;
        break;
    }
    return base;
  }
  // 新增默认值
  const defaults: FieldFormValues = {
    label: '',
    apiName: '',
    required: false,
    unique: false,
    searchable: false,
  };
  switch (type) {
    case 'text':
      defaults.maxLength = 255;
      break;
    case 'long_text':
    case 'rich_text':
      defaults.maxLength = 2000;
      break;
    case 'number':
      defaults.precision = 0;
      break;
    case 'percent':
      defaults.precision = 2;
      break;
    case 'currency':
      defaults.precision = 2;
      defaults.currencyCode = 'CNY';
      break;
    case 'auto_number':
      defaults.autoNumberFormat = '{seq:0000}';
      break;
    case 'date':
      defaults.format = 'yyyy-MM-dd';
      break;
    case 'date_time':
      defaults.format = 'yyyy-MM-dd HH:mm';
      break;
    case 'lookup':
      defaults.relationType = 'one_to_many';
      break;
  }
  return defaults;
}

export function buildConfig(
  type: FieldType,
  v: FieldFormValues,
  options: SelectOption[],
): FieldConfig {
  const config: FieldConfig = { type };
  switch (type) {
    case 'text':
    case 'long_text':
    case 'rich_text':
      config.maxLength = v.maxLength;
      break;
    case 'number':
    case 'percent':
      config.number = { precision: v.precision ?? 0 };
      break;
    case 'currency':
      config.currency = { precision: v.precision ?? 0, code: v.currencyCode ?? 'CNY' };
      break;
    case 'auto_number':
      config.autoNumber = { format: v.autoNumberFormat ?? '{seq:0000}' };
      break;
    case 'single_select':
    case 'multi_select':
      config.options = options.filter((o) => !!o.label).map((o) => ({ ...o }));
      break;
    case 'date':
    case 'date_time':
      config.format = v.format;
      break;
    case 'user':
      config.multi = v.multi;
      break;
    case 'lookup':
      config.lookup = {
        targetObjectId: v.targetObjectId ?? '',
        relationType: v.relationType ?? 'one_to_many',
        inverseFieldName: v.inverseFieldName,
      };
      break;
    case 'rollup':
      config.rollup = {
        relationFieldId: v.rollup?.relationFieldId ?? '',
        targetFieldId: v.rollup?.targetFieldId,
        aggregate: v.rollup?.aggregate ?? 'sum',
      };
      break;
  }
  return config;
}

export function showError(err: unknown) {
  const axErr = err as {
    response?: { data?: { error?: { message?: string } }; message?: string };
    message?: string;
  };
  message.error(axErr.response?.data?.error?.message ?? axErr.message ?? '操作失败,请重试');
}
