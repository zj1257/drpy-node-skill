/**
 * fs 组命令：ls / read / write / rm / edit / find
 * 移植自 drpy-node-mcp/tools/fsTools.js，去掉 MCP 的 content[] 包装，返回纯 data。
 *
 * 安全护栏：
 *   - 所有路径经 isSafePath 校验（限定在 drpy-node 项目内）
 *   - BLOCKED_EXTENSIONS 禁止写 .md/.txt 等文档类（避免误改文档）
 *   - write/edit 写盘后回读验证，不一致则报错（防假成功）
 *   - edit 的 JS 文件写盘前做 vm.Script 语法校验，失败则不写盘
 *   - edit replace_text 要求唯一匹配；行操作限 200 行
 */
import fs from '../lib/fsUtil.js';
import path from 'path';
import vm from 'vm';

import { resolvePath, isSafePath } from '../lib/pathResolver.js';
import { decodeDsSource } from '../lib/dsHelper.js';
import { decoder } from '../lib/runtime.js';

const MAX_AFFECTED_LINES = 200;

const BLOCKED_EXTENSIONS = ['.md', '.txt', '.rst', '.adoc', '.doc', '.docx', '.pdf'];
const BLOCKED_MESSAGE = (ext) =>
  `禁止操作 ${ext} 文件！CLI 文件工具仅用于项目代码文件（.js/.json/.css/.html 等）。文档/README 请用 IDE 的 Write/Edit。`;

function checkBlockedExtension(filePath) {
  const lower = filePath.toLowerCase();
  for (const ext of BLOCKED_EXTENSIONS) {
    if (lower.endsWith(ext)) throw new Error(BLOCKED_MESSAGE(ext));
  }
}

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/** 优先 --content，其次 --content-file，最后 stdin（当 stdin 非 TTY） */
async function readContent(flags) {
  if (flags.content !== undefined) return flags.content;
  if (flags['content-file']) {
    return await fs.readFile(flags['content-file'], 'utf-8');
  }
  if (!process.stdin.isTTY) return await readStdin();
  return undefined;
}

async function decodeJs(content) {
  if (!content.endsWith) return content;
  // 非入口：仅在调用方判断 .js 后使用
  const fn = await decoder();
  return await decodeDsSource(content, fn);
}

/** ls [path] */
async function ls(ctx) {
  const dirPath = ctx.positional[0] || '.';
  if (!isSafePath(dirPath)) throw new Error('Access denied: 路径超出 drpy-node 项目范围');
  const fullPath = resolvePath(dirPath);
  const entries = await fs.readdir(fullPath, { withFileTypes: true });
  return {
    path: dirPath,
    entries: entries.map((f) => ({ name: f.name, isDirectory: f.isDirectory() })),
  };
}

/** read <path> */
async function read(ctx) {
  const filePath = ctx.positional[0];
  if (!filePath || !isSafePath(filePath)) throw new Error('Invalid path');

  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico', '.bmp', '.tiff', '.tif'];
  if (imageExts.some((ext) => filePath.toLowerCase().endsWith(ext))) {
    const buffer = await fs.readFile(resolvePath(filePath));
    const ext = filePath.split('.').pop().toLowerCase();
    const mimeTypes = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
      svg: 'image/svg+xml', webp: 'image/webp', ico: 'image/x-icon', bmp: 'image/bmp',
      tiff: 'image/tiff', tif: 'image/tiff',
    };
    const mimeType = mimeTypes[ext] || 'image/png';
    return { type: 'image', mimeType, dataUrl: `data:${mimeType};base64,${buffer.toString('base64')}` };
  }

  let content = await fs.readFile(resolvePath(filePath), 'utf-8');
  let decoded = false;
  if (filePath.endsWith('.js')) {
    content = await decodeJs(content);
    decoded = true;
  }
  return { type: 'text', content, decoded };
}

/** write <path> [--content|--content-file|stdin] */
async function write(ctx) {
  const filePath = ctx.positional[0];
  const content = await readContent(ctx.flags);
  if (filePath === undefined || !isSafePath(filePath)) throw new Error('Invalid path');
  if (content === undefined) throw new Error('缺少内容：使用 --content / --content-file 或通过 stdin 提供');
  checkBlockedExtension(filePath);

  const fullPath = resolvePath(filePath);
  const existed = await fs.pathExists(fullPath);
  const beforeStat = existed ? await fs.stat(fullPath) : null;
  await fs.outputFile(fullPath, content);
  const written = await fs.readFile(fullPath, 'utf-8');
  const afterStat = await fs.stat(fullPath);

  if (written !== content) {
    throw new Error(
      `WRITE_VERIFICATION_FAILED: 写入后回读内容与预期不一致 (expected ${content.length} chars, got ${written.length})`
    );
  }

  return {
    file: filePath,
    operation: existed ? 'overwrite' : 'create',
    writeVerification: {
      passed: true,
      expectedLength: content.length,
      actualLength: written.length,
      sizeBefore: beforeStat ? beforeStat.size : 0,
      sizeAfter: afterStat.size,
    },
  };
}

