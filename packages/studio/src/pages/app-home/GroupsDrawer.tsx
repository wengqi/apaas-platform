/**
 * 管理分组抽屉（素蓝首页 v8）。
 *
 * 分组是应用上的自由文本（无独立实体）：
 * - 重命名 = 批量改写组内应用 group；
 * - 删除分组 = 组内应用移入「未分组」（group 置空），仅当组为空时展示删除；
 * - 排序需要独立排序存储，v1 不做（组序固定：有组按名称字典序，未分组恒排最后）。
 */

import { useState } from 'react';
import { App as AntApp, Button, Drawer, Empty, Input, Space, Typography } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';
import type { AppSummary } from '../../api/apps.js';
import { TOKENS as T } from '@apaas/shared/design';
import { appsApi } from '../../api/apps.js';
/** 分组归并条目（应用库页与抽屉共用）。 */
export interface AppGroup {
  key: string;
  name: string | null;
  apps: AppSummary[];
}

const { Text } = Typography;

interface GroupsDrawerProps {
  open: boolean;
  groups: AppGroup[];
  onClose: () => void;
  /** 分组数据变化后回调（重命名/删除成功） */
  onChanged: () => void;
}

export default function GroupsDrawer({ open, groups, onClose, onChanged }: GroupsDrawerProps) {
  const { message } = AntApp.useApp();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busy, setBusy] = useState(false);

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const rename = (from: string) =>
    withBusy(async () => {
      const to = renameValue.trim();
      if (!to || to === from) {
        setRenaming(null);
        return;
      }
      const { updated } = await appsApi.updateGroup(from, to);
      message.success(`已重命名：${updated} 个应用归入「${to}」`);
      setRenaming(null);
      onChanged();
    });

  const remove = (name: string) =>
    withBusy(async () => {
      // 删除分组=组内应用移入未分组；入口仅空组可见（UI 控制），此处再保底
      const group = groups.find((g) => g.name === name);
      if (group && group.apps.length > 0) {
        message.warning('仅空分组可删除');
        return;
      }
      await appsApi.updateGroup(name, undefined);
      message.success(`分组「${name}」已删除`);
      onChanged();
    });

  return (
    <Drawer
      title="管理分组"
      open={open}
      onClose={onClose}
      width={420}
      footer={
        <div style={{ fontSize: 11.5, color: T.colorTextQuaternary, lineHeight: 1.7 }}>
          分组随应用产生：创建应用或「移动到分组」时输入新分组名即可建组。
          重命名即时生效；删除分组不会删除应用，组内应用将移入「未分组」。
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
        {groups.length === 0 ? (
          <Empty description="暂无分组" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          groups.map((g) => (
            <div
              key={g.name ?? '__ungrouped'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '11px 12px',
                border: `1px solid ${T.colorBorderSecondary}`,
                borderRadius: 10,
                marginBottom: 8,
                background: T.colorFillQuaternary,
              }}
            >
              {renaming === g.name ? (
                <Space.Compact style={{ flex: 1 }}>
                  <Input
                    autoFocus
                    value={renameValue}
                    maxLength={20}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onPressEnter={() => g.name && rename(g.name)}
                  />
                  <Button type="primary" loading={busy} onClick={() => g.name && rename(g.name)}>
                    保存
                  </Button>
                </Space.Compact>
              ) : (
                <>
                  <Text style={{ fontSize: 13.5, fontWeight: 600, flex: 1 }}>
                    {g.name ?? '未分组'}
                  </Text>
                  <Text style={{ fontSize: 11.5, color: T.colorTextTertiary }}>
                    {g.apps.length} 个应用
                  </Text>
                  {g.name !== null && (
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      aria-label={`重命名分组「${g.name}」`}
                      onClick={() => {
                        if (!g.name) return;
                        setRenaming(g.name);
                        setRenameValue(g.name);
                      }}
                    />
                  )}
                  {g.apps.length === 0 && g.name !== null && (
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      aria-label={`删除分组「${g.name}」`}
                      onClick={() => g.name && remove(g.name)}
                    />
                  )}
                </>
              )}
            </div>
          ))
        )}
      </div>
    </Drawer>
  );
}
