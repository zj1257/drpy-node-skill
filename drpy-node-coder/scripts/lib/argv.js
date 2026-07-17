/**
 * 手写 argv 解析器（零依赖，Windows/bash 兼容）
 *
 * 约定：
 *   --flag value          单值
 *   --flag=value          内联单值
 *   --flag                布尔（"true"）
 *   --header k=v / -H k=v 可重复，收集到 headers 对象
 *   --                    之后的参数全部视为位置参数
 *   其它非 -- 开头        位置参数（positional）
 *
 * 返回 { positional: string[], flags: Record<string,string>, headers: Record<string,string> }
 * flags 保留原始 kebab-case 键名；如需 camelCase，用 toCamel(flags)。
 */
export function parseArgs(argv) {
  const positional = [];
  const flags = {};
  const headers = {};

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      const body = a.slice(2);
      const eq = body.indexOf('=');
      let key, val, inline;
      if (eq >= 0) {
        key = body.slice(0, eq);
        val = body.slice(eq + 1);
        inline = true;
      } else {
        key = body;
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          val = next;
          i++;
        } else {
          val = 'true';
        }
        inline = false;
      }
      // 忽略 inline 形式但值缺失的情况：--header= 也归入 header
      if (key === 'header' || key === 'H') {
        const m = /^([^=]+)=(.*)$/.exec(String(val));
        if (m) headers[m[1]] = m[2];
        continue;
      }
      if (key in flags) {
        if (Array.isArray(flags[key])) flags[key].push(val);
        else flags[key] = [flags[key], val];
      } else {
        flags[key] = val;
      }
      void inline;
    } else {
      positional.push(a);
    }
  }
  return { positional, flags, headers };
}

/** kebab-case → camelCase（--class-id → flags.classId） */
export function toCamel(flags = {}) {
  const out = {};
  for (const k of Object.keys(flags)) {
    out[k.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())] = flags[k];
  }
  return out;
}

/** 读取布尔 flag：存在且不为 false-ish 时为 true */
export function flagBool(flags, key) {
  const v = flags[key];
  return v !== undefined && v !== 'false' && v !== '0' && v !== '';
}
