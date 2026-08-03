import { useState } from 'react';
import { LockOutlined, MailOutlined, GlobalOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Card, Form, Input, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from '../api/client';
import { useAuthStore, type LoginResponse } from '../stores/auth';

const { Title, Text } = Typography;

interface LoginFormValues {
  email: string;
  password: string;
  tenantSlug?: string;
}

/**
 * Runtime 登录页 — 租户用户登录。
 *
 * 表单含租户标识字段（必填），支持 /t/:slug/login 路由参数预填。
 */
export default function Login() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [loading, setLoading] = useState(false);
  const { message } = AntApp.useApp();
  const { slug: routeSlug } = useParams<{ slug: string }>();

  const onFinish = async (values: LoginFormValues) => {
    setLoading(true);
    try {
      const res = await apiClient.post<{ ok: boolean; data: LoginResponse }>('/auth/login', {
        email: values.email,
        password: values.password,
        tenantSlug: values.tenantSlug || undefined,
      });
      const { accessToken, user } = res.data.data;
      login(accessToken, {
        id: user.id,
        name: user.name,
        email: user.email,
        tenantId: user.tenantId ?? null,
      });
      message.success('登录成功');
      navigate('/home', { replace: true });
    } catch (err) {
      const axErr = err as { response?: { data?: { message?: string } }; message?: string };
      message.error(axErr.response?.data?.message ?? '登录失败,请检查邮箱与密码');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md shadow-md">
        <div className="mb-6 text-center">
          <Title level={3} style={{ marginBottom: 4 }}>
            aPaaS Runtime
          </Title>
          <Text type="secondary">应用运行时 — 登录</Text>
        </div>
        <Form<LoginFormValues>
          name="login"
          layout="vertical"
          onFinish={onFinish}
          autoComplete="off"
          initialValues={{ email: '', password: '', tenantSlug: routeSlug ?? '' }}
        >
          <Form.Item
            label="租户标识"
            name="tenantSlug"
            rules={[{ required: true, message: '请输入租户标识' }]}
          >
            <Input prefix={<GlobalOutlined />} placeholder="如 demo" />
          </Form.Item>
          <Form.Item
            label="邮箱"
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input prefix={<MailOutlined />} placeholder="you@example.com" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登录
            </Button>
          </Form.Item>
        </Form>
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            测试账号（租户标识: demo）
          </Text>
          <br />
          <Text type="secondary" style={{ fontSize: 12 }}>
            admin@apaas.dev / admin123 · builder@apaas.dev / builder123 · user@apaas.dev / user123
          </Text>
        </div>
      </Card>
    </div>
  );
}
