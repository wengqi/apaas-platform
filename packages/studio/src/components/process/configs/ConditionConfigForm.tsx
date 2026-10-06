/**
 * 条件分支节点配置表单 —— 基于 react-awesome-query-builder 可视化模式。
 *
 * - 可视化模式：react-awesome-query-builder（Ant Design 主题，嵌套 AND/OR 树）
 * - 底层存储：JsonLogic JSON（标准、可序列化、跨语言）
 *
 * 数据流：
 *   可视化 → exportToJsonLogic → JsonLogic → 存储
 *   后端 → jsonLogic.apply(rule, data) → boolean
 *
 * 子模块拆分见 ./condition-config/（AGENTS.md 单文件 400 行规范）：
 * - types.ts：类型契约
 * - ConditionEditor.tsx：单分支条件编辑器
 * - styles.ts：RAQB 自定义样式
 */

import { useMemo, useRef } from 'react';
import { Button, Divider, Form, Input, Popconfirm, Space, Tag, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';

import { resolveVariables } from './variable-resolver.js';
import { buildQbConfig } from './query-builder-config.js';
import { ConditionEditor } from './condition-config/ConditionEditor.js';
import { CONDITION_FORM_STYLES } from './condition-config/styles.js';
import type { ConditionBranchItem, ConditionConfigFormProps } from './condition-config/types.js';

export type {
  ConditionBranchItem,
  ConditionConfigData,
  ConditionConfigFormProps,
} from './condition-config/types.js';

const { Text } = Typography;

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
                padding: 8,
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
                    disabled={disabled || isElse || branches.length <= 2}
                  />
                </Popconfirm>
              </div>
              <ConditionEditor
                condition={branch.condition ?? null}
                onChange={(cond) => updateBranch(index, { condition: cond })}
                qbConfig={qbConfig}
                isElse={isElse}
                disabled={disabled}
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
      <style>{CONDITION_FORM_STYLES}</style>
    </Form>
  );
}
