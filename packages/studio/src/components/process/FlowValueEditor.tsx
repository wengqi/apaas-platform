/**
 * 四态值编辑器 (IFlowValue) —— 对齐 DESIGN-process.md §6.9。
 *
 * 所有节点配置中支持变量绑定的字段统一用此编辑器,产出 IFlowValue 四态:
 *  - constant: 常量(按字段类型 Input/InputNumber/Switch)
 *  - ref: 引用变量路径(VariablePicker TreeSelect)
 *  - expression: 表达式(TextArea)
 *  - template: 模板字符串(支持 ${var} 插值)
 */

import { useMemo } from 'react';
import { Input, InputNumber, Segmented, Space, Switch } from 'antd';
import { LinkOutlined } from '@ant-design/icons';
import type { IFlowValue } from '@apaas/shared';
import { VariablePicker } from './VariablePicker.js';

const { TextArea } = Input;

export type FlowValueKind = 'constant' | 'ref' | 'expression' | 'template';

export interface FlowValueEditorProps {
  /** 当前值 */
  value?: IFlowValue;
  /** 变化回调 */
  onChange?: (value: IFlowValue) => void;
  /** 常量态的字段类型(input=文本 / number=数字 / switch=布尔) */
  constantType?: 'input' | 'number' | 'switch';
  /** 是否多行(模板/表达式态用 TextArea) */
  multiline?: boolean;
  /** 占位提示 */
  placeholder?: string;
  /** 禁用 */
  disabled?: boolean;
  /** 可用的变量路径候选(传给 VariablePicker) */
  variableOptions?: { value: string; label: string; children?: unknown[] }[];
  /** 允许的态(默认全部) */
  allowedKinds?: FlowValueKind[];
}

const KIND_LABELS: Record<FlowValueKind, string> = {
  constant: '常量',
  ref: '引用',
  expression: '表达式',
  template: '模板',
};

/** 解析 IFlowValue 的态,缺省为 constant。 */
function kindOf(value?: IFlowValue): FlowValueKind {
  if (!value) return 'constant';
  return (value.type as FlowValueKind) ?? 'constant';
}

/** 读取 content 的字符串形式。 */
function contentStr(value?: IFlowValue): string {
  if (!value || value.content == null) return '';
  if (Array.isArray(value.content)) return value.content.join('.');
  return String(value.content);
}

export function FlowValueEditor({
  value,
  onChange,
  constantType = 'input',
  multiline = false,
  placeholder,
  disabled = false,
  variableOptions = [],
  allowedKinds = ['constant', 'ref', 'expression', 'template'],
}: FlowValueEditorProps) {
  const kind = kindOf(value);

  const segmentedOptions = useMemo(
    () =>
      allowedKinds.map((k) => ({
        label: KIND_LABELS[k],
        value: k,
      })),
    [allowedKinds],
  );

  /** 切换态时,保留 content 字符串形式以减少丢失。 */
  const handleKindChange = (newKind: FlowValueKind) => {
    const prevStr = contentStr(value);
    const next: IFlowValue =
      newKind === 'ref'
        ? { type: 'ref', content: prevStr ? prevStr.split('.') : [] }
        : { type: newKind, content: prevStr };
    onChange?.(next);
  };

  /** 常量态控件。 */
  const renderConstant = () => {
    const v = value?.type === 'constant' ? value.content : undefined;
    if (constantType === 'number') {
      return (
        <InputNumber
          value={typeof v === 'number' ? v : undefined}
          onChange={(num) => onChange?.({ type: 'constant', content: num ?? '' })}
          placeholder={placeholder}
          disabled={disabled}
          style={{ width: '100%' }}
        />
      );
    }
    if (constantType === 'switch') {
      return (
        <Switch
          checked={v === true}
          onChange={(checked) => onChange?.({ type: 'constant', content: checked })}
          disabled={disabled}
        />
      );
    }
    return (
      <Input
        value={typeof v === 'string' ? v : v == null ? '' : String(v)}
        onChange={(e) => onChange?.({ type: 'constant', content: e.target.value })}
        placeholder={placeholder}
        disabled={disabled}
      />
    );
  };

  return (
    <div>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Segmented
          size="small"
          options={segmentedOptions}
          value={kind}
          onChange={(val) => handleKindChange(val as FlowValueKind)}
          disabled={disabled}
        />
        {kind === 'constant' && renderConstant()}
        {kind === 'ref' && (
          <VariablePicker
            value={value?.type === 'ref' ? (value.content as string[]) : []}
            onChange={(path) => onChange?.({ type: 'ref', content: path })}
            options={variableOptions}
            disabled={disabled}
            placeholder={placeholder ?? '选择变量路径'}
          />
        )}
        {kind === 'expression' &&
          (multiline ? (
            <TextArea
              value={value?.type === 'expression' ? (value.content as string) : ''}
              onChange={(e) => onChange?.({ type: 'expression', content: e.target.value })}
              placeholder={placeholder ?? 'amount > 1000 && status == 1'}
              rows={3}
              disabled={disabled}
            />
          ) : (
            <Input
              value={value?.type === 'expression' ? (value.content as string) : ''}
              onChange={(e) => onChange?.({ type: 'expression', content: e.target.value })}
              placeholder={placeholder ?? '表达式'}
              disabled={disabled}
              suffix={<LinkOutlined style={{ color: 'rgba(0,0,0,0.25)' }} />}
            />
          ))}
        {kind === 'template' &&
          (multiline ? (
            <TextArea
              value={value?.type === 'template' ? (value.content as string) : ''}
              onChange={(e) => onChange?.({ type: 'template', content: e.target.value })}
              placeholder={placeholder ?? '${record.name} 审批已完成'}
              rows={3}
              disabled={disabled}
            />
          ) : (
            <Input
              value={value?.type === 'template' ? (value.content as string) : ''}
              onChange={(e) => onChange?.({ type: 'template', content: e.target.value })}
              placeholder={placeholder ?? '${record.name}'}
              disabled={disabled}
              suffix={<LinkOutlined style={{ color: 'rgba(0,0,0,0.25)' }} />}
            />
          ))}
      </Space>
    </div>
  );
}

export default FlowValueEditor;
