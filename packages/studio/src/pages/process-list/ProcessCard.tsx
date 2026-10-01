/**
 * 流程卡片 —— 从 pages/ProcessList.tsx 拆分（AGENTS.md 单文件 400 行规范）。
 */

import {
  Button,
  Card,
  Dropdown,
  InputNumber,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ApartmentOutlined,
  CloudUploadOutlined,
  EditOutlined,
  EyeOutlined,
  LinkOutlined,
  MoreOutlined,
  DeleteOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { processesApi, type ProcessDef } from '../../api/processes.js';
import { openApiAdminApi } from '../../api/open-api.js';
import { qk } from '@apaas/shared/stores';
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

  // G6：发布为 API / 触发地址
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [majorVersion, setMajorVersion] = useState<number>(1);
  const { data: releases = [] } = useQuery({
    queryKey: qk.apiReleases(process.appId, process.id),
    queryFn: () => openApiAdminApi.listReleases(process.appId, process.id),
    enabled: urlOpen,
  });
  const latestMajor = releases[0]?.majorVersion ?? null;
  const triggerUrl = `${window.location.origin}/api/v1/open/apps/${process.appId}/processes/${process.apiName}/start`;

  const queryClient = useQueryClient();
  const releaseMutation = useMutation({
    mutationFn: () => openApiAdminApi.release(process.appId, process.id, majorVersion),
    onSuccess: (r) => {
      message.success(
        `已发布 v${r.majorVersion}${r.diff && r.diff.changeCount > 0 ? `（变更 ${r.diff.changeCount} 处）` : ''}`,
      );
      void queryClient.invalidateQueries({
        queryKey: qk.apiReleases(process.appId, process.id),
      });
      setReleaseOpen(false);
      setUrlOpen(true);
    },
    onError: (err) => message.error(err instanceof Error ? err.message : String(err)),
  });

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
                // G6：API 触发流程的开放 API 发布/触发地址入口
                ...(process.triggerType === 'API' && process.status === 'PUBLISHED'
                  ? [
                      { key: 'api-release', label: '发布为 API', icon: <CloudUploadOutlined /> },
                      { key: 'api-url', label: '触发地址', icon: <LinkOutlined /> },
                    ]
                  : []),
                { key: 'export-schema', label: '导出 Schema', icon: <ApartmentOutlined /> },
                { type: 'divider' as const },
                { key: 'delete', label: '删除', icon: <DeleteOutlined />, danger: true },
              ],
              onClick: ({ key }) => {
                if (key === 'api-release') {
                  setReleaseOpen(true);
                } else if (key === 'api-url') {
                  setUrlOpen(true);
                } else if (key === 'export-schema') {
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

      {/* G6：发布为 API（major 半自动——与上一 major 的 diff 随结果返回） */}
      <Modal
        title={`发布为开放 API：${process.name}`}
        open={releaseOpen}
        onCancel={() => setReleaseOpen(false)}
        onOk={() => releaseMutation.mutate()}
        confirmLoading={releaseMutation.isPending}
        okText="发布"
      >
        <p>
          将冻结当前已发布 schema 为该 major 的契约（发布后不可修改）。
          {latestMajor !== null && (
            <span>当前最新 major 为 v{latestMajor}；破坏性变更请 +1（旧版本仍可调用）。</span>
          )}
        </p>
        <InputNumber
          min={1}
          precision={0}
          value={majorVersion}
          onChange={(v) => setMajorVersion(Number(v) || 1)}
          style={{ width: 160 }}
        />
      </Modal>

      {/* G6：触发地址 + 版本历史 */}
      <Modal
        title={`触发地址：${process.name}`}
        open={urlOpen}
        onCancel={() => setUrlOpen(false)}
        footer={null}
        width={720}
      >
        <p>外部系统以请求头 X-API-Key 调用（密钥在「API 密钥」页创建）：</p>
        <Typography.Paragraph code copyable>
          {`curl -X POST "${triggerUrl}" \\
  -H "X-API-Key: ak_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"inputs": {"order_id": "SO-001"}}'`}
        </Typography.Paragraph>
        <Table
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={releases}
          columns={[
            {
              title: 'Major',
              dataIndex: 'majorVersion',
              width: 80,
              render: (v: number) => `v${v}`,
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 120,
              render: (s: string) => (
                <Tag color={s === 'ACTIVE' ? 'green' : 'orange'}>
                  {s === 'ACTIVE' ? '最新生效' : '已废弃（仍可调用）'}
                </Tag>
              ),
            },
            {
              title: '发布时间',
              dataIndex: 'createdAt',
              render: (v: string) => v.replace('T', ' ').slice(0, 19),
            },
          ]}
        />
      </Modal>
    </Card>
  );
}
