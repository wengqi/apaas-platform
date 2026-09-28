/**
 * 轻量 Markdown → HTML 转换（纯函数，无 DOM 依赖）。
 *
 * 支持子集：标题(#~###)、粗体、斜体、行内代码、链接、无序/有序列表、
 * 引用、分割线、段落。输出未经消毒的 HTML —— 渲染层必须用 DOMPurify 消毒后再注入。
 */

/** 块级解析入口：按行切分 markdown，返回 HTML 片段。 */
export function markdownToHtml(markdown: string): string {
  const lines = (markdown ?? '').replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let listType: 'ul' | 'ol' | null = null;

  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (line.trim() === '') {
      closeList();
      continue;
    }

    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      const level = heading[1]?.length ?? 1;
      out.push(`<h${level}>${inline(heading[2] ?? '')}</h${level}>`);
      continue;
    }

    if (/^(---|\*\*\*)$/.test(line.trim())) {
      closeList();
      out.push('<hr>');
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      closeList();
      out.push(`<blockquote>${inline(quote[1] ?? '')}</blockquote>`);
      continue;
    }

    const ul = /^[-*]\s+(.*)$/.exec(line.trim());
    if (ul) {
      if (listType !== 'ul') {
        closeList();
        out.push('<ul>');
        listType = 'ul';
      }
      out.push(`<li>${inline(ul[1] ?? '')}</li>`);
      continue;
    }

    const ol = /^\d+\.\s+(.*)$/.exec(line.trim());
    if (ol) {
      if (listType !== 'ol') {
        closeList();
        out.push('<ol>');
        listType = 'ol';
      }
      out.push(`<li>${inline(ol[1] ?? '')}</li>`);
      continue;
    }

    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }

  closeList();
  return out.join('\n');
}

/** 行内解析：转义 HTML → 行内代码 → 粗体 → 斜体 → 链接。 */
function inline(text: string): string {
  let result = escapeHtml(text);
  result = /`([^`]+)`/.test(result) ? result.replace(/`([^`]+)`/g, '<code>$1</code>') : result;
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  result = result.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>',
  );
  return result;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
