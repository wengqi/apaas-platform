/**
 * 结束节点配置表单 —— 对齐 DESIGN-process.md(结束节点输出)。
 */

import { Divider, Form, Input } from 'antd';

export interface EndConfigData {
  outputs?: string;
  title?: string;
}

export interface EndConfigFormProps {
  data: EndConfigData;
  onChange: (data: EndConfigData) => void;
  disabled?: boolean;
}

export default function EndConfigForm({
  data,
  onChange,
  disabled = false,
}: EndConfigFormProps) {
  const update = (patch: Partial<EndConfigData>) =>
    onChange({ ...data, ...patch });

  return (
    <Form layout="vertical" size="small" disabled={disabled} component="div">
      <Divider orientation="left" plain style={{ marginTop: 0 }}>
        结束节点
      </Divider>
      <Form.Item label="输出结果(可选)">
        <Input.TextArea
          value={data.outputs}
          onChange={(e) => update({ outputs: e.target.value })}
          placeholder='流程最终输出,例如: { "result": "approved" }'
          rows={3}
        />
      </Form.Item>
    </Form>
  );
}
