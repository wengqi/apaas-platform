/**
 * 展示类扩展渲染器 — 页面模块对齐批次C1（对齐飞书「通用」分组）：
 * icon / image / tag / link / qrcode / alert / number_display /
 * datetime_display / user_display / file_display / iframe / markdown。
 *
 * 从 renderers-display.tsx 拆分新文件（单文件 ≤400 行）。
 */

import type { ReactNode } from 'react';
import DOMPurify from 'dompurify';
import { Alert, Image, QRCode, Tag, Typography } from 'antd';
import {
  FileOutlined,
  LinkOutlined,
  SmileOutlined,
  StarFilled,
  UserOutlined,
} from '@ant-design/icons';
import { Progress, Statistic as AntStatistic, Table } from 'antd';
import dayjs from 'dayjs';
import type { ComponentNode } from './types.js';
import type { RenderContext } from './renderer-helpers.js';
import { getPropAsBool, getPropAsNumber, getPropAsString } from './renderer-helpers.js';
import { markdownToHtml } from '../page/markdown.js';

const { Link: AntLink, Text } = Typography;

/** 编辑态占位样式（未绑定值时）。 */
const PLACEHOLDER_STYLE: React.CSSProperties = {
  color: 'rgba(0,0,0,0.35)',
  fontSize: 13,
};

/** antd 图标名 → 图标组件（覆盖常用集合，未知回退 SmileOutlined）。 */
const ICON_MAP: Record<string, typeof SmileOutlined> = {
  smile: SmileOutlined,
  star: StarFilled,
  link: LinkOutlined,
  user: UserOutlined,
  file: FileOutlined,
};

// ---------------------------------------------------------------------------
// 渲染器
// ---------------------------------------------------------------------------

export function renderIcon(node: ComponentNode, ctx: RenderContext): ReactNode {
  const name = getPropAsString(node, 'icon', ctx) || 'smile';
  const size = getPropAsNumber(node, 'size', ctx) || 20;
  const color = getPropAsString(node, 'color', ctx) || '#1456f0';
  const Icon = ICON_MAP[name] ?? SmileOutlined;
  return <Icon style={{ fontSize: size, color, padding: 4 }} />;
}

export function renderImage(node: ComponentNode, ctx: RenderContext): ReactNode {
  const src = getPropAsString(node, 'src', ctx);
  if (!src) {
    return (
      <div style={placeholderBoxStyle}>
        <Text type="secondary" style={PLACEHOLDER_STYLE}>
          🖼 图片
        </Text>
      </div>
    );
  }
  return (
    <Image
      src={src}
      alt={getPropAsString(node, 'alt', ctx) || ''}
      width={getPropAsNumber(node, 'width', ctx) || 200}
      style={{ borderRadius: 6, maxHeight: 400, objectFit: 'contain' }}
    />
  );
}

export function renderTag(node: ComponentNode, ctx: RenderContext): ReactNode {
  const text = getPropAsString(node, 'text', ctx);
  const color = getPropAsString(node, 'color', ctx) || 'blue';
  if (!text) {
    return (
      <Text type="secondary" style={PLACEHOLDER_STYLE}>
        标签
      </Text>
    );
  }
  return <Tag color={color}>{text}</Tag>;
}

export function renderLink(node: ComponentNode, ctx: RenderContext): ReactNode {
  const text = getPropAsString(node, 'text', ctx) || '链接';
  const href = getPropAsString(node, 'href', ctx) || '#';
  const blank = getPropAsBool(node, 'blank', ctx);
  return (
    <AntLink
      href={href}
      target={blank ? '_blank' : undefined}
      rel={blank ? 'noopener noreferrer' : undefined}
      onClick={(e) => {
        // 编辑模式拦截跳转，避免误触
        if (ctx.mode === 'edit') e.preventDefault();
      }}
      style={{ padding: 4 }}
    >
      {text}
    </AntLink>
  );
}

export function renderQrcode(node: ComponentNode, ctx: RenderContext): ReactNode {
  const value = getPropAsString(node, 'content', ctx) || getPropAsString(node, 'value', ctx);
  const size = getPropAsNumber(node, 'size', ctx) || 96;
  if (!value) {
    return (
      <div style={placeholderBoxStyle}>
        <Text type="secondary" style={PLACEHOLDER_STYLE}>
          ▦ 二维码
        </Text>
      </div>
    );
  }
  return <QRCode value={value} size={size} />;
}

