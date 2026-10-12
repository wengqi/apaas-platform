import { useState } from 'react';
// message 走 AntApp.useApp()（2026-10-12 审计）：静态 message 脱离 ConfigProvider
// 上下文（v5 控制台警告 + 主题 token 不生效），与 runtime-ui 登录页写法对齐
import { App as AntApp, Form, Input, Button, Typography } from 'antd';
import { LockOutlined, MailOutlined, ThunderboltFilled, GlobalOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import client, { type ApiResponse } from '../api/client.js';
import { useAuthStore, type AuthUser } from '@apaas/shared/stores';
import { BRAND, LOGIN_BG, TOKENS as T } from '@apaas/shared/design';

const { Title, Text } = Typography;

interface LoginPayload {
  accessToken: string;
  user: AuthUser;
}

interface LoginForm {
  email: string;
  password: string;
  tenantSlug?: string;
}

/**
 * 登录页。
 *
 * 两种登录方式：
 *  1. 平台超管登录 — 不填租户标识，仅 email + password
 *  2. 租户用户登录 — 填租户标识 + email + password
 *
 * 支持 /t/:slug/login 路由参数预填租户标识。
 * 登录成功后：
 *  - 平台超管 → /platform/tenants
 *  - 租户用户 → /apps
 */
export default function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const { message } = AntApp.useApp();
  const { slug: routeSlug } = useParams<{ slug: string }>();

  const onFinish = async (values: LoginForm) => {
    setLoading(true);
    try {
      const res = await client.post<ApiResponse<LoginPayload>>('/api/auth/login', {
        email: values.email,
        password: values.password,
        tenantSlug: values.tenantSlug || undefined,
      });
      const body = res.data;
      if (body.ok && body.data) {
        login(body.data.accessToken, body.data.user);
        message.success('登录成功');
        // 平台超管跳转租户管理页，租户用户跳转应用列表
        if (body.data.user.isPlatformAdmin) {
          navigate('/platform/tenants', { replace: true });
        } else {
          navigate('/apps', { replace: true });
        }
      } else {
        message.error(body.error?.message ?? '登录失败');
      }
    } catch (err) {
      // 后端错误体为 { ok:false, error:{ code, message } }——中文文案在 error.message
      const axErr = err as {
        response?: { data?: { error?: { message?: string }; message?: string } };
        message?: string;
      };
      message.error(
        axErr.response?.data?.error?.message ??
          axErr.response?.data?.message ??
          axErr.message ??
          '登录失败,请重试',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        // 登录共用背景 token（评审 P1）：替换此前的教程紫渐变，
        // 与 runtime 登录页同一世界
        background: LOGIN_BG,
      }}
    >
      <div
        style={{
          width: 400,
          background: T.colorWhite,
          borderRadius: 16,
          padding: '40px 36px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.08)',
        }}
      >
        {/* Logo + 标题（品牌基元走 shared/design token） */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
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
          >
            <ThunderboltFilled />
          </div>
          <Title level={3} style={{ marginBottom: 4 }}>
            aPaaS Studio
          </Title>
          <Text type="secondary">低代码应用搭建平台</Text>
        </div>

        <Form<LoginForm>
          name="login"
          layout="vertical"
          onFinish={onFinish}
          autoComplete="off"
          initialValues={{ email: '', password: '', tenantSlug: routeSlug ?? '' }}
          requiredMark={false}
        >
          <Form.Item
            label="租户标识"
            name="tenantSlug"
            tooltip="租户用户请填写租户标识（如 demo）；平台管理员可留空"
          >
            <Input
              prefix={<GlobalOutlined style={{ color: T.colorTextQuaternary }} />}
              placeholder="如 demo（管理员可留空）"
              size="large"
              style={{ borderRadius: 8 }}
              autoComplete="off"
            />
          </Form.Item>
          <Form.Item
            label="邮箱"
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input
              prefix={<MailOutlined style={{ color: T.colorTextQuaternary }} />}
              placeholder="name@example.com"
              size="large"
              style={{ borderRadius: 8 }}
              autoComplete="email"
            />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: T.colorTextQuaternary }} />}
              placeholder="请输入密码"
              size="large"
              style={{ borderRadius: 8 }}
              autoComplete="current-password"
            />
          </Form.Item>
          <Form.Item style={{ marginBottom: 0, marginTop: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              block
              size="large"
              loading={loading}
              style={{
                borderRadius: 8,
                height: 44,
                fontSize: 15,
                fontWeight: 500,
              }}
            >
              登录
            </Button>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
}
