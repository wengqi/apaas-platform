/**
 * 延时节点配置表单 —— 对齐 DESIGN-process.md §6.8。
 */

import { Divider, Form, InputNumber, Select } from 'antd';

export interface DelayConfigData {
  duration?: number;
  unit?: string;
  title?: string;
}

export interface DelayConfigFormProps {
  data: DelayConfigData;
  onChange: (data: DelayConfigData) => void;
  disabled?: boolean;
}

const UNIT_OPTIONS = [
  { label: '秒', value: 'SECONDS' },
  { label: '分钟', value: 'MINUTES' },
  { label: '小时', value: 'HOURS' },
  { label: '天', value: 'DAYS' },
];

export default function DelayConfigForm({
  data,
  onChange,
  disabled = false,
}: DelayConfigFormProps) {
  const update = (patch: Partial<DelayConfigData>) =>
    onChange({ ...data, ...patch });

  return (
    <Form layout="vertical" size="small" disabled={disabled} component="div">
      <Divider orientation="left" plain style={{ marginTop: 0 }}>
        延时配置
      </Divider>
      <Form.Item label="延时时长" required>
        <Input.Group compact>
          <InputNumber
            min={1}
            value={data.duration}
            onChange={(v) => update({ duration: v ?? undefined })}
            placeholder="24"
            style={{ width: '60%' }}
          />
          <Select
            value={data.unit || 'HOURS'}
            onChange={(v) => update({ unit: v })}
            options={UNIT_OPTIONS}
            style={{ width: '40%' }}
          />
        </Input.Group>
      </Form.Item>
    </Form>
  );
}
