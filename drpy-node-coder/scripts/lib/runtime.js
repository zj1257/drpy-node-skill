/**
 * drpy-node 运行时分层懒加载。
 *
 * 层级（按依赖深度，首次调用才 import，promise 单例缓存）：
 *   L1 decoder()  libs_drpy/drpyCustom.js        getOriginalJs（DS 解密）
 *   L2 req()      utils/req.js                   drpy 请求库
 *   L3 parser()   libs_drpy/drpyInject.js + libs_drpy/htmlParser.js  注入 pdfa/pdfh/pd + cheerio
 *   L4 drpyS()    libs/drpyS.js                  getRuleObject（validate/resolved/syntax）
 *   L5 engine()   drpy-node-bundle/libs/localDsCore.bundled.js  getEngine（test/evaluate）
 *
 * drpyInject 往 globalThis 注入 9 个符号（幂等 + ESM 模块缓存），用 __drpyInjected 守卫防重复。
 * cheerio 统一来源：优先 globalThis.cheerio（drpyInject 注入），失败 fallback 顶层 cheerio，
 * 避免 cli 与 drpyInject 各持一份实例。
 *
 * 所有 file:// import 用 url.pathToFileURL 显式转换（Windows 兼容）。
 */
import path from 'path';
import fs from 'fs';
import { pathToFileURL, fileURLToPath } from 'url';
import { getProjectRoot } from './pathResolver.js';

function fileUrl(p) {
  return pathToFileURL(p).href;
}
function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

const cache = {};
async function once(key, fn) {
  if (key in cache) return cache[key];
  cache[key] = (async () => fn())();
  try {
    return await cache[key];
  } catch (e) {
    delete cache[key];
    throw e;
  }
}

function rootPath(...segs) {
  const root = getProjectRoot();
  if (!root) throw new Error('drpy-node 项目根未定位。请运行: node cli.js setup <drpy-node-绝对路径>');
  return path.join(root, ...segs);
}

/** L1：DS 解密函数 getOriginalJs */
export async function decoder() {
  return once('decoder', async () => {
    const m = await import(fileUrl(rootPath('libs_drpy', 'drpyCustom.js')));
    const fn = m.getOriginalJs || (m.default && m.default.getOriginalJs);
    if (typeof fn !== 'function') {
      throw new Error('libs_drpy/drpyCustom.js 未导出 getOriginalJs');
    }
    return fn;
  });
}

/** L2：drpy 请求库 req */
export async function req() {
  return once('req', async () => {
    const m = await import(fileUrl(rootPath('utils', 'req.js')));
    const fn = m.default || m.req || m.fetch;
    if (typeof fn !== 'function') {
      throw new Error('utils/req.js 未导出可用请求函数（req/fetch）');
    }
    return fn;
  });
}

/** L3：解析层（注入 pdfa/pdfh/pd + cheerio） */
export async function parser() {
  return once('parser', async () => {
    if (!globalThis.__drpyInjected) {
      await import(fileUrl(rootPath('libs_drpy', 'drpyInject.js')));
      globalThis.__drpyInjected = true;
    }
    const hp = await import(fileUrl(rootPath('libs_drpy', 'htmlParser.js')));
    return {
      pdfa: (...a) => globalThis.pdfa(...a),
      pdfh: (...a) => globalThis.pdfh(...a),
      pd: (...a) => globalThis.pd(...a),
      jsoup: hp && (hp.jsoup || (hp.default && hp.default.jsoup)),
    };
  });
}

/** L4：drpyS 引擎（getRuleObject 等） */
export async function drpyS() {
  return once('drpyS', async () => {
    const m = await import(fileUrl(rootPath('libs', 'drpyS.js')));
    return m;
  });
}

/**
 * L5：localDsCore 测试引擎。返回 (sourceName, query) => data。
 * rootDir 参数化注入（替代 spiderTestTools.js 中硬编码的 PROJECT_ROOT）。
 */
export async function engine(rootDir) {
  return once('engine', async () => {
    const root = getProjectRoot();
    // 优先 skill 自带 vendor 副本（便携），fallback 到 drpy-node 项目原位置
    const hereDir = path.dirname(fileURLToPath(import.meta.url));
    const vendorBundle = path.resolve(hereDir, '..', 'vendor', 'localDsCore.bundled.js');
    const bundled = path.join(root, 'drpy-node-bundle', 'libs', 'localDsCore.bundled.js');
    const src = path.join(root, 'drpy-node-bundle', 'localDsCore.js');
    const p = exists(vendorBundle) ? vendorBundle : exists(bundled) ? bundled : exists(src) ? src : null;
    if (!p) {
      throw new Error('localDsCore 未找到：skill vendor/ 与 drpy-node-bundle/ 均无该 bundle');
    }
    // localDsCore 及其内部依赖（getSandbox/puppeteer/sqlite3 等）在 import 时往 stdout
    // 打印初始化日志，且 bundle 缓存了原始 stdout.write 引用（console.log 重定向捕获不到）。
    // 加载期间临时把 process.stdout.write 重定向到 stderr，保证 stdout 只输出业务 JSON。
    const origWrite = process.stdout.write.bind(process.stdout);
    process.stdout.write = (chunk, ...rest) => process.stderr.write(chunk, ...rest);
    try {
      await import(fileUrl(p));
    } finally {
      process.stdout.write = origWrite;
    }
    if (typeof globalThis.getEngine !== 'function') {
      throw new Error('localDsCore 加载后 getEngine 不可用');
    }
    const dir = rootDir || root;
    return (sourceName, query) => globalThis.getEngine(sourceName, query, { rootDir: dir });
  });
}

/** cheerio 统一来源：drpyInject 注入的 globalThis.cheerio（drpyInject 从 drpy-node 项目 resolve cheerio） */
export async function cheerio() {
  if (globalThis.cheerio) return globalThis.cheerio;
  await parser();
  if (globalThis.cheerio) return globalThis.cheerio;
  throw new Error('cheerio 不可用：drpyInject 加载后仍未注入 globalThis.cheerio（检查 drpy-node 项目依赖）');
}
