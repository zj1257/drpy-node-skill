# 从 MCP / 4-skill 迁移到 drpy-node-coder

## 为什么迁移

旧的 `drpy-node-mcp` MCP 服务 + 4 个独立 skill（source-workflow / source-create / play-debug / repo-upload）工作流分散，且必须常驻 MCP 进程 + 配置客户端 stdio/sse。`drpy-node-coder` 把四者融合为**单个 skill**，并用自带 `scripts/cli.js` **替代 MCP**——一个 skill、无需安装 MCP、自带 CLI。

## 便携性边界（重要）

- ✅ 免去 MCP server 进程与 stdio/sse/HTTP 客户端配置。
- ⚠️ 仍需 `drpy-node` 项目在本地（CLI 复用其 req/pdfa/drpyS/localDsCore/DS解密 等运行时模块；这些无法独立打包，尤其 localDsCore 强依赖项目目录结构）。

## MCP 工具 → CLI 命令映射

| 原 MCP 工具 | CLI 命令 |
|---|---|
| drpy_list_directory | `fs ls [path]` |
| drpy_read_file | `fs read <path>` |
| drpy_write_file | `fs write <path> --content ...` |
| drpy_delete_file | `fs rm <path>` |
| drpy_edit_file | `fs edit <path> <op> --search .. --replacement ..` |
| drpy_find_in_file | `fs find <path> <keyword>` |
| list_sources | `src list` |
| get_routes_info | `src routes` |
| fetch_spider_url | `fetch <url> [--method --header k=v --data]` |
| analyze_website_structure | `analyze <url>` |
| guess_spider_template | `guess <url>` |
| debug_spider_rule | `debug --rule <r> --mode pdfa\|pdfh\|pd --url\|--html` |
| extract_website_filter | `filter <url...> [--gzip]` |
| extract_iframe_src | `iframe <url>` |
| get_spider_template | `template` |
| get_drpy_libs_info | `libs` |
| get_drpy_api_list | `api-list` |
| get_claw_ds_skill | `claw-ds [--lang en\|zh]` |
| drpy_check_syntax | `syntax <path>` |
| validate_spider | `validate <path>` |
| get_resolved_rule | `resolved <path>` |
| test_spider_interface | `test <source> <home\|category\|detail\|search\|play> [...]` |
| evaluate_spider_source | `evaluate <source> [...]` |
| house_verify | `house verify` |
| house_file(action=list) | `house list [...]` |
| house_file(action=upload) | `house upload <path> [--tags --is-public --auto-replace]` |
| house_file(action=replace) | `house replace <id> <path>` |
| house_file(action=delete) | `house delete <id>` |
| house_file(action=info) | `house info <cid>` |
| house_file(action=toggle_visibility) | `house toggle <id>` |
| house_file(action=update_tags) | `house tags <id> --tags <t>` |
| read_logs | `logs [--lines N]` |
| sql_query | `sql <query>` |
| manage_config | `config get [key]` / `config set <k> <v>` |
| restart_service | `restart` |

## 4 skill → coder 章节

| 旧 skill | coder 内对应 |
|---|---|
| source-workflow（总控诊断分流） | 主 SKILL.md「总控工作流」「诊断 L1/L2/L3 证据链」+ `references-workflow-triage.md` |
| source-create（建源） | 主 SKILL.md「建源 30 秒路线」「7 条必背规则」+ `references-create-checklist.md` 等 |
| play-debug（播放调试） | 主 SKILL.md「播放调试（Playwright 复用指引）」+ `references-play-lazy-summary.md` |
| repo-upload（仓库守门） | 主 SKILL.md「仓库发布守门」+ `references-upload-decision.md` |

旧 4 skill 已标记归档（SKILL.md 顶部横幅），保留备查。

## 输出格式差异

- MCP：`{content:[{type:"text",text:"..."}]}` 或 `{isError:true,content:[...]}`。
- CLI：成功 `{"ok":true,"data":...}`、失败 `{"ok":false,"error":"...","message":"..."}`（退出码非0）。
- CLI 命令直接返回结构化 data（如 evaluate 返回 `{evaluation:{score,valid,details},interfaces:{...}}`），不再包裹在 text 字段里。

## 行为一致性

CLI 命令逐工具移植自 drpy-node-mcp，核心逻辑（req 请求、pdfa/pdfh/pd 解析、drpyS.getRuleObject、localDsCore.getEngine、DS 解密、house API、edit 语法校验+不写盘）与 MCP 等价，可对照输出验证。

## 已知差异

1. **参数解析**：CLI 用手写 argv（`--flag value`），不再用 zod schema 校验；参数名复用 MCP（snake_case 在 handler 内转换）。
2. **stdout 日志**：test/evaluate 首次加载 localDsCore 时 stdout 可能有一次性初始化日志（drpyInject/getSandbox 等，bundle 固有），业务 JSON 始终是最后一行。其他命令 stdout 纯净（console.log 已重定向 stderr）。
3. **extract_filter**：改用 drpy `req`（原版 axios），去掉 axios 依赖。
4. **Playwright**：MCP 本身不含 Playwright，靠 AI 的 Playwright MCP；coder 同样如此，主 SKILL.md 明确指引复用 AI 的 Playwright 做浏览器嗅探。

## 首次启用

```bash
cd drpy-node-coder/scripts
npm install
node cli.js setup E:/gitwork/drpy-node   # 你的 drpy-node 项目路径
node cli.js doctor                        # 自检应全绿
```

之后 AI 在 skill 内直接调 `node scripts/cli.js <命令>`，无需 MCP 客户端配置。
