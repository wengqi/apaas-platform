/**
 * 自定义规则渲染组件 — 飞书 aPaaS 风格横向四列栅格布局。
 *
 * 替换 RAQB 默认 Rule 组件，通过 config.settings.renderItem 注入。
 *
 * 布局：
 *   ①  [字段 ▾]  [操作符 ▾]  [值类型 ▾]  [值 ▾]  [✕]
 *
 * 飞书对齐功能：
 * - 值类型选择器：引用 / 公式 / 指定值
 * - 操作符按字段类型动态过滤
 * - 为空/不为空：单目操作符，隐藏右值列
 * - 属于/不属于：多值输入
 * - 条件序号 + AND 连接词显示
 */

import { createElement, memo, useState } from 'react';
import { Select, Input, Button, Tag, Popconfirm } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { ItemBuilderProps } from '@react-awesome-query-builder/antd';
import type { Config, Field } from '@react-awesome-query-builder/antd';

// ---------------------------------------------------------------------------
// 操作符定义 — 按字段类型分组（飞书风格）
// ---------------------------------------------------------------------------

interface OperatorDef {
  /** RAQB 操作符 key */
  key: string;
  /** 显示标签 */
  label: string;
  /** 是否为单目操作符（无右值，如 为空/不为空） */
  unary?: boolean;
  /** 是否为多值操作符（如 属于/不属于） */
  multiValue?: boolean;
}

/** 按字段类型映射可用操作符（使用 RAQB 内置操作符 key） */
const OPERATORS_BY_TYPE: Record<string, OperatorDef[]> = {
  text: [
    { key: 'equal', label: '等于' },
    { key: 'not_equal', label: '不等于' },
    { key: 'like', label: '包含' },
    { key: 'not_like', label: '不包含' },
    { key: 'select_any_in', label: '属于' },
    { key: 'select_not_any_in', label: '不属于' },
    { key: 'is_empty', label: '为空', unary: true },
    { key: 'is_not_empty', label: '不为空', unary: true },
  ],
  number: [
    { key: 'equal', label: '等于' },
    { key: 'not_equal', label: '不等于' },
    { key: 'less', label: '小于' },
    { key: 'less_or_equal', label: '小于等于' },
    { key: 'greater', label: '大于' },
    { key: 'greater_or_equal', label: '大于等于' },
    { key: 'is_empty', label: '为空', unary: true },
    { key: 'is_not_empty', label: '不为空', unary: true },
  ],
  boolean: [
    { key: 'equal', label: '等于' },
    { key: 'not_equal', label: '不等于' },
  ],
  date: [
    { key: 'equal', label: '等于' },
    { key: 'not_equal', label: '不等于' },
    { key: 'less', label: '早于' },
    { key: 'less_or_equal', label: '早于等于' },
    { key: 'greater', label: '晚于' },
    { key: 'greater_or_equal', label: '晚于等于' },
    { key: 'is_empty', label: '为空', unary: true },
    { key: 'is_not_empty', label: '不为空', unary: true },
  ],
};

/** 获取字段类型对应的操作符列表 */
function getOperatorsForType(fieldType: string): OperatorDef[] {
  return OPERATORS_BY_TYPE[fieldType] ?? OPERATORS_BY_TYPE['text']!;
}

// ---------------------------------------------------------------------------
// 值类型定义
// ---------------------------------------------------------------------------

const VALUE_SRC_OPTIONS = [
  { label: '引用', value: 'field' },
  { label: '公式', value: 'expr' },
  { label: '指定值', value: 'value' },
];

// ---------------------------------------------------------------------------
// 辅助：从 config.fields 获取字段选项列表
// ---------------------------------------------------------------------------

function getFieldOptions(config: Config): { label: string; value: string; type: string }[] {
  const fields = config.fields as Record<string, Field>;
  return Object.entries(fields)
    .filter(([key]) => !key.startsWith('__'))
    .map(([key, field]) => ({
      label: field.label ?? key,
      value: key,
      type: (field as { type?: string }).type ?? 'text',
    }));
}

// ---------------------------------------------------------------------------
// 辅助：获取字段可用的操作符列表
// ---------------------------------------------------------------------------

function getOperatorOptions(config: Config, fieldName: string | undefined): OperatorDef[] {
  if (!fieldName) return [];
  const fieldConfig = (config.fields as Record<string, Field>)[fieldName];
  if (!fieldConfig) return [];
  const fieldType = (fieldConfig as { type?: string }).type ?? 'text';
  return getOperatorsForType(fieldType);
}

