/**
 * 汇总（Rollup）字段配置表单 — 关系字段 + 聚合目标字段 + 聚合方式。
 *
 * 作为 AntD Form 受控组件使用（value/onChange），绑定 Form.Item name="rollup"。
 * 关系字段候选 = 当前对象上的 lookup / sub_form 字段（决定聚合的关联记录范围）；
 * 目标字段候选 = 关系目标对象上的字段（决定聚合哪个值；count 无需选择）。
 */

import { useMemo } from 'react';
import { Form, Select } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { objectsApi } from '../../api/objects.js';

/** 关系字段（lookup / sub_form）的最小视图。 */
interface RelationFieldView {
  id: string;
  apiName: string;
  label: string;
  type: string;
  config?: {
    lookup?: { targetObjectId?: string };
    subForm?: { childObjectId?: string };
  };
}

export interface RollupValue {
  relationFieldId?: string;
  targetFieldId?: string;
  aggregate?: 'sum' | 'avg' | 'count' | 'min' | 'max';
}

interface RollupConfigFormProps {
  value?: RollupValue;
  onChange?: (v: RollupValue) => void;
  /** 当前对象 ID（查关系字段候选） */
  objectId: string;
}

const AGGREGATE_OPTIONS = [
  { value: 'sum', label: '求和 (sum)' },
  { value: 'avg', label: '平均 (avg)' },
  { value: 'count', label: '计数 (count)' },
  { value: 'min', label: '最小 (min)' },
  { value: 'max', label: '最大 (max)' },
];

export default function RollupConfigForm({ value, onChange, objectId }: RollupConfigFormProps) {
  const aggregate = value?.aggregate ?? 'sum';
  const relationFieldId = value?.relationFieldId;
  const targetFieldId = value?.targetFieldId;

  /** 当前对象字段（查 lookup / sub_form 关系字段候选）。 */
  const { data: currentObject } = useQuery({
    queryKey: ['object', objectId],
    queryFn: () => objectsApi.get(objectId),
    enabled: !!objectId,
  });

  const relationFields = useMemo<RelationFieldView[]>(() => {
    const fields = (currentObject?.fields ?? []) as unknown as RelationFieldView[];
    return fields.filter((f) => f.type === 'lookup' || f.type === 'sub_form');
  }, [currentObject]);

  /** 选中的关系字段的目标对象（lookup → targetObjectId；sub_form → childObjectId）。 */
  const targetObjectId = useMemo(() => {
    const rel = relationFields.find((f) => f.id === relationFieldId);
    if (!rel) return undefined;
    return rel.config?.lookup?.targetObjectId ?? rel.config?.subForm?.childObjectId;
  }, [relationFields, relationFieldId]);

  /** 目标对象字段（聚合目标候选）。 */
  const { data: targetObject } = useQuery({
    queryKey: ['object', targetObjectId],
    queryFn: () => objectsApi.get(targetObjectId!),
    enabled: !!targetObjectId,
  });

  const targetFieldOptions = useMemo(() => {
    const fields = (targetObject?.fields ?? []) as unknown as Array<{
      id: string;
      apiName: string;
      label: string;
      isSystem?: boolean;
    }>;
    return fields
      .filter((f) => !f.isSystem)
      .map((f) => ({ value: f.id, label: `${f.label} (${f.apiName})` }));
  }, [targetObject]);

  const emit = (patch: Partial<RollupValue>) => {
    onChange?.({ relationFieldId, targetFieldId, aggregate, ...patch });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Form.Item
        label="关系字段"
        required
        style={{ marginBottom: 0 }}
        tooltip="选择本对象上的关联字段（关联或子表），汇总将聚合其关联的记录"
      >
        <Select
          value={relationFieldId}
          placeholder="选择关联/子表字段"
          options={relationFields.map((f) => ({ value: f.id, label: `${f.label} (${f.apiName})` }))}
          onChange={(v) => emit({ relationFieldId: v, targetFieldId: undefined })}
          showSearch
          optionFilterProp="label"
        />
      </Form.Item>
      <Form.Item label="聚合方式" required style={{ marginBottom: 0 }}>
        <Select
          value={aggregate}
          options={AGGREGATE_OPTIONS}
          onChange={(v) => emit({ aggregate: v })}
        />
      </Form.Item>
      {aggregate !== 'count' && (
        <Form.Item label="汇总目标字段" required style={{ marginBottom: 0 }}>
          <Select
            value={targetFieldId}
            placeholder="选择目标对象上要聚合的字段"
            options={targetFieldOptions}
            onChange={(v) => emit({ targetFieldId: v })}
            disabled={!targetObjectId}
            showSearch
            optionFilterProp="label"
          />
        </Form.Item>
      )}
    </div>
  );
}