export function renderAlert(node: ComponentNode, ctx: RenderContext): ReactNode {
  const message = getPropAsString(node, 'message', ctx) || '提示';
  const description = getPropAsString(node, 'description', ctx);
  const type = getPropAsString(node, 'type', ctx) || 'info';
  return (
    <div style={{ padding: 4 }}>
      <Alert
        type={(type as 'success' | 'info' | 'warning' | 'error') || 'info'}
        message={message}
        description={description || undefined}
        showIcon={getPropAsBool(node, 'showIcon', ctx) || undefined}
        closable={getPropAsBool(node, 'closable', ctx) || undefined}
      />
    </div>
  );
}

export function renderNumberDisplay(node: ComponentNode, ctx: RenderContext): ReactNode {
  const raw = getPropAsString(node, 'value', ctx);
  const precision = getPropAsNumber(node, 'precision', ctx);
  const prefix = getPropAsString(node, 'prefix', ctx) || '';
  const suffix = getPropAsString(node, 'suffix', ctx) || '';
  if (raw === '') {
    return (
      <Text type="secondary" style={PLACEHOLDER_STYLE}>
        --
      </Text>
    );
  }
  const num = Number(raw);
  const shown =
    raw !== '' && !Number.isNaN(num) ? (precision > 0 ? num.toFixed(precision) : String(num)) : raw;
  return (
    <Text style={{ fontSize: 14, padding: 4, display: 'inline-block' }}>
      {prefix}
      {shown}
      {suffix}
    </Text>
  );
}

export function renderDatetimeDisplay(node: ComponentNode, ctx: RenderContext): ReactNode {
  const raw = getPropAsString(node, 'value', ctx);
  const format = getPropAsString(node, 'format', ctx) || 'YYYY-MM-DD HH:mm:ss';
  if (!raw) {
    return (
      <Text type="secondary" style={PLACEHOLDER_STYLE}>
        --
      </Text>
    );
  }
  const d = dayjs(raw);
  return (
    <Text style={{ fontSize: 14, padding: 4, display: 'inline-block' }}>
      {d.isValid() ? d.format(format) : raw}
    </Text>
  );
}

export function renderUserDisplay(node: ComponentNode, ctx: RenderContext): ReactNode {
  const name = getPropAsString(node, 'value', ctx);
  if (!name) {
    return (
      <Text type="secondary" style={PLACEHOLDER_STYLE}>
        --
      </Text>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 4 }}>
      <UserOutlined style={{ fontSize: 12, color: '#1456f0' }} />
      <Text style={{ fontSize: 13 }}>{name}</Text>
    </span>
  );
}

export function renderFileDisplay(node: ComponentNode, ctx: RenderContext): ReactNode {
  // content 支持字符串文件名或 { name, url } 对象；回退 name/url 直配
  const contentProp = node.props.content;
  let cName = '';
  let cUrl = '';
  if (typeof contentProp === 'string') {
    cName = contentProp;
  } else if (
    contentProp &&
    typeof contentProp === 'object' &&
    !('__bind' in (contentProp as object))
  ) {
    const obj = contentProp as { name?: unknown; url?: unknown };
    if (typeof obj.name === 'string') cName = obj.name;
    if (typeof obj.url === 'string') cUrl = obj.url;
  }
  const name = cName || getPropAsString(node, 'name', ctx) || getPropAsString(node, 'value', ctx);
  const url = cUrl || getPropAsString(node, 'url', ctx);
  if (!name && !url) {
    return (
      <Text type="secondary" style={PLACEHOLDER_STYLE}>
        --
      </Text>
    );
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: 4 }}>
      <FileOutlined style={{ fontSize: 14, color: 'rgba(0,0,0,0.55)' }} />
      {url ? (
        <AntLink href={url} target="_blank" rel="noopener noreferrer">
          {name || url}
        </AntLink>
      ) : (
        <Text style={{ fontSize: 13 }}>{name}</Text>
      )}
    </span>
  );
}