// ---------------------------------------------------------------------------
// 辅助：获取当前选中的字段名
// ---------------------------------------------------------------------------

function getSelectedField(props: ItemBuilderProps): string | undefined {
  const field = props.properties?.get('field');
  if (!field) return undefined;
  if (Array.isArray(field)) return field[field.length - 1] as string;
  return typeof field === 'string' ? field : undefined;
}

function getSelectedOperator(props: ItemBuilderProps): string | undefined {
  const op = props.properties?.get('operator');
  return typeof op === 'string' ? op : undefined;
}

function getSelectedValue(props: ItemBuilderProps): string {
  const value = props.properties?.get('value');
  if (!value) return '';
  const first = value.get?.(0);
  if (first === undefined || first === null) return '';
  return String(first);
}

function getSelectedValueSrc(props: ItemBuilderProps): string {
  const valueSrc = props.properties?.get('valueSrc');
  if (!valueSrc) return 'value';
  const first = valueSrc.get?.(0);
  return typeof first === 'string' ? first : 'value';
}

// ---------------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------------

function CustomRuleImpl(props: ItemBuilderProps): React.ReactElement | null {
  // 只处理 type === 'rule'，其他类型（group 等）用默认组件
  if (props.type !== 'rule') {
    const DefaultCmp = props.itemComponent as unknown as React.ComponentType<
      Record<string, unknown>
    >;
    if (DefaultCmp) return createElement(DefaultCmp, props as unknown as Record<string, unknown>);
    return null;
  }

  const { config, actions, path, id } = props;

  const selectedField = getSelectedField(props);
  const selectedOperator = getSelectedOperator(props);
  const selectedValue = getSelectedValue(props);
  const selectedValueSrc = getSelectedValueSrc(props);

  const fieldOptions = getFieldOptions(config);
  const operatorOptions = getOperatorOptions(config, selectedField);
  const isFieldEmpty = !selectedField;

  // 查找当前操作符定义（判断是否单目/多值）
  const currentOp = operatorOptions.find((op) => op.key === selectedOperator);
  const isUnary = currentOp?.unary ?? false;
  const isMultiValue = currentOp?.multiValue ?? false;

  // 获取当前字段类型
  const currentFieldType = fieldOptions.find((f) => f.value === selectedField)?.type ?? 'text';

  // 值类型选择器：布尔字段不显示值类型选择器（只有"指定值"）
  const showValueSrc = currentFieldType !== 'boolean' && !isUnary;

  return createElement(
    'div',
    null,
    createElement(
      'div',
      {
        className: `custom-rule-row${isFieldEmpty ? ' rule-field-empty' : ''}`,
        'data-id': id,
      },
      // 四列栅格
      createElement(
        'div',
        { className: 'rule-grid' },
        // 列 1：字段选择器
        createElement(
          'div',
          { className: 'rule-cell' },
          createElement(Select, {
            size: 'small',
            placeholder: '搜索',
            value: selectedField,
            onChange: (v: unknown) => {
              actions.setField(path, v as never);
              // 重置操作符为新字段的第一个可用操作符
              const newFieldType = fieldOptions.find((f) => f.value === v)?.type ?? 'text';
              const firstOp = getOperatorsForType(newFieldType)[0];
              if (firstOp) {
                actions.setOperator(path, firstOp.key as never);
              }
            },
            options: fieldOptions,
            showSearch: true,
            optionFilterProp: 'label',
            style: { width: '100%' },
          }),
        ),
        // 列 2：操作符选择器
        createElement(
          'div',
          { className: 'rule-cell' },
          createElement(Select, {
            size: 'small',
            placeholder: '操作符',
            value: selectedOperator,
            onChange: (v: unknown) => {
              actions.setOperator(path, v as string);
              // 单目操作符清空值
              const op = operatorOptions.find((o) => o.key === v);
              if (op?.unary) {
                actions.setValue(path, 0, '' as never, 'text');
              }
            },
            options: operatorOptions.map((op) => ({
              label: op.label,
              value: op.key,
            })),
            disabled: !selectedField,
            style: { width: '100%' },
          }),
        ),
        // 列 3：值类型选择器（单目操作符或布尔字段时隐藏）
        ...(showValueSrc
          ? [
              createElement(
                'div',
                { className: 'rule-cell' },
                createElement(Select, {
                  size: 'small',
                  value: selectedValueSrc,
                  onChange: (v: unknown) => {
                    actions.setValueSrc(path, 0, v as never);
                    // 切换值类型时清空值
                    actions.setValue(path, 0, '' as never, 'text');
                  },
                  options: VALUE_SRC_OPTIONS,
                  style: { width: '100%' },
                }),
              ),
            ]
          : []),
        // 列 4：值输入（单目操作符时隐藏）
        ...(!isUnary
          ? [
              createElement(
                'div',
                { className: 'rule-cell' },
                isMultiValue
                  ? createElement(MultiValueInput, {
                      value: selectedValue,
                      onChange: (v: string) => actions.setValue(path, 0, v as never, 'text'),
                      disabled: !selectedField || !selectedOperator,
                      fieldType: currentFieldType,
                    })
                  : selectedValueSrc === 'field'
                    ? createElement(Select, {
                        size: 'small',
                        placeholder: '搜索',
                        value: selectedValue,
                        onChange: (v: unknown) => actions.setValue(path, 0, v as never, 'field'),
                        options: fieldOptions.map((f) => ({
                          label: f.label,
                          value: f.value,
                        })),
                        showSearch: true,
                        optionFilterProp: 'label',
                        disabled: !selectedField || !selectedOperator,
                        style: { width: '100%' },
                      })
                    : selectedValueSrc === 'expr'
                      ? createElement(Input, {
                          size: 'small',
                          placeholder: '输入公式表达式',
                          value: selectedValue,
                          onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                            actions.setValue(path, 0, e.target.value as never, 'expr'),
                          disabled: !selectedField || !selectedOperator,
                          style: { width: '100%' },
                        })
                      : createElement(ValueInputByType, {
                          fieldType: currentFieldType,
                          value: selectedValue,
                          onChange: (v: string) => actions.setValue(path, 0, v as never, 'text'),
                          disabled: !selectedField || !selectedOperator,
                        }),
              ),
            ]
          : []),
      ),
      // 删除按钮（二次确认）
      createElement(
        Popconfirm,
        {
          title: '确定删除此条件？',
          onConfirm: () => actions.removeRule(path),
          okText: '确定删除',
          cancelText: '取消',
          placement: 'top',
        },
        createElement(Button, {
          size: 'small',
          type: 'text',
          danger: true,
          icon: createElement(DeleteOutlined),
          className: 'rule-delete',
        }),
      ),
    ),
    // 字段为空时红色提示
    isFieldEmpty && createElement('div', { className: 'rule-error' }, '该字段为必填项'),
  );
}

