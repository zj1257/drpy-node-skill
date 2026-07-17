/**
 * spider 组静态数据：源模板 / 全局函数库参考 / API 列表。
 * 从 drpy-node-mcp 的 spiderTools.get_spider_template、drpyLibsInfo、apiTools 移植。
 */

export function makeSpiderTemplate() {
  const today = new Date().toISOString().split('T')[0];
  return `/*
* @File     : drpy-node spider template
* @Author   : user
* @Date     : ${today}
* @Comments :
*/

var rule = {
    // 影视|漫画|小说
    类型: '影视',
    // 源标题
    title: 'Site Name',
    // 源主域名，可以自动处理后续链接的相对路径
    host: 'https://example.com',
    // 源主页链接，作为推荐的this.input
    homeUrl: '/latest/',
    // 源一级列表链接 (fyclass=分类, fypage=页码)
    url: '/category/fyclass/page/fypage',
    // 源搜索链接 (**=关键词, fypage=页码)
    searchUrl: '/search?wd=**&pg=fypage',
    // 允许搜索(1)、允许快搜(1)、允许筛选(1)
    searchable: 2,
    quickSearch: 0,
    filterable: 1,
    // 源默认请求头、调用await request如果参数二不填会自动添加
    headers: {
        'User-Agent': 'MOBILE_UA',
    },
    // 接口访问超时时间
    timeout: 5000,
    // 静态分类名称
    class_name: 'Movie&TV&Anime',
    // 静态分类id
    class_url: '1&2&3',
    // 动态分类获取 列表;标题;链接;正则提取 (可选)
    // class_parse: '#side-menu:lt(1) li;a&&Text;a&&href;com/(.*?)/',

    // 是否需要调用免嗅lazy函数 (服务器解析播放)
    play_parse: true,
    // 免嗅lazy执行函数 (如果play_parse为true则需要)
    lazy: '',
    // 首页推荐显示数量
    limit: 6,
    // 是否双层列表定位,默认false
    double: true,

    // 推荐列表解析: 列表;标题;图片;描述;链接
    推荐: '.recommend .item;a&&title;img&&src;.remarks&&Text;a&&href',
    // 一级列表解析: 列表;标题;图片;描述;链接
    一级: '.list .item;a&&title;img&&src;.remarks&&Text;a&&href',
    // 二级详情解析 (字典模式)
    二级: {
        "title": "h1&&Text",
        "img": ".poster img&&src",
        "desc": ".desc&&Text",
        "content": ".content&&Text",
        "tabs": ".tabs span",
        "lists": ".playlists ul",
    },
    // 搜索结果解析: 列表;标题;图片;描述;链接
    搜索: '.search-result .item;a&&title;img&&src;.remarks&&Text;a&&href',
}
`;
}

