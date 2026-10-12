/**
 * 嵌入集成控制台 —— 应用工作台「嵌入集成」页（/app/:appId/embed）。
 *
 * 定位：UI 集成出口（与「API 密钥」的数据/流程集成出口对称，2026-10-12 用户裁决方案一）。
 * 功能：已发布页面选择 → embed URL + 宿主接入代码片段（可复制）→ 用真实宿主 SDK
 * （@apaas/shared/embed）实时预览（studio 与 runtime 跨端口部署时即真实跨域验证）。
 *
 * 注：预览依赖运行时侧 origin 白名单放行本 studio origin（VITE_EMBED_ALLOWED_ORIGINS，
 * 同域部署天然放行）；握手超时时按配置清单排查。
 */

import { useRef, useState } from 'react';
import { Alert, Button, Card, Collapse, Select, Space, Tag, Typography } from 'antd';
import { CopyOutlined, LinkOutlined, PlayCircleOutlined, StopOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { createApaasEmbed, type ApaasEmbedClient } from '@apaas/shared/embed';
import { useAuthStore } from '@apaas/shared/stores';
import { pagesApi } from '../api/pages.js';
import { buildEmbedUrl, buildHostSnippet } from '../utils/embedIntegration.js';

const { Text, Paragraph } = Typography;

interface LogEntry {
  time: string;
  kind: 'in' | 'out' | 'err';
  text: string;
}

/** 运行时源前缀：与 PageBuilder「打开运行时」同源约定（生产同域部署为空串）。 */
const RUNTIME_BASE = (import.meta.env.VITE_RUNTIME_BASE_URL as string | undefined) ?? '';

export default function EmbedIntegration() {
  const { appId } = useParams<{ appId: string }>();
  const token = useAuthStore((s) => s.token);

  const { data: pages = [], isLoading: pagesLoading } = useQuery({
    queryKey: ['embed-pages', appId],
    queryFn: () => pagesApi.list(appId!),
    enabled: !!appId,
  });
  const publishedPages = pages.filter((p) => p.published);

  const [slug, setSlug] = useState<string>('');
  const [env, setEnv] = useState<string>('prod');
  const [connected, setConnected] = useState(false);
  const [readyInfo, setReadyInfo] = useState<string>('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const clientRef = useRef<ApaasEmbedClient | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const embedUrl = appId && slug ? buildEmbedUrl(RUNTIME_BASE, appId, slug, env) : '';
  const snippet =
    appId && slug ? buildHostSnippet({ runtimeBase: RUNTIME_BASE, appId, slug, env }) : '';

  const log = (kind: LogEntry['kind'], text: string): void => {
    setLogs((prev) =>
      [{ time: new Date().toLocaleTimeString(), kind, text }, ...prev].slice(0, 50),
    );
  };

  const connect = (): void => {
    if (!embedUrl || !boxRef.current) return;
    clientRef.current?.destroy();
    setLogs([]);
    setReadyInfo('');
    const embed = createApaasEmbed({
      container: boxRef.current,
      src: embedUrl,
      token: token ?? undefined,
    });
    clientRef.current = embed;
    setConnected(true);
    log('out', `hello → ${slug}${token ? '（携带登录 JWT）' : '（无 token）'}`);

    embed.on('ready', (p) => {
      setReadyInfo(`${p.name}（${p.slug}）env=${p.env} token=${p.authenticated ? '✓' : '✗'}`);
      log('in', `ready: ${JSON.stringify(p)}`);
    });
    embed.on('route-change', (p) => log('in', `route-change: ${p.appId} / ${p.slug}`));
    embed.on('page-event', (p) =>
      log('in', `page-event: ${p.name}${p.data === undefined ? '' : ` ${JSON.stringify(p.data)}`}`),
    );
    embed.on('height-change', (p) => {
      embed.iframe.style.height = `${Math.min(Math.max(p.height, 320), 720)}px`;
    });
    embed.on('auth-expired', (p) => log('err', `auth-expired: ${p?.url ?? ''}——请更新 token`));
    embed.on('error', (e) => {
      log('err', `${e.code}: ${e.message}`);
      if (e.code === 'handshake-timeout') {
        log(
          'err',
          '排查：运行时侧 VITE_EMBED_ALLOWED_ORIGINS 是否放行本页 origin（见下方配置清单）',
        );
      }
    });
  };

  const disconnect = (): void => {
    clientRef.current?.destroy();
    clientRef.current = null;
    setConnected(false);
    setReadyInfo('');
  };

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto' }}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="嵌入集成：把本应用已发布页面以 iframe 干净形态（无平台外壳）嵌入外部宿主系统，经 embed 协议交互数据"
      />
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* 左：接入配置 */}
        <Card
          size="small"
          title={
            <Space>
              <LinkOutlined />
              接入配置
            </Space>
          }
          style={{ width: 460, flexShrink: 0 }}
        >
          <Paragraph>
            <Text type="secondary">已发布页面</Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              placeholder={pagesLoading ? '加载中…' : '选择页面（仅已发布）'}
              value={slug || undefined}
              onChange={setSlug}
              options={publishedPages.map((p) => ({
                value: p.slug,
                label: `${p.name}（${p.slug}）`,
              }))}
            />
          </Paragraph>
          <Paragraph>
            <Text type="secondary">环境</Text>
            <Select
              style={{ width: '100%', marginTop: 4 }}
              value={env}
              onChange={setEnv}
              options={[
                { value: 'prod', label: '生产环境（prod）' },
                { value: 'dev', label: '开发环境（dev，需已发布到 dev）' },
              ]}
            />
          </Paragraph>
          {embedUrl ? (
            <>
              <Paragraph>
                <Text type="secondary">Embed URL</Text>
                <br />
                <Text code copyable style={{ fontSize: 12, wordBreak: 'break-all' }}>
                  {embedUrl}
                </Text>
              </Paragraph>
              <Paragraph>
                <Space>
                  <Text type="secondary">宿主接入代码</Text>
                  <Text
                    copyable={{
                      text: snippet,
                      tooltips: ['复制接入代码', '已复制'],
                      icon: <CopyOutlined />,
                    }}
                    style={{ fontSize: 12, cursor: 'pointer' }}
                  >
                    复制
                  </Text>
                </Space>
                <pre
                  style={{
                    background: '#f6f8fa',
                    padding: 12,
                    borderRadius: 6,
                    fontSize: 12,
                    maxHeight: 300,
                    overflow: 'auto',
                    marginTop: 4,
                  }}
                >
                  {snippet}
                </pre>
              </Paragraph>
            </>
          ) : (
            <Text type="secondary">选择页面后生成 Embed URL 与宿主接入代码</Text>
          )}
          <Collapse
            ghost
            size="small"
            items={[
              {
                key: 'config',
                label: <Text type="secondary">部署配置清单</Text>,
                children: (
                  <div style={{ fontSize: 12 }}>
                    <Paragraph>
                      ① 平台 nginx <Text code>/embed/</Text> location 的{' '}
                      <Text code>frame-ancestors</Text> 白名单加入宿主
                      origin（infra/nginx/app.conf）。
                    </Paragraph>
                    <Paragraph>
                      ② 运行时构建变量 <Text code>VITE_EMBED_ALLOWED_ORIGINS</Text> 加入宿主
                      origin（协议入站白名单；同域部署天然放行，本地跨端口联调需含 studio origin）。
                    </Paragraph>
                    <Paragraph>
                      ③ 本控制台的运行时地址取 <Text code>VITE_RUNTIME_BASE_URL</Text>
                      （与「打开运行时」一致；当前：{RUNTIME_BASE || '同源相对路径'}）。
                    </Paragraph>
                    <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                      页面修改后需应用级发布才会进入运行时 bundle（页面级发布不进 bundle）。
                    </Paragraph>
                  </div>
                ),
              },
            ]}
          />
        </Card>

        {/* 右：实时预览（真实宿主 SDK） */}
        <Card
          size="small"
          title={
            <Space>
              <PlayCircleOutlined />
              实时预览（真实协议）
            </Space>
          }
          style={{ flex: 1, minWidth: 0 }}
          extra={
            <Space>
              <Button
                size="small"
                type="primary"
                icon={<PlayCircleOutlined />}
                disabled={!embedUrl}
                onClick={connect}
              >
                连接预览
              </Button>
              <Button
                size="small"
                icon={<StopOutlined />}
                disabled={!connected}
                onClick={disconnect}
              >
                断开
              </Button>
              <Button
                size="small"
                disabled={!connected}
                onClick={() => {
                  clientRef.current
                    ?.queryData()
                    .then((r) =>
                      log('in', `query-data(${r.source}): ${JSON.stringify(r.data ?? r.error)}`),
                    )
                    .catch((e: Error) => log('err', `query-data 失败: ${e.message}`));
                }}
              >
                拉取页面数据
              </Button>
            </Space>
          }
        >
          {readyInfo && (
            <Paragraph style={{ marginBottom: 8 }}>
              <Tag color="green">ready：{readyInfo}</Tag>
            </Paragraph>
          )}
          {!connected && !readyInfo && (
            <Paragraph type="secondary" style={{ marginBottom: 8 }}>
              点击「连接预览」以宿主身份嵌入所选页面（跨端口部署时即真实跨域联调）。
            </Paragraph>
          )}
          <div
            ref={boxRef}
            style={{
              minHeight: 360,
              border: '2px dashed #d9d9d9',
              borderRadius: 8,
              marginBottom: 12,
            }}
          />
          <Text type="secondary" style={{ fontSize: 12 }}>
            协议消息流
          </Text>
          <div style={{ maxHeight: 220, overflow: 'auto', marginTop: 4 }}>
            {logs.length === 0 && (
              <Text type="secondary" style={{ fontSize: 12 }}>
                暂无消息
              </Text>
            )}
            {logs.map((l, i) => (
              <div key={`${l.time}-${i}`} style={{ marginBottom: 2 }}>
                <Tag color={l.kind === 'in' ? 'blue' : l.kind === 'out' ? 'orange' : 'red'}>
                  {l.time}
                </Tag>
                <Text style={{ fontSize: 12 }}>{l.text}</Text>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
