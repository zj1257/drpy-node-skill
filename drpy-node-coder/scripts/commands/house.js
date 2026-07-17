/**
 * house 组命令：仓库（DS源仓库）文件管理。
 * 移植自 drpy-node-mcp/tools/houseTools.js，用全局 fetch（非 drpy req），独立于运行时引擎层。
 *
 * 配置来源：drpy-node/config/env.json 的 HOUSER_URL / HOUSE_TOKEN（或环境变量）。
 */
import fs from '../lib/fsUtil.js';
import path from 'path';

import { resolvePath } from '../lib/pathResolver.js';
import { decodeDsSource } from '../lib/dsHelper.js';
import * as runtime from '../lib/runtime.js';
import { flagBool } from '../lib/argv.js';

const DEFAULT_HOUSE_URL = 'http://183.87.133.60:5678';

const MIME_MAP = {
  '.js': 'text/javascript', '.json': 'application/json', '.html': 'text/html',
  '.css': 'text/css', '.xml': 'text/xml', '.txt': 'text/plain', '.md': 'text/markdown',
  '.py': 'text/x-python', '.php': 'application/x-httpd-php',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.mp3': 'audio/mpeg', '.zip': 'application/zip', '.pdf': 'application/pdf',
};
function getMimeType(fileName) {
  return MIME_MAP[path.extname(fileName).toLowerCase()] || 'application/octet-stream';
}

function detectSourceTypeInfo(filePath, content) {
  const normalized = filePath.replace(/\\/g, '/');
  const ext = path.extname(filePath).toLowerCase();
  let typeTag = '';
  const extraTags = [];
  if (normalized.includes('spider/catvod/') || content.includes('extends Spider') || content.includes('CatSpider')) {
    typeTag = 'catvod';
  } else if (normalized.includes('spider/js/')) {
    if (ext === '.php' || content.includes('<?php')) typeTag = 'php';
    else typeTag = 'ds';
  } else if (ext === '.php' || content.includes('<?php')) {
    typeTag = 'php';
  } else if (ext === '.json') {
    typeTag = 'json';
  }
  if (content.includes('hipy') || content.includes('海阔视界') || normalized.includes('hipy')) typeTag = 'hipy';
  const fileName = path.basename(filePath, ext);
  if (fileName.includes('[官]') || fileName.includes('[优]')) extraTags.push('优');
  if (content.includes('jx:') || content.includes('parse:') || /解析|jx/i.test(fileName)) {
    if (!typeTag || typeTag === 'json') extraTags.push('jx');
  }
  return { typeTag, extraTags };
}

function parseTagsString(tags) {
  if (!tags) return [];
  return String(tags).split(',').map((t) => t.trim()).filter(Boolean);
}

function buildAutoTags(filePath, content, userTags) {
  const { typeTag, extraTags } = detectSourceTypeInfo(filePath, content);
  const set = new Set();
  if (typeTag) set.add(typeTag);
  for (const t of extraTags) set.add(t);
  for (const t of parseTagsString(userTags)) set.add(t);
  return Array.from(set);
}

function getHouseConfig() {
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(resolvePath('config/env.json'), 'utf-8'));
  } catch {
    /* ignore */
  }
  return {
    url: (config.HOUSER_URL || process.env.HOUSER_URL || DEFAULT_HOUSE_URL).replace(/\/+$/, ''),
    token: config.HOUSE_TOKEN || process.env.HOUSE_TOKEN || '',
  };
}

async function houseRequest(pathname, options = {}) {
  const { url: baseUrl, token } = getHouseConfig();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const fetchOpts = { method: options.method || 'GET', headers };
  if (options.body) fetchOpts.body = options.body;
  const resp = await fetch(baseUrl + pathname, fetchOpts);
  const ct = resp.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await resp.json() : await resp.text();
  return { status: resp.status, data };
}

async function uploadFileToHouse(filePath, endpoint, extraParams = {}) {
  const { token } = getHouseConfig();
  const absPath = resolvePath(filePath);
  if (!(await fs.pathExists(absPath))) throw new Error(`File not found: ${filePath}`);
  const fileName = path.basename(absPath);
  const fileContent = await fs.readFile(absPath);
  const form = new FormData();
  form.append('file', new Blob([fileContent], { type: getMimeType(fileName) }), fileName);
  const qs = Object.entries(extraParams)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  const url = getHouseConfig().url + endpoint + (qs ? `?${qs}` : '');
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetch(url, { method: 'POST', headers, body: form });
  return { status: resp.status, data: await resp.json() };
}

