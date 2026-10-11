// ==UserScript==
// @name         网页加速器 v6.4 (Chromium 155+ Desktop)
// @namespace    https://tampermonkey.net/
// @version      6.5.0
// @description  Chromium 155+ 原生 Speculation Rules：同源 Moderate Prerender + 跨域 HTTPS Prefetch；强化排除规则与域名处理（v6.5：去掉 anonymous-client-ip-when-cross-origin 硬门槛，跨域 Prefetch 才真正生效）
// @author       OpenAI and Gemini
// @match        *://*/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        GM_getResourceText
// @require      https://cdn.jsdelivr.net/npm/sweetalert2@11
// @resource     swalStyle https://cdn.jsdelivr.net/npm/@sweetalert2/theme-dark/dark.css
// @run-at       document-start
// ==/UserScript==

/* global Swal */

(function () {
    'use strict';

    var SCRIPT_ID = 'tm-speculation-rules-v650';
    var STYLE_ID = 'tm-speculation-style-v650';
    var VALID_EAGERNESS = ['conservative', 'moderate', 'eager'];

    /* =========================================================
     * 1. 功能与桌面设备检测
     * ========================================================= */
    if (
        !('HTMLScriptElement' in window) ||
        typeof HTMLScriptElement.supports !== 'function' ||
        !HTMLScriptElement.supports('speculationrules')
    ) {
        console.warn(
            '[网页加速器] 当前浏览器不支持 Speculation Rules API，脚本未启用。'
        );
        return;
    }

    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        console.log(
            '[网页加速器] 当前设备未检测到桌面精确指针，已跳过。'
        );
        return;
    }

    /* =========================================================
     * 2. 默认配置
     * 保留旧版本存储键，升级时不丢失现有设置。
     * ========================================================= */
    var DEFAULTS = {
        enabled: true,
        respect_dnt: true,
        allow_external: true,
        allow_query: true,
        eagerness: 'moderate',
        exclude_domains: '',
        exclude_words: [
            'logout', 'signout', 'login', 'register', 'delete',
            'remove', 'reset', 'pay', 'cart', 'checkout', 'auth'
        ].join('\n')
    };

    var util = {
        get: function (key, fallback) {
            return GM_getValue(key, fallback);
        },

        set: function (key, value) {
            GM_setValue(key, value);
        },

        splitLines: function (value) {
            return String(value == null ? '' : value)
                .split(/\r?\n/)
                .map(function (item) {
                    return item.trim();
                })
                .filter(function (item) {
                    return item.length > 0;
                });
        },

        escapeHtml: function (value) {
            return String(value == null ? '' : value)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
        },

        // 用于拼接 CSS 属性选择器中的双引号字符串。
        escapeCssString: function (value) {
            return String(value == null ? '' : value)
                .replace(/\\/g, '\\\\')
                .replace(/"/g, '\\"');
        },

        addStyle: function (id, css) {
            if (document.getElementById(id)) {
                return;
            }

            var style = document.createElement('style');
            style.id = id;
            style.textContent = css;

            var target = document.head || document.documentElement;

            if (target) {
                target.appendChild(style);
            }
        }
    };

    Object.keys(DEFAULTS).forEach(function (key) {
        if (util.get(key) === undefined) {
            util.set(key, DEFAULTS[key]);
        }
    });

    /* =========================================================
     * 3. 下载扩展名排除
     * 覆盖常见压缩包、安装包、镜像、文档及表格格式。
     * 同时匹配链接路径末尾和紧邻查询参数的扩展名。
     * ========================================================= */
    var DOWNLOAD_EXTENSIONS = [
        'zip', 'rar', '7z', 'exe', 'msi', 'dmg', 'iso', 'apk',
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
        'tar', 'gz', 'tgz', 'bz2', 'xz'
    ];

    function buildDownloadSelector() {
        var selectors = [];

        DOWNLOAD_EXTENSIONS.forEach(function (ext) {
            ['a', 'area'].forEach(function (tag) {
                selectors.push(
                    tag + '[href$=".' + ext + '" i]'
                );

                selectors.push(
                    tag + '[href*=".' + ext + '?" i]'
                );

                selectors.push(
                    tag + '[href*=".' + ext + '&" i]'
                );
            });
        });

        return selectors.join(', ');
    }

    /* =========================================================
     * 4. 域名规范化
     * 支持 example.com、.example.com、*.example.com、完整 URL。
     * ========================================================= */
    function normalizeDomain(input) {
        var value = String(input == null ? '' : input).trim();

        if (!value) {
            return '';
        }

        value = value
            .replace(/^\*\./, '')
            .replace(/^\.+/, '');

        try {
            var parsed = value.indexOf('://') >= 0
                ? new URL(value)
                : new URL('https://' + value);

            value = parsed.hostname;
        } catch (error) {
            // 无法解析的项目直接忽略，不把它拼入 URLPattern。
            return '';
        }

        value = value.toLowerCase().replace(/\.$/, '');

        if (!value) {
            return '';
        }

        // hostname 不应含路径、查询参数或空白；拒绝可破坏规则的字符。
        if (/[/\\\s?#]/.test(value)) {
            return '';
        }

        return value;
    }

    function getExcludedDomains() {
        var result = [];
        var seen = Object.create(null);

        util.splitLines(
            util.get('exclude_domains', DEFAULTS.exclude_domains)
        ).forEach(function (item) {
            var domain = normalizeDomain(item);

            if (domain && !seen[domain]) {
                seen[domain] = true;
                result.push(domain);
            }
        });

        return result;
    }

    function isCurrentHostExcluded(domains) {
        var host = String(location.hostname || '')
            .toLowerCase()
            .replace(/\.$/, '');

        return domains.some(function (domain) {
            return host === domain ||
                host.endsWith('.' + domain);
        });
    }

    /* =========================================================
     * 5. 构建排除规则
     * 注意：跨域规则不能直接复用相对路径 href_matches，
     * 因其相对当前源解析。
     * ========================================================= */
    function buildCommonExcludes() {
        var excludes = [];

        var linkSafetySelector = [
            'a[target="_blank" i]',
            'area[target="_blank" i]',
            'a[download]',
            'area[download]',
            'a[rel~="nofollow" i]',
            'area[rel~="nofollow" i]'
        ].join(', ');

        excludes.push({
            not: {
                selector_matches: linkSafetySelector
            }
        });

        excludes.push({
            not: {
                selector_matches: buildDownloadSelector()
            }
        });

        // 统一用 CSS 链接属性匹配查询参数与片段。
        if (!util.get('allow_query', true)) {
            excludes.push({
                not: {
                    selector_matches:
                        'a[href*="?"], area[href*="?"]'
                }
            });
        }

        // 排除包含片段标识符的链接。
        excludes.push({
            not: {
                selector_matches:
                    'a[href*="#"], area[href*="#"]'
            }
        });

        var words = util.splitLines(
            util.get('exclude_words', DEFAULTS.exclude_words)
        );

        if (words.length) {
            var wordSelectors = words.map(function (word) {
                return '[href*="' +
                    util.escapeCssString(word) +
                    '" i]';
            });

            excludes.push({
                not: {
                    selector_matches: wordSelectors.join(', ')
                }
            });
        }

        return excludes;
    }

    function buildRules() {
        if (!util.get('enabled', true)) {
            return null;
        }

        if (
            util.get('respect_dnt', true) &&
            navigator.doNotTrack === '1'
        ) {
            console.log(
                '[网页加速器] 检测到 DNT=1，按设置跳过推测加载。'
            );
            return null;
        }

        var eagerness = util.get(
            'eagerness',
            DEFAULTS.eagerness
        );

        if (VALID_EAGERNESS.indexOf(eagerness) === -1) {
            eagerness = 'moderate';
        }

        var domains = getExcludedDomains();
        var commonExcludes = buildCommonExcludes();
        var rules = {};

        // A. 同源预渲染：当前网站不在域名黑名单中时生成。
        if (!isCurrentHostExcluded(domains)) {
            var sameOriginWhere = [
                { href_matches: '/*' }
            ].concat(commonExcludes);

            rules.prerender = [{
                where: {
                    and: sameOriginWhere
                },
                eagerness: eagerness
            }];
        }

        // B. 跨域 HTTPS 预取。
        if (util.get('allow_external', true)) {
            var crossOriginWhere = [
                { href_matches: 'https://*/*' },
                { not: { href_matches: '/*' } }
            ].concat(commonExcludes);

            domains.forEach(function (domain) {
                // 分别排除域名本身和任意子域名。
                crossOriginWhere.push({
                    not: {
                        href_matches: 'https://' + domain + '/*'
                    }
                });

                crossOriginWhere.push({
                    not: {
                        href_matches: 'https://*.' + domain + '/*'
                    }
                });
            });

            // v6.5：不再声明 requires: ['anonymous-client-ip-when-cross-origin']。
            // 实测（Chrome 155）该声明会让整条规则成为硬门槛：凡是匿名客户端 IP（ACI）
            // 不可用的环境，跨域推测一次都不触发，等于默认开启的跨域 Prefetch 全程失效。
            // 去掉后跨域 Prefetch 立即恢复；代价是目标站会看到你的真实 IP。
            rules.prefetch = [{
                where: {
                    and: crossOriginWhere
                },
                eagerness: eagerness
            }];
        }

        return Object.keys(rules).length ? rules : null;
    }

    /* =========================================================
     * 6. 注入 Speculation Rules
     * ========================================================= */
    function appendRulesScript(script) {
        var target = document.head || document.documentElement;

        if (target) {
            target.appendChild(script);
            return;
        }

        // document-start 极早期没有根节点时，等待节点出现后再注入。
        if (typeof MutationObserver === 'function') {
            var observer = new MutationObserver(function () {
                var readyTarget =
                    document.head || document.documentElement;

                if (readyTarget) {
                    readyTarget.appendChild(script);
                    observer.disconnect();
                }
            });

            observer.observe(document, {
                childList: true,
                subtree: true
            });
        } else {
            document.addEventListener('DOMContentLoaded', function () {
                var readyTarget =
                    document.head || document.documentElement;

                if (readyTarget) {
                    readyTarget.appendChild(script);
                }
            }, { once: true });
        }
    }

    function injectRules() {
        if (document.getElementById(SCRIPT_ID)) {
            return;
        }

        var rules = buildRules();

        if (!rules) {
            console.log(
                '[网页加速器] 当前配置未生成推测规则。'
            );
            return;
        }

        var script = document.createElement('script');
        script.id = SCRIPT_ID;
        script.type = 'speculationrules';
        script.textContent = JSON.stringify(rules);

        appendRulesScript(script);

        console.log(
            '[网页加速器 v6.5] Speculation Rules 已提交。',
            rules
        );

        if (!rules.prefetch) {
            console.log(
                '[网页加速器] 本次未生成跨域 Prefetch 规则（allow_external 关闭，或当前站被排除）。'
            );
        }
    }

    /* =========================================================
     * 7. 设置菜单
     * ========================================================= */
    function registerMenu() {
        GM_registerMenuCommand(
            util.get('enabled', true)
                ? '🚀 网页加速器：已启用'
                : '⛔ 网页加速器：已关闭',
            function () {
                util.set(
                    'enabled',
                    !util.get('enabled', true)
                );

                location.reload();
            }
        );

        GM_registerMenuCommand(
            '⚙️ 加速器设置',
            function () {
                var currentEagerness = util.get(
                    'eagerness',
                    DEFAULTS.eagerness
                );

                if (
                    VALID_EAGERNESS.indexOf(currentEagerness) === -1
                ) {
                    currentEagerness = 'moderate';
                }

                var enabled = util.get('enabled', true);
                var respectDnt = util.get('respect_dnt', true);
                var allowExternal = util.get('allow_external', true);
                var allowQuery = util.get('allow_query', true);

                var excludeDomains = util.get(
                    'exclude_domains',
                    DEFAULTS.exclude_domains
                );

                var excludeWords = util.get(
                    'exclude_words',
                    DEFAULTS.exclude_words
                );

                var html =
                    '<div class="is-container">' +

                        '<div class="is-row">' +
                            '<span>启用加速</span>' +
                            '<input type="checkbox" id="IS-enabled" class="is-chk" ' +
                            (enabled ? 'checked' : '') +
                            '>' +
                        '</div>' +

                        '<div class="is-row">' +
                            '<span>尊重 DNT</span>' +
                            '<input type="checkbox" id="IS-respect_dnt" class="is-chk" ' +
                            (respectDnt ? 'checked' : '') +
                            '>' +
                        '</div>' +

                        '<div class="is-row">' +
                            '<span>跨域 HTTPS Prefetch</span>' +
                            '<input type="checkbox" id="IS-allow_external" class="is-chk" ' +
                            (allowExternal ? 'checked' : '') +
                            '>' +
                        '</div>' +

                        '<div class="is-row">' +
                            '<span>允许含参链接</span>' +
                            '<input type="checkbox" id="IS-allow_query" class="is-chk" ' +
                            (allowQuery ? 'checked' : '') +
                            '>' +
                        '</div>' +

                        '<div class="is-col">' +
                            '<span>推测强度</span>' +
                            '<select id="IS-eagerness" class="is-select">' +

                                '<option value="conservative" ' +
                                (currentEagerness === 'conservative'
                                    ? 'selected' : '') +
                                '>conservative（更谨慎）</option>' +

                                '<option value="moderate" ' +
                                (currentEagerness === 'moderate'
                                    ? 'selected' : '') +
                                '>moderate（推荐）</option>' +

                                '<option value="eager" ' +
                                (currentEagerness === 'eager'
                                    ? 'selected' : '') +
                                '>eager（更积极）</option>' +

                            '</select>' +
                        '</div>' +

                        '<div class="is-col">' +
                            '<span>排除域名（一行一个）</span>' +
                            '<textarea id="IS-exclude_domains" class="is-txt" ' +
                            'placeholder="example.com&#10;*.example.org">' +
                            util.escapeHtml(excludeDomains) +
                            '</textarea>' +
                        '</div>' +

                        '<div class="is-col">' +
                            '<span>排除关键词（一行一个）</span>' +
                            '<textarea id="IS-exclude_words" class="is-txt">' +
                            util.escapeHtml(excludeWords) +
                            '</textarea>' +
                        '</div>' +

                        '<div class="is-note">' +
                            '建议保持 moderate。更高强度可能增加预取流量和内存占用；' +
                            '浏览器仍会根据自身策略决定是否执行。' +
                        '</div>' +

                    '</div>';

                Swal.fire({
                    title: '🚀 Chromium 155+ 网页加速器',
                    html: html,
                    width: 440,
                    showCloseButton: true,
                    confirmButtonText: '保存并重载',
                    cancelButtonText: '取消',
                    showCancelButton: true,
                    customClass: {
                        popup: 'instant-popup'
                    }
                }).then(function (result) {
                    if (!result.isConfirmed) {
                        return;
                    }

                    [
                        'enabled',
                        'respect_dnt',
                        'allow_external',
                        'allow_query'
                    ].forEach(function (key) {
                        var element = document.getElementById(
                            'IS-' + key
                        );

                        if (element) {
                            util.set(key, Boolean(element.checked));
                        }
                    });

                    var eagernessElement =
                        document.getElementById('IS-eagerness');

                    if (
                        eagernessElement &&
                        VALID_EAGERNESS.indexOf(
                            eagernessElement.value
                        ) !== -1
                    ) {
                        util.set(
                            'eagerness',
                            eagernessElement.value
                        );
                    }

                    [
                        'exclude_domains',
                        'exclude_words'
                    ].forEach(function (key) {
                        var element = document.getElementById(
                            'IS-' + key
                        );

                        if (element) {
                            util.set(key, element.value);
                        }
                    });

                    location.reload();
                });
            }
        );

        GM_registerMenuCommand(
            '♻️ 恢复默认设置',
            function () {
                Swal.fire({
                    title: '恢复默认设置？',
                    text: '所有加速器设置将恢复默认值。',
                    icon: 'warning',
                    showCancelButton: true,
                    confirmButtonText: '恢复',
                    cancelButtonText: '取消'
                }).then(function (result) {
                    if (!result.isConfirmed) {
                        return;
                    }

                    Object.keys(DEFAULTS).forEach(function (key) {
                        util.set(key, DEFAULTS[key]);
                    });

                    location.reload();
                });
            }
        );
    }

    /* =========================================================
     * 8. UI 样式
     * ========================================================= */
    function injectStyle() {
        var dark = window.matchMedia(
            '(prefers-color-scheme: dark)'
        ).matches;

        var css =
            '.instant-popup{font-size:14px!important}' +
            '.is-container{display:flex;flex-direction:column;gap:10px;text-align:left}' +
            '.is-row{display:flex;justify-content:space-between;align-items:center;min-height:28px;gap:12px}' +
            '.is-col{display:flex;flex-direction:column;gap:5px}' +
            '.is-txt{width:100%;min-height:72px;resize:vertical;box-sizing:border-box;padding:6px;border-radius:5px;border:1px solid #ccc;font:12px monospace}' +
            '.is-select{width:100%;padding:6px;border-radius:5px;border:1px solid #ccc}' +
            '.is-chk{width:18px;height:18px;cursor:pointer;flex-shrink:0}' +
            '.is-note{font-size:12px;opacity:.78;line-height:1.5}' +
            (
                dark
                    ? '.instant-popup{background:#222;color:#eee}' +
                      '.is-txt,.is-select{background:#333;color:#fff;border-color:#555}'
                    : ''
            );

        util.addStyle(STYLE_ID, css);

        var swalCss = GM_getResourceText('swalStyle');

        if (swalCss) {
            util.addStyle('tm-swal-theme-v640', swalCss);
        }
    }

    /* =========================================================
     * 9. 启动
     * ========================================================= */
    injectRules();
    injectStyle();
    registerMenu();

    console.log(
        '[网页加速器 v6.5.0] Chromium 155+ Desktop 初始化完成。'
    );
})();