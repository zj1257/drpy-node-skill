/**
 * 统一 JSON 输出。所有命令成功输出 { ok:true, data }，失败输出 { ok:false, error, message } 并以非 0 退出。
 * AI 按固定结构解析，无需文本猜测。
 */
export function ok(data) {
  process.stdout.write(JSON.stringify({ ok: true, data }) + '\n');
}

export function fail(error, message, code = 1) {
  const payload = { ok: false, error: String(error) };
  if (message) payload.message = String(message);
  process.stdout.write(JSON.stringify(payload) + '\n');
  process.exit(code);
}

/** 未捕获异常的兜底 */
export function attachGlobalErrorHandlers() {
  process.on('unhandledRejection', (err) => {
    fail(err && err.message ? err.message : String(err), err && err.stack ? err.stack : undefined);
  });
}