async function replaceFileOnHouse(fileId, filePath) {
  const { url: baseUrl, token } = getHouseConfig();
  const absPath = resolvePath(filePath);
  if (!(await fs.pathExists(absPath))) throw new Error(`File not found: ${filePath}`);
  const fileName = path.basename(absPath);
  const fileContent = await fs.readFile(absPath);
  const form = new FormData();
  form.append('file', new Blob([fileContent], { type: getMimeType(fileName) }), fileName);
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const resp = await fetch(`${baseUrl}/api/files/${fileId}/replace`, { method: 'PUT', headers, body: form });
  return { status: resp.status, data: await resp.json() };
}

async function maybeDecode(filePath) {
  let content = await fs.readFile(resolvePath(filePath), 'utf-8');
  if (filePath.endsWith('.js')) {
    try {
      const fn = await runtime.decoder();
      content = await decodeDsSource(content, fn);
    } catch {
      /* ignore */
    }
  }
  return content;
}

/** house verify */
async function verify() {
  const { url, token } = getHouseConfig();
  if (!token) return { configured: false, message: 'HOUSE_TOKEN 未配置（config/env.json 或环境变量）' };
  try {
    const { status } = await houseRequest('/api/files/list?limit=1');
    if (status === 200) return { configured: true, connected: true, house_url: url, token_valid: true };
    if (status === 401) return { configured: true, connected: true, house_url: url, token_valid: false, message: 'Token 无效或过期' };
    return { configured: true, connected: true, house_url: url, token_valid: false, status };
  } catch (e) {
    return { configured: true, connected: false, house_url: url, message: `连接失败: ${e.message}` };
  }
}

/** house list */
async function list(ctx) {
  const page = ctx.flags.page || 1;
  const limit = ctx.flags.limit || 20;
  let qs = `page=${page}&limit=${limit}`;
  if (ctx.flags.search) qs += `&search=${encodeURIComponent(ctx.flags.search)}`;
  if (ctx.flags.tag) qs += `&tag=${encodeURIComponent(ctx.flags.tag)}`;
  if (ctx.flags.uploader) qs += `&uploader=${encodeURIComponent(ctx.flags.uploader)}`;
  const { status, data } = await houseRequest(`/api/files/list?${qs}`);
  if (status !== 200) throw new Error(`List failed (${status}): ${JSON.stringify(data)}`);
  return data;
}

