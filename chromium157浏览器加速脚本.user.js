// ==UserScript==
// @name         网页加速器
// @namespace    https://tampermonkey.net/
// @version      6.8.3
// @description  Chrome/Chromium 桌面端原生 Speculation Rules：同源 Prerender + 跨域 HTTPS Prefetch，含安全排除规则与可视化设置面板
// @author       ChatGPT & Gemini
// @match        *://*/*
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/lhflowersbloom/chromium-speculation-accelerator/main/chromium157%e6%b5%8f%e8%a7%88%e5%99%a8%e5%8a%a0%e9%80%9f%e8%84%9a%e6%9c%ac.user.js
// @downloadURL  https://raw.githubusercontent.com/lhflowersbloom/chromium-speculation-accelerator/main/chromium157%e6%b5%8f%e8%a7%88%e5%99%a8%e5%8a%a0%e9%80%9f%e8%84%9a%e6%9c%ac.user.js
// ==/UserScript==

/* =========================================================
 * 注意说明（v6.8.3）
 *
 * 1. DNT / GPC 只控制脚本是否提交「跨域文档 Prefetch」规则，并不是完整隐私开关。
 *    同源 Prerender 仍可能加载目标页的第三方资源、执行页面脚本或触发分析请求。
 *    若希望隐私优先，可关闭「跨域 Prefetch」和/或「同源 Prerender」。
 *    若希望 DNT / GPC 触发时连跨域 Prefetch 也启用，可在设置里取消勾选
 *    「跨域推测尊重 DNT / GPC」。
 *    自查：控制台执行 navigator.doNotTrack, navigator.globalPrivacyControl
 * 2. 脚本名从「网页加速器 (Chromium 155+ Desktop)」改为「网页加速器」，
 *    版本号只写在 @version 与设置面板标题里，不再混进名字。
 *    旧文件 chromium155浏览器加速脚本.user.js 仍沿用旧名字，
 *    两个文件因此成为两个独立脚本 —— 若都安装，请只启用其中一个。
 * 3. 跨域 Prefetch 使用你的真实 IP 访问目标站点；不需要请在面板关闭。
 * 4. prerender 会真实执行目标页面的脚本，带副作用的 GET 链接
 *    （登出、加购、删除、一次性 token）必须排除。
 * 5. 严格 CSP 站点：规则通过页面 nonce 注入；若站点既无 nonce 也
 *    未启用 'inline-speculation-rules'，规则会被拦截（运行状态里可看到）。
 *    设置面板的 <style> 同样复用页面 nonce，因此在 nonce 型 CSP 站点上
 *    也不会掉样式。
 *    验证入口：DevTools → Application → Speculative loads。
 * 6. v6.8.2 起兼容 Trusted Types 站点（YouTube / Google 系等）：
 *    注入失败不会再让整个脚本崩溃，菜单与设置面板始终可用。
 * 7. 「排除域名」= 在这些站点上完全停用，同时不预取指向这些站点的链接。
 * 8. v6.8.3 起跨域 Prefetch 不再排除 target="_blank" 链接。
 *    预取只写 HTTP 缓存（新标签页打开也能命中），而站外链接绝大多数都是
 *    新标签打开 —— 之前一并排除，等于让跨域预取在最需要的地方全部失效。
 *    同源 Prerender 仍然排除 target="_blank"（预渲染结果无法跨标签复用），
 *    除非在设置里打开「新标签页预渲染」。
 * ========================================================= */

