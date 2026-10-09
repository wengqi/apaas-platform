/**
 * 改稿收编弹窗（ADR-0004 决策 4）——人审前微调 AI 草稿后直接落地为人工基线。
 *
 * 开发者兜底路径：以 JSON 编辑快照（与搭建器 CodeTab 同一兜底哲学），
 * 提交后原 AI 草稿记为已取代（SUPERSEDED），编辑内容以人工身份即时生效。
 * 打开时从提交单详情拉取原始快照预填。
 */

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Input, Modal, Typography, message } from 'antd';
import type { ResourceVersionListItemDto } from '@apaas/shared';
import { reviewAffectedKeys } from '@apaas/shared/stores';
import { reviewsApi } from '../../api/reviews.js';

const { Text } = Typography;

/** 快照 JSON 编辑区行数。 */
const SNAPSHOT_ROWS = 16;

export default function AdoptEditModal({
  appId,
  submission,
  onClose,
}: {
  appId: string;
  submission: ResourceVersionListItemDto | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const [comment, setComment] = useState('');

  const { data: detail } = useQuery({
    queryKey: ['review-submission', appId, submission?.id] as const,
    queryFn: () => reviewsApi.get(appId, submission!.id),
    enabled: Boolean(submission),
  });

  // 详情到达后预填一次（用户编辑期间不被覆盖）
  useEffect(() => {
    if (detail?.snapshot) setText(JSON.stringify(detail.snapshot, null, 2));
  }, [detail]);

  const adoptMutation = useMutation({
    mutationFn: (params: { snapshot: Record<string, unknown>; comment?: string }) =>
      reviewsApi.adopt(appId, submission!.id, params),
    onSuccess: (v) => {
      message.success(`已收编为人工基线 v${v.versionNumber}（原 AI 草稿记为已取代）`);
      for (const key of reviewAffectedKeys(appId)) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      onClose();
    },
    onError: (err: Error) => message.error(err.message),
  });

  const handleOk = async () => {
    let snapshot: Record<string, unknown>;
    try {
      snapshot = JSON.parse(text) as Record<string, unknown>;
    } catch {
      message.warning('快照不是合法 JSON，请修正后重试');
      throw new Error('invalid json'); // 抛错保持弹窗开启
    }
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      message.warning('快照必须是 JSON 对象');
      throw new Error('invalid snapshot');
    }
    await adoptMutation.mutateAsync({
      snapshot,
      comment: comment.trim() || undefined,
    });
  };

  return (
    <Modal
      title={`改稿收编：${submission?.name ?? ''}`}
      open={Boolean(submission)}
      onOk={() => void handleOk()}
      onCancel={onClose}
      okText="收编落地"
      okButtonProps={{ loading: adoptMutation.isPending, danger: false }}
      width={860}
      destroyOnClose
    >
      <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
        编辑下方快照 JSON 后收编：将以你的身份立即落地为人工基线（source=HUMAN，跳过人审）， 原 AI
        草稿记为「已取代」，版本谱系保留收编溯源。
      </Text>
      <Input.TextArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={SNAPSHOT_ROWS}
        style={{ fontFamily: 'monospace', fontSize: 12 }}
        placeholder="快照 JSON 加载中…"
      />
      <Input
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        style={{ marginTop: 8 }}
        maxLength={500}
        placeholder="收编说明（可选，记入版本谱系，如：改了标题与必填项）"
      />
    </Modal>
  );
}
