import { useState } from 'react';
import { Form, Input, Button, message, Typography } from 'antd';
import { LockOutlined, MailOutlined, ThunderboltFilled } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import client, { type ApiResponse } from '../api/client.js';
import { useAuthStore, type User } from '../stores/auth.js';

const { Title, Text } = Typography;

interface LoginPayload {
  accessToken: string;
  user: User;
}

interface LoginForm {
  email: string;
  password: string;
}

/**
 * 登录页:email + password 表单,调 POST /api/auth/login,
 * 成功后存 token + user 到 zustand(同步 localStorage),跳转 /apps。
 */
export default function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);

  const onFinish = async (values: LoginForm) => {
    setLoading(true);
    try {
      const res = await client.post<ApiResponse<LoginPayload>>('/api/auth/login', values);
      const body = res.data;
      if (body.ok && body.data) {
        login(body.data.accessToken, body.data.user);
        message.success('登录成功');
        navigate('/apps', { replace: true });
      } else {
        message.error(body.error?.message ?? '登录失败');
      }
    } catch (err) {
      const axErr = err as {
        response?: { data?: { message?: string } };
        message?: string;
      };
      message.error(axErr.response?.data?.message ?? axErr.message ?? '登录失败,请重试');
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
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <div
        style={{
          width: 400,
          background: '#fff',
          borderRadius: 16,
          padding: '40px 36px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        }}
      >
        {/* Logo + 标题 */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: 'linear-gradient(135deg, #1677ff, #4096ff)',
              color: '#fff',
              fontSize: 28,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
              boxShadow: '0 8px 20px rgba(22,119,255,0.3)',
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
          initialValues={{ email: '', password: '' }}
          requiredMark={false}
        >
          <Form.Item
            label="邮箱"
            name="email"
            rules={[
              { required: true, message: '请输入邮箱' },
              { type: 'email', message: '邮箱格式不正确' },
            ]}
          >
            <Input
              prefix={<MailOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="name@example.com"
              size="large"
              style={{ borderRadius: 8 }}
            />
          </Form.Item>
          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#bfbfbf' }} />}
              placeholder="请输入密码"
              size="large"
              style={{ borderRadius: 8 }}
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

        {/* 测试账号提示 */}
        <div
          style={{
            marginTop: 24,
            padding: '12px 16px',
            background: '#f6f8fa',
            borderRadius: 8,
            textAlign: 'center',
          }}
        >
          <Text type="secondary" style={{ fontSize: 12 }}>
            测试账号：admin@apaas.dev / admin123
          </Text>
        </div>
      </div>
    </div>
  );
}
