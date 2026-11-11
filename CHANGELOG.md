# 更新日志

本文件记录每个版本改了什么、为什么改。

约定：**旧版本脚本文件一律保留、不再改动**；新版本以新增文件的形式发布，
这样任何时候都能回退到上一个可用版本。

| 版本 | 文件 | 状态 |
|---|---|---|
| 6.8.4 | `chromium158浏览器加速脚本.user.js` | ✅ 当前推荐 |
| 6.8.3 | `chromium157浏览器加速脚本.user.js` | 🗄 保留（上一版，未改动） |
| 6.8.0 | `chromium156浏览器加速脚本.user.js` | 🗄 保留（上一版，未改动） |
| 6.7.0 / 6.6.x | 同上 | 已被 6.8.0 覆盖 |
| 6.5.2 | `chromium155浏览器加速脚本.user.js` | 🗄 保留（历史版本，停止维护） |

---

## 6.8.4 — 2026-11-11

> 主题：把脚本元数据规范化。**没有任何运行逻辑改动**，规则生成、排除表、设置面板与 6.8.3 完全一致。

### 变更

- **`@namespace` 从 Tampermonkey 默认占位改为仓库地址**

  原值是 `https://tampermonkey.net/` —— 这是新建脚本时 Tampermonkey 填的模板值，大量脚本都沿用它。
  `@namespace` 与 `@name` 共同构成脚本 ID，占位值意味着身份不唯一，也容易与别的脚本撞。
  现改为 `https://github.com/lhflowersbloom/chromium-speculation-accelerator`。

  **代价**：脚本 ID 变了，Tampermonkey 会把它当成一个新脚本，升级需手动安装一次
  （见 README「从 6.8.3 及更早升级」）。

- **新增 `@homepageURL` 与 `@supportURL`**

  `@homepageURL` 指向介绍页，`@supportURL` 指向仓库 issues。装完之后 Tampermonkey 的脚本详情页
  会直接给出这两个入口，用户不必再去猜作者把说明写在哪儿。

- **订正 `@author`**

  原值 `ChatGPT & Gemini` 与 README 致谢（ChatGPT 与 DeepSeek）不一致，按 README 统一为
  `ChatGPT & DeepSeek`。

---

## 6.8.3 — 2026-11-10

> 主题：把跨域预取从排除清单里解放出来，顺手补两个健壮性缺口。

### 变更

- **跨域 Prefetch 不再排除 `target="_blank"` 链接**（本版最大的行为变化）

  原先 `buildExcludeSelectors()` 默认把 `target="_blank"` 塞进排除表，预渲染和预取共用同一份。
  对预渲染这没错 —— 预渲染结果绑在当前标签上，新标签打开无法复用。
  但预取只是把响应写进 HTTP 缓存，新标签页打开一样能命中；而站外链接绝大多数都是
  `target="_blank"`（维基外链、GitHub README 外链、知乎外链……），
  等于跨域预取在最该生效的地方全线失效。

  现在预取走 `buildExcludeSelectors(config, true)`，同源预渲染保持原样。

  > 实测（自建 DOM 桩对比 6.8.2）：预取排除表 354 → 353 条，`[target="_blank" i]` 已移除；
  > 开启「新标签页预渲染」时预渲染表 352 → 351 条，符合预期。

- **设置面板的 `<style>` 复用页面 nonce**

  `style-src` 是 nonce 型（且没有 `'unsafe-inline'`）的站点上，面板样式会被 CSP 拦掉，
  面板退化成无样式的裸 HTML。现在 `openSettings()` 里给 `<style>` 也赋上 `findPageNonce()`
  的结果，和规则注入共用同一套 nonce 逻辑。

- **`@updateURL` / `@downloadURL` 改指 `chromium157浏览器加速脚本.user.js`**

  上一版这两个地址还指向 `chromium156…` 文件。按本仓库约定（新版本新增文件、旧文件不动），
  自动更新地址必须跟着文件名走，否则装上新文件也永远收不到后续版本。

- 版本号统一由 `VERSION` 常量驱动：`@version`、面板标题、运行状态、console 前缀一处改、四处同步。

### 6.8.1 / 6.8.2（未单独发布，已并入本版）

中间两版只在本地迭代、没推仓库，这里留个记录：

- **6.8.1** 修 Trusted Types 崩溃与面板打不开 —— YouTube / Google 系站点上给 `<script>`
  赋 `textContent` 会直接抛错，旧版在 `document-start` 顶层报错，后面的代码全不执行，
  连油猴菜单都不出现。
