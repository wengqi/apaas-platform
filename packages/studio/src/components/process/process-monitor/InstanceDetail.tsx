/**
 * 从 components/process/ProcessMonitor.tsx 拆分（AGENTS.md 单文件 400 行规范）。
 *
 * 实例详情：节点执行状态。
 */

import { TOKENS as T } from '@apaas/shared/design';
import { Badge, Descriptions, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import type { ProcessInstanceReport } from '../../../api/processes.js';
import { getInstanceStateMeta, getNodeStateMeta } from '../../../constants/process.js';
import { formatDuration } from './formatDuration.js';

const { Text, Title, Paragraph } = Typography;

export default function InstanceDetail({
  report,
  processName,
}: {
  report: ProcessInstanceReport;
  processName?: string;
}) {
  const { instance, nodes } = report;
  const stateMeta = getInstanceStateMeta(instance.state);

  return (
    <div>
      <Descriptions
        size="small"
        column={2}
        bordered
        style={{ marginBottom: 16 }}
        items={[
          { label: '流程', children: processName ?? instance.processKey },
          {
            label: '状态',
            children: <Badge status={stateMeta.badgeStatus} text={stateMeta.label} />,
          },
          { label: '触发者', children: instance.triggeredByUser ?? '系统' },
          { label: '开始时间', children: dayjs(instance.startTime).format('YYYY-MM-DD HH:mm:ss') },
          { label: '耗时', children: formatDuration(instance.startTime, instance.endTime) },
          { label: '实例 ID', children: <Text code>{instance.id}</Text> },
        ]}
      />
      {instance.error && (
        <Paragraph type="danger" style={{ marginBottom: 16 }}>
          错误: {instance.error}
        </Paragraph>
      )}
      <Title level={5}>节点执行状态</Title>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* nodes 空值防御：形状漂移时降级为空列表而非整页崩溃 */}
        {Object.entries(nodes ?? {}).map(([nodeId, exec]) => {
          const meta = getNodeStateMeta(exec.state);
          return (
            <div
              key={nodeId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '8px 12px',
                border: `1px solid ${meta.color}`,
                borderLeft: `4px solid ${meta.color}`,
                borderRadius: 6,
                background: exec.state === 'PENDING' ? T.colorFillQuaternary : T.colorWhite,
              }}
            >
              <Badge status={meta.badgeStatus} />
              <Text strong style={{ fontSize: 13 }}>
                {nodeId}
              </Text>
              <Tag style={{ marginLeft: 'auto' }}>{meta.label}</Tag>
              {exec.startTime && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {dayjs(exec.startTime).format('HH:mm:ss')}
                </Text>
              )}
              {exec.error && (
                <Text type="danger" style={{ fontSize: 12 }}>
                  {exec.error}
                </Text>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
