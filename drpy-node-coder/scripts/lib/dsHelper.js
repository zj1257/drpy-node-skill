/**
 * DS 加密源解密（移植自 drpy-node-mcp/utils/dsHelper.js）。
 * 与原版差异：getOriginalJs 不再硬编码相对路径 import，而由调用方通过 runtime.decoder() 注入，
 * 这样解密逻辑与 drpy-node 项目根解耦。
 */

/**
 * @param {string} content 加密内容
 * @param {(content:string)=>Promise<string>} getOriginalJs 来自 libs_drpy/drpyCustom.js
 */
export async function decodeDsSource(content, getOriginalJs) {
  try {
    let result = content;
    if (typeof getOriginalJs === 'function') {
      result = await getOriginalJs(content);
    }
    if (result && (result.includes('var rule') || result.includes('export default'))) {
      return result;
    }
    // fallback: 去注释后尝试 base64
    const clean = content.replace(/\/\*[\s\S]*?\*\//, '').trim();
    try {
      if (/^[A-Za-z0-9+/=\s]+$/.test(clean)) {
        const decoded = Buffer.from(clean, 'base64').toString('utf-8');
        if (decoded.includes('var rule') || decoded.includes('function')) {
          return decoded;
        }
      }
    } catch {
      /* ignore */
    }
    return result;
  } catch (e) {
    try {
      const clean = content.replace(/\/\*[\s\S]*?\*\//, '').trim();
      const decoded = Buffer.from(clean, 'base64').toString('utf-8');
      if (decoded.includes('var rule')) return decoded;
    } catch {
      /* ignore */
    }
    return content;
  }
}

/** 判断内容是否疑似 DS 加密（用于 read 时决定是否尝试解密） */
export function looksEncrypted(content) {
  if (!content) return false;
  if (content.includes('var rule') || content.includes('export default')) return false;
  // 去掉首部块注释后，剩余是 base64 串
  const clean = content.replace(/\/\*[\s\S]*?\*\//, '').trim();
  return clean.length > 0 && /^[A-Za-z0-9+/=\s]+$/.test(clean);
}