- **6.8.2** 修一批中等与细节问题：SPA 跳转后同页排除失效、跨站预取缺 `referrer_policy`
  被静默判为不合格、「排除域名」只停预渲染不停预取、规则插进 `<html>` 引发 React/Next
  hydration 报错、面板里拖选文字松手落在遮罩上误关、同页排除漏掉查询串、
  排除关键词漏掉 `log_out` / `sign_out` 这类下划线写法。

### 升级说明

- **文件名变了，要手动装一次**：`@updateURL` 已指向新文件，但 Tampermonkey 认的是脚本条目
  而不是 URL，装着 `chromium156…` 的人不会自动升上来。
- **设置可能要重配**：新文件在 Tampermonkey 里通常是独立条目，`GM_*` 存储从头开始。
  装之前把「排除域名 / 排除关键词」两栏内容复制出来，装完粘回去。
  顺带好处是本版默认关键词表已含 `log_out` / `logoff` / `log-off` / `sign_out`，全新条目天然生效。
- 装完把旧的 `chromium156…` 条目**禁用**（不用删），两个同时启用会重复注入规则。

---

## 6.8.0 — 2026-11-03

> 主题：改个不再让人误会的名字。

### 变更

- **`@name`：`网页加速器 (Chromium 155+ Desktop)` → `网页加速器`**

  原名里的 `(Chromium 155+ Desktop)` 容易被误读成版本标识——看着像是"一直停在 155"，
  每次检查更新都觉得没生效。括号里那句话其实是平台说明，放在 `@description` 就够了。

- **`@description` 精简**，去掉「v6.6 修复了……」这种会过期的版本描述，
  避免说明文字长期停留在旧版本。

- 设置面板与「查看运行状态」的标题现在带版本号（如 `🚀 网页加速器 v6.8.0`），
  想确认版本看这里即可，不必依赖脚本名。

### 为什么名字里**不**放版本号

Tampermonkey 用 `@name` + `@namespace` 判定脚本身份。把版本写进名字意味着
**每次发版都换了一个身份**：旧条目留在面板里、`GM_*` 设置（含排除域名与关键词）
无法继承，还会出现多个版本同时注入规则。

所以版本只写在 `@version` 一行——这也是 Tampermonkey 唯一用来判断"要不要提示更新"的字段。

### 升级说明

- 更新走 `@updateURL`，脚本内部 ID 不变：**设置会保留，名字会自动变**。
- 万一 Tampermonkey 把它当成新条目（面板里出现两个「网页加速器」），
  保留版本号 6.8.0 的那个、删掉另一个即可。
- 仓库里的 `chromium155浏览器加速脚本.user.js`（v6.5.2）**未改动**，仍叫旧名字；
  两个文件现在是两个独立脚本，若都安装请只启用其中一个。

## 6.7.0 — 2026-11-03

> 主题：把隐私信号的作用域收窄到它真正该管的地方。

### 变更

- **DNT / GPC 不再整体关停推测，只跳过跨域 Prefetch**

  原先只要 `navigator.doNotTrack === "1"` 或 `navigator.globalPrivacyControl === true`，
  `buildRules()` 就在入口处 `return null`，一条规则都不产出。

  问题是这两类推测的性质完全不同：

  | 推测类型 | 是否向第三方发请求 | 是否共享数据 |
  |---|---|---|
  | 同源 Prerender | 否，只请求当前站点 | 否 |
  | 跨域 Prefetch | **是**，真实请求目标站点 | **是**（真实 IP + Referer） |

  用 GPC（"不要出售/共享我的个人信息"）去拦同源预渲染属于过度阻塞：
  它只是在你自己已登录的站点内部提前渲染，并没有把数据交给任何第三方。

  而现实中替你发送这个信号的东西不少（其他 userscript、隐私插件、拦截软件），
  于是默认配置下脚本很容易等于空转——装了和没装一样。

  现在：**同源 Prerender 始终工作，跨域 Prefetch 尊重隐私信号。**

- **设置项改名**：「尊重 DNT / GPC」→「跨域推测尊重 DNT / GPC」，描述同步说明同源不受影响。
  配置键 `respect_dnt` **保持不变**，升级后用户已有设置照常继承。

- **状态面板 / 控制台提示**改为「仅跳过跨域 Prefetch」，不再说"未注入任何规则"。

