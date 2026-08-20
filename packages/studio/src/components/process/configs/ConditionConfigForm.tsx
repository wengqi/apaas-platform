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

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Divider, Form, Input, Popconfirm, Space, Tag, Typography } from 'antd';
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
  /** 分支唯一标识（用于 React key，避免删除/添加时复用错误的编辑器实例） */
  id?: string;
  label: string;
  /** JsonLogic JSON 规则（空 = else/default） */
  condition?: object | null;
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
// renderBuilder — 用 createElement 调用 Builder 组件
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
  const dataBranches = data.conditions ?? [];

  // 使用 ref 跟踪最新的 branches，避免连续操作时 data prop 未更新导致的状态丢失
  // 只在 data prop 的 branches 数量大于等于 ref 时才同步（外部更新）
  // 当 ref 更新（内部 addBranch/removeBranch）但 data prop 还没更新时，保留 ref 的值
  const branchesRef = useRef(dataBranches);
  if (dataBranches.length >= branchesRef.current.length) {
    // 外部更新：按 label/index 匹配保留 ref 中已有的 id，
    // 避免 reconcile 去掉 id 后重新生成 → React key 变化 → 分支子树重挂载
    branchesRef.current = dataBranches.map((b, i) => {
      const existing = branchesRef.current[i];
      if (existing && existing.label === b.label && existing.id && !b.id) {
        return { ...b, id: existing.id };
      }
      return b;
    });
  }

  // 为缺失 id 的分支自动生成稳定 id（初始加载的分支可能没有 id）
  // 这确保 React key 在删除/添加分支时不会复用错误的编辑器实例
  let branches = branchesRef.current;
  if (branches.some((b) => !b.id)) {
    branches = branches.map((b) =>
      b.id ? b : { ...b, id: `branch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` },
    );
    branchesRef.current = branches;
  }

  /** 解析当前节点可用的变量列表 */
  const variableOptions = useMemo(
    () => resolveVariables(schema, currentNodeId),
    [schema, currentNodeId],
  );

  /** RAQB 配置（从变量列表构建）
   *  注意：qbConfig 必须保持引用稳定，否则 QueryContainer 会认为 config 变了，
   *  触发 getMemoizedTree 重新验证 tree，可能清空刚添加的 rule。
   *  只在首次挂载时创建，后续不更新（变量列表在编辑过程中不会变化）。
   */
  const qbConfig = useMemo(() => buildQbConfig(variableOptions), []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (next: ConditionBranchItem[]) => {
    branchesRef.current = next;
    onChange({ ...data, conditions: next });
  };

  const updateBranch = (index: number, patch: Partial<ConditionBranchItem>) => {
    const current = branchesRef.current;
    update(current.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  };

  const addBranch = () => {
    // 使用 ref 中的最新 branches，避免连续点击时 data prop 未更新
    const current = branchesRef.current;
    // 新分支插入到默认分支（最后一个）之前，保持默认分支始终在末尾
    const insertIndex = current.length > 0 ? current.length - 1 : 0;
    // 生成唯一的分支名称：找到现有分支号中的最大值 + 1
    // 避免删除后重新添加时出现重复的分支名
    const existingLabels = new Set(current.map((b) => b.label));
    let branchNum = current.length;
    while (existingLabels.has(`分支 ${branchNum}`)) {
      branchNum++;
    }
    const newBranches = [...current];
    newBranches.splice(insertIndex, 0, {
      id: `branch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      label: `分支 ${branchNum}`,
      condition: null,
    });
    // 立即更新 ref，确保下次调用时使用最新值
    branchesRef.current = newBranches;
    update(newBranches);
  };

  const removeBranch = (index: number) => {
    const current = branchesRef.current;
    const newBranches = current.filter((_, i) => i !== index);
    branchesRef.current = newBranches;
    update(newBranches);
  };

  /** 判断分支是否为默认分支（最后一个且 condition 为空） */
  const isDefaultBranch = (index: number): boolean => index === branches.length - 1;

  /** 判断分支条件是否已配置（非空且非空对象） */
  const isBranchConfigured = (branch: ConditionBranchItem): boolean => {
    if (!branch.condition) return false;
    if (typeof branch.condition === 'object' && Object.keys(branch.condition).length === 0)
      return false;
    return true;
  };

  return (
    <Form layout="vertical" size="small" disabled={disabled} component="div">
      <Divider orientation="left" plain style={{ marginTop: 0, marginBottom: 12 }}>
        条件分支
      </Divider>
      <Space direction="vertical" size={10} style={{ width: '100%' }}>
        {branches.map((branch, index) => {
          const isElse = isDefaultBranch(index);
          const configured = isBranchConfigured(branch);
          return (
            <div
              key={branch.id ?? `branch-${index}`}
              style={{
                border: '1px solid #eef0f4',
                borderRadius: 8,
                padding: 10,
                background: '#fafbfc',
                transition: 'border-color 0.2s',
              }}
            >
              <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center' }}>
                {/* 优先级标签 */}
                <Tag color="blue" style={{ fontSize: 11, margin: 0, flexShrink: 0 }}>
                  优先级 {index + 1}
                </Tag>
                <Input
                  size="small"
                  placeholder="分支名称(如:条件成立)"
                  value={isElse ? '默认分支' : branch.label}
                  onChange={(e) => updateBranch(index, { label: e.target.value })}
                  style={{ flex: 1 }}
                  variant="borderless"
                  disabled={isElse}
                />
                {/* 状态提示 */}
                {!isElse && !configured && (
                  <Text type="danger" style={{ fontSize: 11, flexShrink: 0 }}>
                    未配置
                  </Text>
                )}
                {/* 删除按钮 */}
                <Popconfirm
                  title="确定删除此分支？"
                  onConfirm={() => removeBranch(index)}
                  okText="确定删除"
                  cancelText="取消"
                  placement="top"
                >
                  <Button
                    size="small"
                    type="text"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={isElse || branches.length <= 2}
                  />
                </Popconfirm>
              </div>
              <ConditionEditor
                condition={branch.condition ?? null}
                onChange={(cond) => updateBranch(index, { condition: cond })}
                qbConfig={qbConfig}
                variableOptions={variableOptions}
                disabled={disabled}
                isElse={isElse}
              />
            </div>
          );
        })}
        <Button
          size="small"
          type="dashed"
          icon={<PlusOutlined />}
          onClick={addBranch}
          block
          disabled={disabled}
        >
          添加分支
        </Button>
      </Space>
      {/* RAQB + 自定义规则样式 — 飞书 aPaaS 风格 */}
      <style>{`
        /* Group 容器 */
        .group { background: transparent; border: none; border-radius: 0; }
        .group--header { padding: 0 0 6px 0; border: none; display: flex; align-items: center; gap: 6px; }
        .group--children { padding: 0 !important; }
        /* 隐藏拖拽手柄（6 点图标）— 本平台不支持拖拽排序 */
        .group--drag-handler, .qb-drag-handler { display: none !important; }
        /* 连接词按钮（And/Or/Not） */
        .group--conjunctions .ant-btn-group { display: flex; gap: 2px; }
        .group--conjunctions .ant-btn { font-size: 12px; height: 20px; line-height: 18px; padding: 0 8px; border-radius: 10px; border: none; }
        .group--conjunctions .ant-btn-primary { background: #e8f3ff; color: #1677ff; }
        .group--conjunctions .ant-btn-default { background: #f5f5f5; color: rgba(0,0,0,0.45); }
        /* 操作按钮（Add rule/group） */
        .group--actions { margin-left: auto; }
        .group--actions .ant-btn-group { display: flex; gap: 4px; }
        .group--actions .ant-btn { font-size: 12px; height: 20px; padding: 0 4px; border: none; background: transparent; box-shadow: none; color: rgba(0,0,0,0.45); }
        .group--actions .ant-btn:hover { color: #1677ff; background: #f0f5ff; }
        .group--actions .ant-btn .anticon { font-size: 11px; margin-right: 2px; }
        /* 嵌套组容器 — 加左侧边线区分层级 */
        .group-or-rule-container.group-container { margin-bottom: 6px; }
        .group-or-rule-container.group-container > .group {
          padding-left: 8px;
          border-left: 2px solid #eef0f4;
        }
        .group-or-rule-container.group-container:last-child { margin-bottom: 0; }

        /* 自定义规则行 — 横向四列栅格 */
        .custom-rule-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
        .rule-grid { display: flex; gap: 4px; flex: 1; min-width: 0; }
        .rule-cell { flex: 1; min-width: 0; }
        .rule-cell .ant-select { width: 100% !important; }
        .rule-cell .ant-select-selector { border-radius: 4px !important; font-size: 12px; }
        .rule-cell .ant-select-selection-item { font-size: 12px; line-height: 20px; }
        .rule-cell .ant-input { width: 100% !important; font-size: 12px; border-radius: 4px !important; }
        .rule-cell .ant-input-sm { height: 24px; }
        /* 字段为空时红框高亮 */
        .rule-field-empty .rule-cell:first-child .ant-select-selector {
          border-color: #ff4d4f !important;
          box-shadow: 0 0 0 2px rgba(255,77,79,0.1);
        }
        .rule-error { color: #ff4d4f; font-size: 11px; margin-bottom: 4px; }
        /* 删除按钮 */
        .rule-delete { flex-shrink: 0; }
        .rule-delete.ant-btn { font-size: 12px; height: 24px; width: 24px; min-width: 24px; padding: 0;
          border: none; background: transparent; box-shadow: none; }
        .rule-delete.ant-btn:hover { background: #fff1f0; color: #ff4d4f; }
      `}</style>
    </Form>
  );
}

// ---------------------------------------------------------------------------
// 条件编辑器（可视化 / 表达式 双模式切换）
// ---------------------------------------------------------------------------

interface ConditionEditorProps {
  condition: object | null;
  onChange: (condition: object | null) => void;
  qbConfig: ReturnType<typeof buildQbConfig>;
  variableOptions: VariableOption[];
  disabled?: boolean;
  isElse?: boolean;
}

function ConditionEditor({
  condition,
  onChange,
  qbConfig,
  variableOptions,
  disabled = false,
  isElse = false,
}: ConditionEditorProps) {
  const [exprText, setExprText] = useState(() => {
    if (!condition) return '';
    return jsonLogicToExpression(condition);
  });

  const [activeTab, setActiveTab] = useState<'visual' | 'expression'>('visual');

  const [tree, setTree] = useState<ImmutableTree>(() => loadFromJsonLogic(condition, qbConfig));

  // 跟踪内部变更，避免用户输入时 useEffect 覆盖正在编辑的 tree/exprText
  const internalChangeRef = useRef(false);
  // 缓存上次 condition 的序列化值，用于检测实质变化（而非引用变化）
  const lastConditionRef = useRef<string>(JSON.stringify(condition ?? null));

  // 当 condition prop 实质内容变化时（如删除分支导致编辑器复用），
  // 重新同步内部 tree 和 exprText 状态。
  // 使用 internalChangeRef 跳过由用户输入触发的 condition 变化，
  // 使用 JSON.stringify 比较跳过仅引用变化（如其他分支变更导致的 re-render）。
  useEffect(() => {
    const condStr = JSON.stringify(condition ?? null);
    if (condStr === lastConditionRef.current) return;
    lastConditionRef.current = condStr;

    if (internalChangeRef.current) {
      internalChangeRef.current = false;
      return;
    }
    setTree(loadFromJsonLogic(condition, qbConfig));
    setExprText(condition ? jsonLogicToExpression(condition) : '');
  }, [condition, qbConfig]);

  const onQbChange = useCallback(
    (immutableTree: ImmutableTree) => {
      setTree(immutableTree);
      const logic = exportToJsonLogic(immutableTree, qbConfig);
      // 标记为内部变更，避免 useEffect 重新加载 tree 覆盖正在编辑的状态
      internalChangeRef.current = true;
      lastConditionRef.current = JSON.stringify(logic ?? null);
      onChange(logic);
    },
    [qbConfig, onChange],
  );

  const onExprChange = useCallback(
    (text: string) => {
      setExprText(text);
      const logic = expressionToJsonLogic(text);
      internalChangeRef.current = true;
      lastConditionRef.current = JSON.stringify(logic ?? null);
      onChange(logic);
    },
    [onChange],
  );

  const handleTabChange = (key: string) => {
    if (key === 'visual') {
      setTree(loadFromJsonLogic(condition, qbConfig));
      setActiveTab('visual');
    } else {
      setExprText(jsonLogicToExpression(condition));
      setActiveTab('expression');
    }
  };

  const _validation = validateExpression(exprText);

  return (
    <>
      {isElse && !condition && (
        <Text
          type="secondary"
          style={{ fontSize: 11, display: 'block', marginBottom: 6, color: 'rgba(0,0,0,0.4)' }}
        >
          空条件 = 否则(default)，添加规则后将变为条件分支
        </Text>
      )}
      <div
        style={{
          display: 'flex',
          gap: 0,
          marginBottom: 8,
          background: '#f0f0f0',
          borderRadius: 6,
          padding: 2,
        }}
      >
        <Button
          size="small"
          type={activeTab === 'visual' ? 'primary' : 'text'}
          onClick={() => handleTabChange('visual')}
          style={{ flex: 1, borderRadius: '4px 0 0 4px' }}
        >
          可视化
        </Button>
        <Button
          size="small"
          type={activeTab === 'expression' ? 'primary' : 'text'}
          onClick={() => handleTabChange('expression')}
          style={{ flex: 1, borderRadius: '0 4px 4px 0' }}
        >
          表达式
        </Button>
      </div>

      {activeTab === 'visual' && (
        <div style={{ minHeight: 60 }}>
          {createElement(Query, {
            ...qbConfig,
            value: tree,
            onChange: onQbChange,
            renderBuilder: renderBuilder,
          })}
        </div>
      )}

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
