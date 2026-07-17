# drpy-node MCP Skills & Prompts

- Version: v2.0 (based on drpy framework source analysis + 187 source files study)

---

## Skill 1: Develop DS Source (Create/Debug)
**Description:** Create, debug, and validate `drpy` JS spider sources.

**Steps:**
1. **Classify site**: Use `guess_spider_template(url)` + `analyze_website_structure(url)`
   - Template hit → template inheritance route
   - HTML exists but no hit → DOM analysis route
   - Empty page (SPA) → API-driven route
2. **Develop**: `get_spider_template` → choose writing pattern (see below)
3. **Validate**: `drpy_write_file` → `drpy_check_syntax` → `validate_spider` → `test_spider_interface`
4. **Evaluate**: `evaluate_spider_source` full pipeline scoring

---

## Skill 2: System Maintenance
**Description:** Monitor health, logs, DB, and config.

**Steps:**
1. `read_logs` → `get_routes_info` → `sql_query`
2. `manage_config` get/set
3. `restart_service` after config changes

---

## Decision Tree

```
User provides URL
  ↓
guess_spider_template(url)
  ↓
├── Template hit → Route A: Template inheritance
│   ├── Verify class_parse/url/searchUrl
│   ├── Handle double/tab_exclude
│   └── Minimal overrides for 推荐/一级/二级
│
├── HTML exists, no hit → Route B: DOM analysis
│   ├── CMS-like structure → manual template assign
│   ├── JSON data → json: prefix mode
│   └── Modern UI/anti-crawl → async functions
│
└── Empty page (SPA) → Route C: API-driven
    └── Network analysis → full async functions
```

---

## Five Writing Patterns

| Pattern | Lines | When to use | Key fields |
|---------|-------|-------------|------------|
| **Template inheritance** | 7-15 | Hits built-in template | `模板: 'mxpro'`, `class_parse`, `url` |
| **CSS string rules** | 15-30 | Stable DOM structure | `一级: 'ul li;a&&title;...'` |
| **js: inline** | 1-2 lines | Light computation in strings | `一级: 'js:let x=input...'` |
| **async functions** | 50-200 | Signed APIs, anti-crawl, non-standard | `一级: async function() { ... }` |
| **Network disk** | 100-300 | Multi-cloud aggregation | `hostJs`, `line_order`, `lazy` by flag |

**Core principle**: template > CSS strings > js: inline > async functions.

---

## 12 Built-in Templates

| Template | CMS Type | URL Pattern | double | lazy type |
|----------|---------|-------------|--------|-----------|
| **mx** | AppleCMS old | `/vodshow/fyclass--------fypage---/` | true | common_lazy |
| **mxpro** | AppleCMS Pro | `/vodshow/fyclass--------fypage---.html` | true | common_lazy |
| **mxone5** | One5 theme | `/show/fyclass--------fypage---.html` | true | common_lazy |
| **首图** | Shoutu CMS | `/vodshow/fyclass--------fypage---/` | true | common_lazy |
| **首图2** | Shoutu v2 | `/list/fyclass-fypage.html` | true | common_lazy |
| **vfed** | VFed CMS | `/index.php/vod/show/id/fyclass/page/fypage.html` | true | common_lazy |
| **海螺3** | Hailuo v3 | `/vod_____show/fyclass--------fypage---.html` | true | common_lazy |
| **海螺2** | Hailuo v2 | `/index.php/vod/show/id/fyclass/page/fypage/` | true | common_lazy |
| **短视** | Short video | `/channel/fyclass-fypage.html` | true | common_lazy |
| **短视2** | Short video v2 | API driven | true | common_lazy |
| **采集1** | Collector | API: `?ac=detail&pg=fypage&t=fyclass` | false | cj_lazy |
| **默认** | Fallback | empty | false | def_lazy |

`double: true` = recommendation needs 2-layer parsing. If home recommendation is empty, check `double` first.

---

## Async Function 7 Iron Rules

