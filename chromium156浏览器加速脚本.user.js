// ==UserScript==
// @name         网页加速器 (Chromium 155+ Desktop)
// @namespace    https://tampermonkey.net/
// @version      6.6.1
// @description  Chromium 155/156+ 原生 Speculation Rules：同源 Moderate Prerender + 跨域 HTTPS Prefetch。v6.6 修复 v6.5 锚点排除规则误伤整段预渲染的问题
// @author       ChatGPT & Gemini
// @match        *://*/*
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/lhflowersbloom/chromium-speculation-accelerator/main/chromium156%e6%b5%8f%e8%a7%88%e5%99%a8%e5%8a%a0%e9%80%9f%e8%84%9a%e6%9c%ac.user.js
// @downloadURL  https://raw.githubusercontent.com/lhflowersbloom/chromium-speculation-accelerator/main/chromium156%e6%b5%8f%e8%a7%88%e5%99%a8%e5%8a%a0%e9%80%9f%e8%84%9a%e6%9c%ac.user.js
// ==/UserScript==

/* =========================================================
 * 注意说明（v6.6.1）
 *
 * 1. 若 navigator.doNotTrack === "1" 或 navigator.globalPrivacyControl === true，
 *    在默认配置（respect_dnt = true）下一条规则都不会注入。
 *    实测 Chrome 156 在不少环境下默认就发送 DNT: 1 / Sec-GPC: 1，
 *    且设置界面里已经找不到「请勿跟踪」开关。
 *    自查：控制台执行 navigator.doNotTrack, navigator.globalPrivacyControl
 *    解决：在「加速器设置」里取消勾选「尊重 DNT / GPC」。
 * 2. 旧版 chromium155浏览器加速脚本.user.js 与新版 @name 相同，
 *    Tampermonkey 会把它们当作同一个脚本，安装新版即升级旧版，
 *    两个版本不会并存，设置会被继承。
 * 3. 跨域 Prefetch 使用你的真实 IP 访问目标站点；不需要请在面板关闭。
 * 4. prerender 会真实执行目标页面的脚本，带副作用的 GET 链接
 *    （登出、加购、删除、一次性 token）必须排除。
 * 5. 严格 CSP 站点：规则通过页面 nonce 注入；若站点既无 nonce 也
 *    未启用 'inline-speculation-rules'，规则会被拦截。
 *    验证入口：DevTools → Application → Speculative loads。
 * ========================================================= */

