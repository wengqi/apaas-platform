/**
 * 流程卡片 —— 从 pages/ProcessList.tsx 拆分（AGENTS.md 单文件 400 行规范）。
 */

import { Button, Card, Dropdown, Modal, Space, Tag, Typography, message } from 'antd';
import {
  ApartmentOutlined,
  EditOutlined,
  EyeOutlined,
  MoreOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { processesApi, type ProcessDef } from '../../api/processes.js';
import { getProcessStatusMeta, getTriggerMeta } from '../../constants/process.js';

const { Text } = Typography;

export function ProcessCard({
  process,
  onEdit,
  onMonitor,
  onDelete,
  onStart,
  starting,
  deleting,
}: {
  process: ProcessDef;
  onEdit: () => void;
  onMonitor: () => void;
  onDelete: () => void;
  onStart: () => void;
  starting: boolean;
  deleting: boolean;
}) {
  const triggerMeta = getTriggerMeta(process.triggerType as string | undefined);
  const statusMeta = getProcessStatusMeta(process.status);
  const TriggerIcon = triggerMeta.icon;

  return (
    <Card
      hoverable
      style={{
        borderRadius: 12,
        border: '1px solid #eef0f4',
        transition: 'all 0.2s ease',
      }}
      styles={{ body: { padding: 20 } }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.04)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
      }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        {/* 头部:图标 + 名称 + 状态 + 版本 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              background: `linear-gradient(135deg, ${triggerMeta.color}, ${triggerMeta.color}dd)`,
              color: '#fff',
              fontSize: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <TriggerIcon />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Space size={6} align="center">
              <Text strong style={{ fontSize: 15 }}>
                {process.name}
              </Text>
              <Tag color={statusMeta.tagColor} style={{ margin: 0 }}>
                {statusMeta.label}
              </Tag>
            </Space>
            <div
              style={{
                fontSize: 12,
                color: 'rgba(0,0,0,0.45)',
                fontFamily: 'monospace',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {process.processKey} · v{process.version}
            </div>
          </div>
        </div>

        {/* 触发器 + 更新时间 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Space size={4}>
            <TriggerIcon style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }} />
            <Text type="secondary" style={{ fontSize: 12 }}>
              触发器: {triggerMeta.label}
            </Text>
          </Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            更新于 {dayjs(process.updatedAt).format('MM-DD HH:mm')}
          </Text>
        </div>

        {/* 操作行 */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderTop: '1px solid #f0f2f5',
            paddingTop: 8,
          }}
        >
          <Space size={4}>
            <Button type="text" size="small" icon={<EditOutlined />} onClick={onEdit}>
              编辑
            </Button>
            <Button type="text" size="small" icon={<EyeOutlined />} onClick={onMonitor}>
              监控
            </Button>
          </Space>
          <Dropdown
            menu={{
              items: [
                // 评审整改：手动触发流程的 UI 启动入口
                ...(process.triggerType === 'MANUAL' && process.status === 'PUBLISHED'
                  ? [
                      {
                        key: 'start',
                        label: '启动实例',
                        icon: <PlayCircleOutlined />,
                      },
                    ]
                  : []),
                { key: 'export-schema', label: '导出 Schema', icon: <ApartmentOutlined /> },
                { type: 'divider' as const },
                { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true },
              ],
              onClick: ({ key }) => {
                if (key === 'export-schema') {
                  processesApi
                    .get(process.id)
                    .then((fullProcess) => {
                      const schema = fullProcess.workflowSchema;
                      if (!schema) {
                        message.warning('该流程暂无 Schema 数据');
                        return;
                      }
                      const json = JSON.stringify(schema, null, 2);
                      const blob = new Blob([json], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `${process.apiName}_schema.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                      message.success('Schema 已导出');
                    })
                    .catch(() => {
                      message.error('导出失败');
                    });
                }
                if (key === 'start') {
                  Modal.confirm({
                    title: '启动流程实例',
                    content: `以手动触发方式启动流程「${process.name}」，是否继续？`,
                    okText: '启动',
                    cancelText: '取消',
                    onOk: onStart,
                  });
                }
                if (key === 'delete') {
                  Modal.confirm({
                    title: '删除流程',
                    content: `确定删除流程「${process.name}」吗？删除后流程定义与历史实例将不可恢复。`,
                    okText: '删除',
                    cancelText: '取消',
                    okButtonProps: { danger: true },
                    onOk: onDelete,
                  });
                }
              },
            }}
          >
            <Button
              type="text"
              size="small"
              icon={<MoreOutlined />}
              loading={deleting || starting}
            />
          </Dropdown>
        </div>
      </Space>
    </Card>
  );
}
