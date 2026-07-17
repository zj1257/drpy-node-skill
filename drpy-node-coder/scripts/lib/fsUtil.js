/**
 * fs-extra 的零依赖替代：用原生 node:fs + node:fs/promises 组合出同名 API。
 *
 * fs-extra 的顶层 API 是混合体：readFile/readdir/stat/writeFile 是 promise 版，
 * readFileSync 等是同步版，外加 pathExists/outputFile/remove 三个专属方法。
 * 这里用 {...callbacks, ...promises} 让 promise 版覆盖同名回调方法，同步方法保留。
 * 调用点零改动（只换 import 路径）。
 */
import * as callbacks from 'node:fs';
import * as promises from 'node:fs/promises';
import path from 'node:path';

const pathExists = (p) =>
  promises.access(p).then(
    () => true,
    () => false,
  );

const outputFile = async (p, content) => {
  await promises.mkdir(path.dirname(p), { recursive: true });
  await promises.writeFile(p, content);
};

const remove = (p) => promises.rm(p, { recursive: true, force: true });

export default {
  ...callbacks,
  ...promises,
  pathExists,
  outputFile,
  remove,
};
