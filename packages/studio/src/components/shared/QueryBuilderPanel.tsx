/**
 * 可复用条件编辑面板 —— 基于 react-awesome-query-builder + CodeMirror 双模式。
 *
 * 从流程条件编辑器 (ConditionConfigForm) 提取，供视图筛选、行级权限规则等场景复用。
 *
 * - 可视化模式：react-awesome-query-builder（AntD 主题，嵌套 AND/OR 树）
 * - 表达式模式：CodeMirror 6 编辑器 + 自动补全
 * - 底层存储：JsonLogic JSON（标准、可序列化、跨语言）
 *
 * 数据流：
 *   可视化 → exportToJsonLogic → JsonLogic → onChange
 *   表达式 → expressionToJsonLogic → JsonLogic → onChange
 *   后端 → jsonLogicToPrismaWhere / jsonLogic.apply → Prisma WHERE / boolean
 */

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Typography } from 'antd';
import { Query, Builder } from '@react-awesome-query-builder/antd';
import type { ImmutableTree, BuilderProps } from '@react-awesome-query-builder/antd';
import '@react-awesome-query-builder/antd/css/styles.css';

import {
  buildQbConfig,
  loadFromJsonLogic,
  exportToJsonLogic,
} from '../process/configs/query-builder-config.js';
import type { VariableOption } from '../process/configs/variable-resolver.js';
import {
  expressionToJsonLogic,
  jsonLogicToExpression,
} from '../process/configs/jsonlogic-utils.js';
import ExpressionCodeEditor from '../process/configs/ExpressionCodeEditor.js';
import type { Field } from '../../api/objects.js';

const { Text } = Typography;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface QueryBuilderPanelProps {
  /** 对象字段列表（用于构建 RAQB 字段配置） */
  fields: Field[];
  /** JsonLogic JSON 规则（空 = 无条件） */
  value: object | null;
  /** 值变更回调 */
  onChange: (rule: object | null) => void;
  /** 是否禁用 */
  disabled?: boolean;
  /** 占位提示文本（当 value 为空时显示） */
  placeholder?: string;
}

// ---------------------------------------------------------------------------
// 字段 → VariableOption 转换
// ---------------------------------------------------------------------------

/** FieldType → RAQB field type 映射所需的类型字符串 */
function fieldTypeToVariableType(field: Field): string {
  switch (field.type) {
    case 'number':
    case 'currency':
    case 'percent':
      return 'number';
    case 'checkbox':
      return 'boolean';
    case 'date':
    case 'date_time':
      return 'string'; // RAQB date 类型需额外配置，暂用 text
    default:
      return 'string';
  }
}

/**
 * 将对象字段列表转换为 VariableOption[]，供 buildQbConfig 使用。
 * 字段的 apiName 作为 value（即 JsonLogic {"var": "apiName"} 中的路径）。
 */
export function fieldsToVariableOptions(fields: Field[]): VariableOption[] {
  return fields
    .filter((f) => !['sub_form', 'lookup', 'rollup', 'attachment', 'rich_text'].includes(f.type))
    .map((f) => {
      return {
        value: f.apiName,
        label: f.label,
        type: fieldTypeToVariableType(f),
        group: 'object' as never,
      };
    });
}

// ---------------------------------------------------------------------------
// renderBuilder
// ---------------------------------------------------------------------------

const renderBuilder = (props: BuilderProps) => createElement(Builder, props);

// ---------------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------------

