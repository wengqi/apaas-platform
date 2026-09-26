/**
 * 从 components/process/ProcessMonitor.tsx 拆分（AGENTS.md 单文件 400 行规范）。
 *
 * 任务处理面板（审批/驳回/转办）。
 */

import { useEffect, useState } from 'react';
import { Button, Card, Descriptions, Form, Input, Modal, Popconfirm, Space } from 'antd';
import dayjs from 'dayjs';
import type { UserTask } from '../../../api/processes.js';

interface TaskProcessPanelProps {
  task: UserTask | null;
  onClose: () => void;
  onComplete: (decision: 'approve' | 'reject', comment?: string) => void;
  onDelegate: (userId: string, comment?: string) => void;
}

export default function TaskProcessPanel({
  task,
  onClose,
  onComplete,
  onDelegate,
}: TaskProcessPanelProps) {
  const [form] = Form.useForm();
  const [delegateMode, setDelegateMode] = useState(false);

  useEffect(() => {
    if (task) {
      form.resetFields();
      setDelegateMode(false);
    }
  }, [task, form]);

  const handleApprove = () => {
    const comment = form.getFieldValue('comment') as string | undefined;
    onComplete('approve', comment);
  };

  const handleReject = () => {
    const comment = form.getFieldValue('comment') as string | undefined;
    onComplete('reject', comment);
  };

  const handleDelegate = () => {
    void form.validateFields().then((values) => {
      onDelegate(values.delegateUserId as string, values.comment as string | undefined);
    });
  };

  return (
    <Modal
      title={task ? `处理任务: ${task.taskName}` : '处理任务'}
      open={!!task}
      onCancel={onClose}
      footer={
        task ? (
          <Space>
            <Popconfirm
              title="驳回任务"
              description="确定驳回此任务吗?"
              okButtonProps={{ danger: true }}
              onConfirm={handleReject}
            >
              <Button danger>驳回</Button>
            </Popconfirm>
            {delegateMode ? (
              <Button onClick={handleDelegate}>确认转办</Button>
            ) : (
              <Button onClick={() => setDelegateMode(true)}>转办</Button>
            )}
            <Button type="primary" onClick={handleApprove}>
              通过
            </Button>
          </Space>
        ) : null
      }
      width={640}
    >
      {task && (
        <Form form={form} layout="vertical">
          <Descriptions
            size="small"
            column={2}
            style={{ marginBottom: 16 }}
            items={[
              { label: '流程', children: task.processName ?? '—' },
              { label: '发起人', children: task.starter ?? '—' },
              {
                label: '到达时间',
                children: task.arrivedAt ? dayjs(task.arrivedAt).format('MM-DD HH:mm') : '—',
              },
              {
                label: '截止',
                children: task.dueAt ? dayjs(task.dueAt).format('MM-DD HH:mm') : '—',
              },
            ]}
          />
          {task.variables && Object.keys(task.variables).length > 0 && (
            <Card size="small" title="申请内容" style={{ marginBottom: 16 }}>
              <Descriptions
                size="small"
                column={1}
                items={Object.entries(task.variables).map(([k, v]) => ({
                  label: k,
                  children: String(v),
                }))}
              />
            </Card>
          )}
          <Form.Item label="审批意见" name="comment">
            <Input.TextArea rows={3} placeholder="请输入审批意见(驳回时建议必填)" />
          </Form.Item>
          {delegateMode && (
            <Form.Item
              label="转办给"
              name="delegateUserId"
              rules={[{ required: true, message: '请输入转办用户 ID' }]}
            >
              <Input placeholder="输入转办用户 ID" />
            </Form.Item>
          )}
        </Form>
      )}
    </Modal>
  );
}
