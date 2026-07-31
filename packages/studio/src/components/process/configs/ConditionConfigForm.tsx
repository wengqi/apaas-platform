/**
 * 条件分支节点配置表单 —— 对齐 DESIGN-process.md §6.3。
 */

import { Button, Divider, Form, Input, Space } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';

export interface ConditionBranchItem {
  label: string;
  condition?: string;
}

export interface ConditionConfigData {
  conditions?: ConditionBranchItem[];
  title?: string;
}

export interface ConditionConfigFormProps {
  data: ConditionConfigData;
  onChange: (data: ConditionConfigData) => void;
  disabled?: boolean;
}

export default function ConditionConfigForm({
  data,
  onChange,
  disabled = false,
}: ConditionConfigFormProps) {
  const branches = data.conditions ?? [];

  const update = (next: ConditionBranchItem[]) =>
    onChange({ ...data, conditions: next });

  const updateBranch = (index: number, patch: Partial<ConditionBranchItem>) => {
    update(branches.map((b, i) => (i === index ? { ...b, ...patch } : b)));
  };

  const addBranch = () => {
    update([
      ...branches,
      { label: `分支 ${branches.length + 1}`, condition: '' },
    ]);
  };

  const removeBranch = (index: number) => {
    update(branches.filter((_, i) => i !== index));
  };

  return (
    <Form layout="vertical" size="small" disabled={disabled} component="div">
      <Divider orientation="left" plain style={{ marginTop: 0 }}>
        条件分支
      </Divider>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {branches.map((branch, index) => (
          <div
            key={index}
            style={{
              border: '1px solid #eef0f4',
              borderRadius: 8,
              padding: 12,
            }}
          >
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <Input
                size="small"
                placeholder="分支名称(如:条件成立)"
                value={branch.label}
                onChange={(e) => updateBranch(index, { label: e.target.value })}
                style={{ flex: 1 }}
              />
              <Button
                size="small"
                type="text"
                danger
                icon={<DeleteOutlined />}
                onClick={() => removeBranch(index)}
                disabled={branches.length <= 1}
              />
            </div>
            <Input.TextArea
              size="small"
              placeholder={
                index === branches.length - 1
                  ? '空条件 = 否则(default)'
                  : '条件表达式,例如: amount > 1000'
              }
              value={branch.condition}
              onChange={(e) => updateBranch(index, { condition: e.target.value })}
              rows={2}
            />
          </div>
        ))}
        <Button
          size="small"
          type="dashed"
          icon={<PlusOutlined />}
          onClick={addBranch}
          block
        >
          添加分支
        </Button>
      </Space>
    </Form>
  );
}
