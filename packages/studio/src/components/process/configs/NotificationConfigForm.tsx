/**
 * 通知节点配置表单 —— 对齐 DESIGN-process.md §6.5。
 */

import { Divider, Form, Input, Select } from 'antd';
import { NOTIFICATION_CHANNEL_OPTIONS } from '../../../constants/process.js';

export interface NotificationConfigData {
  channel?: string;
  templateId?: string;
  recipients?: string[];
  title?: string;
  content?: string;
}

export interface NotificationConfigFormProps {
  data: NotificationConfigData;
  onChange: (data: NotificationConfigData) => void;
  disabled?: boolean;
  /** 通知模版候选 */
  templateOptions?: { label: string; value: string }[];
}

export default function NotificationConfigForm({
  data,
  onChange,
  disabled = false,
  templateOptions = [],
}: NotificationConfigFormProps) {
  const update = (patch: Partial<NotificationConfigData>) => onChange({ ...data, ...patch });

  const recipientsStr = (data.recipients ?? []).join(', ');

  return (
    <Form layout="vertical" size="small" disabled={disabled} component="div">
      <Divider orientation="left" plain style={{ marginTop: 0 }}>
        通知配置
      </Divider>
      <Form.Item label="通知渠道" required>
        <Select
          value={data.channel}
          onChange={(v) => update({ channel: v })}
          options={NOTIFICATION_CHANNEL_OPTIONS}
        />
      </Form.Item>
      <Form.Item label="通知模版(可选)">
        <Select
          value={data.templateId}
          onChange={(v) => update({ templateId: v })}
          options={templateOptions}
          allowClear
          placeholder="选择模版后自动填充标题/正文"
        />
      </Form.Item>
      <Form.Item label="收件人" required>
        <Input
          value={recipientsStr}
          onChange={(e) =>
            update({
              recipients: e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
          placeholder="多个用逗号分隔,或 ${trigger.user.id}"
        />
      </Form.Item>
      <Form.Item label="标题" required>
        <Input
          value={data.title}
          onChange={(e) => update({ title: e.target.value })}
          placeholder="${record.name} 审批已完成"
        />
      </Form.Item>
      <Form.Item label="正文" required>
        <Input.TextArea
          value={data.content}
          onChange={(e) => update({ content: e.target.value })}
          placeholder="支持 ${var} 变量插值"
          rows={4}
        />
      </Form.Item>
    </Form>
  );
}
