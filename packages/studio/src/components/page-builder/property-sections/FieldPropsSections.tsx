/**
 * 表单字段组件的专属属性分组（内容 / 校验 / 交互 / 尺寸）。
 *
 * 对齐飞书 aPaaS 字段属性面板：
 * - 内容：标题、占位符、默认值、选项（select 类）
 * - 校验：必填、最大长度、最大/最小值、精度
 * - 交互：只读、禁用、隐藏
 * - 尺寸：宽度（12 栅格 span）
 */

import { useMemo } from 'react';
import { Button, Input, InputNumber, Switch, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { usePageBuilderStore } from '../../../stores/pageBuilder.js';
import type { ComponentNode, ComponentType, PropValue } from '../../../api/pages.js';
import { PropGroup, PropRow } from './PropRow.js';

const { Text } = Typography;

/** 14 个表单字段组件类型（对齐 shared ComponentType 表单类）。 */
const FORM_FIELD_TYPES: ReadonlySet<string> = new Set([
  'text_input',
  'textarea',
  'number_input',
  'select',
  'multi_select',
  'date_picker',
  'radio',
  'checkbox',
  'switch',
  'lookup_picker',
  'sub_form_table',
  'attachment_upload',
  'user_picker',
]);

/** 是否为表单字段组件（驱动属性面板字段专属分组）。 */
export function isFormFieldType(type: string): boolean {
  return FORM_FIELD_TYPES.has(type);
}

// ---------------------------------------------------------------------------
// props 读写辅助（仅处理字面量；绑定/表达式值编辑时以字面量覆盖）
// ---------------------------------------------------------------------------

function getStr(node: ComponentNode, key: string): string {
  const v = node.props[key];
  return typeof v === 'string' ? v : '';
}

function getNum(node: ComponentNode, key: string): number | undefined {
  const v = node.props[key];
  return typeof v === 'number' ? v : undefined;
}

function getBool(node: ComponentNode, key: string): boolean {
  return node.props[key] === true;
}

interface SectionProps {
  node: ComponentNode;
}

// ---------------------------------------------------------------------------
// 内容
// ---------------------------------------------------------------------------

export function FieldContentSection({ node }: SectionProps) {
  const updateComponentProps = usePageBuilderStore((s) => s.updateComponentProps);

  return (
    <PropGroup title="内容">
      <PropRow label="标题">
        <Input
          size="small"
          value={getStr(node, 'label')}
          onChange={(e) => updateComponentProps(node.id, { label: e.target.value })}
          placeholder="字段标题"
        />
      </PropRow>
      {hasPlaceholder(node.type) && (
        <PropRow label="占位符">
          <Input
            size="small"
            value={getStr(node, 'placeholder')}
            onChange={(e) => updateComponentProps(node.id, { placeholder: e.target.value })}
            placeholder={node.type === 'date_picker' ? '请选择日期' : '请输入'}
          />
        </PropRow>
      )}
      <PropRow label="默认值">
        <Input
          size="small"
          value={getStr(node, 'defaultValue')}
          onChange={(e) => updateComponentProps(node.id, { defaultValue: e.target.value })}
          placeholder="请输入"
        />
      </PropRow>
      {hasOptions(node.type) && <OptionsEditor node={node} />}
      {node.type === 'textarea' && (
        <PropRow label="行数">
          <InputNumber
            size="small"
            min={2}
            max={20}
            value={getNum(node, 'rows') ?? 4}
            onChange={(v) => updateComponentProps(node.id, { rows: v ?? 4 })}
            style={{ width: '100%' }}
          />
        </PropRow>
      )}
      {node.type === 'date_picker' && (
        <PropRow label="显示时间">
          <Switch
            size="small"
            checked={getBool(node, 'showTime')}
            onChange={(v) =>
              updateComponentProps(node.id, {
                showTime: v,
                format: v ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD',
              })
            }
          />
        </PropRow>
      )}
      {node.type === 'user_picker' && (
        <PropRow label="允许多选">
          <Switch
            size="small"
            checked={getBool(node, 'multiple')}
            onChange={(v) => updateComponentProps(node.id, { multiple: v })}
          />
        </PropRow>
      )}
      {/* 绑定的对象字段（对应飞书 form data key，生成时写入，只读展示） */}
      {typeof node.props.apiName === 'string' && (
        <PropRow label="字段 API">
          <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
            {node.props.apiName}
          </Text>
        </PropRow>
      )}
    </PropGroup>
  );
}

/** 选项编辑器（single_select / multi_select / radio / checkbox 的 options）。 */
function OptionsEditor({ node }: SectionProps) {
  const updateComponentProps = usePageBuilderStore((s) => s.updateComponentProps);

  const options = useMemo<{ label: string; value: string }[]>(() => {
    const raw = node.props.options;
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (o): o is { label: string; value: string } =>
        typeof o === 'object' && o !== null && typeof (o as { label?: unknown }).label === 'string',
    );
  }, [node.props.options]);

  const writeOptions = (next: { label: string; value: string }[]) => {
    updateComponentProps(node.id, { options: next as unknown as PropValue[] });
  };

  return (
    <div style={{ padding: '4px 0 8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ fontSize: 13, color: 'rgba(0,0,0,0.65)' }}>选项</Text>
        <Button
          type="text"
          size="small"
          icon={<PlusOutlined />}
          onClick={() =>
            writeOptions([
              ...options,
              { label: `选项${options.length + 1}`, value: `option_${options.length + 1}` },
            ])
          }
        >
          添加
        </Button>
      </div>
      {options.map((opt, idx) => (
        <div key={idx} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <Input
            size="small"
            value={opt.label}
            placeholder="标签"
            onChange={(e) => {
              const next = [...options];
              const item = next[idx];
              if (item) next[idx] = { ...item, label: e.target.value };
              writeOptions(next);
            }}
          />
          <Input
            size="small"
            value={opt.value}
            placeholder="值"
            onChange={(e) => {
              const next = [...options];
              const item = next[idx];
              if (item) next[idx] = { ...item, value: e.target.value };
              writeOptions(next);
            }}
          />
          <Button
            type="text"
            size="small"
            icon={<DeleteOutlined style={{ color: 'rgba(0,0,0,0.45)' }} />}
            onClick={() => writeOptions(options.filter((_, i) => i !== idx))}
          />
        </div>
      ))}
    </div>
  );
}

function hasPlaceholder(type: ComponentType): boolean {
  return [
    'text_input',
    'textarea',
    'number_input',
    'select',
    'multi_select',
    'date_picker',
    'lookup_picker',
    'user_picker',
  ].includes(type);
}

function hasOptions(type: ComponentType): boolean {
  return ['select', 'multi_select', 'radio', 'checkbox'].includes(type);
}

// ---------------------------------------------------------------------------
// 校验
// ---------------------------------------------------------------------------

export function FieldValidateSection({ node }: SectionProps) {
  const updateComponentProps = usePageBuilderStore((s) => s.updateComponentProps);

  return (
    <PropGroup title="校验">
      <PropRow label="必填">
        <Switch
          size="small"
          checked={getBool(node, 'required')}
          onChange={(v) => updateComponentProps(node.id, { required: v })}
        />
      </PropRow>
      {(node.type === 'text_input' || node.type === 'textarea') && (
        <PropRow label="最大长度">
          <InputNumber
            size="small"
            min={1}
            value={getNum(node, 'maxLength')}
            onChange={(v) => updateComponentProps(node.id, { maxLength: v ?? undefined })}
            style={{ width: '100%' }}
            placeholder="不限制"
          />
        </PropRow>
      )}
      {node.type === 'number_input' && (
        <>
          <PropRow label="最小值">
            <InputNumber
              size="small"
              value={getNum(node, 'min')}
              onChange={(v) => updateComponentProps(node.id, { min: v ?? undefined })}
              style={{ width: '100%' }}
              placeholder="不限制"
            />
          </PropRow>
          <PropRow label="最大值">
            <InputNumber
              size="small"
              value={getNum(node, 'max')}
              onChange={(v) => updateComponentProps(node.id, { max: v ?? undefined })}
              style={{ width: '100%' }}
              placeholder="不限制"
            />
          </PropRow>
          <PropRow label="小数位数">
            <InputNumber
              size="small"
              min={0}
              max={6}
              value={getNum(node, 'precision')}
              onChange={(v) => updateComponentProps(node.id, { precision: v ?? undefined })}
              style={{ width: '100%' }}
              placeholder="不限制"
            />
          </PropRow>
        </>
      )}
    </PropGroup>
  );
}

// ---------------------------------------------------------------------------
// 交互
// ---------------------------------------------------------------------------

export function FieldInteractionSection({ node }: SectionProps) {
  const updateComponentProps = usePageBuilderStore((s) => s.updateComponentProps);
  const updateNode = usePageBuilderStore((s) => s.updateNode);
  const hidden = node.hidden === true;

  return (
    <PropGroup title="交互">
      <PropRow label="只读">
        <Switch
          size="small"
          checked={getBool(node, 'readonly')}
          onChange={(v) => updateComponentProps(node.id, { readonly: v })}
        />
      </PropRow>
      <PropRow label="禁用">
        <Switch
          size="small"
          checked={getBool(node, 'disabled')}
          onChange={(v) => updateComponentProps(node.id, { disabled: v })}
        />
      </PropRow>
      <PropRow label="隐藏">
        <Switch
          size="small"
          checked={hidden}
          onChange={(v) => updateNode(node.id, { hidden: v })}
        />
      </PropRow>
    </PropGroup>
  );
}

// ---------------------------------------------------------------------------
// 尺寸（宽度 12 栅格，对应飞书「宽度 12 栅格」）
// ---------------------------------------------------------------------------

export const FULL_ROW_SPAN = 12;

export function FieldSizeSection({ node }: SectionProps) {
  const updateComponentProps = usePageBuilderStore((s) => s.updateComponentProps);
  const span = getNum(node, 'span') ?? FULL_ROW_SPAN;

  return (
    <PropGroup title="尺寸">
      <PropRow label="宽度">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <InputNumber
            size="small"
            min={1}
            max={FULL_ROW_SPAN}
            value={span}
            onChange={(v) => updateComponentProps(node.id, { span: v ?? FULL_ROW_SPAN })}
            style={{ width: 72 }}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            / {FULL_ROW_SPAN} 栅格
          </Text>
        </div>
      </PropRow>
    </PropGroup>
  );
}
