/**
 * 提交单详情抽屉（diff 快审核心交互）。
 *
 * 展示：资源信息 + 结构化 diff（增/删/改三色）+ 原始快照 JSON；
 * 动作：批准（活表漂移 409 时提供 force 确认）/ 驳回（意见必填）。
 */

import { useState } from 'react';
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Modal,
  Popconfirm,
  Space,
  Spin,
  Tag,
  Typography,
  Input,
  message,
} from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReviewDiffItem, ResourceVersionListItemDto } from '@apaas/shared';
import { qk, reviewAffectedKeys } from '@apaas/shared/stores';
import { reviewsApi } from '../../api/reviews.js';
import { MODULE_LABEL, SOURCE_LABEL } from './labels.js';

const { Text, Paragraph } = Typography;

const OP_META: Record<ReviewDiffItem['op'], { color: string; label: string }> = {
  ADDED: { color: 'green', label: '新增' },
  REMOVED: { color: 'red', label: '删除' },
  MODIFIED: { color: 'orange', label: '修改' },
};

interface DiffDrawerProps {
  appId: string;
  submission: ResourceVersionListItemDto | null;
  onClose: () => void;
}

export default function DiffDrawer({ appId, submission, onClose }: DiffDrawerProps) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const queryClient = useQueryClient();

  const { data: detail, isLoading } = useQuery({
    queryKey: qk.reviewDetail(appId, submission?.id ?? ''),
    queryFn: () => reviewsApi.get(appId, submission!.id),
    enabled: !!submission,
  });

  const invalidate = () => {
    for (const key of reviewAffectedKeys(appId, {
      module: submission?.module,
      entityId: submission?.entityId ?? undefined,
    })) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const approveMutation = useMutation({
    mutationFn: (force: boolean) => reviewsApi.approve(appId, submission!.id, { force }),
    onSuccess: () => {
      message.success('已批准并生效');
      invalidate();
      onClose();
    },
    onError: (err) => {
      const text = err instanceof Error ? err.message : String(err);
      if (text.includes('偏离')) {
        Modal.confirm({
          title: '活表已偏离提交基线',
          content: '该资源在提交后存在未提交的人工修改，批准将覆盖这些修改。是否强制批准？',
          okText: '强制批准',
          okButtonProps: { danger: true },
          cancelText: '取消',
          onOk: () => approveMutation.mutateAsync(true),
        });
      } else {
        message.error(text);
      }
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => reviewsApi.reject(appId, submission!.id, rejectComment),
    onSuccess: () => {
      message.success('已驳回');
      setRejectOpen(false);
      invalidate();
      onClose();
    },
    onError: (err) => message.error(err instanceof Error ? err.message : String(err)),
  });

  const diff = detail?.diff;
  const isPending = submission?.status === 'PENDING';

  return (
    <Drawer
      title={submission ? `提交单：${submission.name}（v${submission.versionNumber}）` : '提交单'}
      open={!!submission}
      onClose={onClose}
      width={640}
      destroyOnClose
    >
      {isLoading || !detail ? (
        <Spin />
      ) : (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Space wrap>
            <Tag>{MODULE_LABEL[detail.module] ?? detail.module}</Tag>
            <Tag color="blue">{SOURCE_LABEL[detail.source] ?? detail.source}</Tag>
            <Tag>{detail.apiName}</Tag>
            <Text type="secondary">提交人 {detail.submittedBy}</Text>
          </Space>

          {detail.reviewComment && (
            <Alert message={`审批意见：${detail.reviewComment}`} type="warning" showIcon />
          )}

          {diff && diff.changeCount > 0 ? (
            <>
              <Text strong>{diff.summary}</Text>
              <div style={{ maxHeight: 420, overflow: 'auto' }}>
                {diff.items.map((item, idx) => {
                  const meta = OP_META[item.op];
                  return (
                    <div
                      key={`${item.path}-${idx}`}
                      style={{
                        padding: '6px 8px',
                        borderBottom: '1px solid #f0f0f0',
                        display: 'flex',
                        gap: 8,
                        alignItems: 'baseline',
                      }}
                    >
                      <Tag color={meta.color} style={{ flexShrink: 0 }}>
                        {meta.label}
                      </Tag>
                      <div style={{ minWidth: 0 }}>
                        <div>
                          <Text strong>{item.label}</Text>
                          <Text type="secondary" code style={{ marginLeft: 8, fontSize: 12 }}>
                            {item.path}
                          </Text>
                        </div>
                        {item.detail && (
                          <Paragraph
                            type="secondary"
                            style={{ marginBottom: 0, fontSize: 12 }}
                            ellipsis
                          >
                            {item.detail}
                          </Paragraph>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <Empty
              description="无结构化差异（全新资源或无变更）"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}

          <Text type="secondary">提交快照（JSON）</Text>
          <pre
            style={{
              maxHeight: 200,
              overflow: 'auto',
              background: '#fafafa',
              padding: 8,
              fontSize: 12,
              borderRadius: 4,
            }}
          >
            {JSON.stringify(detail.snapshot, null, 2)}
          </pre>

          {isPending && (
            <Space style={{ justifyContent: 'flex-end', width: '100%' }}>
              <Popconfirm title="确认驳回该提交？" onConfirm={() => setRejectOpen(true)}>
                <Button danger icon={<CloseOutlined />}>
                  驳回
                </Button>
              </Popconfirm>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                loading={approveMutation.isPending}
                onClick={() => approveMutation.mutate(false)}
              >
                批准
              </Button>
            </Space>
          )}
        </Space>
      )}

      <Modal
        title="驳回意见"
        open={rejectOpen}
        onCancel={() => setRejectOpen(false)}
        onOk={() => rejectMutation.mutate()}
        okText="提交驳回"
        okButtonProps={{ danger: true, disabled: rejectComment.trim().length === 0 }}
        confirmLoading={rejectMutation.isPending}
      >
        <Input.TextArea
          rows={4}
          maxLength={500}
          showCount
          placeholder="说明驳回原因（会回传给提交者/AI 用于修正）"
          value={rejectComment}
          onChange={(e) => setRejectComment(e.target.value)}
        />
      </Modal>
    </Drawer>
  );
}
