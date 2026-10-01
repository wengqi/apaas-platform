/**
 * 环境管理页（R1.4）——dev/prod 指针状态、发布/回滚、Deployment 历史、环境变量。
 *
 * 核心语义（蓝图 G2）：发布=切版本指针；回滚=指针回切（记录数据不回滚）；
 * 触发器随环境重建。
 */

import { useState } from 'react';
import {
  Button,
  Card,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { RocketOutlined, RollbackOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import type { AppEnvironmentDto, DeploymentDto } from '@apaas/shared';
import { qk } from '@apaas/shared/stores';
import { environmentsApi } from '../api/environments.js';
import { publishApi } from '../api/publish.js';
import EnvVarManager from './environments/EnvVarManager.js';

const { Text } = Typography;

/** 单环境卡片内容（指针 + 操作 + 历史） */
function EnvironmentPanel({
  appId,
  envKey,
  env,
  versions,
}: {
  appId: string;
  envKey: string;
  env?: AppEnvironmentDto;
  versions: Array<{ id: string; versionNumber: string }>;
}) {
  const queryClient = useQueryClient();
  const [deployOpen, setDeployOpen] = useState(false);
  const [targetVersionId, setTargetVersionId] = useState<string>('');

  const { data: deployments = [], isLoading } = useQuery({
    queryKey: qk.deployments(appId, envKey),
    queryFn: () => environmentsApi.deployments(appId, envKey),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: qk.environments(appId) });
    void queryClient.invalidateQueries({ queryKey: qk.deployments(appId, envKey) });
    void queryClient.invalidateQueries({ queryKey: qk.appVersions(appId) });
  };

  const deployMutation = useMutation({
    mutationFn: (versionId?: string) => environmentsApi.deploy(appId, envKey, { versionId }),
    onSuccess: (r) => {
      message.success(`已部署 v${r.deployment.versionNumber} 到 ${envKey}`);
      setDeployOpen(false);
      invalidate();
    },
    onError: (err) => message.error(err instanceof Error ? err.message : String(err)),
  });

  const rollbackMutation = useMutation({
    mutationFn: (versionId: string) => environmentsApi.rollback(appId, envKey, versionId),
    onSuccess: (r) => {
      message.success(`已回滚到 v${r.deployment.versionNumber}（记录数据不回滚）`);
      invalidate();
    },
    onError: (err) => message.error(err instanceof Error ? err.message : String(err)),
  });

  const columns: ColumnsType<DeploymentDto> = [
    {
      title: '版本',
      dataIndex: 'versionNumber',
      width: 90,
      render: (v: string) => <Tag color="blue">v{v}</Tag>,
    },
    {
      title: '类型',
      dataIndex: 'kind',
      width: 90,
      render: (k: string) => (
        <Tag color={k === 'rollback' ? 'orange' : 'green'}>
          {k === 'rollback' ? '回滚' : '部署'}
        </Tag>
      ),
    },
    { title: '操作人', dataIndex: 'operator', width: 140 },
    { title: '说明', dataIndex: 'note' },
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 160,
      render: (v: string) => v.replace('T', ' ').slice(0, 19),
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, r) =>
        r.versionId !== env?.currentVersionId ? (
          <Popconfirm
            title={`回滚 ${envKey} 到 v${r.versionNumber}？`}
            description="仅切指针与重建触发器，记录数据不回滚"
            onConfirm={() => rollbackMutation.mutate(r.versionId)}
          >
            <Button type="link" size="small" icon={<RollbackOutlined />}>
              回滚到此
            </Button>
          </Popconfirm>
        ) : (
          <Tag color="green">当前生效</Tag>
        ),
    },
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Tag color={env?.currentVersionNumber ? 'green' : 'default'}>
          当前生效：{env?.currentVersionNumber ? `v${env.currentVersionNumber}` : '未部署'}
        </Tag>
        {env?.lastDeployedAt && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            最近部署 {env.lastDeployedAt.replace('T', ' ').slice(0, 19)}
          </Text>
        )}
        <Button
          type="primary"
          size="small"
          icon={<RocketOutlined />}
          onClick={() => {
            setTargetVersionId(versions[0]?.id ?? '');
            setDeployOpen(true);
          }}
        >
          部署版本到此环境
        </Button>
      </Space>

      <Table
        rowKey="id"
        columns={columns}
        dataSource={deployments}
        loading={isLoading}
        size="small"
        pagination={false}
        locale={{ emptyText: '该环境暂无部署记录' }}
      />

      <Modal
        title={`部署到 ${envKey}`}
        open={deployOpen}
        onCancel={() => setDeployOpen(false)}
        onOk={() => deployMutation.mutate(targetVersionId || undefined)}
        confirmLoading={deployMutation.isPending}
        okText="部署"
      >
        <p>
          选择要部署的版本（指针将切到该版本；预检会校验必填环境变量——G4）。
          部署后触发器按该版本重建。
        </p>
        <select
          style={{ width: '100%', padding: 6 }}
          value={targetVersionId}
          onChange={(e) => setTargetVersionId(e.target.value)}
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              v{v.versionNumber}
            </option>
          ))}
        </select>
      </Modal>
    </div>
  );
}

export default function Environments() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();

  const { data: envs = [], isLoading } = useQuery({
    queryKey: qk.environments(appId!),
    queryFn: () => environmentsApi.list(appId!),
    enabled: !!appId,
  });
  const { data: versions = [] } = useQuery({
    queryKey: qk.appVersions(appId!),
    queryFn: () => publishApi.listVersions(appId!),
    enabled: !!appId,
  });

  if (!appId) return null;

  const prod = envs.find((e) => e.key === 'prod');
  const dev = envs.find((e) => e.key === 'dev');
  const versionOptions = versions.map((v) => ({
    id: (v as { id: string }).id,
    versionNumber: (v as { versionNumber: string }).versionNumber,
  }));

  return (
    <Card
      title={
        <span>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={() => navigate(`/app/${appId}/dashboard`)}
            style={{ marginRight: 8 }}
          />
          环境管理
        </span>
      }
      extra={<span style={{ color: '#999', fontSize: 12 }}>发布=切版本指针；版本快照不可变</span>}
    >
      {isLoading ? null : (
        <Tabs
          items={[
            {
              key: 'prod',
              label: '生产（prod）',
              children: (
                <EnvironmentPanel
                  appId={appId}
                  envKey="prod"
                  env={prod}
                  versions={versionOptions}
                />
              ),
            },
            {
              key: 'dev',
              label: '开发（dev）',
              children: (
                <EnvironmentPanel appId={appId} envKey="dev" env={dev} versions={versionOptions} />
              ),
            },
            { key: 'env-vars', label: '环境变量', children: <EnvVarsTabs appId={appId} /> },
          ]}
        />
      )}
    </Card>
  );
}

/** 环境变量（dev/prod 各一个面板） */
function EnvVarsTabs({ appId }: { appId: string }) {
  return (
    <Tabs
      items={[
        { key: 'dev-vars', label: 'dev 值', children: <EnvVarManager appId={appId} env="dev" /> },
        {
          key: 'prod-vars',
          label: 'prod 值',
          children: <EnvVarManager appId={appId} env="prod" />,
        },
      ]}
    />
  );
}
