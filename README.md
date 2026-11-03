# Chromium Speculation Accelerator · 网页加速器

> 用 Chromium 原生的 **Speculation Rules API** 提前预渲染 / 预取你可能要点的下一个页面，让跳转几乎瞬间完成。
> 一个只做一件事的 Tampermonkey 用户脚本，零后台、零上报、零依赖。

### [⬇️ 安装 v6.7.0（推荐，新文件）](https://raw.githubusercontent.com/lhflowersbloom/chromium-speculation-accelerator/main/chromium156%e6%b5%8f%e8%a7%88%e5%99%a8%e5%8a%a0%e9%80%9f%e8%84%9a%e6%9c%ac.user.js)

<sub>历史版本 [v6.5.2](https://raw.githubusercontent.com/lhflowersbloom/chromium-speculation-accelerator/main/chromium155%e6%b5%8f%e8%a7%88%e5%99%a8%e5%8a%a0%e9%80%9f%e8%84%9a%e6%9c%ac.user.js) 仍保留在仓库中，不再更新。改动见 [CHANGELOG.md](CHANGELOG.md)。</sub>

![version](https://img.shields.io/badge/version-6.7.0-blue)
![platform](https://img.shields.io/badge/Chromium-155%2F156%2B-green)
![type](https://img.shields.io/badge/Tampermonkey-userscript-orange)
![license](https://img.shields.io/badge/license-MIT-lightgrey)

---

## ⚠️ 使用前必读

这几条是最容易「装了却感觉没用」或「反而出问题」的地方，先看再装。

1. **DNT / GPC 只约束跨域推测，同源预渲染照常工作**
   若浏览器上报 `navigator.doNotTrack === "1"` 或 `navigator.globalPrivacyControl === true`，
   说明有东西在替你发送「隐私退出」信号。来源按常见程度排序：

   - **其他 userscript / 隐私插件**。它们常用 `@match *://*/*` 全局生效，且能改写
     `navigator` 属性、甚至通过 `@webRequest` 注入 `DNT` / `Sec-GPC` 请求头，
     伪装得像浏览器自带的一样，非常容易被忽略。（实测「Don't track me Google」就是如此。）
   - **Chrome 自带的「请勿跟踪」**。它不在顶层菜单，旧版本位于
     *隐私和安全 → 第三方 Cookie* 页面**底部**，新版可能已移除。
   - **广告拦截 / 隐私代理软件**。

   从 **v6.7.0** 起：
   - **跨域 Prefetch** 会向第三方站点发起真实请求，因此**尊重**隐私信号 → 被跳过
   - **同源 Prerender** 只在你自己已登录的站内预渲染，不向任何第三方共享数据 → **不受影响**

   也就是说，默认配置下你依然能用上站内跳转的加速，只是外站链接不做预取。
   想要连跨域一起启用，在「加速器设置」里取消勾选「跨域推测尊重 DNT / GPC」。

   **自查**：F12 控制台执行一行

   ```js
   navigator.doNotTrack, navigator.globalPrivacyControl
   ```

   两项都是 `null` / `undefined` 说明没有信号，同源 + 跨域规则都会启用；
   任一为 `1` / `true` 时，逐个禁用其他 userscript 往往是找出真凶最快的办法。

2. **新旧两版不会并存**
   两个脚本的 `@name` 完全相同，Tampermonkey 视为**同一个脚本**：安装新版 = 升级旧版，
   设置会被继承，不会出现两份规则同时注入。请不要手动改名来强行并存。

3. **跨域 Prefetch 用你的真实 IP**
   跨域预取会真实请求外部站点的主文档（不带匿名代理）。介意的话在面板关掉「跨域 Prefetch」。

4. **带副作用的链接必须排除**
   `prerender` 会**真实执行目标页面的脚本**，`prefetch` 也是真实 GET 请求。
   登出、加入购物车、删除、支付、一次性 `token` 链接都不能被推测。默认关键词表已覆盖常见情况，
   遇到自家站点的奇怪 URL 设计请自行加进「排除关键词」。

5. **严格 CSP 的站点可能拦掉规则**
   规则通过 `<script type="speculationrules">` 注入，受 `script-src` 管。
   脚本会复用页面的 nonce；若站点既没有 nonce、也没启用 `'inline-speculation-rules'`，规则会被拦截。
   验证入口：**DevTools → Application → Speculative loads**。

6. **文件名里的 156 只是发布批次**
   `chromium156浏览器加速脚本.user.js` 面向 Chrome 156 时代发布，接口与 155 相同，**155 及以上都能用**。
   脚本启动时会自行检测 `HTMLScriptElement.supports('speculationrules')`，不支持就直接退出，不报错刷屏。

---

## 这是什么

浏览器其实早就内置了「猜你下一步要点哪」的能力：**Speculation Rules API**。
页面只需要声明一段规则，浏览器就会在空闲时把候选链接提前下载（prefetch）甚至整页渲染（prerender）。等你真的点下去时，页面已经准备好了。

问题在于：几乎没有人会在自己的网站上写这段规则，而浏览器也不会替你写。

这个脚本做的事就是——**以用户脚本的身份，为所有网站补上这段规则**。不是代理，不是加速器插件，不改任何网络流量，只是把这个原生能力打开。

```
鼠标还在链接上 → 浏览器开始 prerender → 你点下去 → 页面已经在了
```

---

## 特性

| | 说明 |
|---|---|
| 🚀 **同源预渲染** | 站内链接使用 `prerender`，整页提前渲染，跳转体感接近 0ms |
| 🌐 **跨域预取** | 外站链接使用 `prefetch`，只拉文档不执行脚本，成本更低 |
| 🎚 **三档强度** | `conservative` / `moderate`（推荐）/ `eager`，由你决定要多激进 |
| 🛡 **安全排除** | 自动跳过 `target="_blank"`、`download`、`nofollow`、下载文件、页内锚点 |
| 🚫 **关键词排除** | 默认排除 `logout` `login` `cart` `checkout` `oauth` `token` 等危险路径，可自定义 |
| 📋 **域名黑名单** | 支持 `example.com`、`*.example.com`、完整 URL 三种写法，一行一个 |
| 🙈 **隐私信号分离处理** | 跨域预取尊重 DNT / GPC，同源预渲染不受影响 |
| 🖥 **桌面限定** | 仅在 `hover: hover` + `pointer: fine` 的设备上启用，手机/平板不浪费流量 |
| 🧩 **严格 CSP 兼容** | 复用页面 nonce 注入规则，尽量绕开 `script-src` 拦截 |
| ⚙️ **可视化面板** | 原生 `<dialog>` + Shadow DOM，深色模式自适应，不用手改代码 |
| 🔒 **零外部依赖** | 不加载任何 CDN、不上报任何数据 |

---

## 安装

1. 先装 [Tampermonkey](https://www.tampermonkey.net/)（Violentmonkey 亦可）。
2. **点这个直链 →** [`chromium156浏览器加速脚本.user.js`（v6.7.0）](https://raw.githubusercontent.com/lhflowersbloom/chromium-speculation-accelerator/main/chromium156%e6%b5%8f%e8%a7%88%e5%99%a8%e5%8a%a0%e9%80%9f%e8%84%9a%e6%9c%ac.user.js)
   Tampermonkey 会**直接弹出安装确认页**，确认即可。
3. 完事。打开任意网页按 F12，控制台应出现 `[网页加速器] Speculation Rules 已提交。`

> **为什么用上面这个直链？** Tampermonkey 靠 URL 末尾的 `.user.js` 识别用户脚本。
> 走 GitHub 文件页（网址是 `/blob/...`）再点右上角 **Raw** 当然也能装，但那是两步；
> 上面的 raw 直链**点一下就是安装页**。

<details>
<summary>我还想装回旧版 6.5.2</summary>

旧文件一直留在仓库里，直链：

```
https://raw.githubusercontent.com/lhflowersbloom/chromium-speculation-accelerator/main/chromium155浏览器加速脚本.user.js
```

注意旧版存在「首页/目录页同源预渲染静默失效」的问题（见 [CHANGELOG.md](CHANGELOG.md)），
仅建议用于对照排查。
</details>

---

## 更新

**6.6.0 起，更新源指向新文件**，脚本头里已经写好，不用你操心：

```js
// @name         网页加速器 (Chromium 155+ Desktop)
// @version      6.7.0
// @updateURL    https://raw.githubusercontent.com/lhflowersbloom/chromium-speculation-accelerator/main/chromium156浏览器加速脚本.user.js
// @downloadURL  同上
```

只要这个文件的 **`@version` 变大**，Tampermonkey 例行检查时就会提示更新。

- 例行检查频率在 Tampermonkey 设置里可调（默认按天级别）；想立刻检查就点
  Tampermonkey 面板 → 该脚本 → **检查更新**。
- Tampermonkey **只认 `@version`**：改了代码但版本号没往上加 = 不会提示更新。
  这是「为什么它不提醒我」最常见的原因。
- **从 6.5.2 升到 6.6.0 需要手动装一次**：6.5.2 的 `@updateURL` 指向的是旧文件，
  它不会知道新文件的存在。装过一次之后，后续更新就自动走新文件了。
- 更新源指向 `raw.githubusercontent.com`，GitHub 的 raw 缓存只有 5 分钟，
  所以提交后几分钟内就能拉到新版（比 jsDelivr 那种 12 小时缓存快得多）。
- 脚本名（`@name`）里**故意不带版本号**，版本只写在 `@version` 这一行。
  这样以后改名、调描述都不会动到 Tampermonkey 的脚本身份。

---

## 使用

安装后无需配置即可生效。打开任意网页，按 F12 看控制台应该能看到：

```
[网页加速器] Speculation Rules 已提交。 {prerender: [...], prefetch: [...]}
```

要调整行为，点 Tampermonkey 图标 → 菜单里有三项：

| 菜单项 | 作用 |
|---|---|
| 🚀 / ⛔ **网页加速器：已启用/已关闭** | 一键开关（会重载当前页） |
| ⚙️ **加速器设置** | 打开设置面板：开关、强度、排除域名、排除关键词 |
| 📊 **查看运行状态** | 弹窗显示规则是否注入、实际 nonce、当前生效的排除模式 |

「恢复默认」按钮已经挪进设置面板底部。

### 设置项

- **启用加速** — 总开关。
- **跨域推测尊重 DNT / GPC** — 浏览器发出隐私信号时跳过**跨域 Prefetch**；同源 Prerender 不受影响。
- **同源 Prerender** — 是否整页预渲染站内链接。
- **跨域 Prefetch** — 是否对外站链接做预取。关掉可以省流量、也不暴露真实 IP。
- **跨域要求匿名客户端 IP** — 默认关闭。开启后若环境拿不到匿名 IP，**整条跨域规则会失效**（见下文 v6.5 说明）。
- **允许含参链接** — 关掉后，带 `?query` 的链接一律不推测（有些站点的参数会触发副作用）。
- **新标签页预渲染（实验性）** — 对 `target="_blank"` 链接声明 `target_hint: "_blank"`。
  浏览器不支持该字段时会静默无效，不影响其他规则。
- **推测强度** — 想更省就用 `conservative`，想更快就用 `eager`。**建议保持 `moderate`**。
- **排除域名 / 排除关键词** — 一行一个。域名支持 `example.com`、`.example.com`、`*.example.com`、`https://example.com/path`。

> 浏览器仍然保有最终决策权：内存不足、网络是流量计费、电池模式等情况下，Chrome 会自行降级或忽略规则。这是预期行为。

---

## 工作原理

脚本以 `document-start` 时机运行，向 `<head>` 注入一个 `type="speculationrules"` 的 `<script>`：

```json
{
  "prerender": [{
    "where": { "and": [
      { "href_matches": "/*" },
      { "not": { "href_matches": "/当前路径#*" } },
      { "not": { "selector_matches": "[target=\"_blank\" i], [download], ..." } }
    ]},
    "eagerness": "moderate"
  }],
  "prefetch": [{
    "where": { "and": [
      { "href_matches": "https://*/*" },
      { "not": { "href_matches": "/*" } }
    ]},
    "eagerness": "moderate"
  }]
}
```

几个实现上的细节：

- **排除规则用 `selector_matches`，不用 `href_matches` 拼正则**。CSS 属性选择器天然支持大小写不敏感（`i` 标志），能同时匹配 `?`、`&` 紧跟扩展名的情况，比正则好写也好读。
- **跨域规则不能复用相对路径**。`href_matches: '/*'` 是相对当前源解析的，所以判定「跨域」要显式写成 `https://*/*` 再减去 `/*`。
- **域名黑名单会展开成两条 `not`**（域名本身 + 任意子域），拼接前经过严格规范化，拒绝任何含 `/ \ 空格 ? #` 的输入，避免把设置面板里的脏数据拼进规则导致整段失效。
- **`document-start` 时可能还没有 `head` 或 `documentElement`**，所以注入走 `MutationObserver` 兜底，DOM 一出现就补上。
- **URL Pattern 里的模式必须先转义再拼**。路径中成对的 `(` `)` 会被当成正则分组，不成对的直接抛错，
  而一个非法模式会让浏览器**丢掉整条规则**。所以 pathname 走转义 + `new URLPattern()` 预校验。

### v6.6 修复了什么

旧版为了「排除带锚点的链接」写了 `{ not: { href_matches: "**/*#*" } }`，实际上有两处错误：
`**/*` 是相对**当前目录**解析的，`#*` 里的 `*` 又**连空 hash 都匹配**。
于是它在根路径上排除了几乎所有同源链接，导致首屏的 `prerender` 一条都不触发。

实测（Chrome 156，同源可预渲染目标数）：

| 当前页 | 6.5.2 | 6.6.0 |
|---|---|---|
| `/`（首页） | **0（全灭）** | 全部覆盖 |
| `/blog/post` | 丢失 `/blog/a`、`/blog/post2` | 全部覆盖 |
| `/wiki/Foo_(bar` | 模式非法，整条规则被丢弃 | 正常 |

现在改为：只排除「当前页 + 锚点」，并且对 pathname 做转义与预校验。

### v6.7 的变化：隐私信号只约束跨域

两类推测的性质不同，不该用同一把锁：

| 推测类型 | 是否向第三方发请求 | 是否共享数据 | 对 DNT / GPC 的响应 |
|---|---|---|---|
| 同源 Prerender | 否，只请求当前站点 | 否 | **不受影响** |
| 跨域 Prefetch | **是**，真实请求目标站点 | **是**（真实 IP + Referer） | **跳过** |

GPC 表达的是「不要出售或共享我的个人信息」。同源预渲染只是在你已经登录的站点内部提前渲染，
并没有把数据交给第三方，因此不该被它拦下。而现实中替你发这个信号的东西不少
（其他 userscript、隐私插件、拦截软件），若坚持用 GPC 关掉一切，脚本很容易变成"装了等于没装"。

### v6.5 的变化：拿掉 `anonymous-client-ip-when-cross-origin`

旧版本给跨域规则声明了：

```json
"requires": ["anonymous-client-ip-when-cross-origin"]
```

本意是隐私友好——通过 Google 的匿名化代理 IP 去预取，目标站看不到你的真实 IP。

**实测（Chrome 155）这个声明是个硬门槛**：只要当前环境拿不到匿名客户端 IP（ACI），**整条 `prefetch` 规则会被直接判定为不可用**，跨域推测一次都不触发。而 ACI 在大量网络环境下本来就不满足——结果就是「默认开启的跨域 Prefetch」全程静默失效，还很难排查。

v6.5 去掉该声明后，跨域 Prefetch 立即恢复工作。v6.6 把它保留为一个**默认关闭**的开关，需要时再打开。

> ⚠️ **代价**：预取请求会带着你的真实 IP 访问目标站点。如果不能接受，请在设置里关掉「跨域 HTTPS Prefetch」。

---

## 版本记录

完整说明见 [CHANGELOG.md](CHANGELOG.md)。

| 版本 | 文件 | 要点 |
|---|---|---|
| **6.7.0** | `chromium156浏览器加速脚本.user.js` | 隐私信号改为只约束跨域 Prefetch，同源 Prerender 不再被整体关停；面板/状态文案同步 |
| 6.6.1 | 同上 | DNT / GPC 触发时不再静默：控制台提示 + 状态面板给出处理方式；文档订正「请勿跟踪」开关的真实位置 |
| 6.6.0 | 同上 | 修复同源预渲染静默失效、修复特殊字符路径导致整条规则被丢弃；注入提前 + nonce 补注；零 CDN 面板；新增 `_blank` 预渲染（实验） |
| 6.5.2 | `chromium155浏览器加速脚本.user.js` | 强化排除规则与域名黑名单；SweetAlert2 面板（🗄 保留，停止维护） |
| 6.5 | 同上 | 去掉 `anonymous-client-ip-when-cross-origin` 硬门槛，跨域预取才真正生效 |

---

## 兼容性

| 环境 | 状态 |
|---|---|
| Chrome / Edge / Brave / Vivaldi 155/156+ 桌面版 | ✅ 完整支持 |
| Chromium 内核但版本 < 155 | ⚠️ 视具体实现，脚本会自动检测并退出 |
| Firefox / Safari | ❌ 不支持（无 Speculation Rules API） |
| 手机 / 平板 | ❌ 主动跳过（非精确指针设备） |

---

## 已知限制

- **跨域 prefetch 会消耗流量，且用真实 IP**。它只下载文档，不执行脚本、不渲染，但确实是真实的网络请求。流量敏感场景建议关掉。
- **带副作用的链接是主要风险**。任何「点一下就会改变服务端状态」的 GET 链接（登出、加购物车、删除、支付）都不该被推测。默认关键词表已覆盖常见情况，但如果你常逛的站有奇怪的 URL 设计，请自行加进排除关键词。
- **prerender 有内存成本**。`eager` 档在链接密集的页面上可能同时渲染多个页面，低配机器请用 `moderate`。Chrome 桌面版同时最多保留 2 个 prerender（FIFO）。
- **无法覆盖 `history.pushState` 驱动的 SPA 路由**。这是 Speculation Rules 的固有边界，不是脚本的问题。
- **严格 CSP 且无 nonce 的站点无法注入规则**，这是浏览器的安全设计。

---

## 文件

```
chromium156浏览器加速脚本.user.js   # 当前版本 v6.7.0（单文件，约 1020 行）
chromium155浏览器加速脚本.user.js   # 历史版本 v6.5.2（原样保留，不再更新）
CHANGELOG.md                        # 更新日志
README.md                           # 本文件
```

---

## 致谢

脚本初版 syhyz1990 经**OpenAI** 与 **Gemini** 协作产出，后续经人工迭代与实测修正。

## 许可

MIT
