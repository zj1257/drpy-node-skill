/**
 * drpy-node 项目根定位 + 路径安全护栏（移植自 drpy-node-mcp/utils/pathHelper.js，扩展定位链）。
 *
 * 优先级（从高到低）：
 *   1. 命令行 --root <path>
 *   2. 环境变量 DRPY_NODE_ROOT
 *   3. scripts/.drpy-root 文件内容（setup 命令写入）
 *   4. 从 cwd 向上查找含 spider/js + libs_drpy/htmlParser.js 的目录
 *   5. fallback: cwd/../drpy-node（兼容旧 MCP 布局）
 *   6. 全部失败 → null（调用方报错提示 setup）
 */
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const SCRIPTS_DIR = path.resolve(__dirname, '..'); // .../drpy-node-coder/scripts
export const DOTFILE = path.join(SCRIPTS_DIR, '.drpy-root');

const MARKERS = ['spider/js', 'libs_drpy/htmlParser.js'];

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function looksLikeRoot(dir) {
  return MARKERS.every((m) => exists(path.join(dir, m)));
}

function findRootUpward(start) {
  let dir = path.resolve(start);
  for (let i = 0; i < 15; i++) {
    if (looksLikeRoot(dir)) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function resolveProjectRoot(explicit) {
  if (explicit && exists(explicit)) return path.resolve(explicit);

  const envRoot = process.env.DRPY_NODE_ROOT || process.env.ROOT;
  if (envRoot && exists(envRoot)) return path.resolve(envRoot);

  try {
    if (exists(DOTFILE)) {
      const f = fs.readFileSync(DOTFILE, 'utf-8').trim();
      if (f && exists(f)) return path.resolve(f);
    }
  } catch {
    /* ignore */
  }

  const up = findRootUpward(process.cwd());
  if (up) return up;

  const fb = path.resolve(process.cwd(), '..', 'drpy-node');
  if (looksLikeRoot(fb)) return fb;

  return null;
}

let _root = null;
let _explicitResolved = false;

export function getProjectRoot() {
  if (!_explicitResolved) {
    _root = resolveProjectRoot();
    _explicitResolved = true;
  }
  return _root;
}

/** 显式覆盖根（--root 或 setup） */
export function setProjectRoot(r) {
  _root = path.resolve(r);
  _explicitResolved = true;
}

export function resolvePath(p) {
  const root = getProjectRoot();
  if (!root) {
    throw new Error('drpy-node 项目根未定位。请运行: node cli.js setup <drpy-node-绝对路径>');
  }
  return path.resolve(root, p);
}

export function isSafePath(p) {
  const root = getProjectRoot();
  if (!root) return false;
  const resolved = path.resolve(root, p);
  return resolved === root || resolved.startsWith(root + path.sep);
}
