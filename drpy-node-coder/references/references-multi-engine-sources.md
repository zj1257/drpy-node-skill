# 多引擎源（php / hipy / cat）修复与测试

> drpy-node 除 `ds`（drpy JS）外，还支持 `php`（PHP 采集）、`hipy`（Python）、`cat`（catvod JS）三种引擎。它们的源文件、运行机制、测试方法、改源生效方式都不同。本 reference 是修这三种源的**必读**，尤其记住两条最大坑：**①测试必须带 `extend` ②hipy 改源后要 kill daemon 重载**。

## 一、四引擎对照表

| 引擎 | do 参数 | 源目录 | 基类/运行机制 | 改源后生效方式 |
|---|---|---|---|---|
| ds | `do=ds` | `spider/js/*.js` | drpyS JS 引擎（每次读文件） | **直接生效** |
| php | `do=php` | `spider/php/*.php` | PHP（`lib/spider.php` 基类） | **直接生效**（PHP 每次解析） |
| hipy | `do=py` | `spider/py/*.py` | Python（`base/spider.py` 基类，走 **t4_daemon 常驻进程**） | **必须 kill t4_daemon 重载** |
| cat | `do=cat` | `spider/catvod/*.js` | Node catvod 引擎 | **直接生效** |

> 注意：`report.json` / 失效清单里 `hipy_py_xxx`、`php_xxx`、`catvod_xxx` 前缀就是这三种。它们**都有独立源文件**，不是"虚拟源不可改"。

## 二、测试 API（核心：必须带 extend）

```
http://localhost:5757/api/{源名}?do={ds|php|py|cat}&extend={ext}&pwd={api_pwd}
```

`api_pwd` 在 `config/env.json` 的 `api_pwd` 字段。`源名` 是 sites 配置里的 `name`（含 `[后缀]`），需 `encodeURIComponent`。

### 🛑 最大陷阱：不带 extend 会大批误判失效

hipy/php 的**模板源**（`AppFox.py` / `AppGet.py` / `AppSk.py` / `getapp3.4.4.py` 等被多站共用的模板）依赖 ext 配置 host/key。裸测（不带 extend）必报 `Invalid URL '/xxx'` 或 `KeyError 'host'`，误判整批源失效。

**测试前必须先取 ext**：拉订阅配置 `http://localhost:5757/config/1?sub=all&pwd=xxx`，sites 数组里每个源有 `ext` 字段。

ext 两种形态：
- **字符串**（直连 URL）：`extend=http://38.47.213.61:41271`
- **JSON 对象**：`extend={"host":"https://app.omofun1.top","key":"66dc309cbeeca454"}` —— 传参时 `JSON.stringify` 后 `encodeURIComponent`

```js
// 正确带 extend 重测示例
const ext = site.ext;                          // 从 sites 配置取
const extStr = typeof ext === 'object' ? JSON.stringify(ext) : String(ext);
const url = `${site.api}&extend=${encodeURIComponent(extStr)}`;
```

> 注：`apps/source-checker/index.html`（生成 report.json 的程序）实际**是带 extend 的**--它从 sites 配置的 `ext` 字段取（hipy/php 模板源 ext 由 config.js 从 `config/map.txt` SitesMap 填充）。report.json 里误判的根因是：① 快照过期（修复引擎后没重测）；② 引擎层 SSL/代理 bug；③ source-checker 自身曾有的 bug（fullCheck detail 用固定 ids=1、fetch timeout 不生效、历史报告丢 ext 等，2026-07-18 已修）。**自己复测时仍必须带 extend**，否则裸测模板源报 KeyError host。

## 三、hipy daemon 重载（改 hipy 源后必做）

hipy 走 `spider/py/core/t4_daemon.py` 常驻 Python 进程，**缓存已 import 的模块**。改 `base/spider.py` 或任何 `.py` 源后，daemon 仍持有旧 module，必须 kill 重启才生效（ds/cat 改了直接生效，无此问题）。

