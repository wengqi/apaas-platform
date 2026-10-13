/**
 * 门户应用卡片（业务面）：横排头 + 业务描述 + 版本·维护者；无工程计数/状态标签。
 * 从 Home.tsx 拆出（单文件 400 行规范），纯展示、数据由 props 注入。
 */

import { Typography } from 'antd';
import { TOKENS as T, appTileBackground } from '@apaas/shared/design';
import type { AppSummary } from '../api/apps';

const { Text } = Typography;

export default function PortalAppCard({ app, onOpen }: { app: AppSummary; onOpen: () => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      style={{
        background: T.colorBgContainer,
        border: `1px solid ${T.colorBorderSecondary}`,
        borderRadius: 12,
        padding: 20,
        height: '100%',
        minHeight: 148,
        display: 'flex',
        flexDirection: 'column',
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            background: appTileBackground(app.color),
            color: T.colorWhite,
            fontSize: 15,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {(app.name || '应').slice(0, 1)}
        </div>
        <Text
          strong
          style={{
            fontSize: 15,
            flex: 1,
            minWidth: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={app.name}
        >
          {app.name}
        </Text>
      </div>
      <Text
        type="secondary"
        style={{
          fontSize: 12.5,
          lineHeight: 1.65,
          marginTop: 12,
          minHeight: 41,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {app.description || '暂无描述'}
      </Text>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginTop: 'auto',
          paddingTop: 12,
          borderTop: `1px solid ${T.colorSplit}`,
          fontSize: 12,
          color: T.colorTextTertiary,
        }}
      >
        <span>
          {app.version ? `v${app.version}` : ''}
          {app.ownerName ? ` · ${app.ownerName}` : ''}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            color: T.colorPrimary,
            fontWeight: 600,
          }}
        >
          进入 →
        </span>
      </div>
    </div>
  );
}
