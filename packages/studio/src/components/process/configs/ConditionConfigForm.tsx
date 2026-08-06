/**
 * 条件分支节点配置表单 —— 基于 react-awesome-query-builder + CodeMirror 双模式。
 *
 * - 可视化模式：react-awesome-query-builder（Ant Design 主题，嵌套 AND/OR 树）
 * - 表达式模式：CodeMirror 6 编辑器 + 自动补全（变量名/运算符/函数提示）
 * - 底层存储：JsonLogic JSON（标准、可序列化、跨语言）
 *
 * 数据流：
 *   可视化 → exportToJsonLogic → JsonLogic → 存储
 *   表达式 → expressionToJsonLogic → JsonLogic → 存储
 *   后端 → jsonLogic.apply(rule, data) → boolean
 */

import { createElement, useCallback, useMemo, useRef, useState } from 'react';
import { Alert, Button, Divider, Form, Input, Space, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { WorkflowSchema } from '@apaas/shared';
import { Query, Builder } from '@react-awesome-query-builder/antd';
import type { ImmutableTree, BuilderProps } from '@react-awesome-query-builder/antd';
import '@react-awesome-query-builder/antd/css/styles.css';

import { resolveVariables, type VariableOption } from './variable-resolver.js';
import { buildQbConfig, loadFromJsonLogic, exportToJsonLogic } from './query-builder-config.js';
import {
  expressionToJsonLogic,
  jsonLogicToExpression,
  validateExpression,
} from './jsonlogic-utils.js';
import ExpressionCodeEditor from './ExpressionCodeEditor.js';

const { Text } = Typography;

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export interface ConditionBranchItem {
  label: string;
  /** JsonLogic JSON 规则（空 = else/default）。向后兼容：也可能是旧格式 expr-eval 字符串 */
  condition?: object | string | null;
}

export interface ConditionConfigData {
  conditions?: ConditionBranchItem[];
  title?: string;
}

export interface ConditionConfigFormProps {
  data: ConditionConfigData;
  onChange: (data: ConditionConfigData) => void;
  disabled?: boolean;
  schema?: WorkflowSchema;
  currentNodeId?: string;
}

// ---------------------------------------------------------------------------
// renderBuilder — 用 createElement 调用 React.memo 包装的 Builder 组件
// ---------------------------------------------------------------------------

const renderBuilder = (props: BuilderProps) => createElement(Builder, props);

// ---------------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------------

export default function ConditionConfigForm({
  data,
  onChange,
  disabled = false,
  schema,
  currentNodeId,
}: ConditionConfigFormProps) {
  const branches = data.conditions ?? [];

  /** 解析当前节点可用的变量列表 */
  const variableOptions = useMemo(
    () => resolveVariables(schema, currentNodeId),
    [schema, currentNodeId],
  );

  /** RAQB 配置（从变量列表构建） */
  const qbConfig = useMemo(() => buildQbConfig(variableOptions), [variableOptions]);

  const update = (next: ConditionBranchItem[]) => onChange({ ...data, conditions: next });

  const updateBranch = (index: number, patch: Partial<ConditionBranchItem>) => {
    update(branches.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  };

  const addBranch = () => {
    update([...branches, { label: `分支 ${branches.length + 1}`, condition: null }]);
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
                condition={branch.condition ?? null}
                onChange={(cond) => updateBranch(index, { condition: cond })}
                qbConfig={qbConfig}
                variableOptions={variableOptions}
                disabled={disabled}
              />
            )}
          </div>
        ))}
        <Button size="small" type="dashed" icon={<PlusOutlined />} onClick={addBranch} block>
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
  condition: object | string | null;
  onChange: (condition: object | null) => void;
  qbConfig: ReturnType<typeof buildQbConfig>;
  variableOptions: VariableOption[];
  disabled?: boolean;
}

function ConditionEditor({
  condition,
  onChange,
  qbConfig,
  variableOptions,
  disabled = false,
}: ConditionEditorProps) {
  // 向后兼容：旧数据可能是 expr-eval 字符串，转换为 JsonLogic
  const normalizedCondition = useMemo(() => {
    if (!condition) return null;
    if (typeof condition === 'string') {
      const jl = expressionToJsonLogic(condition);
      return jl;
    }
    return condition;
  }, [condition]);

  // 表达式文本状态
  const [exprText, setExprText] = useState(() => {
    if (!condition) return '';
    if (typeof condition === 'string') return condition;
    return jsonLogicToExpression(condition);
  });

  const isLegacyString = typeof condition === 'string';

  const [activeTab, setActiveTab] = useState<'visual' | 'expression'>(
    !condition || typeof condition === 'object' ? 'visual' : 'expression',
  );

  // RAQB 树 — 用 ref 存储避免重渲染循环，用 forceUpdate 触发渲染
  const treeRef = useRef<ImmutableTree>(loadFromJsonLogic(normalizedCondition, qbConfig));
  const [, forceUpdate] = useState(0);

  // RAQB onChange — 更新 ref + 导出 JsonLogic + 强制重渲染
  const onQbChange = useCallback(
    (immutableTree: ImmutableTree) => {
      treeRef.current = immutableTree;
      const logic = exportToJsonLogic(immutableTree, qbConfig);
      onChange(logic);
      forceUpdate((n) => n + 1);
    },
    [qbConfig, onChange],
  );

  // 表达式编辑
  const onExprChange = useCallback(
    (text: string) => {
      setExprText(text);
      const logic = expressionToJsonLogic(text);
      onChange(logic);
    },
    [onChange],
  );

  const handleTabChange = (key: string) => {
    if (key === 'visual') {
      treeRef.current = loadFromJsonLogic(normalizedCondition, qbConfig);
      forceUpdate((n) => n + 1);
      setActiveTab('visual');
    } else {
      setExprText(jsonLogicToExpression(normalizedCondition));
      setActiveTab('expression');
    }
  };

  const _validation = validateExpression(exprText);

  return (
    <>
      {isLegacyString && (
        <Alert
          type="info"
          message="此条件使用旧格式表达式，保存后将自动转换为 JsonLogic 格式。"
          style={{ marginBottom: 8, padding: '4px 8px', fontSize: 12 }}
        />
      )}
      {/* 模式切换按钮 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <Button
          size="small"
          type={activeTab === 'visual' ? 'primary' : 'default'}
          onClick={() => handleTabChange('visual')}
        >
          可视化
        </Button>
        <Button
          size="small"
          type={activeTab === 'expression' ? 'primary' : 'default'}
          onClick={() => handleTabChange('expression')}
        >
          表达式
        </Button>
      </div>

      {/* 可视化模式 — 条件渲染而非 Tabs，避免 AntD Tabs 对 RAQB 内部 Redux 的影响 */}
      {activeTab === 'visual' && (
        <div style={{ minHeight: 60 }}>
          {createElement(Query, {
            ...qbConfig,
            value: treeRef.current,
            onChange: onQbChange,
            renderBuilder: renderBuilder,
          })}
        </div>
      )}

      {/* 表达式模式 */}
      {activeTab === 'expression' && (
        <ExpressionCodeEditor
          value={exprText}
          onChange={onExprChange}
          variables={variableOptions}
          disabled={disabled}
        />
      )}
    </>
  );
}
