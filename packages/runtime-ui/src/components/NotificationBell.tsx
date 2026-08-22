/**
 * 通知铃铛组件 — 运行时顶栏未读消息入口。
 *
 * - Badge 显示未读数，窗口获焦时刷新（不使用轮询）
 * - Popover 内嵌消息列表，点击消息标记已读
 * - "全部已读"一键标记
 */

import { useState } from 'react';
import { Badge, Popover, List, Button, Empty, Spin, Typography, Tag } from 'antd';
import { BellOutlined } from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, type InAppMessage } from '../api/notifications';

const { Text } = Typography;

/** 格式化时间为相对时间（如"3分钟前"、"2小时前"）。 */
function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}天前`;
  return new Date(dateStr).toLocaleDateString('zh-CN');
}

export default function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);

  // 未读数 — 窗口获焦时刷新（不使用 refetchInterval 轮询）
  const { data: unreadCount } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: notificationsApi.getUnreadCount,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  // 消息列表（仅在 Popover 打开时加载）
  const { data: messageData, isLoading: messagesLoading } = useQuery({
    queryKey: ['notifications', 'list', { unreadOnly, page: 1 }],
    queryFn: () => notificationsApi.list({ page: 1, pageSize: 20, unreadOnly }),
    enabled: open,
  });

  // 标记单条已读
  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  // 标记全部已读
  const markAllReadMutation = useMutation({
    mutationFn: notificationsApi.markAllRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const handleItemClick = (msg: InAppMessage) => {
    if (!msg.read) {
      markReadMutation.mutate(msg.id);
    }
  };

  const items = messageData?.items ?? [];
  const total = messageData?.total ?? 0;

  const content = (
    <div style={{ width: 360, maxHeight: 480, display: 'flex', flexDirection: 'column' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 0 8px',
          borderBottom: '1px solid #f0f0f0',
        }}
      >
        <Text strong style={{ fontSize: 14 }}>
          消息通知
        </Text>
        <Button
          type="link"
          size="small"
          disabled={!unreadCount || unreadCount === 0}
          loading={markAllReadMutation.isPending}
          onClick={() => markAllReadMutation.mutate()}
        >
          全部已读
        </Button>
      </div>

      <div
        style={{
          margin: '4px 0',
          display: 'flex',
          gap: 8,
        }}
      >
        <Button
          size="small"
          type={unreadOnly ? 'primary' : 'default'}
          onClick={() => setUnreadOnly(true)}
        >
          未读
        </Button>
        <Button
          size="small"
          type={!unreadOnly ? 'primary' : 'default'}
          onClick={() => setUnreadOnly(false)}
        >
          全部
        </Button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {messagesLoading ? (
          <div style={{ textAlign: 'center', padding: 32 }}>
            <Spin size="small" />
          </div>
        ) : items.length === 0 ? (
          <Empty
            description={unreadOnly ? '暂无未读消息' : '暂无消息'}
            style={{ padding: '32px 0' }}
          />
        ) : (
          <List
            dataSource={items}
            renderItem={(msg) => (
              <List.Item
                style={{
                  cursor: 'pointer',
                  padding: '10px 4px',
                  borderBottom: '1px solid #f5f5f5',
                }}
                onClick={() => handleItemClick(msg)}
              >
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    {!msg.read && (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: '#1677ff',
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <Text
                      strong={!msg.read}
                      style={{ fontSize: 13, flex: 1, minWidth: 0 }}
                      ellipsis
                    >
                      {msg.title}
                    </Text>
                    {msg.read && <Tag style={{ margin: 0, fontSize: 11 }}>已读</Tag>}
                  </div>
                  <Text
                    type="secondary"
                    style={{ fontSize: 12, display: 'block', marginBottom: 2 }}
                    ellipsis
                  >
                    {msg.body}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {formatRelativeTime(msg.createdAt)}
                  </Text>
                </div>
              </List.Item>
            )}
          />
        )}
      </div>

      {total > 20 && (
        <div style={{ textAlign: 'center', padding: '8px 0 0', borderTop: '1px solid #f0f0f0' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            共 {total} 条消息，仅显示最近 20 条
          </Text>
        </div>
      )}
    </div>
  );

  return (
    <Popover
      content={content}
      trigger="click"
      placement="bottomRight"
      open={open}
      onOpenChange={setOpen}
    >
      <Badge count={unreadCount ?? 0} overflowCount={99} offset={[-2, 2]}>
        <BellOutlined style={{ color: '#fff', fontSize: 18, cursor: 'pointer' }} />
      </Badge>
    </Popover>
  );
}
