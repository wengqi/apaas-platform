import { useState } from 'react';
import { ThunderboltFilled, LockOutlined, MailOutlined, GlobalOutlined } from '@ant-design/icons';
import { App as AntApp, Button, Card, Form, Input, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import apiClient from '../api/client';
import { useAuthStore, type LoginResponse } from '@apaas/shared/stores';
import { BRAND, LOGIN_BG, TOKENS as T } from '@apaas/shared/design';

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
      // 平台超管不进运行时（运行时是业务用户入口，超管工作台在 Studio 管理端）。
      // 不写入共享 auth store（apaas:auth 跨 studio/runtime 共享，避免覆盖同浏览器
      // 的租户会话）；此前的静默空列表缺陷见 2026-10-10 修复。
      if (user.isPlatformAdmin) {
        message.warning('平台管理员请以租户账号登录运行时（管理操作请使用 Studio 管理端）');
        return;
      }
      login(accessToken, {
        id: user.id,
        name: user.name,
        email: user.email,
        tenantId: user.tenantId ?? null,
        avatar: user.avatar ?? null,
        isPlatformAdmin: user.isPlatformAdmin ?? false,
        roles: user.roles ?? [],
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
    <div className="flex min-h-screen items-center justify-center" style={{ background: LOGIN_BG }}>
      <Card className="w-full max-w-md shadow-md">
        <div className="mb-6 text-center">
          {/* Logo 瓷片（评审 P1）：与 studio 登录页同一品牌图形——此前 runtime
              登录无任何图形 Logo，双表面第一触点即分裂 */}
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: BRAND.logoGradient,
              color: T.colorWhite,
              fontSize: 28,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              boxShadow: BRAND.logoShadow,
            }}
            aria-hidden
          >
            <ThunderboltFilled />
          </div>
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
            <Input prefix={<MailOutlined />} placeholder="you@example.com" autoComplete="email" />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="请输入密码"
              autoComplete="current-password"
            />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登录
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
