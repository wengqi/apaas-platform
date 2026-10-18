/**
 * 运行时门户引导页（2026-10-18 用户裁决：studio/runtime 用户域分离）。
 *
 * 无搭建器权限的用户（仅 END_USER 或仅应用级角色——运行时业务用户）访问 studio 时
 * 不再落入开发中心假空态，而是显式引导前往运行时门户；除非该用户被授予
 * 租户管理员/搭建者角色（判定见 @apaas/shared hasStudioAccess）。
 */

import { TOKENS as T, brandLogoMarkSvg } from '@apaas/shared/design';
import { Button, Space, Typography } from 'antd';
import { LogoutOutlined } from '@ant-design/icons';

const { Text, Title } = Typography;

/** 运行时门户基础地址（与页面搭建器运行时预览/嵌入集成同一约定）。 */
const RUNTIME_BASE = (import.meta.env.VITE_RUNTIME_BASE_URL as string | undefined) ?? '';

interface RuntimePortalNoticeProps {
  userName: string;
  onLogout: () => void;
}

/** 运行时业务用户的 studio 落地引导。 */
export default function RuntimePortalNotice({ userName, onLogout }: RuntimePortalNoticeProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: T.colorBgLayout,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          background: T.colorBgContainer,
          border: `1px solid ${T.colorBorderSecondary}`,
          borderRadius: 16,
          padding: '40px 48px',
          maxWidth: 480,
          textAlign: 'center',
        }}
      >
        <span
          aria-hidden
          dangerouslySetInnerHTML={{ __html: brandLogoMarkSvg(36) }}
          style={{ display: 'inline-flex', marginBottom: 16 }}
        />
        <Title level={4} style={{ marginBottom: 8 }}>
          你好，{userName}
        </Title>
        <Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
          您的账号是业务用户，应用使用与审批请在运行时门户完成。
        </Text>
        <Text type="secondary" style={{ display: 'block', fontSize: 12, marginBottom: 24 }}>
          本搭建器面向搭建者与治理角色；如需搭建权限，请联系租户管理员分配。
        </Text>
        <Space size={8} wrap style={{ justifyContent: 'center' }}>
          {RUNTIME_BASE ? (
            <Button type="primary" href={RUNTIME_BASE} target="_blank" rel="noreferrer">
              前往运行时门户
            </Button>
          ) : (
            <Text type="secondary" style={{ fontSize: 12 }}>
              运行时门户地址未配置（VITE_RUNTIME_BASE_URL），请向管理员获取入口
            </Text>
          )}
          <Button icon={<LogoutOutlined />} onClick={onLogout}>
            退出登录
          </Button>
        </Space>
      </div>
    </div>
  );
}