(function () {
    'use strict';

    const VERSION = '6.8.3';

    /* =========================================================
     * 1. 环境检测
     * ========================================================= */

    const SUPPORTS_SPECULATION = (() => {
        try {
            return typeof HTMLScriptElement !== 'undefined' &&
                typeof HTMLScriptElement.supports === 'function' &&
                HTMLScriptElement.supports('speculationrules');
        } catch {
            return false;
        }
    })();

    // 精确指针（鼠标/触控板）才启用，触屏笔记本外接鼠标也能命中
    const HAS_DESKTOP_POINTER = (() => {
        try {
            return window.matchMedia(
                '(any-hover: hover) and (any-pointer: fine)'
            ).matches;
        } catch {
            return false;
        }
    })();

    /* =========================================================
     * 2. 默认配置
     *
     * 键名与旧版本保持一致，升级后沿用用户已有设置。
     * ========================================================= */

    const DEFAULTS = {
        enabled: true,

        // 跨域推测是否尊重 Do Not Track / Global Privacy Control
        // 仅作用于跨域 Prefetch；同源 Prerender 不受此开关影响
        respect_dnt: true,

        // 同源完整预渲染
        allow_prerender: true,

        // HTTPS 跨域预取
        allow_external: true,

        // 跨域预取要求匿名客户端 IP（匿名 IP 不可用时整条规则失效）
        anon_ip_external: false,

        // 是否允许带查询参数的链接
        allow_query: true,

        // 同时为 target="_blank" 的同源链接预渲染
        prerender_new_tab: false,

        eagerness: 'moderate',

        exclude_domains: '',

        // 每行一个关键词，匹配链接 href
        // order 已剔除（易误杀排序类链接）；token 保留（一次性登录/激活链接不可重复请求）
        exclude_words: [
            'logout',
            'log-out',
            'log_out',
            'logoff',
            'log-off',
            'signout',
            'sign-out',
            'sign_out',
            'login',
            'register',
            'signup',
            'sign-up',
            'delete',
            'remove',
            'reset',
            'checkout',
            'cart',
            'payment',
            'purchase',
            'unsubscribe',
            'cancel',
            'revoke',
            'oauth',
            'token'
        ].join('\n')
    };

    const VALID_EAGERNESS = new Set([
        'conservative',
        'moderate',
        'eager'
    ]);

    const SCRIPT_ID = 'tm-web-accelerator-v66';
    const SETTINGS_HOST_ID = 'tm-wa-v66-settings-host';
    const TT_POLICY_NAME = 'tm-web-accelerator';

    /* =========================================================
     * 3. 文件类型黑名单
     * ========================================================= */

    const DOWNLOAD_EXTENSIONS = [
        // 压缩包
        'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz',
        'tgz', 'zst', 'lz', 'lzma', 'cab',
        // 安装包与镜像
        'exe', 'msi', 'msix', 'appx', 'dmg', 'pkg',
        'iso', 'img', 'apk', 'xapk', 'ipa', 'deb', 'rpm',
        'appimage', 'crx', 'vsix', 'jar',
        // 文档
        'pdf', 'epub', 'mobi', 'azw',
        'doc', 'docx', 'xls', 'xlsx',
        'ppt', 'pptx', 'csv', 'rtf',
        'odt', 'ods', 'odp',
        // 图片（大图直链：预渲染/预取只会白白下载，无法复用）
        'jpg', 'jpeg', 'png', 'gif', 'webp', 'avif',
        'bmp', 'tif', 'tiff', 'heic', 'svg',
        // 视频
        'mp4', 'mkv', 'webm', 'avi', 'mov',
        'wmv', 'flv', 'm4v', '3gp',
        // 音频
        'mp3', 'flac', 'wav', 'ogg', 'm4a',
        'aac', 'ape', 'alac', 'wma',
        // 流媒体分片（不含 ts，避免误杀 TypeScript 相关路径）
        'm3u8', 'm3u', 'mpd', 'm4s',
        // 其他
        'torrent'
    ];

    /* =========================================================
     * 4. 配置读写
     * ========================================================= */

    const storage = {
        get(key, fallback) {
            try {
                const value = GM_getValue(key, fallback);
                return value === undefined ? fallback : value;
            } catch {
                return fallback;
            }
        },

        set(key, value) {
            try {
                GM_setValue(key, value);
            } catch (error) {
                console.error('[网页加速器] 配置保存失败：', error);
            }
        }
    };

    function readConfig() {
        const result = {};

        for (const [key, defaultValue] of Object.entries(DEFAULTS)) {
            const value = storage.get(key, defaultValue);

            result[key] = typeof defaultValue === typeof value
                ? value
                : defaultValue;
        }

        if (!VALID_EAGERNESS.has(result.eagerness)) {
            result.eagerness = 'moderate';
        }

        return result;
    }

    function splitLines(value, maxItems = 100) {
        return String(value ?? '')
            .split(/\r?\n/)
            .map(item => item.trim())
            .filter(Boolean)
            .slice(0, maxItems);
    }

    /* =========================================================
     * 5. 隐私信号
     * ========================================================= */

    function isPrivacyOptOut() {
        const dntValues = [
            navigator.doNotTrack,
            window.doNotTrack,
            navigator.msDoNotTrack
        ];

        const dntEnabled = dntValues.some(value =>
            value === '1' ||
            value === 1 ||
            String(value).toLowerCase() === 'yes'
        );

        return dntEnabled || navigator.globalPrivacyControl === true;
    }

    /* =========================================================
     * 6. CSS 选择器字符串转义
     * ========================================================= */

    function escapeCssString(value) {
        return String(value).replace(
            /[\0-\x1f\x7f"\\]/g,
            character => (character === '\0'
                ? '\uFFFD'
                : '\\' + character.charCodeAt(0).toString(16) + ' ')
        );
    }

    /* =========================================================
     * 7. URLPattern 转义
     *
     * href_matches 用的是 URL Pattern 语法：* ( ) { } 等字符有特殊
     * 含义。路径里出现这些字符（例如 /wiki/Foo_(bar)）会让模式抛错，
     * 而一条规则里的模式只要解析失败，整条规则会被静默丢弃。
     *
     * 注意：冒号 : 不能写成 \: —— 按 URLPattern 规范，字符串模式里的
     * 转义冒号会被当成协议分隔符而直接抛错。保持原样时 :name 会成为
     * 命名分组（略微放宽匹配，只会多排除，不会出错）；无法解析时由
     * 下方的预验证兜底。
     * ========================================================= */

    function escapeUrlPattern(value) {
        return String(value).replace(
            /[\\*(){}?+#]/g,
            character => '\\' + character
        );
    }

    function isValidPattern(pattern) {
        try {
            if (typeof URLPattern === 'function') {
                new URLPattern(pattern, location.href || undefined);
            }
            return true;
        } catch {
            return false;
        }
    }

    // 生成"当前页（含查询串）+ 任意片段"的排除模式；不可用时返回空串
    function buildSamePagePattern() {
        const path = escapeUrlPattern(location.pathname || '/');
        const search = location.search || '';
        const candidates = [];

        if (search.length > 1) {
            // 未转义的 ? 是搜索段分隔符，后面的内容逐字转义
            candidates.push(path + '?' + escapeUrlPattern(search.slice(1)) + '#*');
        }

        // 兜底：只按路径排除（与 v6.8.1 行为一致）
        candidates.push(path + '#*');

        // 提前验证，避免把非法模式塞进规则导致整条失效
        return candidates.find(isValidPattern) || '';
    }

    /* =========================================================
     * 8. 域名规范化
     * ========================================================= */

    function normalizeDomain(input) {
        let value = String(input || '').trim().toLowerCase();

        if (!value) return '';

        value = value
            .replace(/^\*\./, '')
            .replace(/^\./, '');

        const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
            ? value
            : `https://${value}`;

        try {
            const url = new URL(candidate);

            if (!['http:', 'https:'].includes(url.protocol)) return '';
            if (url.username || url.password || !url.hostname) return '';

            return url.hostname.toLowerCase().replace(/\.$/, '');
        } catch {
            return '';
        }
    }

    function getExcludedDomains(config) {
        return [
            ...new Set(
                splitLines(config.exclude_domains)
                    .map(normalizeDomain)
                    .filter(Boolean)
            )
        ];
    }

    function domainMatches(hostname, domain) {
        return hostname === domain ||
            hostname.endsWith('.' + domain);
    }

    function isCurrentDomainExcluded(config) {
        const currentHost = String(location.hostname || '').toLowerCase();

        return getExcludedDomains(config).some(domain =>
            domainMatches(currentHost, domain)
        );
    }

    function getDomainPatterns(domains) {
        const patterns = [];

        for (const domain of domains) {
            const isIpAddress =
                domain.includes(':') ||
                /^\d{1,3}(?:\.\d{1,3}){3}$/.test(domain);

            patterns.push(`*://${domain}/*`);

            if (!isIpAddress) {
                patterns.push(`*://*.${domain}/*`);
            }
        }

        return patterns;
    }

    /* =========================================================
     * 9. 排除选择器
     *
     * includeBlankLink = true 时不排除 target="_blank" 链接，用于两处：
     *   - 开启「新标签页预渲染」时的预渲染规则；
     *   - 跨域 Prefetch 规则（预取结果进 HTTP 缓存，新标签页也能命中）。
     * 只有同源预渲染需要把它排除掉。
     * ========================================================= */

    function buildExcludeSelectors(config, includeBlankLink = false) {
        const selectors = [
            '[download]',
            '[rel~="nofollow" i]',
            '[href=""]',
            '[href^="#"]',
            '[href^="javascript:" i]',
            '[href^="mailto:" i]',
            '[href^="tel:" i]',
            '[href^="data:" i]',
            '[href^="blob:" i]',
            '[href^="file:" i]',
            '[href^="intent:" i]',
            '[aria-disabled="true" i]',
            '[data-no-speculation]',
            '[data-no-prefetch]',
            '[data-no-prerender]'
        ];

        if (!includeBlankLink) {
            selectors.push('[target="_blank" i]');
        }

        for (const ext of DOWNLOAD_EXTENSIONS) {
            const suffix = `.${ext}`;

            selectors.push(
                `[href$="${suffix}" i]`,
                `[href*="${suffix}?" i]`,
                `[href*="${suffix}#" i]`,
                `[href*="${suffix};" i]`
            );
        }

        if (!config.allow_query) {
            selectors.push('[href*="?"]');
        }

        for (const word of splitLines(config.exclude_words)) {
            selectors.push(`[href*="${escapeCssString(word)}" i]`);
        }

        return selectors;
    }

    /* =========================================================
     * 10. 构建 Speculation Rules
     * ========================================================= */

    function buildRules(config = readConfig()) {
        if (!config.enabled) return null;

        // 排除域名 = 在该站点上完全停用（包括从该站点发起的跨域 Prefetch）
        if (isCurrentDomainExcluded(config)) return null;

        // 此开关只控制脚本直接提交的跨域文档 Prefetch。
        // 同源 Prerender 不会被此开关关闭，但目标页仍可能加载第三方子资源、
        // 执行脚本或触发分析请求，因此不能将其视为完全没有第三方网络活动。
        const privacyOptOut = config.respect_dnt && isPrivacyOptOut();

        const eagerness = config.eagerness;
        const excludedDomainPatterns = getDomainPatterns(getExcludedDomains(config));
        const samePagePattern = buildSamePagePattern();

        const rules = {};

        /* ---------- 同源 Prerender ---------- */

        if (config.allow_prerender) {
            const prerenderWhere = [
                { href_matches: '/*' }
            ];

            if (samePagePattern) {
                // 只排除"当前这一页 + 锚点"，保留跨页面锚点链接
                prerenderWhere.push({ not: { href_matches: samePagePattern } });
            }

            // 文档规则会根据链接自身的 target 自动决定预渲染到当前标签还是新标签，
            // 因此「新标签页预渲染」只需要不再排除 target="_blank" 即可
            prerenderWhere.push({
                not: {
                    selector_matches:
                        buildExcludeSelectors(config, config.prerender_new_tab)
                }
            });

            rules.prerender = [{
                where: { and: prerenderWhere },
                eagerness
            }];
        }

        /* ---------- 跨域 Prefetch ---------- */

        if (config.allow_external && !privacyOptOut) {
            const crossOriginWhere = [
                { href_matches: 'https://*/*' },
                { not: { href_matches: '/*' } },
                {
                    not: {
                        selector_matches: [
                            // includeBlankLink = true：预取只写 HTTP 缓存，新标签页打开
                            // 一样能命中，排除 target="_blank" 会让站外链接（几乎都是
                            // 新标签打开）全部拿不到预取 —— 这条排除只对预渲染有意义
                            ...buildExcludeSelectors(config, true),
                            // 链接明确要求不发送 Referer 时不预取，避免与下面的策略冲突
                            '[rel~="noreferrer" i]',
                            '[referrerpolicy="no-referrer" i]'
                        ]
                    }
                }
            ];

            if (excludedDomainPatterns.length > 0) {
                crossOriginWhere.push({
                    not: { href_matches: excludedDomainPatterns }
                });
            }

            const prefetchRule = {
                where: { and: crossOriginWhere },
                eagerness,
                // Chrome 要求跨站 Prefetch 的 Referrer-Policy 足够严格；
                // 页面若使用 unsafe-url / no-referrer-when-downgrade，不声明这一项
                // 跨站预取会全部被判为不合格（DevTools 里静默失败）
                referrer_policy: 'strict-origin-when-cross-origin'
            };

            // 仅在用户明确要求时声明；匿名 IP 不可用的环境会让整条规则失效
            if (config.anon_ip_external) {
                prefetchRule.requires = [
                    'anonymous-client-ip-when-cross-origin'
                ];
            }

            rules.prefetch = [prefetchRule];
        }

        // 只提示一次：跨域被隐私信号挡下，同源照常工作
        if (
            config.allow_external &&
            privacyOptOut &&
            !state.prefetchPrivacyNoticed
        ) {
            state.prefetchPrivacyNoticed = true;
            console.info(
                '[网页加速器] 检测到 DNT / GPC，已跳过跨域 Prefetch；' +
                '同源 Prerender 规则仍保留，但目标页仍可能加载第三方资源或执行页面脚本。' +
                '如需连跨域一起启用，请在「加速器设置」里取消「跨域推测尊重 DNT / GPC」。'
            );
        }

        return Object.keys(rules).length > 0 ? rules : null;
    }

    /* =========================================================
     * 11. nonce 检测（严格 CSP 站点的必需项）
     * ========================================================= */

    function findPageNonce() {
        try {
            for (const script of document.querySelectorAll('script[nonce]')) {
                if (script.nonce) return script.nonce;
            }
        } catch {
            // 忽略
        }

        return '';
    }

    /* =========================================================
     * 12. Trusted Types 兼容
     *
     * 开启 require-trusted-types-for 'script' 的站点（YouTube、Google 系等）
     * 会在给 <script> 赋 textContent 时直接抛 TypeError。旧版本在
     * document-start 顶层抛错 → 整个脚本中断，连油猴菜单都不会注册。
     * 这里先按普通方式赋值，失败时才创建专用 policy 重试。
     * ========================================================= */

    let trustedPolicy = null;

    function getTrustedPolicy() {
        if (trustedPolicy) return trustedPolicy;

        const factory = window.trustedTypes;

        if (!factory || typeof factory.createPolicy !== 'function') return null;

        try {
            trustedPolicy = factory.createPolicy(TT_POLICY_NAME, {
                createScript: value => value
            });
        } catch {
            // 站点的 trusted-types 指令不允许这个 policy 名
            trustedPolicy = null;
        }

        return trustedPolicy;
    }

    function setScriptText(script, text) {
        try {
            script.textContent = text;
            return '';
        } catch {
            // 继续尝试 Trusted Types
        }

        const policy = getTrustedPolicy();

        if (!policy) return 'Trusted Types 拦截（站点不允许创建 policy）';

        try {
            script.textContent = policy.createScript(text);
            return '';
        } catch (error) {
            return 'Trusted Types 拦截：' + (error?.message || error);
        }
    }

    /* =========================================================
     * 13. 注入
     *
     * 策略：document-start 立刻生成规则，<head> 一出现就插入；若页面使用了
     * nonce 型 CSP，则解析完 DOM 后再补一次带 nonce 的注入，因为
     * document-start 阶段还读不到页面脚本上的 nonce。
     * SPA 站内跳转（pushState）后会按新地址刷新"同页锚点"排除模式。
     * ========================================================= */

    const state = {
        currentScript: null,
        pending: false,
        injectedJson: '',
        injectedNonce: null,
        cspBlocked: false,
        injectError: '',
        prefetchPrivacyNoticed: false
    };

    // 规则被页面 CSP 拦截时记录下来，供「运行状态」展示
    try {
        document.addEventListener('securitypolicyviolation', event => {
            if (state.currentScript && event.target === state.currentScript) {
                state.cspBlocked = true;
            }
        }, true);
    } catch {
        // 忽略
    }

    // 插入 <head>：不再抢在 <head> 之前塞进 <html>，
    // 降低 React/Next 等整页水合框架报 hydration mismatch 的概率
    function appendScript(script) {
        if (document.head) {
            state.pending = false;
            document.head.appendChild(script);
            return;
        }

        state.pending = true;

        const finish = parent => {
            observer.disconnect();

            // 等待期间已被新的注入替换，则丢弃
            if (state.currentScript !== script) return;

            state.pending = false;

            if (!script.isConnected && parent) {
                parent.appendChild(script);
            }
        };

        const observer = new MutationObserver(() => {
            if (document.head) finish(document.head);
        });

        observer.observe(document, { childList: true, subtree: true });

        document.addEventListener('DOMContentLoaded', () => {
            finish(document.head || document.documentElement);
        }, { once: true });
    }

    function injectRules() {
        if (!SUPPORTS_SPECULATION || !HAS_DESKTOP_POINTER) return;

        try {
            const rules = buildRules();
            const current = state.currentScript;

            if (!rules) {
                current?.remove();
                state.currentScript = null;
                state.injectedJson = '';
                return;
            }

            const json = JSON.stringify(rules);
            const pageNonce = findPageNonce();
            const nonce = pageNonce || state.injectedNonce || '';
            const alive = Boolean(current && (current.isConnected || state.pending));

            const needsUpdate =
                !alive ||
                state.injectedJson !== json ||
                (pageNonce && pageNonce !== state.injectedNonce);

            if (!needsUpdate) return;

            current?.remove();

            const script = document.createElement('script');

            script.id = SCRIPT_ID;
            script.type = 'speculationrules';

            if (nonce) {
                // 必须走 IDL 属性：CSP 校验读的是内部槽，不是 content attribute
                script.nonce = nonce;
            }

            const textError = setScriptText(script, json);

            if (textError) {
                state.currentScript = null;
                state.injectedJson = '';
                state.injectError = textError;
                console.warn('[网页加速器] 规则注入失败：' + textError);
                return;
            }

            state.currentScript = script;
            state.injectedJson = json;
            state.injectedNonce = nonce;
            state.cspBlocked = false;
            state.injectError = '';

            appendScript(script);

            console.info(
                '[网页加速器] Speculation Rules 已提交' +
                (nonce ? '（携带页面 nonce）' : '') + '。',
                rules
            );
        } catch (error) {
            // 任何意外都不能影响后面的菜单注册
            state.injectError = String(error?.message || error);
            console.warn('[网页加速器] 规则注入异常：', error);
        }
    }

    function scheduleNonceRetry() {
        const retry = () => {
            if (findPageNonce()) injectRules();
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', retry, { once: true });
        } else {
            retry();
        }
    }

    // SPA 站内跳转：地址（路径或查询串）变化后刷新规则
    function watchUrlChanges() {
        let lastKey = location.pathname + location.search;
        let timer = 0;

        const onChange = () => {
            clearTimeout(timer);

            timer = setTimeout(() => {
                const key = location.pathname + location.search;

                if (key === lastKey) return;

                lastKey = key;
                injectRules();
            }, 200);
        };

        try {
            // Navigation API 能捕获页面自己调用的 history.pushState / replaceState
            if (window.navigation && typeof window.navigation.addEventListener === 'function') {
                window.navigation.addEventListener('currententrychange', onChange);
            }
        } catch {
            // 忽略
        }

        window.addEventListener('popstate', onChange);
    }

    function start() {
        injectRules();
        scheduleNonceRetry();
        watchUrlChanges();
    }

    if (document.prerendering) {
        document.addEventListener('prerenderingchange', start, { once: true });
    } else {
        start();
    }

    /* =========================================================
     * 14. 运行状态
     * ========================================================= */

    function showStatus() {
        const config = readConfig();
        const injected = Boolean(state.currentScript?.isConnected);
        const domainExcluded = isCurrentDomainExcluded(config);

        const privacyOptOut = config.respect_dnt && isPrivacyOptOut();
        const rules = buildRules(config);

        let nodeStatus = injected ? '已注入 DOM' : '未注入';

        if (state.cspBlocked) nodeStatus = '已注入，但被页面 CSP 拦截';
        if (state.injectError) nodeStatus = '注入失败（' + state.injectError + '）';

        const lines = [
            `网页加速器 v${VERSION}`,
            '',
            `Speculation Rules API：${SUPPORTS_SPECULATION ? '支持' : '不支持'}`,
            `桌面指针设备：${HAS_DESKTOP_POINTER ? '通过' : '未通过'}`,
            `规则节点：${nodeStatus}`,
            `注入 nonce：${state.injectedNonce || '无'}`,
            `总开关：${config.enabled ? '开启' : '关闭'}`,
            `当前站点：${domainExcluded ? '在排除域名中（已完全停用）' : '未排除'}`,
            `DNT / GPC：${privacyOptOut ? '触发（仅跳过跨域 Prefetch）' : '未触发'}`,
            `  doNotTrack=${String(navigator.doNotTrack)}` +
                `  globalPrivacyControl=${String(navigator.globalPrivacyControl)}`,
            '',
            `同源 Prerender：${rules?.prerender ? '启用' : '未启用'}`,
            `新标签页预渲染：${config.prerender_new_tab ? '开启' : '关闭'}`,
            `跨域 Prefetch：${rules?.prefetch ? '启用' : '未启用'}`,
            `推测强度：${config.eagerness}`,
            `匿名 IP 要求：${config.anon_ip_external ? '开启' : '关闭'}`,
            `同页锚点排除模式：${buildSamePagePattern() || '（未生成）'}`,
            ''
        ];

        if (privacyOptOut) {
            lines.push(
                'ℹ 当前浏览器发出了 DNT / GPC 信号：跨域 Prefetch 已跳过；同源 Prerender 仍可能加载第三方资源或触发页面脚本。',
                '  如需连跨域一起启用：加速器设置 → 取消勾选「跨域推测尊重 DNT / GPC」。',
                ''
            );
        }

        lines.push(
            '注意：规则注入成功不代表浏览器一定执行。',
            '实际推测状态见 DevTools → Application → Speculative loads。'
        );

        console.info(`[网页加速器 v${VERSION}]`, {
            support: SUPPORTS_SPECULATION,
            desktopPointer: HAS_DESKTOP_POINTER,
            injected,
            cspBlocked: state.cspBlocked,
            injectError: state.injectError,
            nonce: state.injectedNonce,
            config,
            rules
        });

        alert(lines.join('\n'));
    }

    /* =========================================================
     * 15. 设置面板（原生 Dialog + Shadow DOM，零 CDN）
     *
     * 全部用 createElement 构建，不使用 innerHTML，
     * 因此在 Trusted Types 站点（YouTube 等）也能正常打开。
     * ========================================================= */

    const TOGGLE_ROWS = [
        ['enabled', '启用网页加速', '全局总开关'],
        ['respect_dnt', '跨域推测尊重 DNT / GPC', '浏览器发出隐私信号时跳过跨域 Prefetch；同源预渲染不受此开关影响'],
        ['allow_prerender', '同源 Prerender', '整页预渲染站内链接'],
        ['allow_external', '跨域 Prefetch', '预取外部 HTTPS 链接的主文档'],
        ['anon_ip_external', '跨域要求匿名客户端 IP', '环境不支持时会令跨域预取整体失效，建议保持关闭'],
        ['allow_query', '允许含参链接', '允许推测带 ?query 的 URL'],
        ['prerender_new_tab', '新标签页预渲染', '同时预渲染同源 target="_blank" 链接；文档规则会自动识别打开目标']
    ];

    const BOOLEAN_KEYS = TOGGLE_ROWS.map(([key]) => key);

    const EAGERNESS_OPTIONS = [
        ['conservative', 'conservative（鼠标按下时触发）'],
        ['moderate', 'moderate（桌面悬停约 200ms，推荐）'],
        ['eager', 'eager（桌面悬停约 10ms，更激进）']
    ];

    const PANEL_CSS = `
        :host { all: initial; color-scheme: light dark; }
        * { box-sizing: border-box; }

        dialog {
            width: min(470px, calc(100vw - 28px));
            max-height: 88vh;
            padding: 0;
            border: 1px solid color-mix(in srgb, CanvasText 18%, transparent);
            border-radius: 14px;
            background: Canvas;
            color: CanvasText;
            font-family: system-ui, -apple-system, sans-serif;
            box-shadow: 0 16px 60px rgba(0, 0, 0, .28);
        }

        dialog::backdrop {
            background: rgba(0, 0, 0, .55);
            backdrop-filter: blur(3px);
        }

        .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 20px 12px;
            border-bottom: 1px solid color-mix(in srgb, CanvasText 12%, transparent);
        }

        .title { font-size: 16px; font-weight: 700; }

        .close {
            border: 0;
            background: transparent;
            color: inherit;
            font-size: 22px;
            line-height: 1;
            cursor: pointer;
        }

        .content {
            padding: 12px 20px;
            overflow-y: auto;
            max-height: 66vh;
        }

        .row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            min-height: 38px;
            padding: 4px 0;
            cursor: pointer;
        }

        .row-label { font-size: 13px; font-weight: 500; }

        .row-desc {
            display: block;
            margin-top: 2px;
            color: GrayText;
            font-size: 11px;
            line-height: 1.45;
        }

        input[type="checkbox"] {
            width: 18px;
            height: 18px;
            accent-color: #1684f8;
            flex-shrink: 0;
            cursor: pointer;
        }

        .group {
            display: flex;
            flex-direction: column;
            gap: 6px;
            margin-top: 14px;
        }

        .group-title { font-size: 13px; font-weight: 650; }

        select, textarea {
            width: 100%;
            border: 1px solid color-mix(in srgb, CanvasText 25%, transparent);
            border-radius: 7px;
            padding: 8px;
            background: Canvas;
            color: CanvasText;
            font: inherit;
            font-size: 12px;
        }

        textarea {
            min-height: 78px;
            resize: vertical;
            font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
            line-height: 1.45;
        }

        .footer {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            padding: 12px 20px 16px;
            border-top: 1px solid color-mix(in srgb, CanvasText 12%, transparent);
        }

        .footer-right { display: flex; gap: 8px; }

        .btn {
            border: 1px solid color-mix(in srgb, CanvasText 22%, transparent);
            border-radius: 8px;
            padding: 7px 13px;
            background: transparent;
            color: inherit;
            font-size: 13px;
            cursor: pointer;
        }

        .btn:hover { background: color-mix(in srgb, CanvasText 6%, transparent); }

        .btn-primary {
            border-color: #1684f8;
            background: #1684f8;
            color: #fff;
            font-weight: 600;
        }

        .btn-primary:hover { background: #1273db; }
    `;

    // 极简 DOM 构建器：字符串子节点会被 append 自动转成文本节点
    function h(tag, props = {}, ...children) {
        const element = document.createElement(tag);

        for (const [key, value] of Object.entries(props)) {
            if (value === null || value === undefined || value === false) continue;

            if (key === 'class') {
                element.className = value;
            } else {
                element.setAttribute(key, value === true ? '' : String(value));
            }
        }

        element.append(
            ...children.flat().filter(child =>
                child !== null && child !== undefined && child !== false
            )
        );

        return element;
    }

    function openSettings() {
        document.getElementById(SETTINGS_HOST_ID)?.remove();

        const parent = document.body || document.documentElement;

        if (!parent) return;

        const config = readConfig();
        const host = document.createElement('div');

        host.id = SETTINGS_HOST_ID;

        const root = host.attachShadow({ mode: 'open' });

        // <style>.textContent 不是 Trusted Types 受控接收器，可直接赋值
        const style = document.createElement('style');
        const styleNonce = findPageNonce();

        if (styleNonce) {
            // nonce 型 style-src 的严格 CSP 站点上不带 nonce 会被拦，
            // 面板会退化成无样式的裸 HTML
            style.nonce = styleNonce;
        }

        style.textContent = PANEL_CSS;

        const checkboxes = {};

        const toggleRows = TOGGLE_ROWS.map(([key, label, desc]) => {
            const input = h('input', { type: 'checkbox' });

            input.checked = Boolean(config[key]);
            checkboxes[key] = input;

            // <label> 包裹：点文字也能切换
            return h('label', { class: 'row' },
                h('div', {},
                    h('div', { class: 'row-label' }, label),
                    h('span', { class: 'row-desc' }, desc)
                ),
                input
            );
        });

        const eagernessSelect = h('select', {},
            EAGERNESS_OPTIONS.map(([value, text]) => h('option', { value }, text))
        );
        eagernessSelect.value = config.eagerness;

        const domainsArea = h('textarea', { placeholder: 'example.com' });
        domainsArea.value = config.exclude_domains;

        const wordsArea = h('textarea', {});
        wordsArea.value = config.exclude_words;

        const btnClose = h('button', { class: 'close', type: 'button', title: '关闭' }, '×');
        const btnReset = h('button', { class: 'btn', type: 'button' }, '恢复默认');
        const btnCancel = h('button', { class: 'btn', type: 'button' }, '取消');
        const btnSave = h('button', { class: 'btn btn-primary', type: 'button' }, '保存并刷新');

        // closedby="any"：Chrome 原生轻关闭（点遮罩 / Esc），
        // 且不会因"在输入框里拖选文字、松手落在遮罩上"而误关
        const dlg = h('dialog', { closedby: 'any' },
            h('div', { class: 'header' },
                h('span', { class: 'title' }, `🚀 网页加速器 v${VERSION}`),
                btnClose
            ),
            h('div', { class: 'content' },
                toggleRows,
                h('div', { class: 'group' },
                    h('span', { class: 'group-title' }, '推测强度 (Eagerness)'),
                    eagernessSelect
                ),
                h('div', { class: 'group' },
                    h('span', { class: 'group-title' }, '排除域名（每行一个，含子域名；这些站点上完全停用，也不预取指向它们的链接）'),
                    domainsArea
                ),
                h('div', { class: 'group' },
                    h('span', { class: 'group-title' }, '排除链接关键词（每行一个，匹配 href）'),
                    wordsArea
                )
            ),
            h('div', { class: 'footer' },
                btnReset,
                h('div', { class: 'footer-right' }, btnCancel, btnSave)
            )
        );

        root.append(style, dlg);
        parent.appendChild(host);

        const close = () => {
            if (dlg.open) dlg.close();
        };

        // 所有关闭途径（按钮、Esc、点遮罩）最终都会触发 close 事件
        dlg.addEventListener('close', () => host.remove());

        btnClose.addEventListener('click', close);
        btnCancel.addEventListener('click', close);

        // 旧内核不支持 closedby 时的兜底：按下与松开都在遮罩上才关闭
        if (!('closedBy' in dlg)) {
            let downOnBackdrop = false;

            dlg.addEventListener('pointerdown', event => {
                downOnBackdrop = event.target === dlg;
            });

            dlg.addEventListener('click', event => {
                if (downOnBackdrop && event.target === dlg) close();
                downOnBackdrop = false;
            });
        }

        btnReset.addEventListener('click', () => {
            if (!confirm('确定恢复全部默认设置并刷新页面吗？')) return;

            for (const [key, value] of Object.entries(DEFAULTS)) {
                storage.set(key, value);
            }

            close();
            location.reload();
        });

        btnSave.addEventListener('click', () => {
            for (const key of BOOLEAN_KEYS) {
                storage.set(key, Boolean(checkboxes[key].checked));
            }

            const eagerness = eagernessSelect.value;

            storage.set(
                'eagerness',
                VALID_EAGERNESS.has(eagerness) ? eagerness : 'moderate'
            );

            storage.set('exclude_domains', domainsArea.value);
            storage.set('exclude_words', wordsArea.value);

            close();
            location.reload();
        });

        dlg.showModal();
    }

    /* =========================================================
     * 16. 油猴菜单
     * ========================================================= */

    function registerMenu() {
        if (typeof GM_registerMenuCommand !== 'function') return;

        const config = readConfig();

        GM_registerMenuCommand(
            config.enabled
                ? '🚀 网页加速器：已启用（点击关闭）'
                : '⛔ 网页加速器：已关闭（点击启用）',
            () => {
                storage.set('enabled', !config.enabled);
                location.reload();
            }
        );

        GM_registerMenuCommand('⚙️ 加速器设置', openSettings);
        GM_registerMenuCommand('📊 查看运行状态', showStatus);
    }

    registerMenu();
})();
