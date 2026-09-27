/**
 * 任务中心 — 弹窗底部操作区（从 TaskCenter.tsx 拆分，
 * AGENTS.md 单文件 400 行规范）。
 */

import { Button, Modal, Space } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';

interface TaskModalFooterProps {
  activeTab: 'pending' | 'completed';
  isPending: boolean;
  onClose: () => void;
  onComplete: (decision: string) => void;
}

/** 审批操作（批准 / 拒绝）/ 关闭按钮。 */
export function TaskModalFooter({
  activeTab,
  isPending,
  onClose,
  onComplete,
}: TaskModalFooterProps) {
  if (activeTab !== 'pending') {
    return <Button onClick={onClose}>关闭</Button>;
  }
  return (
    <Space>
      <Button
        danger
        icon={<CloseOutlined />}
        loading={isPending}
        onClick={() => {
          // 拒绝不可逆 — 二次确认防误触
          Modal.confirm({
            title: '确认拒绝该申请？',
            content: '拒绝后流程将按驳回路径继续，此操作不可撤销。',
            okText: '确认拒绝',
            okType: 'danger',
            cancelText: '取消',
            onOk: () => onComplete('REJECTED'),
          });
        }}
      >
        拒绝
      </Button>
      <Button
        type="primary"
        icon={<CheckOutlined />}
        loading={isPending}
        onClick={() => onComplete('APPROVED')}
      >
        批准
      </Button>
    </Space>
  );
}
