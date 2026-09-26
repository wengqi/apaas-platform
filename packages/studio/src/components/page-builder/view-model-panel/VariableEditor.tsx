/**
 * 变量编辑器（名称 / 类型 / 初始值 / 数据源）—— 从 components/page-builder/ViewModelPanel.tsx
 * 拆分（AGENTS.md 单文件 400 行规范）。
 */

import { useState } from 'react';
import { Button, Form, Input, Select, Space, Switch, Typography, message } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { objectsApi } from '../../../api/objects.js';
import type { VariableDef, VariableType } from '../../../api/pages.js';
import {
  VARIABLE_TYPE_OPTIONS,
  formatInitialValue,
  hasDatasource,
  parseInitialValue,
} from './variableMeta.js';

const { Text } = Typography;

export function VariableEditor({
  varKey,
  def,
  objectOptions,
  onSave,
}: {
  varKey: string;
  def: VariableDef;
  objectOptions: { label: string; value: string }[];
  onSave: (oldKey: string, newKey: string, def: VariableDef) => void;
}) {
  const [name, setName] = useState(varKey);
  const [type, setType] = useState<VariableType>(def.type);
  const [initialValueText, setInitialValueText] = useState(
    formatInitialValue(def.initialValue, def.type),
  );
  const [objectId, setObjectId] = useState(def.datasource?.objectId ?? '');
  const [viewId, setViewId] = useState(def.datasource?.viewId ?? '');
  const [autoQuery, setAutoQuery] = useState(
    def.datasource?.autoQuery ?? def.type === 'record_list',
  );

  const showDatasource = hasDatasource(type);

  /** 加载当前 objectId 的视图列表(仅 record/record_list)。 */
  const { data: views } = useQuery({
    queryKey: ['views', objectId],
    queryFn: () => objectsApi.listViews(objectId),
    enabled: showDatasource && !!objectId,
  });

  const viewOptions = (views ?? []).map((v) => ({ label: v.name, value: v.id }));

  const handleSave = () => {
    if (!name.match(/^[a-zA-Z][a-zA-Z0-9_]*$/)) {
      message.error('变量名须以字母开头,仅含字母数字下划线');
      return;
    }
    const newDef: VariableDef = { type };
    if (showDatasource && objectId) {
      newDef.datasource = {
        objectId,
        viewId: viewId || undefined,
        autoQuery,
      };
    }
    if (!showDatasource) {
      newDef.initialValue = parseInitialValue(initialValueText, type);
    }
    if (def.description) newDef.description = def.description;
    onSave(varKey, name, newDef);
    message.success('变量已保存');
  };

  return (
    <Form layout="vertical" size="small">
      <FormField label="变量名">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ fontFamily: 'monospace' }}
        />
      </FormField>
      <FormField label="类型">
        <Select
          value={type}
          onChange={(v) => setType(v)}
          options={VARIABLE_TYPE_OPTIONS}
          style={{ width: '100%' }}
        />
      </FormField>

      {/* 初始值(scalar/object/array) */}
      {!showDatasource && (
        <FormField label="初始值">
          {type === 'object' || type === 'array' ? (
            <Input.TextArea
              value={initialValueText}
              onChange={(e) => setInitialValueText(e.target.value)}
              rows={3}
              placeholder='{"key":"value"} 或 [1,2,3]'
              style={{ fontFamily: 'monospace' }}
            />
          ) : (
            <Input
              value={initialValueText}
              onChange={(e) => setInitialValueText(e.target.value)}
              placeholder="留空表示 null"
            />
          )}
        </FormField>
      )}

      {/* 数据源配置(record/record_list) */}
      {showDatasource && (
        <>
          <div
            style={{
              fontSize: 12,
              color: 'rgba(0,0,0,0.45)',
              margin: '8px 0',
              paddingBottom: 4,
              borderBottom: '1px solid #f0f2f5',
            }}
          >
            数据源
          </div>
          <FormField label="关联对象">
            <Select
              value={objectId || undefined}
              onChange={(v) => {
                setObjectId(v ?? '');
                setViewId('');
              }}
              showSearch
              allowClear
              placeholder="选择对象"
              optionFilterProp="label"
              options={objectOptions}
              notFoundContent={objectOptions.length > 0 ? '暂无对象' : '加载中...'}
            />
          </FormField>
          <FormField label="视图(可选)">
            <Select
              value={viewId || undefined}
              onChange={(v) => setViewId(v ?? '')}
              allowClear
              placeholder="使用默认视图"
              options={viewOptions}
              notFoundContent={objectId ? (views ? '暂无视图' : '加载中...') : '请先选择对象'}
            />
          </FormField>
          <FormField label="页面加载时自动查询">
            <Space>
              <Switch checked={autoQuery} onChange={setAutoQuery} />
              <Text type="secondary" style={{ fontSize: 12 }}>
                {autoQuery ? '是' : '否'}
              </Text>
            </Space>
          </FormField>
        </>
      )}

      <Button type="primary" size="small" block onClick={handleSave}>
        保存
      </Button>
    </Form>
  );
}

// ---------------------------------------------------------------------------
// 通用表单字段:标签 + 控件
// ---------------------------------------------------------------------------

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 13, color: 'rgba(0,0,0,0.88)', marginBottom: 4 }}>{label}</div>
      {children}
    </div>
  );
}
