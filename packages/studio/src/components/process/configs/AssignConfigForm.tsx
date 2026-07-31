/**
 * 赋值节点配置表单 —— 对齐 DESIGN-process.md §6.7。
 */

import { Divider, Form, Input } from 'antd';
import FlowValueEditor from '../FlowValueEditor.js';
import type { IFlowValue } from '@apaas/shared';

export interface AssignConfigData {
  variableName?: string;
  value?: IFlowValue;
  title?: string;
}

export interface AssignConfigFormProps {
  data: AssignConfigData;
  onChange: (data: AssignConfigData) => void;
  disabled?: boolean;
}

export default function AssignConfigForm({
  data,
  onChange,
  disabled = false,
}: AssignConfigFormProps) {
  const update = (patch: Partial<AssignConfigData>) =>
    onChange({ ...data, ...patch });

  return (
    <Form layout="vertical" size="small" disabled={disabled} component="div">
      <Divider orientation="left" plain style={{ marginTop: 0 }}>
        变量赋值
      </Divider>
      <Form.Item label="变量名" required>
        <Input
          value={data.variableName}
          onChange={(e) => update({ variableName: e.target.value })}
          placeholder="approvalResult"
        />
      </Form.Item>
      <Form.Item label="值" required>
        <FlowValueEditor
          value={data.value}
          onChange={(v) => update({ value: v })}
          disabled={disabled}
          placeholder="approved"
        />
      </Form.Item>
    </Form>
  );
}
