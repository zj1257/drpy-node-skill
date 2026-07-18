# 二级字典规范与多集排障

> 适用范围：所有使用二级字典模式的 DS 源（非 async 二级函数）。
> 本文档包含二级字典的字段语义、槽位规范、以及多集只吐1集的排障经验。

---

## 1. 二级字典字段与槽位语义

二级字典的每个字段用 `;` 分隔，每段有固定的语义槽位：

| 字段 | 语法 | 槽位语义 |
|---|---|---|
| `title` | `'片名规则;类型规则'` | 第1段→片名，第2段→类型名 |
| `img` | `'封面图规则'` | 封面图（支持 `data-src` 等属性） |
| `desc` | `'备注;年份;地区;演员;导演'` | 5段固定：vod_remarks/year/area/actor/director |
| `content` | `'简介规则'` | 详情内容（常需 `.replace(/<[^>]*>/g, '')` 去HTML） |
| `tabs` | `'线路节点选择器'` | 定位所有线路容器 |
| `tab_text` | `'线路名提取规则'` | 从线路容器提取线路名文本 |
| `lists` | `'当前线路选集列表选择器'` | 支持 `#id`（按索引）/ `#idv`（按值）线路替换 |
| `list_text` | `'每集标题'` | 默认 `body&&Text` |
| `list_url` | `'每集链接'` | 默认 `a&&href` |

### 关键理解
- `desc` 不是任意拼接信息串，每段有固定映射关系
- `lists` 只是选集容器定位器，不是最终播放字符串
- `#id` 的主要作用是"线路容器替换定位"，不是控制单线路集数

---

## 2. 最小化原则

二级先保证以下最小可用项：
- 标题、描述/备注、详情内容、图片、线路、列表

只有在用户明确要求时，才补全：年份、地区、演员、导演。

---

## 3. detail 测试规范

### 必须使用一级真实返回的 vod_id
禁止主观简化 vod_id（纯数字id、手推id、猜测id）。

正确顺序：
1. 先跑 `test_spider_interface(category)`
2. 从一级真实结果中提取 `vod_id`
3. 用这个真实 `vod_id` 测 `test_spider_interface(detail)`

### 先让 detail 真通，再进入播放链排障
如果 detail 还没稳定产出 `vod_play_from` 和 `vod_play_url`，不要急着归因为 lazy/play 链路。
先检查：二级字典契约是否写对，tabs/lists/tab_text/list_url 是否匹配。

---

## 4. tabs 的 && 后必须是元素选择器（最高频陷阱，先查这条）

**症状**：detail 有数据（`vod_name`/`vod_pic` 正常），但 `vod_play_from` 和 `vod_play_url` **同时为空**，evaluate 卡在"播放跳过"。

**根因**：dict 二级里 `tabs` 由 **pdfa 执行**（取元素数组）。drpy 执行逻辑（`libs/drpysParser.js` `commonDetailListParse`）：
```js
let p_tab = p.tabs.split(';')[0];        // 整串传给 pdfa
let vHeader = $pdfa(html, p_tab);         // 取 tab 元素数组
// ... playFrom 由 vHeader 生成
for (let i = 0; i < playFrom.length; i++) {  // lists 循环次数 = playFrom 长度
    let p1 = p.lists.replaceAll('#id', i);   // #id 替换成索引，机制可靠
```

**关键规律**：`&&` 在 pdfa 里被当作**后代选择器**（等价于空格）。所以 `tabs` 能带 `&&`，但 `&&` 后必须是**能定位到元素的合法选择器**：
- ✅ `&&` 后是元素选择器：标签 `a`/`dt`/`li`/`dd`、`.class`、`#id` -> pdfa 正常取到后代元素
  - `'#list&&dt'` ≡ `'#list dt'` -> 取 `#list` 下的 `dt` 元素
  - `'.play_source_tab&&a'`（模板 `libs_drpy/template.js` 就有此写法）-> 取 `a` 元素