1. **`this.input` is a URL, not a response** → must `await request(this.input)`
2. **Numeric vod_id requires `detailUrl`** → e.g. `detailUrl: '/api/videos/fyid'`
3. **POST uses `body` (JSON.stringify)** → not `data`
4. **`searchUrl` must contain `**`** → otherwise `this.KEY` is empty
5. **Full aggregation + dedup for recommendations**
6. **Use `this.MY_CATE/MY_PAGE`** → don't manually build URLs
7. **`request`/`post` are globals** → not on `this`

### this Context (Proxy)

```js
let { input, MY_URL, HOST, MY_CATE, MY_PAGE, MY_FL, KEY, fetch_params,
      pdfa, pdfh, pd } = this;
```

### Engine Dispatch by Field Type

| Field type | Handler |
|-----------|---------|
| `async function` | `invokeWithInjectVars()` — Proxy this + auto parseAfter |
| `string (CSS rule)` | `commonXxxParse()` — Cheerio |
| `js:` prefix | `executeJsCodeInSandbox()` |
| `*` | Inherits from 一级 |
| `二级: {object}` | `commonDetailListParse()` |
| undefined | Default fallback |

---

## Template Inheritance Mechanism

```js
// Object.assign(rule, templateRule, originalRule)
// originalRule always overrides templateRule
```

Key implications:
- **Explicit fields in source always override template**
- Clear unwanted class_parse: set `class_parse: ''`
- Clear unwanted double: `double: false`
- Use `get_resolved_rule(path)` to inspect merged result

---

## Play Chain Reference

### lazy Return Semantics

| Return value | parse | jx | Meaning |
|-------------|-------|-----|---------|
| `{parse:0, url:'...m3u8'}` | 0 | — | Direct stream |
| `{parse:0, jx:1, url:'...'}` | 0 | 1 | External parser |
| `{parse:1, url: input}` | 1 | — | Webview sniffing |
| `{parse:0, url:'novel://...'}` | 0 | — | Novel content |
| `{parse:0, url:'pics://...'}` | 0 | — | Comic images |
| `{parse:0, url:'push://...'}` | 0 | — | Screen cast |

### playParseAfter

After lazy returns, the framework auto-decides:
```js
parse = /\.(m3u8|mp4|m4a|mp3)/.test(url) ? 0 : 1;
jx = tellIsJx(url);
```
Even if lazy returns `{parse:1, url}`, a direct-media URL gets overridden to parse:0.

### 3 Template Default Lazy Types

| Type | Behavior |
|------|----------|
| **common_lazy** | Extracts `player_*` JSON, supports encrypt 1(unescape) / 2(base64Decode+unescape) |
| **def_lazy** | Always `{parse:1, url:input}`, pure sniffing |
| **cj_lazy** | Via `rule.parse_url`, supports `json:` prefix |

### Special Content Protocols

```js
// Comic - pics:// protocol
return { parse: 0, url: 'pics://url1&&url2&&url3' };

// Novel - novel:// protocol
return { parse: 0, url: 'novel://' + JSON.stringify({title, content}) };

// Screen cast - push:// protocol
return { parse: 0, url: 'push://' + playUrl };
```

---

## URL Template Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `fyclass` | Category ID | `/show/fyclass--------fypage---.html` |
| `fypage` | Page number | Auto-replaced on pagination |
| `fyid` | Content ID | `/detail/fyid.html` |
| `fyfilter` | Filter params | `filter_url` insertion point |
| `**` | Search keyword | `/search_**----------fypage---.html` |
| `fl.xxx` | Jinja filter | `filter_url: '{{fl.area}}&{{fl.year}}'` |
| `[url1][url2]` | Pagination special | Page 1 uses url2, page 2+ uses url1 |

---

## CSS Rule Syntax

Format: `list_selector;title;image;desc;link;detail`

```
; field separator
&& connects selector+attr: tag&&Text / tag&&src
|| attr fallback: img&&data-original||src
:eq(N) index selection
:gt(N):lt(N) range selection
json: prefix enables JSON parsing mode
```