### 回归矩阵（Chrome 156 实测）

| dnt / gpc | respect_dnt | prerender | prefetch |
|---|---|---|---|
| `1` / `true` | 开（默认） | ✅ 1 条 | ⛔ 跳过 |
| `1` / `true` | 关 | ✅ 1 条 | ✅ 1 条 |
| `null` / `undefined` | 开 | ✅ 1 条 | ✅ 1 条 |
| `1` / `true` | 开，且关闭跨域开关 | ✅ 1 条 | ⛔ 关闭 |

### 升级说明

- 无需任何操作，设置键与默认值均未变。
- 唯一的行为变化：此前因隐私信号而完全空转的用户，升级后**同源预渲染会自动恢复**。

### 实测订正（2026-11-03）

本节记录一次我自己的误判，避免以后再踩。

**错误结论**：6.6.x 时期把 `navigator.doNotTrack === "1"` + `globalPrivacyControl === true`
归因为「Chrome 156 默认行为」，理由是「读的是原生属性、请求头也真的发出去了」。

**真实原因**：另一个全局 userscript「Don't track me Google」在改写 `navigator` 属性，
并让请求带上了 `DNT: 1` / `Sec-GPC: 1`。卸载它之后立即回到：

```
doNotTrack           = null
globalPrivacyControl = undefined
DNT / Sec-GPC 请求头  = 均不再出现
```

**方法学教训**：当时判断「是否原生」用的是 `typeof getter === 'function'`，
而**任何**被脚本改写的 getter 也满足这个条件，所以这个判据毫无区分力。
正确做法是检查 `String(getter)` 是否包含 `[native code]`，并确认属性挂在
`Navigator.prototype` 还是 `navigator` 实例上——两者用 `Object.getOwnPropertyDescriptor`
逐层向上查即可。

**对本次改动的影响**：无。v6.7.0 把隐私信号收窄到跨域 Prefetch 依然是正确设计
（GPC 的语义是「不要出售/共享个人信息」，而同源预渲染不涉及第三方），
只是在干净环境下它会退化成「什么都不拦」，正好是期望行为。

---

## 6.6.1 — 2026-11-03

> 主题：把「静默失效」变成「说得清楚」，并订正文档里一处错误的排查指引。

### 修复

- **DNT / GPC 触发时不再无声无息**
  旧行为：`respect_dnt = true` 且检测到隐私信号时，`buildRules()` 直接 `return null`，
  控制台一个字都不打，用户只会觉得「装了没用」。

  现在：控制台输出一条明确的 warning，说明是隐私信号导致的跳过、以及如何开启；
  「查看运行状态」面板也会直接打印 `navigator.doNotTrack` / `navigator.globalPrivacyControl`
  的真实取值，并给出「取消勾选『尊重 DNT / GPC』」的操作提示。

### 文档

- 订正 README「使用前必读」第 1 条。原文写「Chrome 设置 → 隐私和安全 → 请勿跟踪」，
  但：
  1. 该项从来不在顶层菜单，旧版本位于 *隐私和安全 → 第三方 Cookie* 页面**底部**，新版本可能已被移除；
  2. 当时判定「Chrome 156 在不少环境下默认就会发送 `DNT: 1` / `Sec-GPC: 1`」——
     **这条归因是错的**，见 6.7.0 末尾的「实测订正」。

  现在的指引改为：先用控制台一行 `navigator.doNotTrack, navigator.globalPrivacyControl` 自查，
  再回插件面板取消勾选，不再要求用户去找一个可能已经不存在的开关。

---

## 6.6.0 — 2026-11-03

> 主题：修掉一处「看起来有规则、实际不生效」的静默故障，并把注入时机与 CSP 兼容性做对。
>
> 新增文件 `chromium156浏览器加速脚本.user.js`；`chromium155浏览器加速脚本.user.js` 原样保留。

### 修复

- **同源 Prerender 在大量页面静默失效**（严重）
  旧版用 `{ not: { href_matches: "**/*#*" } }` 想排除带锚点的链接，实际有两个错误：
  1. `**/*` 是**相对当前目录**解析的，不是相对整个源；
  2. `#*` 里的 `*` **连空 hash 也匹配**，所以它根本没在过滤锚点，而是匹配了几乎一切。

  结果：在站点根路径（首页）上，该条件把所有同源链接都排除掉了，`prerender` 一条都不触发；
  在子目录页面上，当前目录下的所有链接被整体排除。

  实测（Chrome 156，同源可预渲染目标数）：

  | 当前页 | 6.5 | 6.6.0 |
  |---|---|---|
  | `/` | **0（全灭）** | 全部覆盖 |
  | `/blog/post` | 仅 `/`、`/about`，丢失 `/blog/a`、`/blog/post2` | 全部覆盖 |

  > 跨域 `prefetch` 不受影响：该模式解析后落在同源，`not` 恒为真。

