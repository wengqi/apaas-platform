/**
 * ${env.KEY} 解析（R1.4 G1 前提：env 只放值不放逻辑）。
 *
 * 在 gateway 侧对 bundle 内 JSON 深遍历，把字符串中的 "${env.KEY}" 引用
 * 替换为对应环境的变量值；未定义的 Key 保留原样并记入 warnings（调用方决定
 * 是否告警/展示）。替换发生在 bundle 读出时，前端零改动。
 */

/** ${env.KEY} 引用模式 */
const ENV_REF_PATTERN = /\$\{env\.([A-Za-z0-9_]+)\}/g;

export interface EnvSubstitutionResult {
  /** 替换后的 JSON（新对象，不改入参） */
  value: unknown;
  /** 未定义 Key 的引用清单（去重），如 ["env.SMTP_HOST"] */
  warnings: string[];
}

/** 单个字符串值替换 */
function substituteString(
  text: string,
  values: Readonly<Record<string, string>>,
  warnings: Set<string>,
): string {
  return text.replace(ENV_REF_PATTERN, (match, key: string) => {
    if (key in values) return values[key]!;
    warnings.add(`env.${key}`);
    return match;
  });
}

/** 深遍历替换（对象/数组新建，标量字符串替换） */
export function substituteEnvRefs(
  input: unknown,
  values: Readonly<Record<string, string>>,
): EnvSubstitutionResult {
  const warnings = new Set<string>();

  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') {
      return node.includes('${env.') ? substituteString(node, values, warnings) : node;
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node !== null && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        out[k] = walk(v);
      }
      return out;
    }
    return node;
  };

  return { value: walk(input), warnings: [...warnings] };
}

/** 提取 JSON 中全部 ${env.KEY} 引用（发布预检 G1 清单用，含位置路径） */
export function collectEnvRefPaths(input: unknown, path = '$'): string[] {
  const found: string[] = [];
  const walk = (node: unknown, p: string): void => {
    if (typeof node === 'string') {
      for (const m of node.matchAll(ENV_REF_PATTERN)) found.push(`${p} → env.${m[1]}`);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${p}[${i}]`));
      return;
    }
    if (node !== null && typeof node === 'object') {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        walk(v, `${p}.${k}`);
      }
    }
  };
  walk(input, path);
  return found;
}
