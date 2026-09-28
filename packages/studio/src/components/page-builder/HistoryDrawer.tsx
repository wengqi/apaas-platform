/**
 * 历史抽屉 — E2-4 飞书式服务端保存点历史。
 *
 * 顶栏「历史」按钮打开：列表（时间/来源/操作人，按时间倒序）+
 * 恢复（Popconfirm 二次确认）。恢复成功后 loadSchema 应用到画布
 * 并 markSaved（服务端已持久化），同时失效 qk.pageSavePoints。
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Drawer, Empty, List, Popconfirm, Space, Tag, Typography, message } from 'antd';
import { HistoryOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { qk } from '@apaas/shared/stores';
import { pagesApi } from '../../api/pages.js';
import { usePageBuilderStore } from '../../stores/pageBuilder.js';

const { Text } = Typography;

const TIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';

function SourceTag({ source }: { source: 'save' | 'restore' }) {
  return source === 'restore' ? (
    <Tag color="orange" style={{ marginRight: 0 }}>
      恢复
    </Tag>
  ) : (
    <Tag color="blue" style={{ marginRight: 0 }}>
      保存
    </Tag>
  );
}

export function HistoryDrawer({
  pageId,
  open,
  onClose,
}: {
  pageId: string;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const loadSchema = usePageBuilderStore((s) => s.loadSchema);
  const markSaved = usePageBuilderStore((s) => s.markSaved);

  const { data: points, isLoading } = useQuery({
    queryKey: qk.pageSavePoints(pageId),
    queryFn: () => pagesApi.listSavePoints(pageId),
    enabled: open,
  });

  const restoreMutation = useMutation({
    mutationFn: (savePointId: string) => pagesApi.restoreSavePoint(pageId, savePointId),
    onSuccess: (page) => {
      loadSchema(page.schema);
      markSaved();
      void queryClient.invalidateQueries({ queryKey: qk.pageSavePoints(pageId) });
      void queryClient.invalidateQueries({ queryKey: qk.page(pageId) });
      message.success('已恢复到所选保存点');
    },
    onError: () => {
      message.error('恢复失败，请重试');
    },
  });

  return (
    <Drawer
      title={
        <Space>
          <HistoryOutlined />
          <span>历史保存点</span>
        </Space>
      }
      width={420}
      open={open}
      onClose={onClose}
      destroyOnClose
    >
      <List
        loading={isLoading}
        dataSource={points ?? []}
        locale={{ emptyText: <Empty description="暂无保存点，保存页面后自动记录" /> }}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Popconfirm
                key="restore"
                title="恢复到该保存点"
                description="当前未保存的修改将丢失，确定恢复吗？"
                okText="恢复"
                cancelText="取消"
                onConfirm={() => restoreMutation.mutate(item.id)}
              >
                <Button size="small" type="link" loading={restoreMutation.isPending}>
                  恢复
                </Button>
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              title={
                <Space size={8}>
                  <Text style={{ fontSize: 13 }}>{dayjs(item.createdAt).format(TIME_FORMAT)}</Text>
                  <SourceTag source={item.source} />
                </Space>
              }
              description={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  操作人：{item.createdBy}
                </Text>
              }
            />
          </List.Item>
        )}
      />
    </Drawer>
  );
}
