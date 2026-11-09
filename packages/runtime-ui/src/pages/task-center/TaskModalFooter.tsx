/**
 * 任务中心 — 弹窗底部操作区（从 TaskCenter.tsx 拆分，
 * AGENTS.md 单文件 400 行规范）。
 * R-B functional-08：补加签（依次/并行）与转办入口（◆4=A）——R1.3 三件套运行时对齐。
 */

import { useState } from 'react';
import { Button, Input, Modal, Radio, Space, Tooltip, Typography } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface TaskModalFooterProps {
  activeTab: 'pending' | 'completed';
  isPending: boolean;
  onClose: () => void;
  onComplete: (decision: string) => void;
  /** #16：节点配置不允许驳回时禁用拒绝按钮（引擎侧同口径强制） */
  allowReject?: boolean;
  /** 不可驳回的具体原因（未配置驳回跳转时展示该文案而非默认文案） */
  rejectReason?: string;
  /** functional-08：加签回调（userId=被加签人；position=依次补审/并行会签） */
  onAddSign: (userId: string, position: 'after' | 'parallel') => void;
  /** functional-08：转办回调（userId=新受理人，任务移交后离开我的待办） */
  onDelegate: (userId: string) => void;
  /** functional-08：加签/转办请求进行中 */
  actionPending?: boolean;
}

/** 审批操作（批准 / 拒绝 / 加签 / 转办）/ 关闭按钮。 */
export function TaskModalFooter({
  activeTab,
  isPending,
  onClose,
  onComplete,
  allowReject = true,
  rejectReason,
  onAddSign,
  onDelegate,
  actionPending = false,
}: TaskModalFooterProps) {
  // functional-08：加签/转办弹窗（手输用户 ID——组织成员选人器待后续轮接入，
  // 裁决 2026-11-09：runtime-ui 现无 END_USER 可用的用户列表 API）
  const [addSignOpen, setAddSignOpen] = useState(false);
  const [delegateOpen, setDelegateOpen] = useState(false);
  const [signUserId, setSignUserId] = useState('');
  const [signPosition, setSignPosition] = useState<'after' | 'parallel'>('after');
  const [delegateUserId, setDelegateUserId] = useState('');

  const submitAddSign = () => {
    const trimmed = signUserId.trim();
    if (!trimmed) return;
    onAddSign(trimmed, signPosition);
    setAddSignOpen(false);
    setSignUserId('');
  };

  const submitDelegate = () => {
    const trimmed = delegateUserId.trim();
    if (!trimmed) return;
    onDelegate(trimmed);
    setDelegateOpen(false);
    setDelegateUserId('');
  };

  if (activeTab !== 'pending') {
    return <Button onClick={onClose}>关闭</Button>;
  }
  return (
    <Space>
      <Tooltip title={allowReject ? undefined : (rejectReason ?? '该审批节点已配置为不允许驳回')}>
        <Button
          danger
          icon={<CloseOutlined />}
          loading={isPending}
          disabled={!allowReject}
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
      </Tooltip>
      <Button
        type="primary"
        icon={<CheckOutlined />}
        loading={isPending}
        onClick={() => onComplete('APPROVED')}
      >
        批准
      </Button>
      <Button disabled={actionPending} onClick={() => setAddSignOpen(true)}>
        加签
      </Button>
      <Button disabled={actionPending} onClick={() => setDelegateOpen(true)}>
        转办
      </Button>

      <Modal
        title="加签审批人"
        open={addSignOpen}
        onOk={submitAddSign}
        okText="确认加签"
        cancelText="取消"
        okButtonProps={{ disabled: !signUserId.trim() }}
        onCancel={() => setAddSignOpen(false)}
        width={420}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <Input
            placeholder="被加签用户的 ID（选人器待后续轮接入）"
            value={signUserId}
            onChange={(e) => setSignUserId(e.target.value)}
          />
          <Radio.Group
            value={signPosition}
            onChange={(e) => setSignPosition(e.target.value as 'after' | 'parallel')}
          >
            <Radio value="after">依次（先由被加签人审批）</Radio>
            <Radio value="parallel">并行（与会签同批）</Radio>
          </Radio.Group>
        </div>
      </Modal>

      <Modal
        title="转办"
        open={delegateOpen}
        onOk={submitDelegate}
        okText="确认转办"
        cancelText="取消"
        okButtonProps={{ disabled: !delegateUserId.trim() }}
        onCancel={() => setDelegateOpen(false)}
        width={420}
      >
        <div style={{ display: 'grid', gap: 12 }}>
          <Input
            placeholder="新受理人的 ID（选人器待后续轮接入）"
            value={delegateUserId}
            onChange={(e) => setDelegateUserId(e.target.value)}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            转办后任务移交新受理人，将离开你的待办列表
          </Text>
        </div>
      </Modal>
    </Space>
  );
}
