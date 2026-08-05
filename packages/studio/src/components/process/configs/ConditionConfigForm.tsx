/**
 * 条件分支节点配置表单 —— 对齐 DESIGN-process.md §6.3。
 *
 * 混合模式编辑器：
 * - 可视化 Tab：字段 + 运算符 + 值 行式编辑，多行用 AND/OR 组合
 * - 表达式 Tab：TextArea + 实时语法校验
 * 底层存储格式统一为 expr-eval 兼容表达式字符串（如 `amount > 1000 and status == "urgent"`）。
 */

import { useEffect, useState } from 'react';
import { Alert, Button, Divider, Form, Input, Select, Space, Tabs, Tag, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  OPERATOR_OPTIONS,
  COMBINER_OPTIONS,
  visualToExpression,
  expressionToVisual,
  validateExpression,
  type VisualCondition,
  type ConditionRow,
} from './expression-utils.js';

const { Text } = Typography;

export interface ConditionBranchItem {
  label: string;
  condition?: string;
}

export interface ConditionConfigData {
  conditions?: ConditionBranchItem[];
  title?: string;
}

export interface ConditionConfigFormProps {
  data: ConditionConfigData;
  onChange: (data: ConditionConfigData) => void;
  disabled?: boolean;
}

export default function ConditionConfigForm({
  data,
  onChange,
  disabled = false,
}: ConditionConfigFormProps) {
  const branches = data.conditions ?? [];

  const update = (next: ConditionBranchItem[]) =>
    onChange({ ...data, conditions: next });

  const updateBranch = (index: number, patch: Partial<ConditionBranchItem>) => {
    update(branches.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  };

  const addBranch = () => {
    update([
      ...branches,
      { label: `分支 ${branches.length + 1}`, condition: '' },
    ]);
  };

  const removeBranch = (index: number) => {
    update(branches.filter((_, i) => i !== index));
  };

  return (
    <Form layout="vertical" size="small" disabled={disabled} component="div">
      <Divider orientation="left" plain style={{ marginTop: 0 }}>
        条件分支
      </Divider>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {branches.map((branch, index) => (
          <div
            key={index}
            style={{
              border: '1px solid #eef0f4',
              borderRadius: 8,
              padding: 12,
            }}
          >
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <Input
                size="small"
                placeholder="分支名称(如:条件成立)"
                value={branch.label}
                onChange={(e) => updateBranch(index, { label: e.target.value })}
                style={{ flex: 1 }}
              />
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => removeBranch(index)}
                disabled={branches.length <= 1}
              />
            </div>
            {index === branches.length - 1 && !branch.condition ? (
              <Text type="secondary" style={{ fontSize: 12 }}>
                空条件 = 否则(default)
              </Text>
            ) : (
              <ConditionEditor
                condition={branch.condition ?? ''}
                onChange={(cond) => updateBranch(index, { condition: cond })}
              />
            )}
          </div>
        ))}
        <Button
          size="small"
          type="dashed"
          icon={<PlusOutlined />}
          onClick={addBranch}
          block
        >
          添加分支
        </Button>
      </Space>
    </Form>
  );
}

// ---------------------------------------------------------------------------
// 条件编辑器（可视化 / 表达式 双模式切换）
// ---------------------------------------------------------------------------

interface ConditionEditorProps {
  condition: string;
  onChange: (condition: string) => void;
}

