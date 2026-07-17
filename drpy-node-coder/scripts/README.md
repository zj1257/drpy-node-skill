# drpy-node-coder CLI

自包含命令行工具，替代 `drpy-node-mcp` MCP 服务。配合 `drpy-node-coder` skill 使用，AI 在 skill 内直接 `node scripts/cli.js <命令>` 完成爬虫源的开发、测试、修复与仓库发布。

## 便携性

- ✅ 免去 MCP server 常驻进程与 stdio/sse 客户端配置
- ✅ **零 npm 依赖**：无需 `npm install`。`localDsCore` bundle（14M，含 cheerio/axios/drpyS/htmlParser 全内联）+ sqlite + 编码 wasm 自带于 `vendor/`
- ⚠️ 仍需 `drpy-node` 项目在本地：CLI 复用其 `req`/`pdfa`/`drpyS`/DS解密 **源码模块**（这些互相 import，非 bundle，搬不动）；但最重的 `localDsCore` 测试引擎已内联进 `vendor/`，`test`/`evaluate` 不再依赖 `drpy-node-bundle` 目录
- ⚠️ `simplecc`（GBK 编码转换）为可选：上游 bundle 在任意位置均加载失败（`__wbindgen_placeholder__`），仅影响 GBK 站点，JSON API / UTF-8 源不受影响

## 首次使用

```bash
cd drpy-node-coder/scripts
node cli.js setup E:/gitwork/drpy-node        # 定位 drpy-node 项目根（写入 .drpy-root）
node cli.js doctor                            # 自检（含 vendor/ 运行时检查）
```

定位优先级：`--root` 参数 > 环境变量 `DRPY_NODE_ROOT` > `.drpy-root` 文件 > 向上查找 > `../drpy-node` fallback。

## 输出约定

所有命令输出 JSON：

- 成功：`{"ok":true,"data":...}`，退出码 0
- 失败：`{"ok":false,"error":"...","message":"..."}`，退出码 1

## 命令清单

### 元命令
| 命令 | 说明 |
|---|---|
| `setup <drpy-node-路径>` | 写入 `.drpy-root` |
| `where` | 显示当前定位的 drpy-node 根 |
| `doctor` | 自检：node 版本、根定位、关键运行时模块、house 配置 |
| `help` | 列出所有可用命令 |

### 文件系统（fs 组）
| 命令 | 说明 |
|---|---|
| `fs ls [path]` | 列目录 |
| `fs read <path>` | 读文件（DS 源自动解密） |
| `fs write <path> --content ...` | 写文件（支持 `--content-file`/stdin） |
| `fs rm <path>` | 删除 |
| `fs edit <path> <op> ...` | replace_text/replace_lines/delete_lines/insert_lines（JS 语法校验） |
| `fs find <path> <keyword>` | 搜索（`--regex --surrounding-lines --max-matches`） |

### 爬虫开发
| 命令 | 说明 |
|---|---|
| `src list` / `src routes` | 列源 / 路由信息 |
| `fetch <url>` | 用 drpy `req` 抓取（`--method --header k=v --data`） |
| `analyze <url>` | 抓取并清洗 HTML 输出精简 DOM |
| `guess <url>` | 模板探测 |
| `debug --rule <r> --mode <m>` | 规则调试（pdfa/pdfh/pd） |
| `filter <url...>` | 提取筛选字典（`--gzip`） |
| `iframe <url>` | 提取播放页 iframe src |
| `template` / `libs` / `api-list` | 模板 / 全局函数 / API 列表 |
| `claw-ds [--lang en|zh]` | 自动写源 Prompt |

### 验证
| 命令 | 说明 |
|---|---|
| `syntax <path>` | JS 语法检查 |
| `validate <path>` | 语法 + Rule 结构 |
| `resolved <path>` | 模板继承后最终 rule |

### 测试（依赖 localDsCore）
| 命令 | 说明 |
|---|---|
| `test <source> <home|category|detail|search|play>` | 单接口测试 |
| `evaluate <source>` | 全流程评分（首页20+一级20+二级25+播放25+搜索10） |

### 仓库（house）
| 命令 | 说明 |
|---|---|
| `house verify` | 验证仓库连通与 TOKEN |
| `house list` | 文件列表（`--search --tag --page --limit`） |
| `house upload <path>` | 上传（自动同名替换，`--tags --is-public --auto-replace`） |
| `house replace <id> <path>` | 按 ID 替换 |
| `house delete <id>` | 删除 |
| `house info <cid>` | 元数据 |
| `house toggle <id>` | 公开/私密切换 |
| `house tags <id> --tags <t>` | 更新标签 |

### 系统
| 命令 | 说明 |
|---|---|
| `logs [--lines N]` | 日志 |
| `sql <query>` | 只读 SELECT |
| `config get [key]` / `config set <k> <v>` | 配置读写（点语法） |
| `restart` | PM2 重启 drpys |

## 实现进度

- [x] P1 骨架（cli/argv/pathResolver/runtime/output/dsHelper + 元命令）
- [x] P2 fs 组（ls/read/write/rm/edit/find + DS 解密 + 语法校验护栏）
- [x] P3 spider 无运行时命令（list/routes/template/libs/api-list/claw-ds）
- [x] P4 fetch/analyze/guess/iframe/debug/filter（req + jsoup）
- [x] P5 validate/resolved/syntax（drpyS.getRuleObject + vm sandbox）
- [x] P6 test/evaluate（localDsCore 引擎，全流程评分）
- [x] P7 house + system 组（house API + logs/sql/config/restart）
- [x] P8 SKILL.md + references 融合 + cli-commands + migration-from-mcp
- [x] P9 旧 4 skill 归档
- [x] P10 便携化：localDsCore bundle + sqlite + 编码 wasm 内联 `vendor/`，删除 cheerio/fs-extra/node-sqlite3-wasm 三个 npm 依赖，零 `npm install`