```bash
# 1. kill 旧 daemon（Windows PowerShell）
powershell -Command "Get-CimInstance Win32_Process -Filter \"name='python.exe'\" | Where-Object {\$_.CommandLine -like '*t4_daemon*'} | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }"

# 2a. 重启 drpy-node 服务（会自动 spawn 新 daemon）—— 推荐
# 2b. 或手动起 daemon（不碰 drpy-node 服务）
python spider/py/core/t4_daemon.py --pid-file t4_daemon.pid --log-file logs/daemon.log --host 127.0.0.1 --port 57570 &
```

> `kill_t4_daemon.sh`（`kill -9 $(pgrep -f t4_daemon)`）是 Linux 写法，Windows 用上面的 PowerShell。daemon 端口固定 `127.0.0.1:57570`（`utils/daemonManager.js` 配置）。

## 四、三种引擎写法要点

### php 源（`spider/php/xxx.php`）
```php
<?php
require_once __DIR__ . '/lib/spider.php';
class Spider extends BaseSpider {
    private $HOST = 'https://api.xxx.com';   // host 通常写死
    protected function getHeaders() { return ['User-Agent: okhttp/3.12.0', 'Content-Type: application/json']; }
    public function homeContent($filter) { /* 返回 ['class'=>[], 'filters'=>[]] */ }
    public function categoryContent($tid, $pg=1, $filter=[], $extend=[]) { /* 返回 $this->pageResult($videos,$pg,$total,$limit) */ }
    public function detailContent($ids) { /* 返回 ['list'=>[$vod]] */ }
    public function searchContent($key, $quick=false, $pg=1) { /* 同 category */ }
    public function playerContent($flag, $id, $vipFlags=[]) { /* 返回 ['parse'=>0,'url'=>..,'header'=>..] */ }
}
(new Spider())->run();
```
基类 `lib/spider.php` 提供 `fetch`/`post`/`pageResult`/`pdfa`/`pdfh`。方法名是 `homeContent/categoryContent/...`（与 hipy 同），返回 PHP 关联数组。

### hipy 源（`spider/py/xxx.py`）
```python
import json
from base.spider import BaseSpider
class Spider(BaseSpider):
    def init(self, extend=""):
        ext = json.loads(self.extend.strip())   # ext 从 self.extend 读
        self.host = ext['host']
        self.key = ext.get('key')
    def homeContent(self, filter): ...           # 返回 {'class':[], 'filters':{}}
    def categoryContent(self, tid, pg, filter, extend): ...
    def detailContent(self, ids): ...
    def searchContent(self, key, quick, pg='1'): ...
    def playerContent(self, flag, id, vipFlags): ...
```
基类 `base/spider.py` 提供 `fetch`/`post`/`postJson`（**默认 `verify=False, proxies={}`**）/`md5`/`aes_cbc_decode`/`rsa_private_decode` 等。`self.extend` 是请求传入的 ext 字符串。模板源（AppFox/AppGet/AppSk/getapp3.4.4）被多站共用，靠 ext 区分 host/key——改模板会同时影响所有派生源。

### cat 源（`spider/catvod/xxx.js`）
```js
import {Crypto} from 'assets://js/lib/cat.js';
var HOST;
async function init(cfg) { HOST = (cfg.ext?.host?.trim() || 'https://默认').replace(/\/$/,''); }
async function home(filter) { return JSON.stringify({class:[...], filters:{...}}); }
async function homeVod() { /* 首页推荐 */ }
async function category(tid, pg, filter, extend) { /* 返回 JSON.stringify({list,page,pagecount,limit,total}) */ }
async function detail(ids) { /* ids 是 "id@name@pic@desc" 字符串，返回 {list:[VOD]} */ }
async function search(wd, quick, pg) { ... }
async function play(flag, ids, flags) { /* 返回 {jx,parse,url,header} */ }
export function __jsEvalReturn() { return {init, home, homeVod, category, search, detail, play, proxy: null}; }
```
cat 源用 `pdfa`/`pdfh`/`pd`/`cutStr`/`req`/`request`（catvod 注入）。home/category 等返回 **JSON.stringify** 的字符串。`vod_id` 常用 `id@name@pic@desc` 复合格式，detail 里 `ids.split('@')` 拆。

