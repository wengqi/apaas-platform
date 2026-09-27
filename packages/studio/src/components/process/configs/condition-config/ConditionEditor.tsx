/**
 * 条件分支配置表单 — ConditionEditor 子组件（从 ConditionConfigForm.tsx 拆分，
 * AGENTS.md 单文件 400 行规范）。
 *
 * 条件编辑器（可视化模式 — 对齐飞书 aPaaS）。
 */

import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { Typography } from 'antd';
import { Query, Builder } from '@react-awesome-query-builder/antd';
import type { ImmutableTree, BuilderProps } from '@react-awesome-query-builder/antd';
import '@react-awesome-query-builder/antd/css/styles.css';

import { buildQbConfig, loadFromJsonLogic, exportToJsonLogic } from '../query-builder-config.js';

const { Text } = Typography;

// ---------------------------------------------------------------------------
// renderBuilder — 用 createElement 调用 Builder 组件
// ---------------------------------------------------------------------------

const renderBuilder = (props: BuilderProps) => createElement(Builder, props);

// ---------------------------------------------------------------------------
// 条件编辑器（可视化模式 — 对齐飞书 aPaaS）
// ---------------------------------------------------------------------------

interface ConditionEditorProps {
  condition: object | null;
  onChange: (condition: object | null) => void;
  qbConfig: ReturnType<typeof buildQbConfig>;
  isElse?: boolean;
}

export function ConditionEditor({
  condition,
  onChange,
  qbConfig,
  isElse = false,
}: ConditionEditorProps) {
  const [tree, setTree] = useState<ImmutableTree>(() => loadFromJsonLogic(condition, qbConfig));

  // 跟踪内部变更，避免用户输入时 useEffect 覆盖正在编辑的 tree
  const internalChangeRef = useRef(false);
  // 缓存上次 condition 的序列化值，用于检测实质变化（而非引用变化）
  const lastConditionRef = useRef<string>(JSON.stringify(condition ?? null));

  // 当 condition prop 实质内容变化时（如删除分支导致编辑器复用），
  // 重新同步内部 tree 状态。
  useEffect(() => {
    const condStr = JSON.stringify(condition ?? null);
    if (condStr === lastConditionRef.current) return;
    lastConditionRef.current = condStr;

    if (internalChangeRef.current) {
      internalChangeRef.current = false;
      return;
    }
    setTree(loadFromJsonLogic(condition, qbConfig));
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
      <div style={{ minHeight: 60 }}>
        {createElement(Query, {
          ...qbConfig,
          value: tree,
          onChange: onQbChange,
          renderBuilder: renderBuilder,
        })}
      </div>
    </>
  );
}
