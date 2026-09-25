/**
 * 批量操作节点配置表单。
 *
 * operation：create（inputs.records 为记录数组）/ update / delete（范围 = recordIds 或 filter）。
 * 上限受 BATCH_MAX_ROWS 环境变量约束（默认 500）。
 */

import { Select, Typography } from 'antd';

const { Text, Paragraph } = Typography;

export interface BatchOperationConfigFormProps {
  data: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  disabled?: boolean;
  objectOptions: { label: string; value: string }[];
}

export default function BatchOperationConfigForm({
  data,
  onChange,
  disabled,
  objectOptions,
}: BatchOperationConfigFormProps) {
  const operation = (data['operation'] as string) ?? 'create';
  const objectId = (data['objectId'] as string) ?? '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          操作类型
        </Text>
        <Select
          value={operation}
          disabled={disabled}
          style={{ width: '100%', marginTop: 4 }}
          options={[
            { label: '批量创建', value: 'create' },
            { label: '批量更新', value: 'update' },
            { label: '批量删除', value: 'delete' },
          ]}
          onChange={(v) => onChange({ operation: v })}
        />
      </div>
      <div>
        <Text type="secondary" style={{ fontSize: 12 }}>
          目标对象
        </Text>
        <Select
          value={objectId || undefined}
          disabled={disabled}
          showSearch
          allowClear
          placeholder="选择对象"
          options={objectOptions}
          style={{ width: '100%', marginTop: 4 }}
          onChange={(v) => onChange({ objectId: v })}
        />
      </div>
      <Paragraph type="secondary" style={{ fontSize: 11, marginBottom: 0 }}>
        批量创建：inputs.records 传记录数据数组；批量更新/删除：inputs.recordIds 或节点
        filter（JsonLogic）圈定范围，缺省拒绝全表操作。单次上限 BATCH_MAX_ROWS（默认 500）。
      </Paragraph>
    </div>
  );
}
