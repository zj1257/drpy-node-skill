# drpy 框架内部机制参考

> 来源：`libs/drpyS.js`、`libs/drpysParser.js` 源码
> 用途：排查疑难问题时理解引擎的分流和行为机制

## 一、整体架构

```
请求 → API路由 → drpyS.js引擎 → 沙箱执行
                           ├── init() 初始化
                           │   ├── getSandbox() → vm.createContext
                           │   ├── 执行JS源码获取rule
                           │   ├── handleTemplateInheritance() 模板继承
                           │   ├── initParse() URL/headers/预处理
                           │   └── 缓存moduleObject
                           └── invokeMethod() 调度分发
                               ├── home/class_parse → 首页分类
                               ├── homeVod/推荐 → 推荐内容
                               ├── category/一级 → 分类列表
                               ├── detail/二级 → 详情
                               ├── search/搜索 → 搜索
                               ├── play/lazy → 播放解析
                               └── proxy → 代理
```

## 二、沙箱隔离机制

所有JS源在 `vm.createContext()` 创建的沙箱中执行：

```js
// drpyS.js getSandbox()
const sandbox = {
    console, WebAssembly, setTimeout,  // 基础能力
    ...GLOBAL_STATIC_SANDBOX,           // pdfh/pd/pda/req/local等全局函数
    env动态变量,                         // getProxyUrl, requestHost等
};
const context = vm.createContext(sandbox);
```

**含义**：源中的JS代码无法访问 `require()`、`fs`、`process` 等 Node.js 原生 API。
只能使用沙箱中注入的函数（pdfh/pd/request/CryptoJS 等）。

## 三、模板继承机制

```js
// handleTemplateInheritance() 核心
if (rule['模板'] === '自动') {
    // 请求 host 页面，用每个模板的 class_parse 尝试解析
}
if (rule.模板 && muban.hasOwnProperty(rule.模板)) {
    const templateRule = muban[rule.模板];
    Object.assign(rule, templateRule, originalRule);
    // ↑ templateRule 在前，originalRule 在后
    // → 源的显式定义永远覆盖模板默认值
}
```

**重要推论**：
1. 源中同名字段覆盖模板 → 设 `class_parse: ''` 可清除模板继承的 class_parse
2. 模板的 `double: true` 会被继承，除非显式覆盖
3. 模板的 url/searchUrl 会被继承，不匹配时需要显式覆盖

## 四、调度分发机制

```js
// invokeMethod() 根据 method 类型进行分支
switch (method) {
    case 'class_parse': injectVars = homeParse(...); break;
    case '推荐':        injectVars = homeVodParse(...); break;
    case '一级':        injectVars = cateParse(...); break;
    case '二级':        injectVars = detailParse(...); break;
    case '搜索':        injectVars = searchParse(...); break;
    case 'lazy':        injectVars = playParse(...); break;
}
```

每个 method 根据 rule 中字段的类型进一步分流：

| rule字段类型 | 处理方式 | 适用场景 |
|---|---|---|
| `async function` | `invokeWithInjectVars()` 执行 | 复杂逻辑 |
| `string (CSS规则)` | `commonXxxParse()` 解析 | 简单DOM |
| `js:开头` | `executeJsCodeInSandbox()` | 内联计算 |
| `*` | 从一级规则继承 | 推荐/搜索复用 |
| `二级: {对象}` | `commonDetailListParse()` | 字典式配置 |
| `二级: '*'` | 跳过二级，一级链直接播放 | 极简 |
| 未定义 | 返回默认值 | 保护降级 |

## 五、Proxy this 上下文

```js
// invokeWithInjectVars() 中创建 Proxy
let thisProxy = new Proxy(injectVars, {
    get(injectVars, key) {
        return injectVars[key] || rule[key];
        // 优先取运行时注入变量，其次 rule 定义
    },
    set(injectVars, key, value) {
        rule[key] = value;
        injectVars[key] = value;
        // 同时写入 rule 和 injectVars
    }
});
```

这意味着 async function 中：
- `this.input` → injectVars.input（运行时URL）
- `this.host` → rule.host（配置值）
- `this.xxx = yy` → 同时修改 rule.xxx

## 六、URL 模板变量

| 变量 | 说明 | 示例 |
|---|---|---|
| `fyclass` | 分类ID | `/show/fyclass--------fypage---.html` |
| `fypage` | 页码 | 翻页自动替换 |
| `fyid` | 内容ID | `/detail/fyid.html` |
| `fyfilter` | 筛选URL | `filter_url`拼接位置 |
| `**` | 搜索关键词 | `/search_**----------fypage---.html` |
| `fl.xxx` | Jinja模板筛选 | `filter_url: '{{fl.area}}&{{fl.year}}'` |

特殊翻页语法：`/list/fyclass-fypage.html[/list/fyclass.html]`
- 第1页用 `[url2]`，第2页起用 `url1`

## 七、playParseAfter 后处理

```js
// lazy 返回后，框架自动判断
parse = SPECIAL_URL.test(playUrl) || /^(push:)/.test(playUrl) || 
        /\.(m3u8|mp4|m4a|mp3)/.test(playUrl) ? 0 : 1;
jx = tellIsJx(playUrl);
```

- 即使 lazy 返回 `{parse:1, url}`，如果 url 是直链后缀 → 框架会覆盖为 parse:0
- 即使返回纯字符串 URL → 框架自动处理后返回

## 八、B 类失败（评估未串联）的根本原因

B 类失败的本质是 **评估器的串联依赖断裂**：

```
home → class → category → detail → play
         ↑
    class_parse 未命中
    → class 数组为空
    → 评估器拿不到分类ID
    → category 无法测试
    → 无法获取 vod_id
    → detail/play 全断
```

`get_resolved_rule(path)` 可以查看模板继承后的最终字段值，
快速判断 `class_parse`、`double`、`url`、`searchUrl` 等关键字段是否被正确继承或覆盖。
