import { useState } from 'react';
import {
  Card,
  Steps,
  Button,
  Form,
  Input,
  Space,
  Table,
  Tag,
  Typography,
  Alert,
  message,
  Descriptions,
  Radio,
} from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { publishAffectedKeys, qk } from '@apaas/shared/stores';
import { publishApi } from '../api/publish.js';
import { environmentsApi } from '../api/environments.js';
import type { ChangeSet } from '@apaas/shared';

const { Title, Text, Paragraph: _Paragraph } = Typography;
const { TextArea } = Input;

/**
 * 发布向导 — 三步流程。
 *
 * 步骤 1: 版本信息（版本号 + 更新说明）
 * 步骤 2: 变更内容（自动生成的变更清单）
 * 步骤 3: 确认发布
 */
export default function PublishWizard() {
  const { appId } = useParams<{ appId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState(0);
  const [version, setVersion] = useState('0.1.0');
  // R1.4：目标环境（prod=对外生效；dev=仅内部验证，不触碰生产）
  const [targetEnv, setTargetEnv] = useState<'prod' | 'dev'>('prod');
  const [description, setDescription] = useState('');

  /** 获取变更清单 */
  const { data: changeSet, isLoading: changesLoading } = useQuery({
    queryKey: qk.publishChanges(appId!),
    queryFn: () => publishApi.getChanges(appId!),
    enabled: !!appId,
  });

  /** 发布 mutation（R1.4：prod 由后端发布即部署；dev 追加切 dev 指针） */
  const publishMutation = useMutation({
    mutationFn: async () => {
      const created = await publishApi.publish(appId!, { version, description });
      if (targetEnv === 'dev') {
        await environmentsApi.deploy(appId!, 'dev', { versionId: created.id });
      }
      return created;
    },
    onSuccess: () => {
      message.success(targetEnv === 'dev' ? '已发布并部署到 dev（生产未受影响）' : '发布成功');
      // 评审 P2-1：发布成功后失效受影响键（此前不做任何失效，
      // 已挂载的应用/对象/页面/版本/变更视图会保持陈旧）
      for (const key of publishAffectedKeys(appId!)) {
        queryClient.invalidateQueries({ queryKey: key });
      }
      void queryClient.invalidateQueries({ queryKey: qk.environments(appId!) });
      navigate(`/app/${appId}/versions`);
    },
    onError: (err: unknown) => {
      const errData = (err as { response?: { data?: { message?: string } } })?.response?.data;
      message.error(errData?.message ?? '发布失败');
    },
  });

  /** 步骤是否可前进 */
  const canProceed =
    version.trim() !== '' && description.trim() !== '' && /^\d+\.\d+\.\d+$/.test(version);

  const steps = [
    {
      title: '版本信息',
      content: (
        <Form layout="vertical" style={{ maxWidth: 500 }}>
          <Form.Item label="版本号" required>
            <Input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="请输入版本号，如 1.2.1"
            />
            <Text type="secondary" style={{ fontSize: 12 }}>
              语义化版本号，格式为 x.y.z
            </Text>
          </Form.Item>
          <Form.Item label="目标环境（R1.4）">
            <Radio.Group
              value={targetEnv}
              onChange={(e) => setTargetEnv(e.target.value as 'prod' | 'dev')}
            >
              <Radio value="prod">生产（prod）</Radio>
              <Radio value="dev">仅开发（dev，生产不受影响）</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item label="更新说明" required>
            <TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请输入更新说明"
              rows={4}
              maxLength={500}
              showCount
            />
          </Form.Item>
        </Form>
      ),
    },
    {
      title: '变更内容',
      content: <ChangeSetViewer changeSet={changeSet ?? null} loading={changesLoading} />,
    },
    {
      title: '确认发布',
      content: (
        <Descriptions column={1} bordered style={{ maxWidth: 500 }}>
          <Descriptions.Item label="版本号">{version}</Descriptions.Item>
          <Descriptions.Item label="更新说明">{description}</Descriptions.Item>
          <Descriptions.Item label="变更模块数">{changeSet?.modules.length ?? 0}</Descriptions.Item>
          <Descriptions.Item label="变更总数">
            {changeSet?.modules.reduce((sum, m) => sum + m.changes.length, 0) ?? 0}
          </Descriptions.Item>
        </Descriptions>
      ),
    },
  ];

  return (
    <Card>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        <Title level={4} style={{ margin: 0 }}>
          发布新版本
        </Title>
        <Button onClick={() => navigate(-1)}>返回</Button>
      </div>

      <Steps
        current={current}
        items={steps.map((s) => ({ title: s.title }))}
        style={{ marginBottom: 32 }}
      />

      <div style={{ minHeight: 300 }}>{steps[current]?.content}</div>

      <div style={{ marginTop: 24, textAlign: 'right' }}>
        <Space>
          {current > 0 && <Button onClick={() => setCurrent(current - 1)}>上一步</Button>}
          {current < steps.length - 1 ? (
            <Button type="primary" disabled={!canProceed} onClick={() => setCurrent(current + 1)}>
              下一步
            </Button>
          ) : (
            <Button
              type="primary"
              loading={publishMutation.isPending}
              onClick={() => publishMutation.mutate()}
            >
              确认发布
            </Button>
          )}
        </Space>
      </div>

      {!canProceed && current === 0 && (
        <Alert
          type="info"
          message="请填写版本号和更新说明后才能继续"
          style={{ marginTop: 16 }}
          showIcon
        />
      )}
    </Card>
  );
}

/**
 * 变更清单展示组件。
 */
function ChangeSetViewer({
  changeSet,
  loading,
}: {
  changeSet: ChangeSet | null;
  loading: boolean;
}) {
  if (loading) return <Text>加载变更内容...</Text>;
  if (!changeSet || changeSet.modules.length === 0) {
    return (
      <Alert
        type="success"
        message="暂无变更"
        description={
          changeSet?.baselineVersion
            ? `自版本 ${changeSet.baselineVersion} 以来没有新的变更`
            : '首次发布，将包含所有当前配置'
        }
        showIcon
      />
    );
  }

  const moduleLabels: Record<string, string> = {
    APPLICATION: '应用',
    PAGE: '页面',
    OBJECT: '对象',
    PROCESS: '流程',
    PERMISSION: '权限',
  };

  const changeTypeColors: Record<string, string> = {
    CREATE: 'green',
    UPDATE: 'blue',
    DELETE: 'red',
  };

  return (
    <div>
      {changeSet.baselineVersion && (
        <Alert
          type="info"
          message={`对比基线版本：${changeSet.baselineVersion}`}
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}
      {changeSet.modules.map((mod) => (
        <div key={mod.module} style={{ marginBottom: 24 }}>
          <Title level={5}>{moduleLabels[mod.module] ?? mod.module}</Title>
          <Table
            dataSource={mod.changes}
            rowKey={(r) => r.entityId + r.changedAt}
            pagination={false}
            size="small"
            columns={[
              {
                title: '名称',
                dataIndex: 'entityName',
                key: 'entityName',
              },
              {
                title: '变更类型',
                dataIndex: 'changeType',
                key: 'changeType',
                render: (type: string) => (
                  <Tag color={changeTypeColors[type] ?? 'default'}>
                    {type === 'CREATE' ? '新建' : type === 'UPDATE' ? '更新' : '删除'}
                  </Tag>
                ),
              },
              {
                title: '描述',
                dataIndex: 'description',
                key: 'description',
              },
              {
                title: '时间',
                dataIndex: 'changedAt',
                key: 'changedAt',
                render: (t: string) => new Date(t).toLocaleString('zh-CN'),
              },
            ]}
          />
        </div>
      ))}
    </div>
  );
}
