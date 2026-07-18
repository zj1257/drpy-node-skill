---
name: drpy-node-coder
description: drpy-node 爬虫源全生命周期一体化 skill——建源、诊断、修复、测试、播放调试、仓库发布。自带 CLI（scripts/cli.js），无需安装 MCP。用户提到"新建源/写源/做源/建源/生成源/爬虫源""修源/测试某个源/详情为空/搜索异常/源无效/低分评估/诊断/排障/规则不生效""播放不通/lazy 不对/iframe/m3u8/parse:0/1/假播放/加密链接/防盗链""上传仓库/替换上传/改标签/发布源/同步源/打标签/分享源"时使用。
---

# drpy-node Coder

drpy-node 爬虫源的**建、修、测、放、传**全链路一体化 skill。自带 CLI 工具，**无需安装 MCP 服务**。

## 便携性说明（先读）

- ✅ **无需 MCP**：所有能力内置在 `scripts/cli.js`，AI 直接 `node scripts/cli.js <命令>` 调用。
- ✅ **零 npm 依赖**：无需 `npm install`。`localDsCore` 测试引擎 bundle（14M，全内联 cheerio/axios/drpyS/htmlParser）+ sqlite + 编码 wasm 自带于 `scripts/vendor/`。
- ⚠️ **前置**：本机需有 `drpy-node` 项目（CLI 复用其 `req`/`pdfa`/`drpyS`/DS解密 **源码模块**——这些互相 import、非 bundle，搬不动；但 `localDsCore` 已内联进 `vendor/`，`test`/`evaluate` 不再依赖 `drpy-node-bundle` 目录）。
- 首次使用：`cd scripts && node cli.js setup <drpy-node-绝对路径> && node cli.js doctor`。
- 调用范式：`node scripts/cli.js [--root <drpy-node路径>] <命令> [参数] [--flags]`。所有命令输出 JSON：成功 `{"ok":true,"data":...}`、失败 `{"ok":false,"error":...}`。
- **输出读取**：少数命令（test/evaluate）首次加载测试引擎时 stdout 可能有一次初始化日志，**业务 JSON 始终是 stdout 最后一行**，按最后一行 `{` 解析。

## 总控工作流（5 步闭环）

```
用户输入
  │
Step1 识别输入 ──仅 URL──→ 分析站点 → 建源路线
  │（已有源名/文件）
Step2 评估现状：syntax+validate(L1) → test 单接口(L2) → evaluate 全流程(L3)
  │
Step3 判断失败类型：A规则不通 / B评估串联 / C播放链
  │  🛑 检查点1：确认诊断结论
Step4 分流执行：本 skill 修 / 转播放调试 / 转仓库
  │
Step5 收束：evaluate 复评 → 🛑 检查点2 → 上传建议 / 结束
```

**核心原则**：先评估 → 再分流 → 再修复 → 再验证 → 最后给上传建议。不要一上来就重写。

## 模式闸门：先判断是否允许写入

| 用户模式 | 允许 | 禁止 |
|---|---|---|
| 只读/dry-run/只规划 | 读取、诊断、给方案和验证计划 | `fs write/edit`、`house upload/*` |
| 需确认后改 | 读取、诊断、输出拟改字段+验证计划 | 未确认前改源或仓库元数据 |
| 明确执行 | 按 L1/L2/L3 证据最小修复 | 跳过大改确认点、直接仓库 mutation |
| 自主全流程（"修到100""自动完成""做源并上传"） | alive check→建源→低风险修复→播放→L3=100→上传 | 坏站硬写、未达目标冒充完成、目标不明上传 |

## 任务分派表（场景 → 路线 + 首读 reference + 关键命令）

