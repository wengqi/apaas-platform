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

import { createElement, memo, useCallback, useMemo, useState } from 'react';
import { Alert, Button, Divider, Form, Input, Space, Tabs, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { WorkflowSchema } from '@apaas/shared';
import { Query, Builder } from '@react-awesome-query-builder/antd';
import type { ImmutableTree, BuilderProps, Config } from '@react-awesome-query-builder/antd';
import '@react-awesome-query-builder/antd/css/styles.css';

import { resolveVariables, type VariableOption } from './variable-resolver.js';
import {
  buildQbConfig,
  loadFromJsonLogic,
  exportToJsonLogic,
} from './query-builder-config.js';
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
// QueryBuilderPanel — 独立组件，避免 Tabs 重渲染导致 Query 重新挂载
// ---------------------------------------------------------------------------

interface QueryBuilderPanelProps {
  config: Config;
  tree: ImmutableTree;
  onChange: (tree: ImmutableTree) => void;
}

const QueryBuilderPanel = memo(function QueryBuilderPanel({
  config,
  tree,
  onChange,
}: QueryBuilderPanelProps) {
  return (
    <div style={{ minHeight: 60 }}>
      <Query
        {...config}
        value={tree}
        onChange={onChange}
        renderBuilder={renderBuilder}
      />
    </div>
  );
});

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
  const qbConfig = useMemo(
    () => buildQbConfig(variableOptions),
    [variableOptions],
  );

  const update = (next: ConditionBranchItem[]) =>
    onChange({ ...data, conditions: next });

  const updateBranch = (index: number, patch: Partial<ConditionBranchItem>) => {
    update(branches.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  };

  const addBranch = () => {
    update([
      ...branches,
      { label: `分支 ${branches.length + 1}`, condition: null },
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
                condition={branch.condition ?? null}
                onChange={(cond) => updateBranch(index, { condition: cond })}
                qbConfig={qbConfig}
                variableOptions={variableOptions}
                disabled={disabled}
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
      // 旧格式字符串 → 尝试转为 JsonLogic
      const jl = expressionToJsonLogic(condition);
      return jl; // 解析失败返回 null（作为空条件处理）
    }
    return condition;
  }, [condition]);

  // 表达式文本状态（用于表达式 Tab）
  const [exprText, setExprText] = useState(() => {
    if (!condition) return '';
    if (typeof condition === 'string') return condition;
    return jsonLogicToExpression(condition);
  });

  // 表达式是否为旧格式字符串（需要提示用户保存后将转为 JsonLogic）
  const isLegacyString = typeof condition === 'string';

  // 决定初始 Tab：空条件 → 可视化；旧字符串 → 表达式；JsonLogic → 可视化
  const [activeTab, setActiveTab] = useState<'visual' | 'expression'>(
    !condition || typeof condition === 'object' ? 'visual' : 'expression',
  );

  // RAQB 树状态
  const [qbTree, setQbTree] = useState<ImmutableTree>(() =>
    loadFromJsonLogic(normalizedCondition, qbConfig),
  );

  // 处理 RAQB onChange — 更新树状态 + 导出 JsonLogic
  const onQbChange = useCallback(
    (immutableTree: ImmutableTree) => {
      setQbTree(immutableTree);
      const logic = exportToJsonLogic(immutableTree, qbConfig);
      onChange(logic);
    },
    [qbConfig, onChange],
  );

  // 处理表达式编辑 — 转换为 JsonLogic
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
      // 切到可视化：从当前 JsonLogic 加载到 RAQB
      setQbTree(loadFromJsonLogic(normalizedCondition, qbConfig));
      setActiveTab('visual');
    } else {
      // 切到表达式：从 JsonLogic 生成表达式文本
      setExprText(jsonLogicToExpression(normalizedCondition));
      setActiveTab('expression');
    }
  };

  const validation = validateExpression(exprText);

  return (
    <>
      {isLegacyString && (
        <Alert
          type="info"
          message="此条件使用旧格式表达式，保存后将自动转换为 JsonLogic 格式。"
          style={{ marginBottom: 8, padding: '4px 8px', fontSize: 12 }}
        />
      )}
      <Tabs
        size="small"
        activeKey={activeTab}
        onChange={handleTabChange}
        destroyInactiveTabPane={false}
        items={[
          {
            key: 'visual',
            label: '可视化',
            children: (
              <QueryBuilderPanel
                config={qbConfig}
                tree={qbTree}
                onChange={onQbChange}
              />
            ),
          },
          {
            key: 'expression',
            label: '表达式',
            children: (
              <ExpressionCodeEditor
                value={exprText}
                onChange={onExprChange}
                variables={variableOptions}
                disabled={disabled}
              />
            ),
          },
        ]}
      />
    </>
  );
}