- ❌ `&&` 后是 pdfh 取值段：`Text`/`Html`/`href`/`src`/`data-xxx` -> 不是合法元素选择器，pdfa 返回**空** -> `playFrom=[]` -> lists 循环 0 次 -> 播放线路全空

每个 tab 的显示文本由 `tab_text` 字段控制（默认 `body&&Text`），不写在 tabs 里。

**正确写法**（按站点 DOM 结构二选一）：
```js
二级: {
    // 写法1：tabs 取容器自身的多个元素（无 &&）
    tabs: '.module-tab-item',
    // 写法2：tabs 取容器内的子元素（&& 后是元素选择器）
    tabs: '.play_source_tab&&a',
    tab_text: 'body&&Text',                     // 可省略，默认即此值
    lists: '.module-play-list:eq(#id) a',       // #id 自动替换为 tab 索引
}
```

**排查命令**：`debug --rule '<tabs选择器>' --mode pdfa --url <详情页>`，看 count 是否>0 且元素正确。`&&Text`/`&&href` 会 count=0。另查 `tab_text` 在 tab 元素上能否取到文本（取不到会被兜底成"线路空"）。

**实测样本**（验证规律）：
- 顶点小说详情页：`#list&&a`->108、`#list&&dt`->2、`#list&&dd`->106（&& 后是标签，都取到）；`#list&&Text`/`#list&&href`->0（pdfh 取值段，取不到）。完美印证"&& 后必须是元素选择器"。
- 樱花动漫[优]：`tabs:'.play-list-group-switch-item&&Text'` -> pdfa count=0，全空；改 `tabs:'.play-list-group-switch-item'`（switch-item 本身就是 3 个 tab 元素，取自身）-> count=3，`vod_play_from=1-30$$$31-60$$$61-62`，evaluate 65->90。
- 顶点小说[书]：`tabs:'#list&&dt'`（dt 是标签，count=2 本身合法）但 `tab_text:'dd&&Text'`（dt 上无 dd 子元素，取空->兜底"线路空"）；改 `tab_text:'body&&Text'` -> 线路名正常取到 dt 文本。这里根因是 tab_text 不是 tabs。

---

## 5. 多集只吐 1 集的排障（咕咕番案例）

### 问题描述
详情页真实 DOM 已确认能抓到多集，`vod_play_from` 正常，但 `vod_play_url` 在字典模式下只吐出 1 集。

### 不要第一反应就切 async
应优先检查 `lists` 容器层级。

### 排查步骤
1. 用 `debug_spider_rule(pdfa)` 分别验证 `ul / li / a` 三层能抓到多少项
2. 若页面多集存在，优先尝试把 `lists` 从容器层下沉到项层

### 咕咕番验证结果
对于"一级异步接口 + 详情直出资源列表"的站点：

```js
// ❌ 只吐1集 — lists 落在了 ul 容器层
lists: '.anthology-list-box:eq(#id) .anthology-list-play'

// ✅ 正常吐多集 — lists 下沉到 li 项层
lists: '.anthology-list-box:eq(#id) .anthology-list-play li',
list_text: 'a&&Text',
list_url: 'a&&href'
```

页面上：
- `.anthology-list-box:eq(0) .anthology-list-play` → 1个 `ul`
- `.anthology-list-box:eq(0) .anthology-list-play a` → 2个 `a`
- `.anthology-list-box:eq(0) .anthology-list-play li` → 2个 `li`

### 判定原则
- `#id` 是"线路容器替换定位"
- 真正影响多集展开的关键是 `lists` 落在 `li` 项层而不是 `ul` 容器层
- **先调 `lists` 容器层级，再考虑放弃字典或切 async**

### 工作流动作
1. `debug_spider_rule(pdfa)` 分别验证 `ul / li / a` 三层
2. 若多集存在，优先 `lists` 从容器层下沉到 `li` 项层
3. 只有字典层级已验证不成立时，才切 async 二级
