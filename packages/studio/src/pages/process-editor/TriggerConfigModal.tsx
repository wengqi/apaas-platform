/**
 * 从 pages/ProcessEditor.tsx 拆分（AGENTS.md 单文件 400 行规范）。
 *
 * 触发器配置弹窗（评审整改：此前"创建后再配置"没有配置界面）。
 */

import { useEffect, useState } from 'react';
import { Alert, Form, Input, Modal, Select, message } from 'antd';
import { processesApi, type ProcessDef } from '../../api/processes.js';
import { TRIGGER_OPTIONS } from '../../constants/process.js';

export default function TriggerConfigModal({
  open,
  processDef,
  onClose,
  onSaved,
}: {
  open: boolean;
  processDef: ProcessDef;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form] = Form.useForm<{ triggerType: string; cron?: string }>();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      form.setFieldsValue({
        triggerType: processDef.triggerType ?? 'MANUAL',
        cron: processDef.cron ?? undefined,
      });
    }
  }, [open, processDef, form]);

  const triggerType = Form.useWatch('triggerType', form);

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      setSaving(true);
      await processesApi.update(processDef.id, {
        triggerType: values.triggerType,
        ...(values.triggerType === 'SCHEDULED' ? { cron: values.cron } : {}),
      } as never);
      message.success('触发器已更新；已发布流程将回退为草稿，请重新发布');
      onSaved();
    } catch (err) {
      if (err && typeof err === 'object' && 'errorFields' in err) {
        return; // 校验错误由 Form 展示
      }
      message.error('触发器更新失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="触发器配置"
      open={open}
      onCancel={onClose}
      onOk={handleOk}
      confirmLoading={saving}
      okText="保存"
      cancelText="取消"
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item name="triggerType" label="触发类型" rules={[{ required: true }]}>
          <Select options={TRIGGER_OPTIONS} />
        </Form.Item>
        {triggerType === 'SCHEDULED' && (
          <Form.Item
            name="cron"
            label="Cron 表达式"
            rules={[{ required: true, message: '请输入 Cron 表达式' }]}
            tooltip="五段式，如 0 9 * * 1-5 表示工作日 9 点"
          >
            <Input placeholder="0 9 * * 1-5" />
          </Form.Item>
        )}
      </Form>
      <Alert
        type="info"
        showIcon
        message="修改触发器后流程会回退为草稿状态，需重新发布才会生效。"
      />
    </Modal>
  );
}
