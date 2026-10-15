import { useEffect, useState } from 'react';
// message 走 AntApp.useApp()（2026-10-12 审计）：静态 message 脱离 ConfigProvider
// 上下文（v5 控制台警告 + 主题 token 不生效）
import { App as AntApp, Button, Form, Input, Typography } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import client, { type ApiResponse } from '../api/client.js';
import { useAuthStore, type AuthUser } from '@apaas/shared/stores';
import {
  LOGIN_BG,
  LOGIN_PANEL_BG,
  LOGIN_PANEL_BORDER,
  LOGIN_PANEL_WATERMARK,
  TOKENS as T,
  brandLogoMarkSvg,
  brandLogoMonoSvg,
} from '@apaas/shared/design';

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

/** 面板能力点（素蓝定稿：对象/页面/流程三件事）。 */
const PANEL_FEATURES = [
  '对象建模 · 定义业务数据',
  '页面搭建 · 拖拽生成界面',
  '流程编排 · 审批自动流转',
];

/**
 * 登录页（素蓝融合版分屏，2026-10-13 定稿）：
 * 左 46% 淡蓝灰品牌栏（天光水印 + 主张 + 能力点），右 54% 白底极简表单。
 *
 * 登录方式：租户用户填租户标识；平台超管可留空（登录后进租户管理）。
 * 支持 /t/:slug/login 路由参数预填。窄屏（<960px）隐藏品牌栏保表单可用。
 * SSO：平台 identity 层有 CAS Provider 但网关未暴露登录端点，故不放死按钮。
 */
export default function Login() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const { message } = AntApp.useApp();
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const [showPanel, setShowPanel] = useState(() => window.innerWidth >= 960);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 960px)');
    const onChange = (e: MediaQueryListEvent) => setShowPanel(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

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
        // 平台超管跳转租户管理页，租户用户跳转开发中心
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
          '登录失败，请重试',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: LOGIN_BG }}>
      {/* 左品牌栏：天光水印 + 主张 + 能力点（窄屏隐藏） */}
      {showPanel && (
        <div
          style={{
            position: 'relative',
            width: '46%',
            minWidth: 480,
            background: LOGIN_PANEL_BG,
            borderRight: `1px solid ${LOGIN_PANEL_BORDER}`,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            padding: '48px 60px',
          }}
        >
          {/* 天光水印：单色描形，比底色深半度，出血裁切 */}
          <div
            aria-hidden
            style={{ position: 'absolute', right: -90, bottom: -110, opacity: 1 }}
            dangerouslySetInnerHTML={{
              __html: brandLogoMonoSvg(620, LOGIN_PANEL_WATERMARK),
            }}
          />
          <div
            style={{
              position: 'relative',
              zIndex: 1,
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span
                aria-hidden
                dangerouslySetInnerHTML={{ __html: brandLogoMarkSvg(32) }}
                style={{ display: 'inline-flex' }}
              />
              <Text style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>
                aPaaS{' '}
                <Text type="secondary" style={{ fontWeight: 500 }}>
                  Studio
                </Text>
              </Text>
            </div>

            <div style={{ marginTop: 'auto', marginBottom: 'auto', padding: '48px 0' }}>
              <Title level={3} style={{ fontSize: 29, lineHeight: 1.45, margin: 0 }}>
                把业务想法
                <br />
                搭成<span style={{ color: T.colorPrimary }}>正在运行的应用</span>
              </Title>
              <Text
                style={{
                  display: 'block',
                  color: T.colorTextSecondary,
                  fontSize: 14,
                  lineHeight: 1.9,
                  marginTop: 16,
                }}
              >
                对象建模、页面搭建、流程审批、台账报表——
                <br />
                不写代码，从想法到上线。
              </Text>
              <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 13 }}>
                {PANEL_FEATURES.map((f) => (
                  <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span
                      aria-hidden
                      style={{
                        width: 7,
                        height: 7,
                        background: T.colorPrimary,
                        borderRadius: 2,
                        flexShrink: 0,
                      }}
                    />
                    <Text style={{ fontSize: 13.5, color: T.colorTextSecondary }}>{f}</Text>
                  </div>
                ))}
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 18,
                fontSize: 12,
                color: T.colorTextQuaternary,
              }}
            >
              <span
                aria-hidden
                style={{ width: 7, height: 7, background: T.colorPrimaryBg, borderRadius: 2 }}
              />
              <span>企业级低代码应用平台</span>
              <span style={{ marginLeft: 'auto' }}>帮助文档 · 隐私政策 · v0.1.0</span>
            </div>
          </div>
        </div>
      )}

      {/* 右表单区 */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: T.colorBgContainer,
          padding: '40px 24px',
        }}
      >
        <div style={{ width: 372 }}>
          <Title level={3} style={{ fontSize: 23, margin: 0 }}>
            登录开发中心
          </Title>
          <Text
            type="secondary"
            style={{ display: 'block', fontSize: 13, marginTop: 8, marginBottom: 4 }}
          >
            使用企业账号继续，开始搭建应用
          </Text>

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
              style={{ marginTop: 18, marginBottom: 0 }}
            >
              <Input placeholder="如 demo" autoComplete="off" />
            </Form.Item>
            <Form.Item
              label="邮箱"
              name="email"
              rules={[
                { required: true, message: '请输入邮箱' },
                { type: 'email', message: '邮箱格式不正确' },
              ]}
              style={{ marginTop: 20, marginBottom: 0 }}
            >
              <Input placeholder="name@company.com" autoComplete="email" />
            </Form.Item>
            <Form.Item
              label="密码"
              name="password"
              rules={[{ required: true, message: '请输入密码' }]}
              style={{ marginTop: 20, marginBottom: 0 }}
            >
              <Input.Password placeholder="请输入密码" autoComplete="current-password" />
            </Form.Item>
            <Form.Item style={{ marginTop: 24, marginBottom: 0 }}>
              <Button type="primary" htmlType="submit" block size="large" loading={loading}>
                登 录
              </Button>
            </Form.Item>
          </Form>

          <div style={{ textAlign: 'center', marginTop: 26, fontSize: 12.5 }}>
            <Text type="secondary">还没有账号？</Text>{' '}
            <Text style={{ color: T.colorPrimary, fontWeight: 500 }}>联系企业管理员开通</Text>
          </div>
        </div>
      </div>
    </div>
  );
}