**Important**: `||` only for attribute fallback on the SAME selector. Do NOT write `img&&data-original||img&&src`.

---

## Complete Rule Field Reference

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `title` | string | Display name | yes |
| `host` | string | Website domain | yes |
| `类型` | string | 影视/漫画/小说/听书 | yes |
| `模板` | string | Template name to inherit | no |
| `url` | string | Category list URL pattern | yes |
| `homeUrl` | string | Homepage URL | no |
| `detailUrl` | string | Detail page URL | needed for numeric vod_id |
| `searchUrl` | string | Search URL pattern | needed for search |
| `class_name` | string | Static category names(&-separated) | yes (or class_parse) |
| `class_url` | string | Static category IDs(&-separated) | pair with class_name |
| `class_parse` | string/func | Dynamic category parsing | alternative |
| `headers` | object | Request headers | no |
| `searchable` | 0/1/2 | Search capability | no |
| `filterable` | 0/1 | Filter support | no |
| `play_parse` | bool | Enable lazy parsing | no(default:true) |
| `lazy` | string/func | Play URL resolver | no |
| `double` | bool | Double-layer recommendation | no |
| `filter` | string/obj | Filter config (gzip compressed) | no |
| `filter_url` | string | Filter URL template | no |
| `hostJs` | function | Dynamic host resolution | no |
| `line_order` | array | Source line ordering | no |
| `search_match` | bool | Strict search matching | no |
| `proxy_rule` | string/func | Proxy rule | no |

---

## Template Site Troubleshooting Order

1. `get_resolved_rule` to inspect merged fields
2. `class_parse` overriding static categories → set `class_parse: ''`
3. `double` causing empty recommendation → `double: false`
4. Verify real `url` / `searchUrl` match site structure
5. Remove handwritten 一级/搜索, test built-in template first
6. Only then apply minimal overrides

**Don't confuse template issues, URL issues, or evaluator chaining issues with selector issues.**

---

## Search Strategy

Before writing search rules, determine the type:
1. **Native search API** — use searchUrl directly
2. **Suggest /联想 fallback** — JSON API, async parse
3. **RSS fallback** — alternative path

Search term tuning:
- Don't just use default "斗罗大陆"
- Use broad-match terms (try common words)
- Adjust `multi: 1` if page size is insufficient

---

## MCP Tool Mapping

| Scenario | Primary tool | Secondary |
|----------|-------------|-----------|
| Classify site | `guess_spider_template` | `analyze_website_structure` |
| Analyze DOM | `analyze_website_structure` | `fetch_spider_url` |
| Debug selector | `debug_spider_rule` | `extract_website_filter` |
| Interface test | `test_spider_interface` | `evaluate_spider_source` |
| Play debug | `extract_iframe_src` | `test_spider_interface(play)` |
| Upload | `house_verify` → `house_file` | — |

---

## Knowledge Base

### Category Rules
- `class_name: 'Movies&TV'` + `class_url: '1&2'` → static categories
- `class_parse: '.nav li;a&&Text;a&&href;/(\d+)'` → dynamic
- Falls back to static when dynamic returns empty

### Selectors
| Function | Returns | Description |
|----------|---------|-------------|
| `pdfa(html, selector)` | Array | Get element list |
| `pdfh(html, rule)` | String | Extract text/attr |
| `pd(html, rule, baseUrl)` | String | Extract + resolve URL |
| `pjfh(json, rule)` | String | JSON mode pdfh |
| `pjfa(json, rule)` | Array | JSON mode pdfa |

### Globals
- `request(url, opts)`, `post(url, opts)` — HTTP requests
- `setResult(d)` — Format list `{title, url, desc, pic_url, content}[]`
- `base64Encode/Decode`, `md5`, `CryptoJS` — crypto
- `MOBILE_UA`, `PC_UA`, `UA` — UA constants
- `urljoin(base, path)`, `buildUrl(url, obj)` — URL utils
