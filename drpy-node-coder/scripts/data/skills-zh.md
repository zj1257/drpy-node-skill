# drpy-node MCP 技能与提示词

- 版本: v2.0（基于 drpy 框架源码深度分析 + 187 个源文件学习）

---

## 技能 1: 开发 DS 源（创建/调试）
**描述：** 创建、调试和验证 `drpy` JS 爬虫源。支持新建源、修复和高级逻辑（加密/lazy）。

**步骤：**
1. **分站型**: 用 `guess_spider_template(url)` + `analyze_website_structure(url)` 判断站型
   - 命中模板 → 模板继承路线
   - 有 HTML 但不命中 → DOM 分析路线
   - 页面为空(SPA) → API 驱动路线
2. **开发**: 用 `get_spider_template` 获取骨架，按下面「五种编写模式」选合适模式
3. **验证**: `drpy_write_file` → `drpy_check_syntax` → `validate_spider` → `test_spider_interface` 逐接口测
4. **评估**: `evaluate_spider_source` 全流程评分

---

## 技能 2: 系统维护
**描述：** 监控健康状况、日志、数据库和配置。

**步骤：**
1. **诊断**: `read_logs` → `get_routes_info` → `sql_query`
2. **配置**: `manage_config` get/set
3. **重启**: 修改核心配置后 `restart_service`

---

## 核心：写源决策树

```
用户给出 URL
  ↓
guess_spider_template(url)
  ↓
├── 命中内置模板 → 路线A: 模板继承 + 最小覆盖
│   ├── 验 class_parse/url/searchUrl
│   ├── 处理 double/tab_exclude
│   └── 按需覆盖推荐/一级/二级
│
├── 有HTML但不命中 → 路线B: 分析DOM
│   ├── 结构类似CMS → 手动指定模板
│   ├── 数据在JSON → JSON模式 (json:)
│   └── 现代UI/反爬 → async 函数
│
└── 页面空(SPA) → 路线C: API驱动
    └── 网络分析 → 全 async 函数
```

---

## 五种编写模式

| 模式 | 代码量 | 适用场景 | 关键字段 |
|------|--------|---------|---------|
| **模板继承** | 7-15行 | `guess_spider_template` 命中内置模板 | `模板: 'mxpro'`, `class_parse`, `url` |
| **字符串规则** | 15-30行 | DOM 结构稳定的标准站 | `一级: 'ul li;a&&title;...'` |
| **js: 内联** | 1-2行 | 字符串中嵌入少量计算 | `一级: 'js:let x=input...'` |
| **async 函数** | 50-200行 | 签名API、反爬、非标站 | `一级: async function() { ... }` |
| **网盘型** | 100-300行 | 多网盘聚合 | `hostJs`, `line_order`, `lazy` 按 flag 分派 |

**核心原则**: 模板继承 > 字符串规则 > js:内联 > async 函数，逐步增加复杂度。

---

## 12 个内置模板速查

| 模板名 | CMS类型 | URL模式 | double | 二级 lazy |
|--------|---------|---------|--------|-----------|
| **mx** | 苹果CMS旧版 | `/vodshow/fyclass--------fypage---/` | true | common_lazy |
| **mxpro** | 苹果CMS Pro | `/vodshow/fyclass--------fypage---.html` | true | common_lazy |
| **mxone5** | One5主题 | `/show/fyclass--------fypage---.html` | true | common_lazy |
| **首图** | 首图CMS | `/vodshow/fyclass--------fypage---/` | true | common_lazy |
| **首图2** | 首图CMS v2 | `/list/fyclass-fypage.html` | true | common_lazy |
| **vfed** | VFed CMS | `/index.php/vod/show/id/fyclass/page/fypage.html` | true | common_lazy |
| **海螺3** | 海螺CMS v3 | `/vod_____show/fyclass--------fypage---.html` | true | common_lazy |
| **海螺2** | 海螺CMS v2 | `/index.php/vod/show/id/fyclass/page/fypage/` | true | common_lazy |
| **短视** | 短视频 | `/channel/fyclass-fypage.html` | true | common_lazy |
| **短视2** | 短视频v2 | API驱动(`#type=fyclass&page=fypage`) | true | common_lazy |
| **采集1** | 采集站 | API: `?ac=detail&pg=fypage&t=fyclass` | false | cj_lazy |
| **默认** | 通用兜底 | 空 | false | def_lazy |

`double: true` 表示推荐需要两层解析。首页推荐空时优先检查 `double`。

---

## async 函数 7 条铁律

1. **`this.input` 是 URL 不是响应** → 必须 `await request(this.input)` 拿响应体
2. **纯数字 vod_id 必须设 `detailUrl`** → 如 `detailUrl: '/api/videos/fyid'`
3. **POST 用 `body` (JSON.stringify)** → 不是 `data` 参数
4. **`searchUrl` 必须带 `**`** → 否则 `this.KEY` 为空
5. **推荐要全量聚合 + 去重** → 不要只取 featured
6. **async 函数用 `this.MY_CATE/MY_PAGE`** → 不要手动拼 URL
7. **`request`/`post` 是全局函数** → 不在 this 上

