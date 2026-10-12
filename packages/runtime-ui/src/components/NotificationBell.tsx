/**
 * 通知铃铛组件 — 运行时顶栏未读消息入口。
 *
 * - Badge 显示未读数，窗口获焦时刷新（不使用轮询）
 * - Popover 内嵌消息列表，点击消息标记已读
 * - "全部已读"一键标记
 */

import { TOKENS as T } from '@apaas/shared/design';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Popover, List, Button, Empty, Spin, Typography, Tag, Segmented } from 'antd';
import { BellOutlined, RightOutlined } from '@ant-design/icons';
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
  const navigate = useNavigate();
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

  /**
   * 点击消息：标已读 + 深链跳转（2026-10-12 评审 P0）。
   * 此前点击仅标已读——驳回消息"请查看审批意见"却无任何行动出口；
   * 现在携带 link（/app/:id、/tasks 等）的消息直达业务位置。
   */
  const handleItemClick = (msg: InAppMessage) => {
    if (!msg.read) {
      markReadMutation.mutate(msg.id);
    }
    if (msg.link) {
      setOpen(false);
      navigate(msg.link);
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
          borderBottom: `1px solid ${T.colorSplit}`,
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

      {/* 未读/全部筛选（评审 P2）：Segmented 控件承载互斥选择——此前用两个
          互斥 type=primary Button，主按钮蓝色被降格为选中态 */}
      <Segmented
        size="small"
        value={unreadOnly ? 'unread' : 'all'}
        onChange={(v) => setUnreadOnly(v === 'unread')}
        options={[
          { value: 'unread', label: `未读${unreadCount ? ` (${unreadCount})` : ''}` },
          { value: 'all', label: '全部' },
        ]}
        style={{ marginBottom: 4 }}
      />

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
                  borderBottom: `1px solid ${T.colorFillQuaternary}`,
                }}
                onClick={() => handleItemClick(msg)}
                // 键盘可达（a11y 2026-10-12 审计）：列表项承载点击标记已读
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleItemClick(msg);
                  }
                }}
              >
                <div style={{ width: '100%' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    {!msg.read && (
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: T.colorPrimary,
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
                    {msg.link && (
                      <RightOutlined
                        style={{ fontSize: 10, color: T.colorTextQuaternary, flexShrink: 0 }}
                        aria-label="可跳转"
                      />
                    )}
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
        <div
          style={{
            textAlign: 'center',
            padding: '8px 0 0',
            borderTop: `1px solid ${T.colorSplit}`,
          }}
        >
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
      {/* a11y（2026-10-12 审计）：铃铛改为原生 Button 触发——图标此前无可访问名称，
          Popover 键盘无法打开；Badge 包 Button 保留未读角标。
          头部翻白后图标用默认文字色（评审 P1 双表面一致） */}
      <Badge count={unreadCount ?? 0} overflowCount={99} offset={[-2, 2]}>
        <Button
          type="text"
          aria-label={unreadCount ? `通知，${unreadCount} 条未读` : '通知'}
          icon={<BellOutlined style={{ fontSize: 18 }} />}
        />
      </Badge>
    </Popover>
  );
}
