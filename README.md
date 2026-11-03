# Chromium Speculation Accelerator · 网页加速器

> 用 Chromium 原生的 **Speculation Rules API** 提前预渲染 / 预取你可能要点的下一个页面，让跳转几乎瞬间完成。
> 一个只做一件事的 Tampermonkey 用户脚本，零后台、零上报、零依赖。

### [⬇️ 安装 v6.8.0](https://raw.githubusercontent.com/lhflowersbloom/chromium-speculation-accelerator/main/chromium156%e6%b5%8f%e8%a7%88%e5%99%a8%e5%8a%a0%e9%80%9f%e8%84%9a%e6%9c%ac.user.js)

![version](https://img.shields.io/badge/version-6.8.0-blue)
![platform](https://img.shields.io/badge/Chromium-155%2F156%2B-green)
![type](https://img.shields.io/badge/Tampermonkey-userscript-orange)

---

## 这是什么

浏览器早就内置了「猜你下一步要点哪」的能力 —— **Speculation Rules API**：
页面声明一段规则，浏览器就会在你悬停链接时提前预渲染、甚至整页预载目标页面，
等你点下去时页面已经准备好了。

问题在于，几乎没人会在自己的网站上写这段规则。

这个脚本做的事就是：**以用户脚本的身份，替所有网站补上这段规则**。
不是代理、不改任何网络流量，只是把这个原生能力打开。

```
鼠标停在链接上 → 浏览器开始预渲染 → 你点下去 → 页面已经在眼前
```

## 特性

| | |
|---|---|
| 🚀 **同源预渲染** | 站内链接整页提前渲染，跳转体感接近 0ms |
| 🌐 **跨域预取** | 外站链接只拉文档、不执行脚本，成本更低 |
| 🎚 **三档强度** | `conservative` / `moderate`（推荐）/ `eager` |
| 🛡 **自动排除** | `target="_blank"`、`download`、`nofollow`、下载文件、页内锚点 |
| 🚫 **可自定义排除** | 关键词（`logout` `cart` `token`…）+ 域名黑名单，一行一个 |
| 🙈 **隐私信号分离** | 跨域预取尊重 DNT / GPC，同源预渲染不受影响 |
| 🖥 **仅桌面启用** | 手机 / 平板自动跳过，不浪费流量 |
| ⚙️ **可视化面板** | 原生 `<dialog>`，深色模式自适应，不用改代码 |
| 🔒 **零外部依赖** | 不加载任何 CDN、不上报任何数据 |

## 安装

1. 装 [Tampermonkey](https://www.tampermonkey.net/)（Violentmonkey 亦可）。
2. 点上面的安装直链，Tampermonkey 会直接弹出安装页，确认即可。
3. 打开任意网页按 F12，看到这行就说明生效了：

   ```
   [网页加速器] Speculation Rules 已提交。
   ```

> 直链末尾是 `.user.js`，Tampermonkey 靠它识别脚本，点一下就是安装页；
> 走 GitHub 文件页再点 Raw 也行，只是多一步。

**只装一个**：仓库里有新旧两个文件，同时安装会重复注入规则，请只启用其中一个。

<details>
<summary>我要装回旧版 v6.5.2</summary>

```
https://raw.githubusercontent.com/lhflowersbloom/chromium-speculation-accelerator/main/chromium155浏览器加速脚本.user.js
```

旧版存在「首页 / 目录页同源预渲染静默失效」的问题（见 [CHANGELOG.md](CHANGELOG.md)），仅建议用于对照排查。
</details>

## 使用

安装后无需配置。点油猴图标，菜单有三项：

| 菜单项 | 作用 |
|---|---|
| 🚀 / ⛔ **已启用 / 已关闭** | 一键开关（会重载当前页） |
| ⚙️ **加速器设置** | 开关、强度、排除域名、排除关键词 |
| 📊 **查看运行状态** | 规则是否注入、实际 nonce、当前版本与排除模式 |

常用设置：

| 设置项 | 说明 |
|---|---|
| 推测强度 | 想省就 `conservative`，想快就 `eager`，**默认 `moderate` 最稳** |
| 同源 Prerender | 站内整页预渲染，加速的主力 |
| 跨域 Prefetch | 外站预取；关掉可省流量、不暴露真实 IP |
| 跨域推测尊重 DNT / GPC | 有隐私信号时跳过跨域，同源不受影响 |
| 排除域名 / 关键词 | 一行一个；域名支持 `example.com`、`*.example.com`、完整 URL |

> 浏览器保有最终决策权：内存紧张、流量计费、电池模式下，Chrome 会自行降级甚至忽略规则。

## ⚠️ 几个必须知道的前提

1. **带副作用的链接别让它猜。**
   `prerender` 会**真实执行**目标页的脚本，`prefetch` 也是真实 GET 请求。
   登出、加购、删除、支付、一次性 `token` 链接都会被真的执行或消耗掉。
   默认关键词表已覆盖常见情况，遇到自家站点的特殊 URL 请加进「排除关键词」。

2. **跨域预取用你的真实 IP，并消耗流量。**
   介意就在面板里关掉「跨域 Prefetch」，站内加速不受影响。

3. **隐私信号只拦跨域。**
   若 `navigator.doNotTrack === "1"` 或 `globalPrivacyControl === true`，
   说明有别的东西在替你发这个信号（多半是另一个 userscript 或隐私插件，它们能改写 `navigator` 属性）。
   此时跨域预取被跳过，站内预渲染照常工作。自查：控制台执行 `navigator.doNotTrack`。

4. **严格 CSP 的站点可能拦掉规则。**
   规则由脚本注入，受 `script-src` 管；脚本会复用页面 nonce，
   若站点既无 nonce 也未启用 `'inline-speculation-rules'`，规则会被拦下。
   验证入口：**DevTools → Application → Speculative loads**。

## 兼容性

| 环境 | 状态 |
|---|---|
| Chrome / Edge / Brave / Vivaldi 155+ 桌面版 | ✅ 完整支持 |
| 其他 Chromium 内核且 < 155 | ⚠️ 脚本自动检测，不支持则静默退出 |
| Firefox / Safari | ❌ 无 Speculation Rules API |
| 手机 / 平板 | ❌ 主动跳过（非精确指针设备） |

文件名里的 `156` 只是**发布批次**，接口与 155 相同，155 及以上都能用。

## 已知限制

- **prerender 占内存**：Chrome 桌面端同时最多保留 2 个，FIFO 淘汰，低配机器建议留在 `moderate`。
- **覆盖不了 SPA 路由**：`history.pushState` 驱动的跳转不会被预测，这是 API 的边界。
- **无 nonce 的严格 CSP 站点无法注入**，属浏览器安全设计。

## 更新

Tampermonkey 按 `@updateURL` 自动检查（默认按天）；想立刻检查就点脚本 → **检查更新**。

它**只认 `@version`**：代码改了但版本号没往上加，就不会提示更新。
当前版本看设置面板标题，或「查看运行状态」第一行。

## 文件与版本

```
chromium156浏览器加速脚本.user.js   # 当前版本 v6.8.0，单文件约 1020 行
chromium155浏览器加速脚本.user.js   # 历史版本 v6.5.2，原样保留
CHANGELOG.md                        # 每个版本改了什么、为什么改
```

| 版本 | 要点 |
|---|---|
| **6.8.0** | 脚本名简化为「网页加速器」，版本号不再混进名字 |
| 6.7.0 | 隐私信号只约束跨域预取，同源预渲染不再被整体关停 |

完整历史、实现细节与实测数据见 **[CHANGELOG.md](CHANGELOG.md)**。

## 致谢

初版 syhyz1990 经 **OpenAI** 与 **Gemini** 协作产出，后续经人工迭代与实测修正。

## 许可

MIT