### this 上下文

```js
// this 是 Proxy 对象，访问 this.xxx 时:
// 1. 优先返回 injectVars.xxx（运行时变量）
// 2. 回退到 rule.xxx（配置值）
let { input, MY_URL, HOST, MY_CATE, MY_PAGE, MY_FL, KEY, fetch_params,
      pdfa, pdfh, pd, pjfa, pjfh, pj } = this;
```

### 引擎调度机制

引擎根据 rule 字段**类型**决定如何处理：

| 字段类型 | 处理方式 |
|---------|---------|
| `async function` | `invokeWithInjectVars()` — Proxy this + 自动 parseAfter |
| `string (CSS规则)` | `commonXxxParse()` — Cheerio 解析 |
| `js:` 开头 | `executeJsCodeInSandbox()` — 沙箱内 eval |
| `*` | 继承一级规则 |
| `二级: {对象}` | `commonDetailListParse()` — 字典解析 |
| 未定义 | 返回默认值（保护降级） |

---

## 模板继承机制

```js
// 源码行为: Object.assign(rule, templateRule, originalRule)
// templateRule 在前 → originalRule 在后 → originalRule 覆盖 templateRule
```

关键推论：
- **源中显式字段永远覆盖模板**
- 不想要模板的 class_parse → 显式设 `class_parse: ''`
- 不想要 double: true → 设 `double: false`
- 用 `get_resolved_rule(path)` 查看继承后的最终字段

---

## 播放链路详解

### lazy 返回值语义

| 返回格式 | parse | jx | 含义 |
|---------|-------|-----|------|
| `{parse:0, url:'https://...m3u8'}` | 0 | — | 直链，直接播放 |
| `{parse:0, jx:1, url:'https://...'}` | 0 | 1 | 站外解析链接 |
| `{parse:1, url: input}` | 1 | — | 交由嗅探系统 |
| `{parse:0, url:'novel://...'}` | 0 | — | 小说内容 |
| `{parse:0, url:'pics://...'}` | 0 | — | 漫画图片 |
| `{parse:0, url:'push://...'}` | 0 | — | 投屏 |

### playParseAfter 后处理

`lazy` 返回后，框架自动判断：
```js
parse = /\.(m3u8|mp4|m4a|mp3)/.test(playUrl) ? 0 : 1;
jx = tellIsJx(playUrl);
```
即使 lazy 返回 `{parse:1, url: xxx}`，如果 xxx 是直链后缀 → 框架自动覆盖为 parse:0。

### 三种模板默认 lazy

| 类型 | 行为 |
|------|------|
| **common_lazy** | 提取页面 `player_*` JSON，支持 encrypt 1(unescape) / 2(base64Decode+unescape) |
| **def_lazy** | 始终 `{parse:1, url:input}`，完全嗅探 |
| **cj_lazy** | 通过 `rule.parse_url` 调解析接口 |

### 常见加密模式

| 加密方式 | 处理 |
|---------|------|
| `encrypt: '1'` | `unescape(url)` |
| `encrypt: '2'` | `base64Decode(url)` → `unescape()` |
| URL 非 http 开头 | `base64Decode(input)` |
| 携带 sign/timestamp | 需逆向签名算法 |

### 特殊内容协议

```js
// 漫画 - pics:// 协议
return { parse: 0, url: 'pics://url1&&url2&&url3' };

// 小说 - novel:// 协议
return { parse: 0, url: 'novel://' + JSON.stringify({title, content}) };

// 投屏 - push:// 协议
return { parse: 0, url: 'push://' + playUrl };
```

---

## URL 模板变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `fyclass` | 分类ID | `/show/fyclass--------fypage---.html` |
| `fypage` | 页码 | 翻页自动替换 |
| `fyid` | 内容ID | `/detail/fyid.html` |
| `fyfilter` | 筛选参数 | `filter_url` 拼接位置 |
| `**` | 搜索关键词 | `/search_**----------fypage---.html` |
| `fl.xxx` | Jinja 筛选 | `filter_url: '{{fl.area}}&{{fl.year}}'` |
| `[url1][url2]` | 翻页 | 第1页用url2，第2页起用url1 |

---

## 字符串规则语法

通用格式: `列表选择器;标题;图片;描述;链接;详情`

```
; 分号分隔各字段
&& 连接选择器与属性: 标签&&Text / 标签&&src
|| 属性 fallback: img&&data-original||src
:eq(N) 索引选取
:gt(N):lt(N) 范围选取
json: 前缀切换到 JSON 模式
```

