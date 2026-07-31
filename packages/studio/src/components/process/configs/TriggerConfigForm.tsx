/**
 * 触发器节点配置表单 —— 对齐 DESIGN-process.md §6.1。
 */

import { Divider, Form, Input, Radio, Select } from 'antd';
import { TRIGGER_OPTIONS } from '../../../constants/process.js';

export interface TriggerConfigData {
  triggerType?: string;
  objectId?: string;
  event?: 'create' | 'update' | 'delete';
  cron?: string;
  condition?: string;
  title?: string;
}

export interface TriggerConfigFormProps {
  data: TriggerConfigData;
  onChange: (data: TriggerConfigData) => void;
  disabled?: boolean;
  /** 对象候选(appId 下对象列表) */
  objectOptions?: { label: string; value: string }[];
}

const CRON_PRESETS = [
  { label: '每天 9 点', value: '0 0 9 * * ?' },
  { label: '每小时', value: '0 0 * * * ?' },
  { label: '每分钟', value: '0 * * * * ?' },
  { label: '每周一 9 点', value: '0 0 9 ? * MON' },
];

export default function TriggerConfigForm({
  data,
  onChange,
  disabled = false,
  objectOptions = [],
}: TriggerConfigFormProps) {
  const update = (patch: Partial<TriggerConfigData>) => onChange({ ...data, ...patch });
  const isRecordEvent = data.triggerType === 'record_event';
  const isSchedule = data.triggerType === 'schedule';

  return (
    <Form layout="vertical" size="small" disabled={disabled} component="div">
      <Divider orientation="left" plain style={{ marginTop: 0 }}>
        触发器配置
      </Divider>
      <Form.Item label="触发类型" required>
        <Select
          value={data.triggerType}
          onChange={(v) => update({ triggerType: v })}
          options={TRIGGER_OPTIONS}
          placeholder="选择触发类型"
        />
      </Form.Item>
      {isRecordEvent && (
        <>
          <Form.Item label="关联对象" required>
            <Select
              showSearch
              value={data.objectId || undefined}
              onChange={(v) => update({ objectId: v })}
              options={objectOptions}
              placeholder="选择触发关联的对象"
            />
          </Form.Item>
          <Form.Item label="触发事件" required>
            <Radio.Group
              value={data.event || 'create'}
              onChange={(e) => update({ event: e.target.value })}
            >
              <Radio value="create">创建</Radio>
              <Radio value="update">更新</Radio>
              <Radio value="delete">删除</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item label="触发条件(可选)">
            <Input.TextArea
              value={data.condition}
              onChange={(e) => update({ condition: e.target.value })}
              placeholder="满足条件时才触发,例如: amount > 1000"
              rows={2}
            />
          </Form.Item>
        </>
      )}
      {isSchedule && (
        <Form.Item label="Cron 表达式" required>
          <Input
            value={data.cron}
            onChange={(e) => update({ cron: e.target.value })}
            placeholder="0 0 9 * * ?"
            addonAfter={
              <Select
                size="small"
                style={{ width: 110 }}
                placeholder="预设"
                onChange={(v) => update({ cron: v })}
                options={CRON_PRESETS}
                variant="borderless"
              />
            }
          />
        </Form.Item>
      )}
    </Form>
  );
}