/** rm <path> */
async function rm(ctx) {
  const filePath = ctx.positional[0];
  if (!filePath || !isSafePath(filePath)) throw new Error('Invalid path');
  await fs.remove(resolvePath(filePath));
  return { file: filePath, deleted: true };
}

function validateJsSyntax(code) {
  try {
    new vm.Script(code);
    return null;
  } catch (e) {
    return e.message;
  }
}

/** edit <path> <op> [--search --replacement | --start-line --end-line --content] */
async function edit(ctx) {
  const filePath = ctx.positional[0];
  const operation = ctx.positional[1] || ctx.flags.operation;
  if (!filePath || !isSafePath(filePath)) throw new Error('Invalid path');
  if (!operation) throw new Error('operation 必填：replace_text/replace_lines/delete_lines/insert_lines');
  checkBlockedExtension(filePath);

  const fullPath = resolvePath(filePath);
  if (!(await fs.pathExists(fullPath))) throw new Error(`File not found: ${filePath}`);

  let content = await fs.readFile(fullPath, 'utf-8');
  const originalContent = content;
  const originalStat = await fs.stat(fullPath);
  let summary = '';

  if (operation === 'replace_text') {
    const { search, replacement } = ctx.flags;
    if (!search) throw new Error("replace_text 需要 --search");
    const idx = content.indexOf(search);
    if (idx === -1) {
      throw new Error(`Text not found: "${search.substring(0, 100)}${search.length > 100 ? '...' : ''}"`);
    }
    const secondIdx = content.indexOf(search, idx + 1);
    if (secondIdx !== -1) {
      const ln1 = content.substring(0, idx).split('\n').length;
      const ln2 = content.substring(0, secondIdx).split('\n').length;
      throw new Error(
        `搜索文本有 2+ 处匹配（行 ${ln1} 和 ${ln2}），拒绝替换。请用更长的唯一文本，或先用 fs find 定位。`
      );
    }
    content = content.substring(0, idx) + (replacement || '') + content.substring(idx + search.length);
    summary = `Replaced text at pos ${idx} (${search.length} → ${(replacement || '').length} chars)`;
  } else if (operation === 'replace_lines' || operation === 'delete_lines' || operation === 'insert_lines') {
    const startLine = Number(ctx.flags['start-line']);
    const endLine = ctx.flags['end-line'] !== undefined ? Number(ctx.flags['end-line']) : startLine;
    const lines = content.split('\n');

    if (operation === 'insert_lines') {
      if (!(startLine >= 0)) throw new Error('insert_lines 需要 --start-line >= 0');
      if (startLine > lines.length) throw new Error(`start_line ${startLine} 超范围 (0-${lines.length})`);
      const newContent = (await readContent(ctx.flags)) || '';
      const newLines = newContent.split('\n');
      if (newLines.length > MAX_AFFECTED_LINES) {
        throw new Error(`insert_lines 将插入 ${newLines.length} 行（上限 ${MAX_AFFECTED_LINES}）`);
      }
      lines.splice(startLine, 0, ...newLines);
      content = lines.join('\n');
      summary = `Inserted ${newLines.length} line(s) ${startLine === 0 ? 'at beginning' : `after line ${startLine}`}`;
    } else {
      if (!(startLine >= 1)) throw new Error(`${operation} 需要 --start-line >= 1`);
      if (startLine > lines.length) throw new Error(`start_line ${startLine} 超范围 (1-${lines.length})`);
      const end = Math.min(endLine || startLine, lines.length);
      if (end < startLine) throw new Error(`end_line ${end} < start_line ${startLine}`);
      const count = end - startLine + 1;
      if (count > MAX_AFFECTED_LINES) {
        throw new Error(`${operation} 将影响 ${count} 行（上限 ${MAX_AFFECTED_LINES}）`);
      }
      if (operation === 'replace_lines') {
        const newContent = (await readContent(ctx.flags)) || '';
        const newLines = newContent.split('\n');
        lines.splice(startLine - 1, count, ...newLines);
        content = lines.join('\n');
        summary = `Replaced lines ${startLine}-${end} with ${newLines.length} line(s)`;
      } else {
        lines.splice(startLine - 1, count);
        content = lines.join('\n');
        summary = `Deleted lines ${startLine}-${end} (${count} line(s))`;
      }
    }
  } else {
    throw new Error(`Unknown operation: ${operation}`);
  }

  const isJsFile = filePath.endsWith('.js');
  if (isJsFile) {
    const syntaxError = validateJsSyntax(content);
    if (syntaxError) {
      const err = new Error(`JS_SYNTAX_CHECK_FAILED: 编辑会破坏 JS 语法，文件未修改。${syntaxError}`);
      err.notWritten = true;
      err.syntaxError = syntaxError;
      throw err;
    }
  }

  await fs.writeFile(fullPath, content, 'utf-8');
  const written = await fs.readFile(fullPath, 'utf-8');
  const writtenStat = await fs.stat(fullPath);
  if (written !== content) {
    throw new Error(`WRITE_VERIFICATION_FAILED: 编辑写盘后回读不一致 (expected ${content.length}, got ${written.length})`);
  }

  // diff
  const diffLines = [];
  const origLines = originalContent.split('\n');
  const newLines = content.split('\n');
  const maxLen = Math.max(origLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const o = origLines[i];
    const n = newLines[i];
    if (o !== n) {
      if (o === undefined) diffLines.push({ line: i + 1, type: 'added', content: n });
      else if (n === undefined) diffLines.push({ line: i + 1, type: 'removed', content: o });
      else diffLines.push({ line: i + 1, type: 'changed', old: o, new: n });
    }
  }
  const diff = diffLines.length > 50 ? diffLines.slice(0, 50).concat([{ type: 'truncated', info: `还有 ${diffLines.length - 50} 处变更` }]) : diffLines;

  return {
    file: filePath,
    operation: summary,
    changes: diffLines.length,
    diff,
    syntaxCheck: isJsFile ? 'PASSED' : undefined,
    writeVerification: {
      passed: true,
      expectedLength: content.length,
      actualLength: written.length,
      sizeBefore: originalStat.size,
      sizeAfter: writtenStat.size,
    },
  };
}