| 场景 | 路线 | 首读 reference | 关键 CLI 命令 |
|---|---|---|---|
| 仅 URL，新建源 | 建源 A/B/C/D | `references-create-checklist.md`、`references-template-system.md` | `fetch` `guess` `analyze` `template` `fs write` `syntax` `validate` `test` `evaluate` |
| 已有源评估低分 | 诊断 A/B/C | `references-workflow-triage.md`、`references-framework-internals.md` | `fs read` `resolved` `evaluate` `test` |
| detail 通但 play 异常 | 播放专项 | `references-play-lazy-summary.md` | `test <src> detail` `test <src> play` `iframe` `fetch` + Playwright（见下） |
| 上传/替换/改标签 | 仓库守门 | `references-upload-decision.md` | `house verify` `house upload` `house list` `house info` `house tags` |
| 模板继承排查 | 路线 A | `references-template-summary.md`、`references-inherited-template-minimal-override-site.md` | `guess` `resolved` |
| 纯 API/SPA 站 | 路线 C | `references-pure-api-async-site.md`、`references-api-functions.md` | `fetch` `analyze` |
| 签名接口站 | 路线 B2 | `references-non-template-signed-api-site.md` | `fetch` + 浏览器抓包 |
| 二级字典/多集 | detail 规范 | `references-detail-dict-and-multiep.md` | `debug` `test <src> detail` |
| 搜索异常 | 搜索策略 | `references-search-strategies.md`、`references-old-encoding-search-site.md` | `test <src> search` |
| async 函数陷阱 | 通用 | `references-async-function-patterns.md` | — |
| 特殊内容(漫画/小说/音乐/网盘) | 路线 D | `references-special-content.md` | — |

## 建源 30 秒路线（仅 URL 入口）

**Step 0 alive check**（自主模式不可跳过）：`fetch <url>` 确认可达；`guess <url>` 探模板；`analyze <url>` 看 HTML/SPA。遇 `broken_site`/`hard_anti_bot`/`missing_credentials` 停手。

**站型分派**（先 `guess`）：
- 命中模板 → **A 模板继承**（最小覆盖 host/url/searchUrl/class_parse，勿急重写）
- 未命中+DOM 完整 → **B1 字符串规则**（+二级字典）
- 未命中+签名接口 → **B2 async 一级/搜索**
- body 空+JSON API → **C 全 async**
- 漫画/小说/音乐/网盘 → **D 特殊内容**
- 403/登录/验证码 → **停手**

**7 条必背规则**（含 async 的源必过）：①`this.input` 是 URL 不是响应，须 `await request(this.input)` ②纯数字 vod_id 必设 `detailUrl` ③POST 用 `body` 非 `data` ④`searchUrl` 必带 `**` ⑤推荐要全量聚合去重 ⑥async 用 `this.input`/`this.MY_CATE`/`this.MY_PAGE`，勿手拼 URL ⑦不写重复同名属性。

**写入验证链**：`template` → `fs write spider/js/源名.js` → `syntax` → `validate` → `test home/category/detail/search/play` → `evaluate`。

## 诊断 L1/L2/L3 证据链

| 等级 | 命令 | 能下结论 | 不能下结论 |
|---|---|---|---|
| L1 | `syntax` + `validate` | 非语法残档、rule 结构合法，可拆测 | 可用、已修好、可上传 |
| L2 | `test <src> <iface>` 单接口 | 某接口真实通/断（须带真实上游返回值） | 全链稳定、可发布 |
| L3 | `evaluate <src>` 全流程 | 首页→一级→二级→播放→搜索串联评分 | 站点长期稳定 |

**结论必须带等级**，例"L2 显示 detail 通、play 断"，不要说成"整个源不通"。单接口测试必须用上游真实返回值（category→vod_id→detail→play_url），不要手推 ID。

**evaluate 丢分映射**：首页20+一级20丢 → `class_parse` 未命中；仅首页20丢 → `double` 不匹配；搜索10丢 → 已按源名后缀选默认词(漫画->海贼王/小说->修仙/短剧->离婚/音频->故事)，仍丢则换词查 `searchUrl`；二级25丢 → `detailUrl`/二级字典；播放25丢 → 先看 `test detail` 的 `play_url_diagnosis`：detail 有数据但 `vod_play_url` 空属二级选择器/detailUrl 问题(非 play 层)，按 hint 修二级；仅当 detail 完整且 play 真失败才转 Playwright 嗅探。常见误判：detail 返回列表项(只有 vod_id/vod_name/vod_pic)而非完整详情 = 缺 `detailUrl`。

## 播放调试（Playwright 复用指引）

CLI 提供 `test <src> play`、`iframe <url>`、`fetch <url>`。**浏览器嗅探能力不在 CLI 内**——需要嗅探 JS 运行时生成的 m3u8/签名时，使用你已连接的 **Playwright MCP**：