(function () {
    'use strict';

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

    // 角标指针（鼠标/触控板）才启用，触屏笔记本外接鼠标也能命中
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

        // 尊重 Do Not Track / Global Privacy Control
        respect_dnt: true,

        // 同源完整预渲染
        allow_prerender: true,

        // HTTPS 跨域预取
        allow_external: true,

        // 跨域预取要求匿名客户端 IP（匿名 IP 不可用时整条规则失效）
        anon_ip_external: false,

        // 是否允许带查询参数的链接
        allow_query: true,

        // 实验性：为 target="_blank" 链接按 _blank 提示预渲染
        prerender_new_tab: false,

        eagerness: 'moderate',

        exclude_domains: '',

        // 每行一个关键词，匹配链接 href
        // order 已剔除（易误杀排序类链接）；token 保留（一次性登录/激活链接不可重复请求）
        exclude_words: [
            'logout',
            'log-out',
            'signout',
            'sign-out',
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

    /* =========================================================
     * 3. 文件类型黑名单
     * ========================================================= */

    const DOWNLOAD_EXTENSIONS = [
        // 压缩包
        'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz',
        'tgz', 'zst',
        // 安装包与镜像
        'exe', 'msi', 'msix', 'appx', 'dmg', 'pkg',
        'iso', 'img', 'apk', 'xapk', 'deb', 'rpm',
        'appimage', 'crx',
        // 文档
        'pdf', 'epub', 'mobi', 'azw',
        'doc', 'docx', 'xls', 'xlsx',
        'ppt', 'pptx', 'csv',
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
     * ========================================================= */

    function escapeUrlPattern(value) {
        return String(value).replace(
            /[\\*(){}?+#]/g,
            character => '\\' + character
        );
    }

    // 生成"当前页 + 任意片段"的排除模式；不可用时返回空串
    function buildSamePagePattern() {
        const pathname = location.pathname || '/';
        const pattern = escapeUrlPattern(pathname) + '#*';

        try {
            // 提前验证，避免把非法模式塞进规则导致整条失效
            if (typeof URLPattern === 'function') {
                new URLPattern(pattern, location.href || undefined);
            }
            return pattern;
        } catch {
            return '';
        }
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
     * includeBlankLink = true 时保留 target="_blank" 链接，
     * 供 _blank 预渲染规则复用同一套排除条件。
     * ========================================================= */

    function buildExcludeSelectors(config, includeBlankLink = false) {
        const selectors = [
            '[download]',
            '[rel~="nofollow" i]',
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
            // 新标签页打开的链接无法复用当前标签的预渲染结果
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
        if (config.respect_dnt && isPrivacyOptOut()) {
            // 绝不静默失败：这条分支会让脚本看起来"装了没用"
            if (!state.privacyWarned) {
                state.privacyWarned = true;
                console.warn(
                    '[网页加速器] 检测到 DNT / GPC 隐私信号，已按设置跳过注入，本次不产生任何推测规则。' +
                    '如需启用，请点油猴菜单 → 加速器设置 → 取消「尊重 DNT / GPC」。' +
                    '（Chrome 156 在不少环境下默认就发送 DNT: 1 / Sec-GPC: 1，设置界面里可能找不到对应开关）'
                );
            }
            return null;
        }

        const eagerness = config.eagerness;
        const excludedDomains = getExcludedDomains(config);
        const excludedDomainPatterns = getDomainPatterns(excludedDomains);
        const currentHost = String(location.hostname || '').toLowerCase();

        const currentDomainExcluded = excludedDomains.some(domain =>
            domainMatches(currentHost, domain)
        );

        const samePagePattern = buildSamePagePattern();

        // 同源规则的公共条件（不含 target 限制）
        const baseSameOrigin = [
            { href_matches: '/*' }
        ];

        if (samePagePattern) {
            // 只排除"当前这一页 + 锚点"，保留跨页面锚点链接
            baseSameOrigin.push({ not: { href_matches: samePagePattern } });
        }

        const rules = {};

        /* ---------- 同源 Prerender ---------- */

        if (config.allow_prerender && !currentDomainExcluded) {
            const prerenderRules = [{
                where: {
                    and: [
                        ...baseSameOrigin,
                        {
                            not: {
                                selector_matches:
                                    buildExcludeSelectors(config)
                            }
                        }
                    ]
                },
                eagerness
            }];

            // 实验性：为会在新标签页打开的链接按 _blank 预渲染
            if (config.prerender_new_tab) {
                prerenderRules.push({
                    where: {
                        and: [
                            ...baseSameOrigin,
                            {
                                selector_matches:
                                    '[target="_blank" i]'
                            },
                            {
                                not: {
                                    selector_matches:
                                        buildExcludeSelectors(config, true)
                                }
                            }
                        ]
                    },
                    eagerness,
                    target_hint: '_blank'
                });
            }

            rules.prerender = prerenderRules;
        }

        /* ---------- 跨域 Prefetch ---------- */

        if (config.allow_external) {
            const crossOriginWhere = [
                { href_matches: 'https://*/*' },
                { not: { href_matches: '/*' } },
                {
                    not: {
                        selector_matches: buildExcludeSelectors(config)
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
                eagerness
            };

            // 仅在用户明确要求时声明；匿名 IP 不可用的环境会让整条规则失效
            if (config.anon_ip_external) {
                prefetchRule.requires = [
                    'anonymous-client-ip-when-cross-origin'
                ];
            }

            rules.prefetch = [prefetchRule];
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
     * 12. 注入
     *
     * 策略：document-start 立刻注入（规则越早生效越好）；若页面使用了
     * nonce 型 CSP，则解析完 DOM 后再补一次带 nonce 的注入，因为
     * document-start 阶段还读不到页面脚本上的 nonce。
     * ========================================================= */

    const state = {
        injectedNonce: null,
        privacyWarned: false
    };

    function appendScript(script) {
        const target = document.head || document.documentElement;

        if (target) {
            target.appendChild(script);
            return;
        }

        if (typeof MutationObserver === 'function') {
            const observer = new MutationObserver(() => {
                const ready = document.head || document.documentElement;

                if (ready) {
                    ready.appendChild(script);
                    observer.disconnect();
                }
            });

            observer.observe(document, { childList: true, subtree: true });
            return;
        }

        document.addEventListener('DOMContentLoaded', () => {
            (document.head || document.documentElement)?.appendChild(script);
        }, { once: true });
    }

    function injectRules() {
        if (!SUPPORTS_SPECULATION || !HAS_DESKTOP_POINTER) return;

        const rules = buildRules();

        if (!rules) return;

        const nonce = findPageNonce();
        const existing = document.getElementById(SCRIPT_ID);

        if (existing) {
            // 已有注入且无需补 nonce 时直接返回
            if (!nonce || state.injectedNonce === nonce) return;
            existing.remove();
        }

        const script = document.createElement('script');

        script.id = SCRIPT_ID;
        script.type = 'speculationrules';
        script.textContent = JSON.stringify(rules);

        if (nonce) {
            // 必须走 IDL 属性：CSP 校验读的是内部槽，不是 content attribute
            script.nonce = nonce;
        }

        appendScript(script);
        state.injectedNonce = nonce;

        console.info(
            '[网页加速器] Speculation Rules 已提交' +
            (nonce ? '（携带页面 nonce）' : '') + '。',
            rules
        );
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

    if (document.prerendering) {
        document.addEventListener('prerenderingchange', () => {
            injectRules();
            scheduleNonceRetry();
        }, { once: true });
    } else {
        injectRules();
        scheduleNonceRetry();
    }

    /* =========================================================
     * 13. 运行状态
     * ========================================================= */

    function showStatus() {
        const config = readConfig();
        const injected = Boolean(document.getElementById(SCRIPT_ID));

        const privacyBlocked = config.respect_dnt && isPrivacyOptOut();
        const rules = buildRules(config);

        const lines = [
            '网页加速器 v6.6.1',
            '',
            `Speculation Rules API：${SUPPORTS_SPECULATION ? '支持' : '不支持'}`,
            `桌面指针设备：${HAS_DESKTOP_POINTER ? '通过' : '未通过'}`,
            `规则节点：${injected ? '已注入 DOM' : '未注入'}`,
            `注入 nonce：${state.injectedNonce || '无'}`,
            `总开关：${config.enabled ? '开启' : '关闭'}`,
            `DNT / GPC：${privacyBlocked ? '触发隐私退出（规则被跳过）' : '未触发'}`,
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

        if (privacyBlocked) {
            lines.push(
                '⚠ 当前浏览器发出了 DNT / GPC 信号，脚本按默认设置不注入任何规则。',
                '  如需加速：加速器设置 → 取消勾选「尊重 DNT / GPC」。',
                ''
            );
        }

        lines.push(
            '注意：规则注入成功不代表浏览器一定执行。',
            '严格 CSP 可能阻止规则生效。',
            '实际推测状态见 DevTools → Application → Speculative loads。'
        );

        console.info('[网页加速器 v6.6.1]', {
            support: SUPPORTS_SPECULATION,
            desktopPointer: HAS_DESKTOP_POINTER,
            injected,
            nonce: state.injectedNonce,
            config,
            rules
        });

        alert(lines.join('\n'));
    }

    /* =========================================================
     * 14. 设置面板（原生 Dialog + Shadow DOM，零 CDN）
     * ========================================================= */

    const BOOLEAN_KEYS = [
        'enabled',
        'respect_dnt',
        'allow_prerender',
        'allow_external',
        'anon_ip_external',
        'allow_query',
        'prerender_new_tab'
    ];

    function openSettings() {
        document.getElementById(SETTINGS_HOST_ID)?.remove();

        const parent = document.body || document.documentElement;

        if (!parent) return;

        const config = readConfig();
        const host = document.createElement('div');

        host.id = SETTINGS_HOST_ID;

        const root = host.attachShadow({ mode: 'open' });

        root.innerHTML = `
            <style>
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
            </style>

            <dialog id="dlg">
                <div class="header">
                    <span class="title">🚀 网页加速器 v6.6.1</span>
                    <button class="close" id="btn-close" title="关闭">&times;</button>
                </div>

                <div class="content">
                    <div class="row">
                        <div>
                            <div class="row-label">启用网页加速</div>
                            <span class="row-desc">全局总开关</span>
                        </div>
                        <input type="checkbox" id="cfg-enabled">
                    </div>

                    <div class="row">
                        <div>
                            <div class="row-label">尊重 DNT / GPC</div>
                            <span class="row-desc">浏览器发出 DNT / GPC 信号时完全不注入（Chrome 156 可能默认就在发送）</span>
                        </div>
                        <input type="checkbox" id="cfg-respect_dnt">
                    </div>

                    <div class="row">
                        <div>
                            <div class="row-label">同源 Prerender</div>
                            <span class="row-desc">整页预渲染站内链接</span>
                        </div>
                        <input type="checkbox" id="cfg-allow_prerender">
                    </div>

                    <div class="row">
                        <div>
                            <div class="row-label">跨域 Prefetch</div>
                            <span class="row-desc">预取外部 HTTPS 链接的主文档</span>
                        </div>
                        <input type="checkbox" id="cfg-allow_external">
                    </div>

                    <div class="row">
                        <div>
                            <div class="row-label">跨域要求匿名客户端 IP</div>
                            <span class="row-desc">环境不支持时会令跨域预取整体失效，建议保持关闭</span>
                        </div>
                        <input type="checkbox" id="cfg-anon_ip_external">
                    </div>

                    <div class="row">
                        <div>
                            <div class="row-label">允许含参链接</div>
                            <span class="row-desc">允许推测带 ?query 的 URL</span>
                        </div>
                        <input type="checkbox" id="cfg-allow_query">
                    </div>

                    <div class="row">
                        <div>
                            <div class="row-label">新标签页预渲染（实验性）</div>
                            <span class="row-desc">对 target="_blank" 链接按 _blank 提示预渲染，需浏览器支持 target_hint</span>
                        </div>
                        <input type="checkbox" id="cfg-prerender_new_tab">
                    </div>

                    <div class="group">
                        <span class="group-title">推测强度 (Eagerness)</span>
                        <select id="cfg-eagerness">
                            <option value="conservative">conservative（按下鼠标才触发）</option>
                            <option value="moderate">moderate（悬停 200ms，推荐）</option>
                            <option value="eager">eager（轻微靠近即触发）</option>
                        </select>
                    </div>

                    <div class="group">
                        <span class="group-title">排除域名（每行一个，含子域名）</span>
                        <textarea id="cfg-exclude_domains" placeholder="example.com"></textarea>
                    </div>

                    <div class="group">
                        <span class="group-title">排除链接关键词（每行一个，匹配 href）</span>
                        <textarea id="cfg-exclude_words"></textarea>
                    </div>
                </div>

                <div class="footer">
                    <button class="btn" id="btn-reset">恢复默认</button>
                    <div class="footer-right">
                        <button class="btn" id="btn-cancel">取消</button>
                        <button class="btn btn-primary" id="btn-save">保存并刷新</button>
                    </div>
                </div>
            </dialog>
        `;

        parent.appendChild(host);

        const $ = id => root.getElementById(id);
        const dlg = $('dlg');

        for (const key of BOOLEAN_KEYS) {
            $(`cfg-${key}`).checked = Boolean(config[key]);
        }

        $('cfg-eagerness').value = config.eagerness;
        $('cfg-exclude_domains').value = config.exclude_domains;
        $('cfg-exclude_words').value = config.exclude_words;

        const close = () => {
            if (dlg.open) dlg.close();
            host.remove();
        };

        $('btn-close').addEventListener('click', close);
        $('btn-cancel').addEventListener('click', close);
        dlg.addEventListener('cancel', close);

        dlg.addEventListener('click', event => {
            if (event.target === dlg) close();
        });

        $('btn-reset').addEventListener('click', () => {
            if (!confirm('确定恢复全部默认设置并刷新页面吗？')) return;

            for (const [key, value] of Object.entries(DEFAULTS)) {
                storage.set(key, value);
            }

            close();
            location.reload();
        });

        $('btn-save').addEventListener('click', () => {
            for (const key of BOOLEAN_KEYS) {
                storage.set(key, Boolean($(`cfg-${key}`).checked));
            }

            const eagerness = $('cfg-eagerness').value;

            storage.set(
                'eagerness',
                VALID_EAGERNESS.has(eagerness) ? eagerness : 'moderate'
            );

            storage.set('exclude_domains', $('cfg-exclude_domains').value);
            storage.set('exclude_words', $('cfg-exclude_words').value);

            close();
            location.reload();
        });

        dlg.showModal();
    }

    /* =========================================================
     * 15. 油猴菜单
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
