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

import { createElement, memo } from 'react';
import { Select, Input, Button, Popconfirm } from 'antd';
import { DeleteOutlined } from '@ant-design/icons';
import type { ItemBuilderProps } from '@react-awesome-query-builder/antd';
import { getOperatorsForType } from './custom-rule/operators.js';
import {
  VALUE_SRC_OPTIONS,
  getFieldOptions,
  getOperatorOptions,
  getSelectedField,
  getSelectedOperator,
  getSelectedValue,
  getSelectedValueSrc,
} from './custom-rule/rule-helpers.js';
import { MultiValueInput, ValueInputByType } from './custom-rule/ValueInputs.js';

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

export const CustomRule = memo(CustomRuleImpl);