export const DRPY_LIBS_INFO = {
  '1. Core Request Functions': [
    'request(url, options?) — 主异步请求函数，返回响应体字符串。options: { headers, method, data/body, timeout, encoding }',
    'post(url, options?) — POST 快捷',
    'fetch(url, options?) — fetch 兼容异步请求',
    'req(url, options?) — 底层请求封装，通常返回 { content, headers, code, ... }',
    'reqs(urls, options?) — 批量请求',
    'getHtml(url, options?) — 取 HTML',
    'getCode(url, options?) — 取源码/文本',
    'checkHtml(html) — 校验/规范 HTML',
    'reqCookie(url, options?) — 带 cookie 提取的请求',
  ],
  '2. Parsing Functions (HTML / JSON / URL)': [
    "pdfh(htmlOrNode, rule) — 解析节点文本/属性。例: 'a&&Text', 'img&&src', '.title&&Text'",
    'pd(htmlOrNode, rule, baseUrl?) — 解析并规范化 URL，自动用 baseUrl 解析相对链接',
    'pdfa(htmlOrNode, selector) — 用 CSS 选择器解析数组/列表节点',
    'jsp(baseUrl?) — 创建绑定 base URL 的 jsoup 解析实例，返回带 pdfh/pd/pdfa 方法的 parser',
    'pdfl(htmlOrNode, rule) — 底层列表解析',
    'pjfh / pj / pjfa — JSON 源解析变体',
    'jsonpath.query(obj, path) — JSONPath 查询',
  ],
  '3. Async Context Rules': [
    '一级/二级/搜索/lazy/推荐/预处理/class_parse/hostJs 用 async function 时，引擎以 thisProxy 调用',
    "必须在函数顶部从 this 解构: let { input, HOST, MY_URL, pdfa, pdfh, pd } = this;",
    '绝不要假设 input/HOST 是裸全局变量——它们在 this 上，不是自由标识符',
    'this 先读 injectVars，再回退 rule 对象',
    'this.xxx = value 同时写回 injectVars 和 rule 对象',
  ],
  '4. Rule String Syntax': [
    '选择器规则格式: 列表;标题;图片;描述;链接;详情',
    "用 && 嵌套提取: 'a&&title', '.lazyload&&data-original'",
    "用 || 对同一选择器的属性做回退: 'img&&data-original||src'",
    "不要写整规则级回退如 'img&&data-original||img&&src'",
    '用 :eq(n) 做索引选择',
    'pdfa 模式只接受纯 CSS 选择器，不接受分号多段规则',
  ],
  '5. URL / Query Utilities': [
    'urljoin(base, path) — 相对 URL 解析',
    'buildUrl(url, obj) — 带查询参数构造 URL',
    'getQuery(url) — 解析查询串',
    'encodeIfContainsSpecialChars(str) — 按需编码',
    'tellIsJx(url) — 判断是否解析器/jx URL',
  ],
  '6. User-Agent Constants': ['MOBILE_UA — 移动端 UA', 'PC_UA — 桌面端 UA', 'UA — 默认 UA', 'randomUa.generateUa(count?, options?) — 随机 UA'],
  '7. JSON / Crypto / Compression': [
    'JSON5 / JSONbig — 宽松/大数 JSON 解析',
    'base64Encode/base64Decode, md5, aes/des/rsa, rc4, gzip/ungzip',
    'CryptoJS / JSEncrypt / NODERSA / forge — 加密库',
  ],
  '8. Data / Result Helpers': [
    'setResult(d) — 详情页结果格式化',
    'setHomeResult(d) — 首页结果格式化',
    'fixAdM3u8Ai(m3u8Url, m3u8Content, headers?) — 去广告 m3u8',
    'forceOrder(list, key?, flags?) — 强制数组顺序',
    'getOriginalJs(jsCode) — 从加密/压缩代码还原 JS',
  ],
  '9. Template Engine & Inheritance': [
    'jinja / template — 模板引擎',
    '模板继承不是黑盒：最终 rule 在模板合并后产生',
    '模板站常用继承字段: class_parse, double, url, searchUrl, 推荐, 一级, 搜索',
    '先用 resolved 命令检查最终继承摘要，再决定是否手写覆盖',
  ],
  '10. Rule Object Properties (rule.*)': [
    'rule.title / rule.host / rule.url / rule.searchUrl',
    'rule.class_name / rule.class_url / rule.class_parse',
    'rule.一级 / rule.二级 / rule.搜索 / rule.推荐 / rule.lazy / rule.预处理',
    'rule.play_parse / rule.searchable(0禁1启2快搜) / rule.filterable / rule.double / rule.headers / rule.timeout',
  ],
  '11. Lazy / Play 三种心智模型': [
    'common_lazy — 解析播放页 HTML，提取 player_* JSON，解密 url，返回直链或解析链接',
    'def_lazy — 返回 { parse:1, url: input }，由解析器/前端处理播放页',
    'cj_lazy — 采集站风格，可能用 parse_url 或 json:parse 端点',
    '不要假设 parse:1 一定错；不要假设任意 http URL 都是直链',
  ],
};

export const DRPY_API_LIST = [
  {
    category: 'Core Video Source API',
    endpoints: [
      {
        path: '/api/:module',
        method: 'GET/POST',
        description: "影视源主接口。module 可选: 'drpyS','hipy','php','xbpq','catvod'",
        params: {
          ac: "'t'=分类/列表, 'ids'=详情, 省略且带 wd 则搜索",
          t: '分类 ID (ac=t 时)',
          pg: '页码（默认 1）',
          wd: '搜索关键词',
          ids: '逗号分隔的 vod ID (ac=ids)',
          play: '待解析的播放 URL',
          flag: '播放线路标识',
        },
      },
      { path: '/proxy/:module/:url', method: 'GET', description: '源请求代理（headers 等）' },
      { path: '/parse/:jx', method: 'GET', description: '视频解析接口' },
    ],
  },
  {
    category: 'Configuration',
    endpoints: [
      { path: '/config', method: 'GET', description: '生成 app 配置 JSON（TVBox 等）' },
      { path: '/config/:id', method: 'GET', description: '特定配置变体' },
    ],
  },
  {
    category: 'System & Tools',
    endpoints: [
      { path: '/health', method: 'GET', description: '健康检查' },
      { path: '/encoder|/decoder', method: 'POST', description: '编解码工具' },
      { path: '/http', method: 'POST', description: 'HTTP 代理请求' },
      { path: '/gh/release', method: 'GET', description: 'drpy-node 最新 release' },
    ],
  },
  {
    category: 'Proxy Services',
    endpoints: [
      { path: '/unified-proxy/proxy', method: 'GET/HEAD', description: '统一智能代理（自动识别 m3u8/文件）' },
      { path: '/m3u8-proxy/playlist', method: 'GET', description: 'M3U8 播放列表代理' },
      { path: '/file-proxy/proxy', method: 'GET/HEAD', description: '远程文件代理' },
      { path: '/webdav/file', method: 'GET', description: 'WebDAV 文件代理' },
    ],
  },
  {
    category: 'Task & File',
    endpoints: [
      { path: '/tasks', method: 'GET', description: '列出定时任务' },
      { path: '/execute-now/:taskName?', method: 'GET', description: '立即执行定时任务' },
      { path: '/image/upload', method: 'POST', description: '上传图片（base64）' },
      { path: '/clipboard/add|/clipboard/read', method: 'POST/GET', description: '剪贴板' },
    ],
  },
  { category: 'Realtime', endpoints: [{ path: '/ws', method: 'GET', description: 'WebSocket（日志/状态）' }] },
];
