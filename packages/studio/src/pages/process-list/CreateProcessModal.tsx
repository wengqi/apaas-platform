/**
 * 新建流程弹窗 —— 从 pages/ProcessList.tsx 拆分（AGENTS.md 单文件 400 行规范）。
 */

import { Form, Input, Modal, Select, Typography } from 'antd';
import { TRIGGER_OPTIONS } from '../../constants/process.js';
import { suggestApiNameFromLabel } from '../../utils/api-name-suggestion.js';

const { Text } = Typography;

export interface CreateProcessFormValues {
  name: string;
  processKey: string;
  triggerType?: string;
}

export function CreateProcessModal({
  open,
  form,
  onCancel,
  onOk,
  confirmLoading,
}: {
  open: boolean;
  form: ReturnType<typeof Form.useForm<CreateProcessFormValues>>[0];
  onCancel: () => void;
  onOk: () => void;
  confirmLoading: boolean;
}) {
  /** 名称变化时自动生成 API 名(简易:中文无法转拼音,提示手填)。 */
  const name = Form.useWatch('name', form);

  return (
    <Modal
      title="新建流程"
      open={open}
      onCancel={onCancel}
      onOk={onOk}
      confirmLoading={confirmLoading}
      okText="创建并编辑"
      cancelText="取消"
      width={520}
      destroyOnHidden
    >
      <Form<CreateProcessFormValues> form={form} layout="vertical" preserve={false}>
        <Form.Item
          label="流程名称"
          name="name"
          rules={[
            { required: true, message: '请输入流程名称' },
            { max: 40, message: '最多 40 字' },
          ]}
        >
          <Input
            placeholder="客户审批流"
            onChange={(e) => {
              // A 旅程（2026-10-03）：API 名称未手填时按显示名称拼音转写自动建议
              // （onChange 时 form.getFieldValue 还是旧值,必须取 e.target.value）,可改
              if (!form.getFieldValue('processKey')) {
                form.setFieldValue('processKey', suggestApiNameFromLabel(e.target.value, 'flow'));
              }
            }}
          />
        </Form.Item>
        <Form.Item
          label="API 名称"
          name="processKey"
          tooltip="小写下划线,应用内唯一,如 customer_approval"
          rules={[
            { required: true, message: '请输入 API 名称' },
            {
              pattern: /^[a-z][a-z0-9_]*$/,
              message: '仅支持小写字母、数字、下划线,且以字母开头',
            },
          ]}
        >
          <Input placeholder="customer_approval" style={{ fontFamily: 'monospace' }} />
        </Form.Item>
        <Form.Item label="触发器类型(可选)" name="triggerType">
          <Select allowClear placeholder="创建后再配置" options={TRIGGER_OPTIONS} />
        </Form.Item>
      </Form>
      {name && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          已按名称自动生成 API 名称（可修改），创建后锁定。
        </Text>
      )}
    </Modal>
  );
}
