# 模板系统参考

> 来源：`libs_drpy/template.js` 源码分析
> 用途：新建源时判断命中哪个模板、理解模板默认字段、最小覆盖排查

## 一、12 个内置模板速查

| 模板名 | CMS类型 | URL模式 | double | 二级 lazy | class_parse |
|--------|---------|---------|--------|-----------|-------------|
| **mx** | 苹果CMS旧版 | `/vodshow/fyclass--------fypage---/` | true | common_lazy | `.top_nav li;...` |
| **mxpro** | 苹果CMS Pro | `/vodshow/fyclass--------fypage---.html` | true | common_lazy | `.navbar-items li:gt(0):lt(10);...` |
| **mxone5** | One5主题 | `/show/fyclass--------fypage---.html` | true | common_lazy | `.nav-menu-items&&li;...` |
| **首图** | 首图CMS | `/vodshow/fyclass--------fypage---/` | true | common_lazy | `.myui-header__menu li:gt(0):lt(7);...` |
| **首图2** | 首图CMS v2 | `/list/fyclass-fypage.html` | true | common_lazy | `.stui-header__menu li:gt(0):lt(7);...` |
| **vfed** | VFed CMS | `/index.php/vod/show/id/fyclass/page/fypage.html` | true | common_lazy | `.fed-pops-navbar&&ul...` |
| **海螺3** | 海螺CMS v3 | `/vod_____show/fyclass--------fypage---.html` | true | common_lazy | `body&&.hl-nav li:gt(0);...` |
| **海螺2** | 海螺CMS v2 | `/index.php/vod/show/id/fyclass/page/fypage/` | true | common_lazy | `#nav-bar li;...` |
| **短视** | 短视频 | `/channel/fyclass-fypage.html` | true | common_lazy | `.menu_bottom ul li;...` |
| **短视2** | 短视频v2 | `/index.php/api/vod#type=fyclass&page=fypage` | true | common_lazy | — |
| **采集1** | 采集站 | `/api.php/provide/vod/?ac=detail&pg=fypage&t=fyclass` | false | cj_lazy | `json:class;` |
| **默认** | 通用兜底 | 空 | false | def_lazy | `#side-menu li;...` |

## 二、double 机制

`double: true` 的模板，推荐规则使用两层解析：
1. 先取外层容器（如 `.tab-list.active`）
2. 再从内层列表（如 `a.module-poster-item.module-item`）提取数据

如果首页推荐为空且用了模板继承，优先：
```
设 double: false → 重新测试
```

## 三、三种模板默认 lazy

### common_lazy（mx/mxpro/首图/海螺/短视等）
```js
let hconf = html.match(/r player_.*?=(.*?)</)[1];
let json = JSON5.parse(hconf);
// encrypt: '1' → unescape(url)
// encrypt: '2' → base64Decode(url) → unescape()
if (/\.(m3u8|mp4|m4a|mp3)/.test(url)) return {parse:0, url};
if (tellIsJx(url)) return {parse:0, jx:1, url};
return input;
```

### def_lazy（默认模板）
```js
return { parse: 1, url: input, js: '' }
```
完全交由嗅探系统，`parse:1` 不一定是错。

### cj_lazy（采集1）
检查 `rule.parse_url`，支持 `json:` 前缀的解析接口。

## 四、各模板二级字典差异

mxpro 典型二级：
```js
{
    title: 'h1&&Text;.module-info-tag-link:eq(-1)&&Text',
    img: '.lazyload&&data-original||data-src||src',
    desc: '.module-info-item:eq(-2)&&Text;.module-info-tag-link&&Text;...',
    content: '.module-info-introduction&&Text',
    tabs: '.module-tab-item',
    lists: '.module-play-list:eq(#id) a',
    tab_text: 'div--small&&Text',
}
```

首图2 使用回退机制（title1/desc1/tabs1）：主选择器不命中时自动回退。

## 五、模板修改函数

```js
// 在模板继承之前动态修改模板字段
模板修改: async function(muban) {
    muban.mxpro.一级 = '自定义选择器';
}
```

## 六、自动模板匹配

```js
rule = { 模板: '自动', host: 'https://example.com' }
// 框架自动请求 host 页面，用每个模板的 class_parse 尝试解析
// 第一个成功解析出分类的模板被选中
```