export default function QueryBuilderPanel({
  fields,
  value,
  onChange,
  disabled = false,
  placeholder,
}: QueryBuilderPanelProps) {
  const variableOptions = useMemo(() => fieldsToVariableOptions(fields), [fields]);
  const qbConfig = useMemo(() => buildQbConfig(variableOptions), [variableOptions]);

  const [exprText, setExprText] = useState(() => {
    if (!value) return '';
    return jsonLogicToExpression(value);
  });

  const [activeTab, setActiveTab] = useState<'visual' | 'expression'>('visual');
  const [tree, setTree] = useState<ImmutableTree>(() => loadFromJsonLogic(value, qbConfig));

  const internalChangeRef = useRef(false);
  const lastValueRef = useRef<string>(JSON.stringify(value ?? null));

  useEffect(() => {
    const valStr = JSON.stringify(value ?? null);
    if (valStr === lastValueRef.current) return;
    lastValueRef.current = valStr;

    if (internalChangeRef.current) {
      internalChangeRef.current = false;
      return;
    }
    setTree(loadFromJsonLogic(value, qbConfig));
    setExprText(value ? jsonLogicToExpression(value) : '');
  }, [value, qbConfig]);

  const onQbChange = useCallback(
    (immutableTree: ImmutableTree) => {
      setTree(immutableTree);
      const logic = exportToJsonLogic(immutableTree, qbConfig);
      internalChangeRef.current = true;
      lastValueRef.current = JSON.stringify(logic ?? null);
      onChange(logic);
    },
    [qbConfig, onChange],
  );

  const onExprChange = useCallback(
    (text: string) => {
      setExprText(text);
      const logic = expressionToJsonLogic(text);
      internalChangeRef.current = true;
      lastValueRef.current = JSON.stringify(logic ?? null);
      onChange(logic);
    },
    [onChange],
  );

  const handleTabChange = (key: string) => {
    if (key === 'visual') {
      setTree(loadFromJsonLogic(value, qbConfig));
      setActiveTab('visual');
    } else {
      setExprText(value ? jsonLogicToExpression(value) : '');
      setActiveTab('expression');
    }
  };

  return (
    <>
      {placeholder && (!value || Object.keys(value).length === 0) && (
        <Text
          type="secondary"
          style={{ fontSize: 11, display: 'block', marginBottom: 6, color: 'rgba(0,0,0,0.4)' }}
        >
          {placeholder}
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

      {/* RAQB + 自定义规则样式 — 飞书 aPaaS 风格 */}
      <style>{`
        .group { background: transparent; border: none; border-radius: 0; }
        .group--header { padding: 0 0 6px 0; border: none; display: flex; align-items: center; gap: 6px; }
        .group--children { padding: 0 !important; }
        .group--conjunctions .ant-btn-group { display: flex; gap: 2px; }
        .group--conjunctions .ant-btn { font-size: 12px; height: 20px; line-height: 18px; padding: 0 8px; border-radius: 10px; border: none; }
        .group--conjunctions .ant-btn-primary { background: #e8f3ff; color: #1677ff; }
        .group--conjunctions .ant-btn-default { background: #f5f5f5; color: rgba(0,0,0,0.45); }
        .group--actions { margin-left: auto; }
        .group--actions .ant-btn-group { display: flex; gap: 4px; }
        .group--actions .ant-btn { font-size: 12px; height: 20px; padding: 0 4px; border: none; background: transparent; box-shadow: none; color: rgba(0,0,0,0.45); }
        .group--actions .ant-btn:hover { color: #1677ff; background: #f0f5ff; }
        .group--actions .ant-btn .anticon { font-size: 11px; margin-right: 2px; }
        .custom-rule-row { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
        .rule-grid { display: flex; gap: 4px; flex: 1; min-width: 0; }
        .rule-cell { flex: 1; min-width: 0; }
        .rule-cell .ant-select { width: 100% !important; }
        .rule-cell .ant-select-selector { border-radius: 4px !important; font-size: 12px; }
        .rule-cell .ant-select-selection-item { font-size: 12px; line-height: 20px; }
        .rule-cell .ant-input { width: 100% !important; font-size: 12px; border-radius: 4px !important; }
        .rule-cell .ant-input-sm { height: 24px; }
        .rule-field-empty .rule-cell:first-child .ant-select-selector {
          border-color: #ff4d4f !important;
          box-shadow: 0 0 0 2px rgba(255,77,79,0.1);
        }
        .rule-error { color: #ff4d4f; font-size: 11px; margin-bottom: 4px; }
        .rule-delete { flex-shrink: 0; }
        .rule-delete.ant-btn { font-size: 12px; height: 24px; width: 24px; min-width: 24px; padding: 0;
          border: none; background: transparent; box-shadow: none; }
        .rule-delete.ant-btn:hover { background: #fff1f0; color: #ff4d4f; }
      `}</style>
    </>
  );
}
