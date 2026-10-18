/**
 * 权限调试页（P1 运维治理）— 平台级，回答"用户 X 对目标 Y 能否执行 Z、为什么"。
 *
 * 表单：用户 / 类型 / 动作 / 目标 ID（+可选节点、记录 ID）→ POST /permissions/debug；
 * 结果区拆分至 ./permission-debug/DebugResult.tsx。
 * 顶栏导航由 TenantLayout 常显，页面只负责内容区。
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Col, Form, Input, Row, Select, Space, Typography, message } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { isAxiosError } from 'axios';
import type { PermissionAction, PermissionType } from '../api/permissions.js';
import { usersApi } from '../api/permissions.js';
import { qk } from '@apaas/shared/stores';
import { permissionDebugApi, type PermissionDebugResult } from '../api/permission-debug.js';
import { TARGET_ACTION_OPTIONS, TARGET_TYPE_OPTIONS } from './permission-debug/constants.js';
import DebugResult from './permission-debug/DebugResult.js';
import PageHeader from '../components/shared/PageHeader.js';
import PageContainer from '../components/shared/PageContainer.js';

const { Text } = Typography;

interface DebugFormValues {
  userId: string;
  type: PermissionType;
  action: PermissionAction;
  targetId: string;
  targetNodeId?: string;
  recordId?: string;
}

/** axios 错误 → 后端 error.message（兜底通用文案）。 */
function extractErrorMessage(err: unknown): string {
  if (isAxiosError(err)) {
    const msg = (err.response?.data as { error?: { message?: string } } | undefined)?.error
      ?.message;
    if (msg) return msg;
  }
  return '调试请求失败';
}

export default function PermissionDebug() {
  const [form] = Form.useForm<DebugFormValues>();
  const [result, setResult] = useState<PermissionDebugResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  /** 用户列表（label=姓名 (email)，value=id）。 */
  const { data: users } = useQuery({
    queryKey: qk.users(),
    queryFn: () => usersApi.list(),
  });

  const userOptions = (users ?? []).map((u) => ({
    value: u.id,
    label: `${u.name} (${u.email})`,
  }));

  const onFinish = async (values: DebugFormValues) => {
    setSubmitting(true);
    try {
      const data = await permissionDebugApi.debug({
        userId: values.userId,
        type: values.type,
        action: values.action,
        targetId: values.targetId,
        targetNodeId: values.targetNodeId || undefined,
        recordId: values.recordId || undefined,
      });
      setResult(data);
    } catch (err) {
      message.error(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="权限调试"
        description="解释权限决策：有效角色 / 命中规则 / 合并条件 / 行级翻译 / 记录可见性"
      />

      <div>
        <Card style={{ marginBottom: 16 }}>
          <Form<DebugFormValues>
            form={form}
            layout="vertical"
            onFinish={(v) => void onFinish(v)}
            initialValues={{ type: 'PAGE', action: 'VIEW' }}
          >
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item
                  name="userId"
                  label="用户"
                  rules={[{ required: true, message: '请选择用户' }]}
                >
                  <Select
                    showSearch
                    placeholder="选择被调试用户"
                    options={userOptions}
                    optionFilterProp="label"
                  />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name="type" label="类型" rules={[{ required: true }]}>
                  <Select options={TARGET_TYPE_OPTIONS} />
                </Form.Item>
              </Col>
              <Col span={4}>
                <Form.Item name="action" label="动作" rules={[{ required: true }]}>
                  <Select options={TARGET_ACTION_OPTIONS} />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item
                  name="targetId"
                  label="目标 ID"
                  rules={[{ required: true, message: '请输入目标资源 ID' }]}
                >
                  <Input placeholder="对象/页面/流程 ID" allowClear />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="targetNodeId" label="节点 ID（可选）">
                  <Input placeholder="流程节点级规则的目标节点" allowClear />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="recordId" label="记录 ID（可选）">
                  <Input placeholder="提供时额外验证该记录在合并条件下是否可见" allowClear />
                </Form.Item>
              </Col>
              <Col span={8} style={{ display: 'flex', alignItems: 'flex-end', paddingBottom: 24 }}>
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  loading={submitting}
                  htmlType="submit"
                >
                  执行调试
                </Button>
              </Col>
            </Row>
          </Form>
        </Card>

        {result ? (
          <Card title="调试结果">
            <DebugResult result={result} />
          </Card>
        ) : (
          <Card>
            <Space direction="vertical" size={4}>
              <Text type="secondary">填写表单后点击「执行调试」查看权限决策解释。</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                结论为 deny-overrides：任一 DENY
                规则命中即拒绝；记录可见性以运行时同一套查询路径验证。
              </Text>
            </Space>
          </Card>
        )}
      </div>
    </PageContainer>
  );
}