/** find <path> <keyword> [--regex --surrounding-lines N --max-matches N] */
async function find(ctx) {
  const filePath = ctx.positional[0];
  const keyword = ctx.positional[1];
  const useRegex = ctx.flags.regex === 'true' || ctx.flags.regex === true;
  const contextLines = ctx.flags['surrounding-lines'] !== undefined ? Number(ctx.flags['surrounding-lines']) : 2;
  const maxMatches = ctx.flags['max-matches'] !== undefined ? Number(ctx.flags['max-matches']) : 20;

  if (!filePath || !isSafePath(filePath)) throw new Error('Invalid path');
  if (!keyword) throw new Error('keyword 必填');

  const fullPath = resolvePath(filePath);
  if (!(await fs.pathExists(fullPath))) throw new Error(`File not found: ${filePath}`);

  let content = await fs.readFile(fullPath, 'utf-8');
  if (filePath.endsWith('.js')) content = await decodeJs(content);

  const lines = content.split('\n');
  let pattern;
  if (useRegex) {
    try {
      pattern = new RegExp(keyword);
    } catch (e) {
      throw new Error(`Invalid regex: ${e.message}`);
    }
  }

  const matches = [];
  for (let i = 0; i < lines.length; i++) {
    const isMatch = useRegex ? pattern.test(lines[i]) : lines[i].includes(keyword);
    if (isMatch) {
      const start = Math.max(0, i - contextLines);
      const end = Math.min(lines.length - 1, i + contextLines);
      const contextArr = [];
      for (let j = start; j <= end; j++) {
        contextArr.push({ line: j + 1, content: lines[j], isMatch: j === i });
      }
      matches.push({ line: i + 1, text: lines[i], context: contextArr });
      if (matches.length >= maxMatches) break;
    }
  }

  return {
    file: filePath,
    keyword,
    regex: useRegex,
    total_lines: lines.length,
    matches: matches.length,
    results: matches,
  };
}

export const commands = {
  'fs ls': ls,
  'fs read': read,
  'fs write': write,
  'fs rm': rm,
  'fs edit': edit,
  'fs find': find,
};
