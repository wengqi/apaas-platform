/**
 * 任务中心 — 详情弹窗内容页签（从 TaskCenter.tsx 拆分，
 * AGENTS.md 单文件 400 行规范）。
 */

import { Collapse, Descriptions, Input, Tabs, Tag, Typography } from 'antd';
import type { ProcessTask, ProcessTraceData } from '../../api/tasks.js';
import TraceViewer from '../../components/TraceViewer.js';
import { STATUS_COLORS, STATUS_LABELS } from './constants.js';

const { Text } = Typography;

interface TaskDetailTabsProps {
  taskDetail: ProcessTask;
  triggerData: [string, unknown][];
  formData: [string, unknown][];
  activeTab: 'pending' | 'completed';
  comment: string;
  onCommentChange: (value: string) => void;
  traceData: ProcessTraceData | null;
  traceLoading: boolean;
  /** 申请内容"创建人"的解析姓名（后端 getTask 解析；审批人不应看到裸 cuid） */
  recordCreatorName?: string;
}

/** 任务详情 / 流程轨迹页签。 */
export function TaskDetailTabs({
  taskDetail,
  triggerData,
  formData,
  activeTab,
  comment,
  onCommentChange,
  traceData,
  traceLoading,
  recordCreatorName,
}: TaskDetailTabsProps) {
  return (
    <Tabs
      defaultActiveKey="detail"
      items={[
        {
          key: 'detail',
          label: '任务详情',
          children: (
            <div>
              <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
                <Descriptions.Item label="流程名称" span={2}>
                  {taskDetail.instance?.processDef?.name ?? '—'}
                </Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={STATUS_COLORS[taskDetail.status] ?? 'default'}>
                    {STATUS_LABELS[taskDetail.status] ?? taskDetail.status}
                  </Tag>
                </Descriptions.Item>
                {taskDetail.decision && (
                  <Descriptions.Item label="审批结果">
                    <Tag color={taskDetail.decision === 'APPROVED' ? 'green' : 'red'}>
                      {taskDetail.decision === 'APPROVED' ? '批准' : '拒绝'}
                    </Tag>
                  </Descriptions.Item>
                )}
                {taskDetail.comment && (
                  <Descriptions.Item label="审批意见">{taskDetail.comment}</Descriptions.Item>
                )}
                <Descriptions.Item label="创建时间">
                  {new Date(taskDetail.createdAt).toLocaleString('zh-CN')}
                </Descriptions.Item>
                {taskDetail.completedAt && (
                  <Descriptions.Item label="完成时间">
                    {new Date(taskDetail.completedAt).toLocaleString('zh-CN')}
                  </Descriptions.Item>
                )}
              </Descriptions>

              {triggerData.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>
                    申请内容
                  </Text>
                  <Descriptions column={1} size="small" bordered>
                    {triggerData.map(([key, value]) => (
                      <Descriptions.Item key={key} label={key}>
                        {/* 交互评审（2026-10-04）：创建人显示解析姓名而非裸 cuid */}
                        {key === '创建人' && recordCreatorName
                          ? recordCreatorName
                          : typeof value === 'object'
                            ? JSON.stringify(value, null, 2)
                            : String(value ?? '—')}
                      </Descriptions.Item>
                    ))}
                  </Descriptions>
                </div>
              )}

              {/* 交互评审（2026-10-04）：流程变量是开发者调试信息，折叠默认收起——
                  此前 11 行原始 JSON 全量铺在审批动作之前，决策信息被噪音淹没。
                  双视角评审（2026-10-05）收尾：裸 cuid 任务 ID 同属技术详情，一并移入折叠区 */}
              <Collapse
                ghost
                size="small"
                style={{ marginBottom: 16 }}
                items={[
                  {
                    key: 'vars',
                    label: (
                      <Text type="secondary" style={{ fontSize: 13 }}>
                        流程变量（技术详情）
                      </Text>
                    ),
                    children: (
                      <Descriptions column={1} size="small" bordered>
                        <Descriptions.Item label="任务 ID">{taskDetail.id}</Descriptions.Item>
                        {formData.map(([key, value]) => (
                          <Descriptions.Item key={key} label={key}>
                            {typeof value === 'object'
                              ? JSON.stringify(value, null, 2)
                              : String(value ?? '—')}
                          </Descriptions.Item>
                        ))}
                      </Descriptions>
                    ),
                  },
                ]}
              />

              {activeTab === 'pending' && (
                <div>
                  <Text strong style={{ display: 'block', marginBottom: 8 }}>
                    审批意见
                  </Text>
                  <Input.TextArea
                    placeholder="请输入审批意见（可选）"
                    rows={3}
                    value={comment}
                    onChange={(e) => onCommentChange(e.target.value)}
                  />
                </div>
              )}
            </div>
          ),
        },
        {
          key: 'trace',
          label: '流程轨迹',
          children: <TraceViewer trace={traceData ?? null} loading={traceLoading} />,
        },
      ]}
    />
  );
}