1. `browser_navigate(play_url)` 打开播放页
2. `browser_network_requests(filter='m3u8|mp4|api|play|url')` 看运行时请求
3. 需点播放按钮则 `browser_snapshot` 找按钮→点击→再看网络
4. 提取真实媒体 URL 或签名 API，回写 lazy

lazy 三类型：**common_lazy**（播放页有 player_* JSON，先查 encrypt）/ **def_lazy**（`{parse:1,url:input}` 嗅探）/ **cj_lazy**（parse_url）。**假通过识别**：`play` success≠真实可播，返回 url 仍是 play.html/API/普通页时继续验扩展名/content-type/网络请求。

## 仓库发布守门

上传前必跑：`house verify` + `syntax` + `validate` + 源 metadata 自洽。给出 **A/B/C 档 + L1/L2/L3 证据**：
- **A 建议上传**：至少 L2，最终版/自主要求 L3=100
- **B 技术可传不建议**：L1/L2，用户坚持才传
- **C 暂不传**：触红线（语法错/结构无效/metadata 不一致/详情空/播放假通过/特殊内容无对应协议）

**上传**：`house upload <path> --tags <逗号分隔> --is-public true --auto-replace true`（默认同名自动替换）。上传后 `house info <cid>` 核验 file_id/cid/tags/is_public 一致。

**标签规则**：不脑补、不因文件名带 `[优]` 就加 `优`，严格按用户明确要求；用户没说则从简。

## 强约束 / 停手边界

- **坏站/反爬/缺凭据** → 停手回报，不绕过（`broken_site`/`hard_anti_bot`/`missing_credentials`）。
- **高风险重写**（模板改全 async、删大段规则、引签名/登录态）→ 必须先给方案等确认。
- **仓库 mutation**（upload/replace/tags/toggle）→ 必须 `house verify` + 目标确认 + `info` 核验。
- **DS 加密源**：用 `fs read`（自动解密），勿用 IDE Edit 直接改加密文件。
- **大改确认点**：删手写规则、改 detail 线路逻辑、跨多 flag 的 lazy 重写 → 停手确认。
- **路径安全**：所有文件操作限定在 drpy-node 项目内（isSafePath 强制）。

## 自主全流程 handoff packet

当用户要求"自动完成/修到100/做源并上传"时，贯穿建→修→测→传全程：

```text
autonomous: true
target_score: 100
upload_preauthorized: true/false
tags/is_public: 用户明确值或空
source_name/path: ...
blocker_type: none/broken_site/hard_anti_bot/missing_credentials/high_risk_change/ambiguous_upload/score_below_target/detail_unstable
autonomous_next: continue_evaluate/return_workflow/stop_for_user
```

自主循环：`alive check → 建源 → L1/L2/L3 → 按丢分最小修复 → play（detail 稳定时）→ L3=100 → house upload → info 核验`。低风险不停手只记录；遇 high_risk/目标歧义/凭据缺失必须停手确认。

## CLI 速查（高频；完整清单见 references-cli-commands.md）

```bash
node cli.js [--root <path>] doctor                          # 自检
node cli.js src list                                        # 列源
node cli.js fetch <url> [--method POST --header k=v --data] # 抓取(用 drpy req)
node cli.js analyze <url> | guess <url>                     # 清洗DOM | 探模板
node cli.js debug --rule 'a&&href' --mode pdfh --url <url>  # 规则调试(pdfa/pdfh/pd)
node cli.js fs read <path> | fs write <path> --content ...  # 读写(.js自动DS解密)
node cli.js fs edit <path> replace_text --search .. --replacement ..  # 编辑(JS语法校验)
node cli.js syntax <path> | validate <path> | resolved <path>
node cli.js test <src> <home|category|detail|search|play> [--class-id/--ids/--keyword/--play-url/--flag]
node cli.js evaluate <src> [--keyword 斗罗大陆]              # 全流程评分(满分100)
node cli.js house verify | house upload <path> --tags .. | house info <cid>
```

参数约定：位置参数在前，flags 在后（`--flag value` / `--flag=value` / `--header k=v` 可重复）。大文本用 `--content-file` 或 stdin。

## Reference 使用规则

references/ 落地深度内容（建源清单/模板系统/async 陷阱/play lazy/上传决策/框架机制等）。主文件不重复 reference 内容，按「任务分派表」首读对应 reference。reference 不可达时不中断，按本文件内置规则最小排查并标注。