export function renderIframe(node: ComponentNode, ctx: RenderContext): ReactNode {
  const src = getPropAsString(node, 'src', ctx);
  const height = getPropAsNumber(node, 'height', ctx) || 240;
  if (!src) {
    return (
      <div style={placeholderBoxStyle}>
        <Text type="secondary" style={PLACEHOLDER_STYLE}>
          ▯ Iframe
        </Text>
      </div>
    );
  }
  return (
    <iframe
      src={src}
      height={height}
      style={{ width: '100%', border: '1px solid #e5e6eb', borderRadius: 6 }}
      title={getPropAsString(node, 'title', ctx) || 'iframe'}
      sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
    />
  );
}

export function renderMarkdownDisplay(node: ComponentNode, ctx: RenderContext): ReactNode {
  const content = getPropAsString(node, 'content', ctx);
  if (!content) {
    return (
      <div style={placeholderBoxStyle}>
        <Text type="secondary" style={PLACEHOLDER_STYLE}>
          # Markdown 内容
        </Text>
      </div>
    );
  }
  // XSS 防护：markdown 转出的 HTML 注入前必须消毒（对齐 rich_text_display）
  const clean = DOMPurify.sanitize(markdownToHtml(content));
  return <div style={{ padding: 8 }} dangerouslySetInnerHTML={{ __html: clean }} />;
}

const placeholderBoxStyle: React.CSSProperties = {
  padding: 16,
  background: '#fafbfc',
  border: '1px dashed #eef0f4',
  borderRadius: 6,
  minHeight: 48,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};

// ---------------------------------------------------------------------------
// 批次C4：进度图 / 矩阵表 / 指标卡组
// ---------------------------------------------------------------------------

/** 进度图 — antd Progress（percent 可绑定）。 */
export function renderProgressChart(node: ComponentNode, ctx: RenderContext): ReactNode {
  const percent = getPropAsNumber(node, 'percent', ctx);
  const pct = Math.max(0, Math.min(100, percent || 0));
  const circle = getPropAsBool(node, 'circle', ctx);
  return (
    <div style={{ padding: 8 }}>
      <Progress percent={pct} type={circle ? 'circle' : 'line'} status="normal" />
    </div>
  );
}

/** 矩阵表 — 绑定数组自动生成列（列 = 首行键）。 */
export function renderMatrixTable(node: ComponentNode, ctx: RenderContext): ReactNode {
  const raw = getPropAsString(node, 'data', ctx);
  let rows: Record<string, unknown>[] = [];
  try {
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    if (Array.isArray(parsed)) {
      rows = parsed.filter(
        (r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r),
      );
    }
  } catch {
    rows = [];
  }
  const first = rows[0];
  const columns = first ? Object.keys(first).map((k) => ({ title: k, dataIndex: k, key: k })) : [];
  return (
    <Table
      size="small"
      columns={columns}
      dataSource={rows.map((r, i) => ({ ...r, __key: i }))}
      rowKey="__key"
      pagination={false}
      locale={{ emptyText: '矩阵表（绑定数组数据后展示）' }}
    />
  );
}

/** 指标卡组 — 项（title|label + value）渲染一排统计卡。 */
export function renderStatisticGroup(node: ComponentNode, _ctx: RenderContext): ReactNode {
  const raw = node.props.items ?? node.props.options;
  const options = Array.isArray(raw)
    ? raw
        .map((o) => {
          if (!o || typeof o !== 'object') return null;
          const obj = o as { label?: unknown; title?: unknown; value?: unknown };
          const label =
            typeof obj.label === 'string'
              ? obj.label
              : typeof obj.title === 'string'
                ? obj.title
                : '';
          if (!label) return null;
          const value = typeof obj.value === 'number' ? obj.value : 0;
          return { label, value };
        })
        .filter((x): x is { label: string; value: number } => x !== null)
    : [];
  if (options.length === 0) {
    return (
      <div style={placeholderBoxStyle}>
        <Text type="secondary" style={PLACEHOLDER_STYLE}>
          指标卡组（配置选项后展示）
        </Text>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: 8 }}>
      {options.map((o) => (
        <AntStatistic key={o.label} title={o.label} value={o.value} />
      ))}
    </div>
  );
}
