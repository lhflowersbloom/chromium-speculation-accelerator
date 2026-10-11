# Chromium Speculation Accelerator · 网页加速器

> 用 Chromium 原生的 **Speculation Rules API** 提前预渲染 / 预取你可能要点的下一个页面，让跳转几乎瞬间完成。
> 一个只做一件事的 Tampermonkey 用户脚本，零后台、零上报、零依赖。

![version](https://img.shields.io/badge/version-6.5.0-blue)
![platform](https://img.shields.io/badge/Chromium-155%2B-green)
![type](https://img.shields.io/badge/Tampermonkey-userscript-orange)
![license](https://img.shields.io/badge/license-MIT-lightgrey)

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
| 🛡 **安全排除** | 自动跳过 `target="_blank"`、`download`、`nofollow`、下载文件、带 `#` 锚点的链接 |
| 🚫 **关键词排除** | 默认排除 `logout` `login` `pay` `cart` `checkout` `auth` 等危险路径，可自定义 |
| 📋 **域名黑名单** | 支持 `example.com`、`*.example.com`、完整 URL 三种写法，一行一个 |
| 🙈 **尊重 DNT** | 检测到 `DNT: 1` 时自动闭嘴 |
| 🖥 **桌面限定** | 仅在 `hover: hover` + `pointer: fine` 的设备上启用，手机/平板不浪费流量 |
| ⚙️ **可视化面板** | 油猴菜单里直接改设置，深色模式自适应，不用手改代码 |
| 🔒 **不联网** | 除 CDN 加载的 SweetAlert2 外，脚本不上报任何数据 |

---

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)（Violentmonkey 亦可）。
2. 打开本仓库的 [`chromium-speculation-accelerator.user.js`](./chromium-speculation-accelerator.user.js)。
3. 点右上角 **Raw**，Tampermonkey 会弹出安装页 → 确认安装。

> **要求 Chromium 155+**（Chrome / Edge / Brave / Vivaldi 等）。脚本启动时会自己检测
> `HTMLScriptElement.supports('speculationrules')`，不支持就直接退出，不会报错刷屏。

---

## 使用

安装后无需配置即可生效。打开任意网页，按 F12 看控制台应该能看到：

```
[网页加速器 v6.5] Speculation Rules 已提交。 {prerender: [...], prefetch: [...]}
```

要调整行为，点 Tampermonkey 图标 → 菜单里有三项：

| 菜单项 | 作用 |
|---|---|
| 🚀 / ⛔ **网页加速器：已启用/已关闭** | 一键开关（会重载当前页） |
| ⚙️ **加速器设置** | 打开设置面板：开关、强度、排除域名、排除关键词 |
| ♻️ **恢复默认设置** | 全部还原成默认值 |

### 设置项

- **启用加速** — 总开关。
- **尊重 DNT** — 浏览器开着「请勿跟踪」时自动停用推测加载。
- **跨域 HTTPS Prefetch** — 是否对外站链接做预取。关掉可以省流量。
- **允许含参链接** — 关掉后，带 `?query` 的链接一律不推测（有些站点的参数会触发副作用）。
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
      { "not": { "selector_matches": "a[target=\"_blank\" i], a[download], ..." } }
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

### v6.5 的变化：拿掉 `anonymous-client-ip-when-cross-origin`

旧版本给跨域规则声明了：

```json
"requires": ["anonymous-client-ip-when-cross-origin"]
```

本意是隐私友好——通过 Google 的匿名化代理 IP 去预取，目标站看不到你的真实 IP。

**实测（Chrome 155）这个声明是个硬门槛**：只要当前环境拿不到匿名客户端 IP（ACI），**整条 `prefetch` 规则会被直接判定为不可用**，跨域推测一次都不触发。而 ACI 在大量网络环境下本来就不满足——结果就是「默认开启的跨域 Prefetch」全程静默失效，还很难排查。

v6.5 去掉该声明后，跨域 Prefetch 立即恢复工作。

> ⚠️ **代价**：预取请求会带着你的真实 IP 访问目标站点。如果不能接受，请在设置里关掉「跨域 HTTPS Prefetch」。

---

## 兼容性

| 环境 | 状态 |
|---|---|
| Chrome / Edge / Brave / Vivaldi 155+ 桌面版 | ✅ 完整支持 |
| Chromium 内核但版本 < 155 | ⚠️ 视具体实现，脚本会自动检测并退出 |
| Firefox / Safari | ❌ 不支持（无 Speculation Rules API） |
| 手机 / 平板 | ❌ 主动跳过（非精确指针设备） |

---

## 已知限制

- **跨域 prefetch 会消耗流量**。它只下载文档，不执行脚本、不渲染，但确实是真实的网络请求。流量敏感场景建议关掉。
- **带副作用的链接是主要风险**。任何「点一下就会改变服务端状态」的 GET 链接（登出、加购物车、删除、支付）都不该被推测。默认关键词表已覆盖常见情况，但如果你常逛的站有奇怪的 URL 设计，请自行加进排除关键词。
- **prerender 有内存成本**。`eager` 档在链接密集的页面上可能同时渲染多个页面，低配机器请用 `moderate`。
- **无法覆盖 `history.pushState` 驱动的 SPA 路由**。这是 Speculation Rules 的固有边界，不是脚本的问题。

---

## 文件

```
chromium-speculation-accelerator.user.js   # 用户脚本本体（单文件，698 行）
README.md                                  # 本文件
```

---

## 致谢

脚本初版由 **OpenAI** 与 **Gemini** 协作产出，后续经人工迭代与实测修正。

## 许可

MIT