function ConditionEditor({ condition, onChange }: ConditionEditorProps) {
  // 尝试从现有表达式解析可视化结构
  const initialVisual = expressionToVisual(condition);
  const [activeTab, setActiveTab] = useState<'visual' | 'expression'>(
    initialVisual ? 'visual' : 'expression',
  );
  // 可视化状态：若解析失败，初始化为空行
  const [visual, setVisual] = useState<VisualCondition>(
    initialVisual ?? { rows: [createEmptyRow()], combiner: 'AND' },
  );

  // 当外部 condition 变化（如切换节点）时，重新解析
  useEffect(() => {
    const parsed = expressionToVisual(condition);
    if (parsed) {
      setVisual(parsed);
      // 如果当前在表达式 Tab 且新表达式可可视化，保持不变（用户可能正在编辑）
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [condition]);

  const updateVisual = (next: VisualCondition) => {
    setVisual(next);
    const expr = visualToExpression(next);
    onChange(expr);
  };

  const handleTabChange = (key: string) => {
    if (key === 'visual') {
      // 切到可视化：尝试解析当前表达式
      const parsed = expressionToVisual(condition);
      if (parsed) {
        setVisual(parsed);
        setActiveTab('visual');
      } else {
        // 无法解析 → 留在表达式 Tab，提示用户
        return;
      }
    } else {
      // 切到表达式：从可视化生成表达式
      const expr = visualToExpression(visual);
      onChange(expr);
      setActiveTab('expression');
    }
  };

  const validation = validateExpression(condition);

  return (
    <Tabs
      size="small"
      activeKey={activeTab}
      onChange={handleTabChange}
      items={[
        {
          key: 'visual',
          label: '可视化',
          children: (
            <VisualConditionEditor
              visual={visual}
              onChange={updateVisual}
            />
          ),
        },
        {
          key: 'expression',
          label: '表达式',
          children: (
            <ExpressionEditor
              condition={condition}
              onChange={onChange}
              validation={validation}
            />
          ),
        },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// 可视化条件编辑器
// ---------------------------------------------------------------------------

function createEmptyRow(): ConditionRow {
  return { field: '', operator: '>', value: '', valueType: 'number' };
}

interface VisualConditionEditorProps {
  visual: VisualCondition;
  onChange: (visual: VisualCondition) => void;
}

function VisualConditionEditor({ visual, onChange }: VisualConditionEditorProps) {
  const { rows, combiner } = visual;

  const updateRow = (index: number, patch: Partial<ConditionRow>) => {
    const nextRows = rows.map((r, i) => (i === index ? { ...r, ...patch } : r));
    onChange({ rows: nextRows, combiner });
  };

  const addRow = () => {
    onChange({ rows: [...rows, createEmptyRow()], combiner });
  };

  const removeRow = (index: number) => {
    onChange({ rows: rows.filter((_, i) => i !== index), combiner });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rows.map((row, index) => (
        <div key={index}>
          {index > 0 && (
            <div style={{ marginBottom: 4 }}>
              <Select
                size="small"
                value={combiner}
                onChange={(v) => onChange({ rows, combiner: v })}
                options={COMBINER_OPTIONS}
                style={{ width: 120 }}
                variant="borderless"
              />
            </div>
          )}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <Input
              size="small"
              placeholder="字段名"
              value={row.field}
              onChange={(e) => updateRow(index, { field: e.target.value })}
              style={{ flex: 1 }}
            />
            <Select
              size="small"
              value={row.operator}
              onChange={(v) => updateRow(index, { operator: v })}
              options={OPERATOR_OPTIONS}
              style={{ width: 90 }}
            />
            <Input
              size="small"
              placeholder="值"
              value={row.value}
              onChange={(e) => updateRow(index, { value: e.target.value })}
              style={{ flex: 1 }}
            />
            <Select
              size="small"
              value={row.valueType}
              onChange={(v) => updateRow(index, { valueType: v })}
              options={[
                { label: '数字', value: 'number' },
                { label: '文本', value: 'string' },
              ]}
              style={{ width: 70 }}
            />
            <Button
              size="small"
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() => removeRow(index)}
              disabled={rows.length <= 1}
            />
          </div>
        </div>
      ))}
      <Button
        size="small"
        type="dashed"
        icon={<PlusOutlined />}
        onClick={addRow}
        block
      >
        添加条件
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 表达式编辑器
// ---------------------------------------------------------------------------

interface ExpressionEditorProps {
  condition: string;
  onChange: (condition: string) => void;
  validation: { valid: boolean; error?: string };
}

function ExpressionEditor({ condition, onChange, validation }: ExpressionEditorProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <Input.TextArea
        size="small"
        placeholder='条件表达式，例如: amount > 1000 and status == "urgent"'
        value={condition}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
      />
      {condition.trim() ? (
        validation.valid ? (
          <Tag color="green" style={{ alignSelf: 'flex-start' }}>
            语法正确
          </Tag>
        ) : (
          <Alert
            type="error"
            message={validation.error}
            style={{ padding: '4px 8px', fontSize: 12 }}
          />
        )
      ) : null}
    </div>
  );
}