/** house upload <path> */
async function upload(ctx) {
  const filePath = ctx.positional[0];
  if (!filePath) throw new Error('path 必填');
  const { token } = getHouseConfig();
  if (!token) throw new Error('HOUSE_TOKEN 未配置，上传需要认证');

  const absPath = resolvePath(filePath);
  if (!(await fs.pathExists(absPath))) throw new Error(`File not found: ${filePath}`);

  const rawContent = await maybeDecode(filePath);
  const { typeTag } = detectSourceTypeInfo(filePath, rawContent);
  const autoTags = buildAutoTags(filePath, rawContent, ctx.flags.tags);
  const tagsStr = autoTags.join(',');
  const isPublic = ctx.flags['is-public'] === undefined ? true : flagBool(ctx.flags, 'is-public');
  const autoReplace = ctx.flags['auto-replace'] === undefined ? true : flagBool(ctx.flags, 'auto-replace');
  const fileName = path.basename(absPath);

  // 同名替换检测
  let shouldReplace = false;
  let replaceId = null;
  if (autoReplace && typeTag) {
    try {
      const { status: lsStatus, data: lsData } = await houseRequest(
        `/api/files/list?search=${encodeURIComponent(fileName)}&limit=50`
      );
      if (lsStatus === 200 && lsData.files && lsData.files.length > 0) {
        for (const f of lsData.files) {
          if (f.filename !== fileName) continue;
          if (parseTagsString(f.tags).includes(typeTag)) {
            shouldReplace = true;
            replaceId = f.id;
            break;
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (shouldReplace && replaceId) {
    const { status, data } = await replaceFileOnHouse(replaceId, filePath);
    if (status !== 200) throw new Error(`Replace failed (${status}): ${JSON.stringify(data)}`);
    const finalTags = Array.from(new Set([...parseTagsString(data.tags), ...autoTags]));
    try {
      await houseRequest(`/api/files/${data.id}/tags`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: finalTags }),
      });
    } catch {
      /* ignore */
    }
    return {
      action: 'replaced',
      file_id: data.id,
      filename: data.filename,
      old_cid: data.old_cid,
      new_cid: data.cid,
      detected_type: typeTag || 'unknown',
      tags: finalTags.join(','),
    };
  }

  const { status, data } = await uploadFileToHouse(filePath, '/api/files/upload', {
    is_public: isPublic ? 'true' : 'false',
    tags: tagsStr,
  });
  if (status !== 200) throw new Error(`Upload failed (${status}): ${JSON.stringify(data)}`);
  return {
    action: 'uploaded',
    file_id: data.id,
    filename: data.filename,
    cid: data.cid,
    is_public: data.is_public,
    detected_type: typeTag || 'unknown',
    tags: tagsStr,
  };
}

/** house replace <file_id> <path> */
async function replace(ctx) {
  const fileId = Number(ctx.positional[0]);
  const filePath = ctx.positional[1];
  if (!fileId || !filePath) throw new Error('用法: house replace <file_id> <path>');
  const { token } = getHouseConfig();
  if (!token) throw new Error('HOUSE_TOKEN 未配置');
  const rawContent = await maybeDecode(filePath);
  const { status, data } = await replaceFileOnHouse(fileId, filePath);
  if (status !== 200) throw new Error(`Replace failed (${status}): ${JSON.stringify(data)}`);
  const autoTags = buildAutoTags(filePath, rawContent, ctx.flags.tags);
  const finalTags = Array.from(new Set([...parseTagsString(data.tags), ...autoTags]));
  try {
    await houseRequest(`/api/files/${data.id}/tags`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: finalTags }),
    });
  } catch {
    /* ignore */
  }
  return { action: 'replaced', file_id: data.id, filename: data.filename, old_cid: data.old_cid, new_cid: data.cid };
}

/** house delete <file_id> */
async function del(ctx) {
  const fileId = ctx.positional[0];
  if (!fileId) throw new Error('file_id 必填');
  const { token } = getHouseConfig();
  if (!token) throw new Error('HOUSE_TOKEN 未配置');
  const { status, data } = await houseRequest(`/api/files/${fileId}`, { method: 'DELETE' });
  if (status !== 200) throw new Error(`Delete failed (${status}): ${JSON.stringify(data)}`);
  return { action: 'deleted', file_id: Number(fileId) };
}

/** house info <cid> [--file-id] */
async function info(ctx) {
  const cid = ctx.positional[0];
  if (!cid) throw new Error('cid 必填');
  let qs = `/api/files/${cid}`;
  if (ctx.flags['file-id']) qs += `?id=${ctx.flags['file-id']}`;
  const { status, data } = await houseRequest(qs);
  if (status !== 200) throw new Error(`Info failed (${status}): ${JSON.stringify(data)}`);
  return data;
}

/** house toggle <file_id> */
async function toggle(ctx) {
  const fileId = ctx.positional[0];
  if (!fileId) throw new Error('file_id 必填');
  const { token } = getHouseConfig();
  if (!token) throw new Error('HOUSE_TOKEN 未配置');
  const { status, data } = await houseRequest(`/api/files/${fileId}/toggle-visibility`, { method: 'POST' });
  if (status !== 200) throw new Error(`Toggle failed (${status}): ${JSON.stringify(data)}`);
  return data;
}

/** house tags <file_id> --tags <t> */
async function tags(ctx) {
  const fileId = ctx.positional[0];
  const tagsVal = ctx.flags.tags;
  if (!fileId || !tagsVal) throw new Error('用法: house tags <file_id> --tags <逗号分隔>');
  const { token } = getHouseConfig();
  if (!token) throw new Error('HOUSE_TOKEN 未配置');
  const tagArr = parseTagsString(tagsVal);
  const { status, data } = await houseRequest(`/api/files/${fileId}/tags`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tags: tagArr }),
  });
  if (status !== 200) throw new Error(`Update tags failed (${status}): ${JSON.stringify(data)}`);
  return data;
}

export const commands = {
  'house verify': verify,
  'house list': list,
  'house upload': upload,
  'house replace': replace,
  'house delete': del,
  'house info': info,
  'house toggle': toggle,
  'house tags': tags,
};