**重要限制**: `||` 仅用于同一选择器下的属性 fallback，不要写 `img&&data-original||img&&src`。

### desc 五段槽位 (二级字典)

```
desc: '备注;年份;地区;演员;导演'
```

---

## 完整 rule 字段速查

| 字段 | 类型 | 说明 | 必填 |
|------|------|------|------|
| `title` | string | 源显示名称 | 是 |
| `host` | string | 网站域名 | 是 |
| `类型` | string | 影视/漫画/小说/听书 | 是 |
| `模板` | string | 继承的模板名 | 否 |
| `url` | string | 分类列表URL模式 | 是 |
| `homeUrl` | string | 首页URL | 否 |
| `detailUrl` | string | 详情页URL | 数字vid必填 |
| `searchUrl` | string | 搜索URL模式 | 搜索时必填 |
| `class_name` | string | 静态分类名(&分隔) | 二选一 |
| `class_url` | string | 静态分类ID(&分隔) | 配合class_name |
| `class_parse` | string/func | 动态分类解析 | 替代class_name |
| `headers` | object | 请求头 | 否 |
| `searchable` | 0/1/2 | 搜索能力 | 否 |
| `filterable` | 0/1 | 筛选支持 | 否 |
| `play_parse` | bool | 启用免嗅探 | 否(default:true) |
| `lazy` | string/func | 播放解析 | 否 |
| `double` | bool | 推荐双层定位 | 否 |
| `limit` | number | 每页条数 | 否 |
| `multi` | number | 多页聚合 | 否 |
| `filter` | string/obj | 筛选配置(gzip压缩) | 否 |
| `filter_url` | string | 筛选URL模板 | 否 |
| `hostJs` | function | 动态获取host | 否 |
| `预处理` | function | 预处理函数 | 否 |
| `二级访问前` | function | 二级前置处理 | 否 |
| `line_order` | array | 线路排序 | 否 |
| `search_match` | bool | 搜索严格匹配 | 否 |
| `proxy_rule` | string/func | 代理规则 | 否 |

---

## 模板站排障顺序

1. `get_resolved_rule` 看最终继承字段
2. `class_parse` 是否覆盖静态分类 → 补 `class_parse: ''`
3. `double` 是否导致推荐空 → `double: false`
4. 真实分类 `url` / 搜索 `searchUrl` 是否匹配
5. 删手写 一级/搜索，回测模板内置
6. 最后才最小覆盖

**不要把模板问题、URL 问题、评估串联问题，误当成选择器问题。**

---

## 搜索策略

处理搜索前先判断搜索类型：
1. **原生搜索接口** — searchUrl 完整，直接使用
2. **suggest / 联想 fallback** — JSON 接口，async 解析
3. **RSS fallback** — 备用路径

搜索词调优：
- 不要只用默认词"斗罗大陆"
- 换成高频宽匹配词（通用词 `我的`，动漫站 `异世界`）
- 搜索 pagesize 不够 → 试 `multi: 1`

---

## B 类失败（评估未串联）根因

```
home → class → category → detail → play
         ↑
    class_parse 未命中 → class为空 → 拿不到分类ID → 全链断
```

`get_resolved_rule` 可快速判断 class_parse/double/url 是否正确继承。

---

## MCP 工具调用映射

| 场景 | 首选工具 | 辅助 |
|------|---------|------|
| 判断站型 | `guess_spider_template` | `analyze_website_structure` |
| 分析 DOM | `analyze_website_structure` | `fetch_spider_url` |
| 规则调试 | `debug_spider_rule` | `extract_website_filter` |
| 接口测试 | `test_spider_interface` | `evaluate_spider_source` |
| 播放排障 | `extract_iframe_src` | `test_spider_interface(play)` |
| 仓库操作 | `house_verify` → `house_file` | — |

---

## 知识库

### 分类规则
- `class_name: '电影&电视剧'` + `class_url: '1&2'` → 静态分类
- `class_parse: '.nav li;a&&Text;a&&href;/(\d+)'` → 动态解析
- 动态返回空时自动回退到静态分类

### 选择器
| 函数 | 返回值 | 描述 |
|-----|--------|------|
| `pdfa(html, selector)` | Array | 获取节点列表 |
| `pdfh(html, rule)` | String | 提取文本 |
| `pd(html, rule, baseUrl)` | String | 提取并补全URL |
| `pjfh(json, rule)` | String | JSON 模式 pdfh |
| `pjfa(json, rule)` | Array | JSON 模式 pdfa |

### 全局函数
- `request(url, opts)`, `post(url, opts)` — HTTP 请求
- `setResult(d)` — 格式化列表 `{title, url, desc, pic_url, content}[]`
- `base64Encode/Decode`, `md5`, `CryptoJS` — 加解密
- `MOBILE_UA`, `PC_UA`, `UA` — UA 常量
- `urljoin(base, path)`, `buildUrl(url, obj)` — URL 工具