## 五、常见错误诊断表（hipy 重点）

| 错误信息 | 根因 | 修复 |
|---|---|---|
| `SSLError(SSLCertVerificationError)` | requests 默认验证证书，站证书有问题 | 用 `verify=False`（base 已默认 False；自建 `requests.Session` 要 `session.verify=False` 且 `session.get(..., verify=False)` 双保险）|
| `HTTPConnectionPool(host='127.0.0.1', port=7890)` | Windows **系统代理**拦截 http 请求（非环境变量，`trust_env` 读系统代理）| 用 `proxies={}`（base 已默认）；或环境无 HTTP_PROXY 时查系统代理设置 |
| `HTTPSConnectionPool(host='xxx', port=443) Max retries` | 连接超时/SSL/站慢 | 看 `Caused by`：SSL 用 verify=False；timeout 是站慢/墙 |
| `Invalid URL '/xxx'` / `KeyError 'host'` | ext 没传或 host 没取到 | 测试带 extend；查 init 的 gethost 逻辑（ext host 是 txt 外链时要 fetch 取真实 host）|
| `Expecting value: line 1 column 1` | host 返回非 JSON（HTML/空）| host 改版/失效，fetch host 看实际返回，逆向新 API 或跳过 |
| `Extra data: line 1 column 5` | 返回多个 JSON 拼接 | 同上，host 返回异常 |
| `string indices must be integers` | 解析逻辑对字符串取下标（数据格式非预期）| 加 `isinstance(x, dict)` 容错；根因多是 host 数据变了 |
| `Document is empty` | lxml 解析空响应 | host 返回空，验 host |

## 六、修复决策（什么能改源修，什么跳过）

**能改源修**：
- SSL/代理问题 → base 默认 verify=False/proxies={} 已覆盖；自建 session 的源单独加
- 解析 bug（string indices 等）→ 加容错
- home 选择器过时（cat/ds）→ fetch 站点看新 DOM 改选择器

**跳过（非源 bug）**：
- host 死（socket hang up / ECONNRESET / 404 / 508 限流）→ 站点层面，改源无用
- host 改版 API 变（404 page not found）→ 需逆向新接口，成本高，单独评估
- ext host 是外链 txt 且 txt 已失效（404/403）→ 配置失效
- 区域限制（403 不支持当前区域）/ CF 防护（TLS handshake 断）→ 非 source 可解
- Emby/网盘源依赖运行时 ENV（quark_cookie 等）→ 需真实服务实测

## 七、本轮（2026-07）实战经验

- 改 `base/spider.py` 的 `fetch`/`post`/`postJson` 默认 `verify=False` + `proxies={}`：**一次修复 14 个 hipy 源**（SSL 证书 + Windows 系统代理问题）。这是框架级合理默认（爬虫直连、不验证证书），对正常源无副作用。
- `剧透社[盘].py` 自建 `requests.Session`，`session.verify=False` 属性在某些情况不生效，需 `session.get(..., verify=False)` 显式传参。
- hipy 模板源（AppFox/AppGet/AppSk/getapp3.4.4）多站共用，改一个模板修复所有派生源；反之一个 ext host 失效会挂掉所有用该模板的源。
- 大量 hipy/php 失效源是 host 死/改版（如 ldys.sq1005.top 403、99.jl8.top/1.txt 404、qkfqapi.vv9v.cn API 全 404），非源 bug，逐个验 host 后跳过。
- `report.json` 是快照，状态会变；source-checker 本身带 extend，但旧快照 + 引擎 SSL/代理 bug 曾致失效数虚高（2026-07-18 已修引擎 + source-checker）。修源前建议重新跑一遍检测拿最新清单。
