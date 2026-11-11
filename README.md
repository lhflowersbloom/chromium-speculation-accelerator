# Chromium Speculation Accelerator · 网页加速器

> 用 Chromium 原生的 **Speculation Rules API** 预渲染 / 预取下一个可能访问的页面，让站内跳转几乎无需等待。
> 一个只做这件事的 Tampermonkey 用户脚本：无后台、无上报、无外部依赖。

### [⬇️ 安装 v6.8.4](https://raw.githubusercontent.com/lhflowersbloom/chromium-speculation-accelerator/main/chromium158%e6%b5%8f%e8%a7%88%e5%99%a8%e5%8a%a0%e9%80%9f%e8%84%9a%e6%9c%ac.user.js)

![version](https://img.shields.io/badge/version-6.8.4-blue)
![platform](https://img.shields.io/badge/Chromium-122%2B-green)
![type](https://img.shields.io/badge/Tampermonkey-userscript-orange)

原理、特性表、兼容性与常见问题，也在[介绍页](https://lhflowersbloom.github.io/chromium-speculation-accelerator/)上有一份图文版。

---

## 这是什么

Chromium 自带一种「提前准备下一个页面」的能力：页面声明一段 JSON 规则，浏览器便会按规则预取文档、甚至整页渲染，用户点击时目标页已经就绪。

愿意在站点上写这段规则的网站并不多。

这个脚本只做一件事：**以用户脚本的形式，替所有网站补上这段规则**。它不代理流量、不改动请求，只是把这个原生能力打开。

```
指针悬停在链接上 → 浏览器预渲染目标页 → 点击 → 页面即刻呈现
```

## 特性

| | |
|---|---|
| **同源预渲染** | 站内链接整页预渲染，跳转几乎瞬时完成 |
| **跨域预取** | 外站仅取文档、不执行脚本，开销更低 |
| **三档强度** | `conservative` / `moderate`（默认）/ `eager` |
| **自动排除** | `download`、`nofollow`、下载包与图片直链、页内锚点、副作用链接 |
| **自定义排除** | 关键词（`logout`、`cart`、`token`…）与域名黑名单，一行一条 |
| **隐私信号分离** | DNT / GPC 仅约束跨域预取，同源预渲染不受影响 |
| **仅桌面启用** | 触屏设备自动跳过，避免无谓流量 |
| **零外部依赖** | 不加载 CDN、不上报数据；设置面板为原生 `<dialog>` |

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)（Violentmonkey 亦可）。
2. 点击上方安装链接，在扩展中确认。
3. 打开任意网页，控制台出现下面这行即表示生效：

   ```
   [网页加速器] Speculation Rules 已提交。
   ```

> `.user.js` 结尾的直链会被 Tampermonkey 识别为安装请求；从 GitHub 文件页点 Raw 亦可，只是多一步。

**只启用一个。** 仓库保留了多个版本的文件，同时启用会重复注入规则。

> **从 6.8.3 及更早升级**：6.8.4 更换了 `@namespace`（`@namespace + @name` 共同构成脚本 ID），
> 会被 Tampermonkey 识别为**新脚本**，需手动安装一次。
> 安装前请复制「排除域名 / 排除关键词」两栏内容，装完粘回；随后禁用旧的条目即可（不必删除）。

<details>
<summary>需要回到旧版 v6.5.2</summary>

```
https://raw.githubusercontent.com/lhflowersbloom/chromium-speculation-accelerator/main/chromium155浏览器加速脚本.user.js
```

该版本存在「首页 / 目录页同源预渲染静默失效」的问题（见 [CHANGELOG.md](CHANGELOG.md)），仅建议用于对照排查。
</details>

## 使用

安装后无需配置。点击 Tampermonkey 图标，菜单提供三项：

| 菜单项 | 作用 |
|---|---|
| **已启用 / 已关闭** | 一键开关，会重载当前页 |
| **加速器设置** | 开关、强度、排除域名、排除关键词 |
| **查看运行状态** | 规则是否注入、是否被 CSP 拦截、当前 nonce 与排除模式 |

常用设置：

| 设置项 | 说明 |
|---|---|
| 推测强度 | 省流量选 `conservative`，追求速度选 `eager`；**默认 `moderate` 最稳** |
| 同源 Prerender | 站内整页预渲染，加速主力 |
| 跨域 Prefetch | 外站预取；关闭可省流量、不暴露真实 IP |
| 跨域推测尊重 DNT / GPC | 有隐私信号时跳过跨域，同源不受影响 |
| 排除域名 / 关键词 | 一行一条；域名支持 `example.com`、`*.example.com` 或完整 URL |

> 浏览器保有最终决策权：内存紧张、启用省流量模式或电量过低时，Chrome 会自行降低推测强度甚至忽略规则。

## 注意事项

1. **带副作用的链接不能被推测。**
   预渲染会真实执行目标页脚本，预取也是真实的 GET 请求。登出、加购、删除、支付、一次性 token 类链接都会被真的执行或消耗。默认关键词表覆盖了常见情况，站点特殊路径请自行补进「排除关键词」。

2. **跨域预取使用真实 IP，并消耗流量。**
   介意可在面板中关闭「跨域 Prefetch」，站内加速不受影响；或开启「跨域要求匿名客户端 IP」，由浏览器经代理转发（环境不支持时该规则会整体失效）。

3. **隐私信号只拦跨域。**
   若 `navigator.doNotTrack === "1"` 或 `globalPrivacyControl === true`，通常说明有其他扩展或脚本在代发该信号。此时跨域预取被跳过，站内预渲染照常工作。自查：控制台执行 `navigator.doNotTrack`。

4. **严格 CSP 的站点可能拦掉规则。**
   规则由脚本注入，受 `script-src` 约束；脚本会复用页面 nonce，设置面板样式同样复用。若站点既无 nonce 也未启用 `'inline-speculation-rules'`，规则会被拦下，「查看运行状态」中会标出。验证入口：**DevTools → Application → Speculative loads**。

## 兼容性

| 环境 | 状态 |
|---|---|
| Chromium **122+** 桌面版（Chrome / Edge / Brave / Vivaldi 等） | ✅ 完整支持 |
| Chromium 121 | ⚠️ 多数场景可用：`where` 与 `eagerness` 自 121 引入，但脚本省略的 `source` 键要到 122 才保证可推断 |
| Chromium 109–120 | ⚠️ 会注入规则，但 `where` / `eagerness` 尚未支持，整条规则被浏览器丢弃（控制台可见解析错误） |
| Chromium ≤ 108 | ❌ `HTMLScriptElement.supports('speculationrules')` 为 false，脚本静默退出 |
| Firefox / Safari | ❌ 无 Speculation Rules API |
| 手机 / 平板 | ❌ 主动跳过（非精确指针设备） |

文件名中的 `157` 是**发布批次**，不是版本要求；实际门槛由所用 API 决定，即上表的 122。

## 已知限制

- **预渲染占用内存**：`moderate` / `conservative` 下 Chrome 同时最多保留 2 个，FIFO 淘汰，低配机器建议保持默认强度。
- **覆盖不了 SPA 路由**：`history.pushState` 驱动的软导航不在 API 范围内，脚本只能在地址变化时刷新排除模式，无法让这类站点受益。
- **无 nonce 的严格 CSP 站点无法注入**，属浏览器安全设计。

## 更新

Tampermonkey 按 `@updateURL` 自动检查（默认每日一次）；需要立即检查时，点击脚本条目 → **检查更新**。

它**只认 `@version`**：改了代码但没有提升版本号，不会提示更新。当前版本可在设置面板标题或「查看运行状态」首行确认。

> 6.8.4 起 `@updateURL` 指向 `chromium158浏览器加速脚本.user.js`，与安装地址一致，后续版本可直接推送。
> 6.8.0 那版的地址指向 `chromium156…`，这也是它收不到后续版本更新的原因。

## 文件与版本

```
chromium158浏览器加速脚本.user.js   # 当前版本 v6.8.4，约 1230 行
chromium157浏览器加速脚本.user.js   # 上一版 v6.8.3，原样保留
chromium156浏览器加速脚本.user.js   # v6.8.0，原样保留
chromium155浏览器加速脚本.user.js   # 历史版本 v6.5.2，原样保留
CHANGELOG.md                        # 每个版本改了什么、为什么改
docs/                               # 介绍页（GitHub Pages）
```

| 版本 | 要点 |
|---|---|
| **6.8.4** | `@namespace` 改为仓库地址、补 `@homepageURL` / `@supportURL`、订正 `@author` |
| 6.8.3 | 跨域预取不再排除 `target="_blank"`；面板样式复用 nonce；更新地址指向新文件 |
| 6.8.0 | 脚本名简化为「网页加速器」，版本号不再混进名字 |
| 6.7.0 | 隐私信号只约束跨域预取，同源预渲染不再被整体关停 |

完整历史与实现细节见 **[CHANGELOG.md](CHANGELOG.md)**。

## 致谢

初版来自 [syhyz1990/instantpage](https://github.com/syhyz1990/instantpage)。

后续改进由 **ChatGPT** 与 **DeepSeek** 经 **WorkBuddy** 协作完成，包含规则安全性核查与逐版本实测校验。

## 许可

MIT