// ---------------------------------------------------------------------------
// 按字段类型渲染值输入
// ---------------------------------------------------------------------------

interface ValueInputByTypeProps {
  fieldType: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

function ValueInputByType({
  fieldType,
  value,
  onChange,
  disabled,
}: ValueInputByTypeProps): React.ReactElement {
  if (fieldType === 'boolean') {
    return createElement(Select, {
      size: 'small',
      value,
      onChange: (v: unknown) => onChange(v as string),
      disabled,
      options: [
        { label: 'true', value: 'true' },
        { label: 'false', value: 'false' },
      ],
      style: { width: '100%' },
    });
  }
  // 文本/数字/日期：统一用 Input
  return createElement(Input, {
    size: 'small',
    placeholder: '输入值',
    value,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value),
    disabled,
    type: fieldType === 'number' ? 'number' : 'text',
    style: { width: '100%' },
  });
}

// ---------------------------------------------------------------------------
// 多值输入（属于/不属于操作符）
// ---------------------------------------------------------------------------

interface MultiValueInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  fieldType: string;
}

function MultiValueInput({ value, onChange, disabled }: MultiValueInputProps): React.ReactElement {
  const [inputValue, setInputValue] = useState('');

  // 值以逗号分隔存储
  const tags = value
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  const handleAdd = (): void => {
    const v = inputValue.trim();
    if (v && !tags.includes(v)) {
      onChange([...tags, v].join(', '));
    }
    setInputValue('');
  };

  const handleRemove = (tag: string): void => {
    onChange(tags.filter((t) => t !== tag).join(', '));
  };

  return createElement(
    'div',
    { style: { display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' } },
    ...tags.map((tag) =>
      createElement(
        Tag,
        {
          key: tag,
          closable: !disabled,
          onClose: () => handleRemove(tag),
          style: { margin: 0 },
        },
        tag,
      ),
    ),
    createElement(Input, {
      size: 'small',
      placeholder: '输入值后回车',
      value: inputValue,
      onChange: (e: React.ChangeEvent<HTMLInputElement>) => setInputValue(e.target.value),
      onPressEnter: handleAdd,
      disabled,
      style: { width: '80px', fontSize: '12px' },
    }),
  );
}

export const CustomRule = memo(CustomRuleImpl);
