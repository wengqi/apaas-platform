import { TOKENS as T } from '@apaas/shared/design';
import { useState } from 'react';
import { Button, Empty, List, Tag, Typography, Space, Spin } from 'antd';
import {
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  WarningOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery } from '@tanstack/react-query';
import { publishApi } from '../../api/publish.js';
import type { CheckResult } from '@apaas/shared';

const { Text, Title } = Typography;

/**
 * 预检面板 — 内嵌在构建器 Drawer 中。
 *
 * 交互流程:
 * 1. 首次显示「立即检查」按钮
 * 2. 点击后显示 loading
 * 3. 完成后显示结果列表或「暂无问题」
 * 4. 支持「重新检查」
 */
export default function CheckPanel({ appId }: { appId: string }) {
  const [result, setResult] = useState<CheckResult | null>(null);

  /** 获取历史检查记录 */
  const { data: checks } = useQuery({
    queryKey: ['app-checks', appId],
    queryFn: () => publishApi.listChecks(appId),
    enabled: !!appId,
  });

  /** 执行预检 */
  const checkMutation = useMutation({
    mutationFn: () => publishApi.check(appId),
    onSuccess: (data) => {
      setResult(data);
    },
  });

  const lastCheck = result ?? null;
  const errorCount = lastCheck?.issues.filter((i) => i.level === 'ERROR').length ?? 0;
  const warningCount = lastCheck?.issues.filter((i) => i.level === 'WARNING').length ?? 0;

  return (
    <div style={{ padding: '0 4px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Title level={5} style={{ margin: 0 }}>
          问题
        </Title>
        {lastCheck && (
          <Text type="secondary" style={{ fontSize: 12 }}>
            最近检查 {new Date(lastCheck.checkedAt).toLocaleTimeString('zh-CN')}
          </Text>
        )}
      </div>

      {!lastCheck && !checkMutation.isPending && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          {checks && checks.length > 0 ? (
            <Text type="secondary">没有检查记录</Text>
          ) : (
            <Text type="secondary">没有检查记录</Text>
          )}
          <div style={{ marginTop: 16 }}>
            <Button
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => checkMutation.mutate()}
            >
              立即检查
            </Button>
          </div>
        </div>
      )}

      {checkMutation.isPending && (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <Spin tip="检查中..." />
        </div>
      )}

      {lastCheck && !checkMutation.isPending && (
        <>
          {lastCheck.issues.length === 0 ? (
            <Empty
              image={<CheckCircleOutlined style={{ fontSize: 48, color: T.colorSuccess }} />}
              description="暂无问题"
            />
          ) : (
            <>
              <Space style={{ marginBottom: 12 }}>
                {errorCount > 0 && <Tag color="error">{errorCount} 个错误</Tag>}
                {warningCount > 0 && <Tag color="warning">{warningCount} 个警告</Tag>}
              </Space>
              <List
                dataSource={lastCheck.issues}
                renderItem={(issue) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={
                        issue.level === 'ERROR' ? (
                          <ExclamationCircleOutlined
                            style={{ color: T.colorError, fontSize: 18 }}
                          />
                        ) : issue.level === 'WARNING' ? (
                          <WarningOutlined style={{ color: T.colorGold, fontSize: 18 }} />
                        ) : (
                          <CheckCircleOutlined style={{ color: T.colorPrimary, fontSize: 18 }} />
                        )
                      }
                      title={
                        <Space>
                          <Tag>{issue.module}</Tag>
                          <Text strong>{issue.entityName}</Text>
                        </Space>
                      }
                      description={
                        <div>
                          <Text>{issue.message}</Text>
                          {issue.suggestion && (
                            <Text type="secondary" style={{ display: 'block', marginTop: 4 }}>
                              建议：{issue.suggestion}
                            </Text>
                          )}
                        </div>
                      }
                    />
                  </List.Item>
                )}
              />
            </>
          )}
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => checkMutation.mutate()}
              loading={checkMutation.isPending}
            >
              重新检查
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