- **锚点排除模式可能让整条规则被丢弃**（严重）
  改用 `location.pathname + "#*"` 后，路径里的 `(` `{` 等 URL Pattern 特殊字符会引发解析错误
  （例如 `/wiki/Foo_(bar` → `Unbalanced regex`）。而规则里只要有一个模式非法，
  **浏览器会静默丢掉整条 `prerender` 规则**，页面直接失去预渲染。

  现在对 pathname 做 URL Pattern 转义，并在拼接前用 `new URLPattern()` 预校验；
  校验失败就跳过该条件，绝不让它拖垮整条规则。

- **恢复跨页锚点的预渲染**
  旧版把 `a[href*="#"]` 整类排除，导致维基百科、文档站的 `#section` 链接一律不预渲染。
  现在只排除「当前页 + 锚点」，站内其他页面带 `#` 的链接正常预渲染。

### 改进

- **注入时机**：回到 `document-start` 立即注入（规则越早生效越好）；
  `DOMContentLoaded` 后如果发现页面带 nonce，再替换为携带 nonce 的版本。
  旧版为了取 nonce 把注入统一推迟到 `DOMContentLoaded`，慢站点上首次悬停可能还没有规则。
- **严格 CSP 兼容**：nonce 通过 `script.nonce`（IDL 属性）写入，这是 CSP 校验真正读取的位置；
  用 `setAttribute('nonce', …)` 不生效。
- **设置面板零依赖**：改为原生 `<dialog>` + Shadow DOM，移除 SweetAlert2 的 `@require` / `@resource`，
  不再请求任何 CDN，也不受站点 CSP 对 `script-src` 的限制。
- **状态面板**：显示规则节点、实际使用的 nonce、同页排除模式，方便排查。

### 新增

- `@noframes`：不再在 iframe 里重复注入规则（iframe 内本来也不允许 prerender）。
- `GPC`（Global Privacy Control）检测，与 DNT 一起生效。
- 面板新增开关：**允许含参链接**、**跨域要求匿名 IP**、**新标签页预渲染（实验性，`target_hint: "_blank"`）**。
- 恢复 `@updateURL` / `@downloadURL`，指向本文件，可正常收到后续更新。

### 调整

- 默认排除关键词新增 `token`（一次性登录/激活链接被预取会真的消耗掉），保留 `oauth`；
  依旧不含 `order`（误杀排序类链接）。
- 下载扩展名黑名单不含 `ts`（避免误杀 TypeScript 相关路径）。

### 实现备注

从 README 移入，属实现层面而非使用层面的说明。

- **排除规则用 `selector_matches`，不在 `href_matches` 里拼正则**。
  CSS 属性选择器天然支持大小写不敏感（`i` 标志），能同时覆盖 `?`、`&` 紧跟扩展名的情况，比正则好写也好读。
- **跨域规则不能复用相对路径**。`href_matches: '/*'` 是相对当前源解析的，
  所以判定「跨域」必须显式写成 `https://*/*` 再减去 `/*`。
- **域名黑名单展开成两条 `not`**（域名本身 + 任意子域），拼接前严格规范化，
  拒绝含 `/ \ 空格 ? #` 的输入，避免面板里的脏数据让整段规则失效。
- **`document-start` 时可能还没有 `head` / `documentElement`**，注入走 `MutationObserver` 兜底，
  DOM 一出现就补上。

---

## 6.5.2 — 历史版本

- 强化排除规则与域名黑名单处理（域名本身 + 任意子域拆成两条 `not`）。
- 设置面板使用 SweetAlert2。

> 该文件保留在仓库中，不再更新。

---

## 6.5 — 历史版本

- 去掉 `requires: ["anonymous-client-ip-when-cross-origin"]` 硬门槛。
  实测该声明会让「匿名客户端 IP 不可用」的环境里整条 `prefetch` 规则失效，
  跨域预取全程静默不触发。代价是预取请求会带上真实 IP。
