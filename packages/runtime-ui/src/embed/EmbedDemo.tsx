/**
 * EmbedDemo — 宿主系统模拟器（/embed-demo，开发与联调用）。
 *
 * 用真实宿主 SDK（@apaas/shared/embed 的 createApaasEmbed）把本应用的
 * /embed 干净页面以 iframe 嵌入，演示并验证协议全流程：握手 ready、
 * route-change、page-event（embedEvent 动作出站）、query-data、navigate、
 * context 注入、token 轮换、auth-expired。
 *
 * 同源部署下 frame-ancestors 'self' 天然放行；跨域宿主需在平台 nginx
 * /embed/ location 的 frame-ancestors 白名单中加入宿主 origin。
 */

import { useRef, useState } from 'react';
import { Button, Card, Descriptions, Input, Space, Tag, Typography } from 'antd';
import { createApaasEmbed, type ApaasEmbedClient } from '@apaas/shared/embed';

const { Title, Text, Paragraph } = Typography;

interface LogEntry {
  time: string;
  kind: 'in' | 'out' | 'err';
  text: string;
}

/** 从本浏览器共享 auth store 取 token（demo 便捷通道：先在本应用登录一次）。 */
function readLocalToken(): string {
  try {
    const raw = localStorage.getItem('apaas:auth');
    if (!raw) return '';
    const parsed = JSON.parse(raw) as { state?: { token?: string } };
    return parsed.state?.token ?? '';
  } catch {
    return '';
  }
}

export default function EmbedDemo() {
  const [appId, setAppId] = useState('');
  const [slug, setSlug] = useState('');
  const [env, setEnv] = useState('prod');
  const [token, setToken] = useState('');
  const [navSlug, setNavSlug] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connected, setConnected] = useState(false);
  const [readyInfo, setReadyInfo] = useState<string>('');
  const clientRef = useRef<ApaasEmbedClient | null>(null);

  const log = (kind: LogEntry['kind'], text: string): void => {
    setLogs((prev) =>
      [{ time: new Date().toLocaleTimeString(), kind, text }, ...prev].slice(0, 50),
    );
  };

  const connect = (): void => {
    if (!appId || !slug) {
      log('err', '请先填写 appId 与 slug');
      return;
    }
    clientRef.current?.destroy();
    setLogs([]);
    const params = env && env !== 'prod' ? `?env=${encodeURIComponent(env)}` : '';
    const embed = createApaasEmbed({
      container: document.getElementById('embed-host-box')!,
      src: `${window.location.origin}/embed/app/${appId}/p/${slug}${params}`,
      token: token || undefined,
      allowedOrigin: window.location.origin,
    });
    clientRef.current = embed;
    setConnected(true);

    embed.on('ready', (p) => {
      setReadyInfo(`${p.name}（${p.slug}）env=${p.env} token=${p.authenticated ? '✓' : '✗'}`);
      log('in', `ready: ${JSON.stringify(p)}`);
    });
    embed.on('route-change', (p) => log('in', `route-change: ${p.appId} / ${p.slug}`));
    embed.on('page-event', (p) =>
      log('in', `page-event: ${p.name} ${p.data === undefined ? '' : JSON.stringify(p.data)}`),
    );
    embed.on('height-change', (p) => {
      embed.iframe.style.height = `${Math.max(p.height, 240)}px`;
    });
    embed.on('auth-expired', (p) => log('err', `auth-expired: ${p?.url ?? ''}——请更新 token`));
    embed.on('error', (e) => log('err', `${e.code}: ${e.message}`));
    log('out', `hello → ${appId} / ${slug}${token ? '（携带 token）' : '（无 token）'}`);
  };

  const disconnect = (): void => {
    clientRef.current?.destroy();
    clientRef.current = null;
    setConnected(false);
    setReadyInfo('');
  };

  return (
    <div style={{ maxWidth: 1080, margin: '0 auto', padding: 24 }}>
      <Title level={3}>iframe 嵌入宿主模拟器</Title>
      <Paragraph type="secondary">
        本页模拟外部宿主系统：以 iframe 嵌入平台干净页面（/embed/...），经 embed
        协议通信。先在平台登录（右上角登录页），点「取本会话 token」自动填充。
      </Paragraph>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            style={{ width: 240 }}
            placeholder="appId（如 app_xxx）"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
          />
          <Input
            style={{ width: 200 }}
            placeholder="页面 slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
          <Input
            style={{ width: 90 }}
            placeholder="env"
            value={env}
            onChange={(e) => setEnv(e.target.value)}
          />
          <Button type="primary" onClick={connect}>
            嵌入
          </Button>
          <Button onClick={disconnect} disabled={!connected}>
            断开
          </Button>
          <Button
            onClick={() => {
              const t = readLocalToken();
              setToken(t);
              log('out', t ? '已从本会话 auth store 读取 token' : '本会话无 token（未登录）');
            }}
          >
            取本会话 token
          </Button>
        </Space>
        <Space wrap style={{ marginTop: 12 }}>
          <Input.Password
            style={{ width: 360 }}
            placeholder="JWT（留空则由 hello 免 token 握手）"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <Button
            disabled={!connected || !token}
            onClick={() => {
              clientRef.current?.setToken(token);
              log('out', 'setToken（apaas:auth 轮换）');
            }}
          >
            轮换 token
          </Button>
          <Button
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
        <Space wrap style={{ marginTop: 12 }}>
          <Input
            style={{ width: 200 }}
            placeholder="目标页面 slug"
            value={navSlug}
            onChange={(e) => setNavSlug(e.target.value)}
          />
          <Button
            disabled={!connected || !navSlug}
            onClick={() => {
              clientRef.current?.navigate(navSlug);
              log('out', `navigate → ${navSlug}`);
            }}
          >
            切换页面
          </Button>
          <Button
            disabled={!connected}
            onClick={() => {
              clientRef.current?.setContext({ context: { dept: '华东科技', source: 'host-demo' } });
              log('out', 'setContext（注入 host 上下文数据域）');
            }}
          >
            注入上下文
          </Button>
        </Space>
      </Card>

      {readyInfo && (
        <Descriptions size="small" column={1} style={{ marginBottom: 12 }}>
          <Descriptions.Item label="ready">
            <Tag color="green">{readyInfo}</Tag>
          </Descriptions.Item>
        </Descriptions>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div
          id="embed-host-box"
          style={{ flex: 1, minHeight: 320, border: '2px dashed #d9d9d9', borderRadius: 8 }}
        />
        <Card size="small" title="协议消息流" style={{ width: 380, flexShrink: 0 }}>
          <div style={{ maxHeight: 360, overflow: 'auto' }}>
            {logs.length === 0 && <Text type="secondary">暂无消息</Text>}
            {logs.map((l, i) => (
              <div key={`${l.time}-${i}`} style={{ marginBottom: 4 }}>
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
