# 纯 API 驱动 SPA 站建源指南

> 适用站型：后端 Express/Koa/Nest + 前端 SPA（React/Vue），无传统 HTML 列表页，所有数据通过 JSON API 返回。
> 典型特征：页面源码几乎为空，所有内容由前端 JS 异步渲染。
> 已验证案例：247看（2026-04-21）

### ⚠️ 通用经验已提炼至独立参考
与 async 函数相关的通用模式（this.input、detailUrl、POST body、searchUrl、推荐聚合等）均在：
- **`references/references-async-function-patterns.md`**（async 函数通用模式与陷阱）

---

## 1. 站型识别（30秒判断）

当看到以下特征时，应判定为纯 API 站：
- `guess_spider_template` 返回不匹配任何模板
- 页面源码 `<body>` 内只有 `<div id="app">` 等 SPA 容器
- 浏览器 Network 面板显示所有数据来自 `/api/xxx` 的 JSON 响应
- 没有传统的 `.list li a` 等列表 DOM 结构

**此时应放弃模板继承路线，直接走全 async 函数模式。**

---

## 2. 四大 URL 模板定义

纯 API 站虽然不走模板引擎的 DOM 解析，但仍需正确定义 `url`/`homeUrl`/`detailUrl`/`searchUrl`，让引擎渲染模板并注入 `this.input`。

```js
var rule = {
    host: 'https://example.com',
    homeUrl: '/api/home',                                          // 首页API
    url: '/api/categories/fyclass/videos?page=fypage&limit=24',   // 一级API
    detailUrl: '/api/videos/fyid',                                 // 二级API（关键！）
    searchUrl: '/api/search?q=**&page=fypage',                    // 搜索API
};
```

### 关键点

| 模板 | 占位符 | 引擎注入变量 |
|---|---|---|
| `url` | `fyclass` → 分类ID, `fypage` → 页码 | `this.MY_CATE`, `this.MY_PAGE` |
| `homeUrl` | 通常无占位符 | `this.input` = 完整URL |
| `detailUrl` | `fyid` → vod_id | 引擎把一级vod_id替换到fyid |
| `searchUrl` | `**` → 搜索词, `fypage` → 页码 | `this.KEY`, `this.MY_PAGE` |

---

## 3. 完整源模板

```js
var rule = {
    类型: '影视',
    title: '站名',
    host: 'https://example.com',
    homeUrl: '/api/home',
    url: '/api/categories/fyclass/videos?page=fypage&limit=24',
    detailUrl: '/api/videos/fyid',
    searchUrl: '/api/search?q=**&page=fypage',
    searchable: 2,
    quickSearch: 0,
    filterable: 0,
    headers: { 'User-Agent': 'MOBILE_UA' },
    timeout: 10000,
    class_name: '',
    class_url: '',
    play_parse: true,
    limit: 6,
    double: false,

    class_parse: async function () {
        let {HOST} = this;
        let data = JSON.parse(await request(HOST + '/api/categories'));
        let classes = [];
        data.data.forEach(function (cat) {
            classes.push({
                type_id: String(cat.type_id),
                type_name: cat.type_name
            });
        });
        return {class: classes};
    },

    推荐: async function () {
        let data = JSON.parse(await request(this.input));
        // 完整聚合逻辑...
    },

    一级: async function () {
        let data = JSON.parse(await request(this.input));
        let items = [];
        if (data.data && data.data.videos) {
            data.data.videos.forEach(function (v) {
                items.push({
                    vod_name: v.vod_name,
                    vod_pic: v.vod_pic || '',
                    vod_remarks: v.vod_remarks || '',
                    vod_id: String(v.vod_id)
                });
            });
        }
        return items;
    },

    二级: async function () {
        let data = JSON.parse(await request(this.input));
        let v = data.data;
        // 线路/选集/详情字段处理...
        return { vod_name: v.vod_name, /* ... */ };
    },

    搜索: async function () {
        let KEY = this.KEY;
        let MY_PAGE = this.MY_PAGE || 1;
        // 搜索请求与解析...
    },

    lazy: async function () {
        let {input} = this;
        if (input.indexOf('.m3u8') > -1) {
            return { url: input, parse: 0 };
        }
        return { url: input, parse: 1 };
    }
};
```

---

## 4. 排障 Checklist

| 症状 | 优先检查 |
|---|---|
| 二级全部为空 | `detailUrl` 是否设置了 `fyid` 占位符 |
| `JSON.parse` 报 URL 不是 JSON | `this.input` 是 URL 不是响应，需 `await request(this.input)` |
| 搜索始终空但没报错 | 1. `searchUrl` 是否带 `**` 2. POST 用 `body` 不是 `data` 3. 是否需要 Authorization |
| 搜索请求 401 | 外部 API 需要 Authorization，从浏览器抓包 |
| 推荐只有几条 | 是否只取了 featured，要聚合全部推荐源 |
| 两个同名属性 | JS 后者覆盖前者，删掉多余的空占位 |
