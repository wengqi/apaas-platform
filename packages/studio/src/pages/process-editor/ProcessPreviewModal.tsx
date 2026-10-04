/**
 * 从 ProcessEditor.tsx 拆分（AGENTS.md 单文件 400 行规范）。
 *
 * 流程结构预览弹窗：只读展示当前（含未保存）schema 的节点链与关键配置摘要。
 *
 * 背景（交互评审 2026-10-04）：工具栏"预览"按钮此前无任何 onClick，是纯装饰死按钮。
 * 运行时并不存在"流程渲染预览"的概念（流程在运行态表现为实例，不是页面），
 * 因此这里提供的是结构摘要——按执行顺序列出节点类型/标题/配置摘要，
 * 供搭建者在不进配置面板的情况下快速核对整条链路。
 */

import { Modal, Tag, Typography, Empty } from 'antd';
import { getNodeMeta } from '../../constants/process.js';
import { getNodeSummary, checkNodeIncomplete } from '../../components/process/nodeMetadata.js';
import type { WorkflowSchema, WorkflowNode } from '@apaas/shared/process';

const { Text } = Typography;

interface ProcessPreviewModalProps {
  open: boolean;
  onClose: () => void;
  schema: WorkflowSchema | undefined;
  /** 是否有未保存更改（预览的是内存态 schema，需要提示与已发布版本的差异） */
  dirty: boolean;
  /** 已发布状态（readonly 时提示预览的是已发布版本结构） */
  readonly: boolean;
}

interface PreviewRow {
  key: string;
  depth: number;
  type: string;
  title: string;
  summary: string;
  incomplete: boolean;
}

function collectRows(nodes: WorkflowNode[], depth: number, out: PreviewRow[]): void {
  for (const node of nodes) {
    const meta = getNodeMeta(node.type);
    const data = (node.data ?? {}) as Record<string, unknown>;
    out.push({
      key: node.id,
      depth,
      type: node.type,
      title: (data.title as string) || meta.label,
      summary: getNodeSummary(node.type, data),
      incomplete: checkNodeIncomplete(node.type, data),
    });
    if (node.blocks?.length) {
      collectRows(node.blocks, depth + 1, out);
    }
  }
}

export default function ProcessPreviewModal({
  open,
  onClose,
  schema,
  dirty,
  readonly,
}: ProcessPreviewModalProps) {
  const rows: PreviewRow[] = [];
  if (schema?.nodes?.length) {
    collectRows(schema.nodes, 0, rows);
  }

  return (
    <Modal title="流程结构预览" open={open} onCancel={onClose} footer={null} width={620}>
      {dirty && (
        <Text type="warning" style={{ display: 'block', marginBottom: 12 }}>
          当前有未保存的更改，以下为编辑器内存中的最新结构（尚未生效）。
        </Text>
      )}
      {readonly && !dirty && (
        <Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
          当前为已发布版本的结构。
        </Text>
      )}
      {rows.length === 0 ? (
        <Empty description="流程为空" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((row) => {
            const meta = getNodeMeta(row.type);
            return (
              <div
                key={row.key}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  paddingLeft: row.depth * 24,
                  padding: '6px 10px',
                  background: '#fafbfc',
                  borderRadius: 6,
                }}
              >
                <Tag color={meta.color ?? 'default'} style={{ margin: 0 }}>
                  {meta.label}
                </Tag>
                <Text strong>{row.title}</Text>
                {row.summary && (
                  <Text
                    type="secondary"
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {row.summary}
                  </Text>
                )}
                {row.incomplete && (
                  <Tag color="red" style={{ margin: 0 }}>
                    未完成配置
                  </Tag>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}
