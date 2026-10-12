/**
 * 页面列表项 —— 从 components/page-builder/PageList.tsx 拆分
 * （AGENTS.md 单文件 400 行规范）。
 */

import { Button, List, Popconfirm, Space, Tag, Typography } from 'antd';
import { appTileBackground, TOKENS as T } from '@apaas/shared/design';
import {
  UnorderedListOutlined,
  ProfileOutlined,
  FormOutlined,
  DashboardOutlined,
  LayoutOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { PageMeta } from '../../../api/pages.js';

const { Text } = Typography;

/** 页面类型 → 图标映射。 */
const PAGE_TYPE_ICONS: Record<string, typeof LayoutOutlined> = {
  list_page: UnorderedListOutlined,
  detail_page: ProfileOutlined,
  form_page: FormOutlined,
  dashboard: DashboardOutlined,
  custom: LayoutOutlined,
};

/** 页面类型 → 中文标签。 */
const PAGE_TYPE_LABELS: Record<string, string> = {
  list_page: '列表页',
  detail_page: '详情页',
  form_page: '表单页',
  dashboard: '仪表盘',
  custom: '自定义',
};

export function PageListItem({
  page,
  onClick,
  onDelete,
  deleting,
}: {
  page: PageMeta;
  onClick: () => void;
  onDelete: () => void;
  deleting: boolean;
}) {
  const Icon = PAGE_TYPE_ICONS[page.type] ?? LayoutOutlined;
  const typeLabel = PAGE_TYPE_LABELS[page.type] ?? page.type;

  return (
    <List.Item
      style={{
        padding: '12px 0',
        cursor: 'pointer',
        borderBottom: `1px solid ${T.colorSplit}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = T.colorFillQuaternary;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent';
      }}
      onClick={onClick}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
        {/* 图标块 */}
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: appTileBackground(),
            color: T.colorWhite,
            fontSize: 18,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Icon />
        </div>

        {/* 名称 + slug */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Space size={8} align="center">
            <Text strong style={{ fontSize: 14 }}>
              {page.name}
            </Text>
            <Tag style={{ margin: 0, fontSize: 11 }}>{typeLabel}</Tag>
            {page.published ? (
              <Tag color="success" style={{ margin: 0, fontSize: 11 }}>
                已发布
              </Tag>
            ) : (
              <Tag color="default" style={{ margin: 0, fontSize: 11 }}>
                草稿
              </Tag>
            )}
          </Space>
          <div
            style={{
              fontSize: 12,
              color: 'rgba(0,0,0,0.45)',
              fontFamily: 'monospace',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {page.apiName}
          </div>
        </div>

        {/* 操作 */}
        <Popconfirm
          title="删除页面"
          description={`确定删除页面「${page.name}」吗?删除后不可恢复。`}
          okText="删除"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          onConfirm={(e) => {
            e?.stopPropagation();
            onDelete();
          }}
          onCancel={(e) => e?.stopPropagation()}
        >
          <Button
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            loading={deleting}
            onClick={(e) => e.stopPropagation()}
          />
        </Popconfirm>
      </div>
    </List.Item>
  );
}
