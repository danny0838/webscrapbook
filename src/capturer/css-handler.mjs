import * as utils from "../utils/common.mjs";
import {MapWithDefault} from "../lib/map-with-default.mjs";

/**
 * A class that tokenizes a CSS selector.
 *
 * Expect a selector text which is validated and tidied by the browser.
 */
class CssSelectorTokenizer {
  constructor() {
    this.regexLiteral = /(?:[0-9A-Za-z_\-\u00A0-\uFFFF]|\\(?:[0-9A-Fa-f]{1,6} ?|.))+|(.)/g;
    this.regexQuote = /[^"]*(?:\\.[^"]*)*"/g;
  }

  static tokensToString(tokens) {
    return tokens.reduce((result, current) => {
      return result + current.value;
    }, '');
  }

  tokensToString(...args) {
    return this.constructor.tokensToString.apply(this, args);
  }

  run(selectorText) {
    this.tokens = [];
    this.depth = -1;
    this.parse(selectorText, 0);
    return this.tokens;
  }

  parse(selectorText, start, endSymbol = null) {
    this.depth++;
    this.regexLiteral.lastIndex = start;
    let match;
    while (match = this.regexLiteral.exec(selectorText)) {
      switch (match[1]) {
        case endSymbol: {
          this.depth--;
          this.tokens.push({
            type: 'operator',
            value: match[0],
            depth: this.depth,
          });
          return this.regexLiteral.lastIndex;
        }
        case '(': {
          this.tokens.push({
            type: 'operator',
            value: match[0],
            depth: this.depth,
          });
          this.regexLiteral.lastIndex = this.parse(
            selectorText,
            this.regexLiteral.lastIndex,
            ')',
          );
          break;
        }
        case '[': {
          const start = this.regexLiteral.lastIndex;
          const end = this.regexLiteral.lastIndex = this.matchBracket(selectorText, start);
          this.tokens.push({
            type: 'selector',
            value: selectorText.slice(start - 1, end),
            depth: this.depth,
          });
          break;
        }
        case ':': {
          const isPseudoElement = selectorText[this.regexLiteral.lastIndex] === ':';
          if (isPseudoElement) {
            this.regexLiteral.lastIndex++;
          }
          this.tokens.push({
            type: 'operator',
            value: isPseudoElement ? '::' : ':',
            depth: this.depth,
          });
          this.regexLiteral.lastIndex = this.parsePseudo(
            selectorText,
            this.regexLiteral.lastIndex,
          );
          break;
        }
        case '|': {
          // Special handling for || (column combinator in CSS4 draft)
          // to prevent misinterpreted as double | operator.
          const isColumnCombinator = selectorText[this.regexLiteral.lastIndex] === '|';
          if (isColumnCombinator) {
            this.regexLiteral.lastIndex++;
          }
          this.tokens.push({
            type: 'operator',
            value: isColumnCombinator ? '||' : '|',
            depth: this.depth,
          });
          break;
        }
        default: {
          if (match[1]) {
            this.tokens.push({
              type: 'operator',
              value: match[0],
              depth: this.depth,
            });
          } else {
            this.tokens.push({
              type: 'name',
              value: match[0],
              depth: this.depth,
            });
          }
          break;
        }
      }
    }
    this.depth--;
    return selectorText.length;
  }

  parsePseudo(selectorText, start) {
    let _tokens = this.tokens;
    this.tokens = [];
    let lastIndex = selectorText.length;
    this.regexLiteral.lastIndex = start;
    let match;
    while (match = this.regexLiteral.exec(selectorText)) {
      switch (match[1]) {
        case '(': {
          this.tokens.push({
            type: 'operator',
            value: match[0],
            depth: this.depth,
          });
          this.regexLiteral.lastIndex = this.parse(
            selectorText,
            this.regexLiteral.lastIndex,
            ')',
          );
          break;
        }
        default: {
          if (match[1]) {
            lastIndex = this.regexLiteral.lastIndex - 1;
            this.regexLiteral.lastIndex = selectorText.length;
          } else {
            this.tokens.push({
              type: 'name',
              value: match[0],
              depth: this.depth,
            });
          }
          break;
        }
      }
    }

    this.tokens = _tokens.concat(this.tokens);
    return lastIndex;
  }

  matchBracket(selectorText, start) {
    this.regexLiteral.lastIndex = start;
    let match;
    while (match = this.regexLiteral.exec(selectorText)) {
      switch (match[1]) {
        case ']': {
          return this.regexLiteral.lastIndex;
        }
        case '"': {
          this.regexLiteral.lastIndex = this.matchQuote(selectorText, this.regexLiteral.lastIndex);
          break;
        }
      }
    }
    return selectorText.length;
  }

  matchQuote(selectorText, start) {
    this.regexQuote.lastIndex = start;
    const m = this.regexQuote.exec(selectorText);
    if (m) { return this.regexQuote.lastIndex; }
    return selectorText.length;
  }
}

/**
 * A class that handles document CSS analysis.
 */
class DocumentCssHandler {
  constructor({doc, rootNode, origNodeMap, clonedNodeMap, settings, options}, capturer) {
    this.doc = doc;
    this.rootNode = rootNode;
    this.origNodeMap = origNodeMap;
    this.clonedNodeMap = clonedNodeMap;
    this.settings = settings;
    this.options = options;
    this.resourceMap = ((options['capture.saveAs'] === 'singleHtml') && options['capture.mergeCssResources']) ? {} : null;
    this.capturer = capturer;
  }

  warn(msg) {
    return this.capturer.invoke("remoteMsg", [{
      msg,
      type: 'warn',
      settings: this.settings, // for missionId
    }]);
  }

  /**
   * Check whether the current status of document stylesheets can be resulted
   * from normal browser pick mechanism.
   *
   * CSS status:
   * 1. Persistent (no rel="alternate", no non-empty title)
   * 2. Preferred (no rel="alternate", has non-empty title)
   * 3. Alternate (has rel="alternate", has non-empty title)
   */
  get isBrowserPick() {
    const result = (() => {
      if (!this.doc.styleSheets) {
        return true;
      }

      const groups = new Map();

      for (const css of this.doc.styleSheets) {
        // ignore imported CSS
        if (!css.ownerNode) {
          continue;
        }

        const title = css.title?.trim();

        // ignore persistent CSS
        if (!title) {
          continue;
        }

        // preferred or alternate
        if (!groups.has(title)) {
          groups.set(title, []);
        }
        groups.get(title).push(css);
      }

      const arr = Array.from(groups.values());

      // For a browser not supporting alternative stylesheets, the disabled
      // property of every stylesheet is false.
      // Chromium has a bug that the disabled property of every alternative
      // stylesheet is false, causing the same result:
      // https://bugs.chromium.org/p/chromium/issues/detail?id=965554
      if (utils.userAgent.is('chromium')) {
        return arr.every(r => r.every(x => !x.disabled));
      }

      if (arr.length === 0) {
        // no non-persistent stylesheets
        return true;
      }

      return (
        // exactly one group has all stylesheets enabled
        arr.filter(r => r.every(x => !x.disabled)).length === 1 &&
        // and others has all stylesheets disabled
        arr.filter(r => r.every(x => !!x.disabled)).length === arr.length - 1
      );
    })();

    // cache the result
    Object.defineProperty(this, 'isBrowserPick', {value: result});

    return result;
  }

  /**
   * Return the equivalent selector text for a possibly nested CSSStyleRule.
   *
   * ref: https://drafts.csswg.org/css-nesting-1/
   *
   * @param {CSSStyleRule} rule
   * @return {string} The equivalent selector text.
   */
  static getSelectorText(...args) {
    const tokenizer = new CssSelectorTokenizer();
    const getParentStyleRule = (rule) => {
      let ruleCurrent = rule;
      while (ruleCurrent = ruleCurrent.parentRule) {
        if (ruleCurrent.type === 1) {
          return ruleCurrent;
        }
      }
      return null;
    };
    const rewriteRule = (rule) => {
      let selectorText = rule.selectorText;
      const parent = getParentStyleRule(rule);
      if (parent) {
        const parentSelectorText = `:is(${rewriteRule(parent)})`;

        // get the top-level selectors separated by ","
        const tokens = tokenizer.run(selectorText);
        let selectors = [], lastSplitIndex = 0;
        for (let i = 0, I = tokens.length; i < I; i++) {
          const token = tokens[i];
          if (token.value === ',' && token.type === 'operator' && token.depth === 0) {
            selectors.push(tokens.slice(lastSplitIndex, i));
            lastSplitIndex = i + 1;
          }
        }
        selectors.push(tokens.slice(lastSplitIndex));

        // combine with parentSelectorText
        selectorText = selectors.map(tokens => {
          let firstToken = null;
          let hasAmp = false;
          for (let i = 0, I = tokens.length; i < I; i++) {
            const token = tokens[i];
            if (!firstToken && !(!utils.trim(token.value) && token.type === 'operator')) {
              firstToken = token;
            }
            if (token.value === '&' && token.type === 'operator') {
              hasAmp = true;
              tokens[i] = {
                type: 'selector',
                value: parentSelectorText,
                depth: token.depth,
              };
            }
          }
          if (!hasAmp || (['>', '+', '~', '||'].includes(firstToken.value) && firstToken.type === 'operator')) {
            tokens.splice(0, 0,
              {
                type: 'selector',
                value: parentSelectorText,
                depth: 0,
              },
              {
                type: 'operator',
                value: ' ',
                depth: 0,
              },
            );
          }
          return tokenizer.tokensToString(tokens);
        }).join(', ');
      }
      return selectorText;
    };
    const fn = (rule) => {
      return rewriteRule(rule);
    };
    Object.defineProperty(this, 'getSelectorText', {value: fn});
    return fn(...args);
  }

  getSelectorText(...args) {
    return this.constructor.getSelectorText.apply(this, args);
  }

  /**
   * Rewrite the given CSS selector to cover a reasonably broader cases and
   * can be used in querySelector().
   *
   * 1. Rewrite namespace in the selector. (e.g. svg|a => a,
   *    [attr=value] => [*|attr=value])
   * 2. Recursively remove pseudoes (including pseudo-classes(:*) and
   *    pseudo-elements(::*)) unless it's listed in ALLOWED_PSEUDO.
   *    (e.g. div:hover => div).
   * 3. Add * in place if the non-pseudo version becomes empty.
   *    (e.g. :hover => *)
   * 4. Return "" if the selector contains a special pseudo that cannot be
   *    reliably rewritten.
   *    (e.g. :host and :host-context represent the shadow host, which can
   *    not be matched by ShadowRoot.querySelector() using any selector.
   */
  static getSelectorVerifier(...args) {
    // Do not include :not as the semantic is reversed and the rule could be
    // narrower after rewriting (e.g. :not(:hover) => :not(*)).
    const ALLOWED_PSEUDO = new Set([
      'root', 'scope',
      'is', 'matches', 'any', 'where', 'has',
      'first-child', 'first-of-type', 'last-child', 'last-of-type',
      'nth-child', 'nth-of-type', 'nth-last-child', 'nth-last-of-type',
      'only-child', 'only-of-type',
    ]);

    // @TODO: rewrite only standalone ':host', as ':host > div' etc. can
    //        still match using ShadowRoot.querySelector().
    const SPECIAL_PSEUDO = new Set(['host', 'host-context']);

    const regexAttrNs = /^\[[^\\|=\]]*(?:\\.[^\\|=\]]*)*\|(?!=)/g;

    const tokenizer = new CssSelectorTokenizer();

    const fn = (selectorText) => {
      const tokens = tokenizer.run(selectorText);
      const result = [];
      for (let i = 0, I = tokens.length; i < I; i++) {
        const token = tokens[i];

        // Remove namespaced type selector to match any namespace.
        // - document.querySelector('elem') matches elem or ns:elem in any namespace
        // - document.querySelector('*|elem') matches elem or ns:elem in any namespace
        //   (seems no difference to the previous one)
        // - document.querySelector('ns|elem') throws an error
        if (token.value === '|' && token.type === 'operator') {
          const prevToken = result[result.length - 1];
          if (prevToken && (prevToken.type === 'name' || (prevToken.value === '*' && prevToken.type === 'operator'))) {
            result.pop();
          }
          continue;
        }

        // Force attribute selector namespace to be *. Do this for any namespace since
        // the namespace and prefix can be defined by a @namespace rule and different
        // from the docuemnt, which is difficult to trace reliably.
        // - document.querySelector('[*|attr]') matches attr or ns:attr in any namespace
        // - document.querySelector('[attr]') matches attr in any namespace
        // - document.querySelector('[ns|attr]') throws an error
        if (token.type === 'selector' && token.value.startsWith('[')) {
          regexAttrNs.lastIndex = 0;
          if (regexAttrNs.test(token.value)) {
            token.value = '[*|' + token.value.slice(regexAttrNs.lastIndex);
          } else {
            token.value = '[*|' + token.value.slice(1);
          }
        }

        // handle pseudo-classes/elements
        if ((token.value === ':' || token.value === '::') && token.type === 'operator') {
          const name = tokens[i + 1].value;

          if (SPECIAL_PSEUDO.has(name)) {
            return "";
          }

          if (!ALLOWED_PSEUDO.has(name)) {
            skipPseudoAndGetNextPos: {
              let j = i = i + 2;
              const parenToken = tokens[j];
              if (parenToken?.value === '(' && parenToken.type === 'operator') {
                const depth = parenToken.depth;
                for (j += 1; j < I; j++) {
                  const token = tokens[j];
                  if (token?.depth === depth) {
                    i = j + 1;
                    break skipPseudoAndGetNextPos;
                  }
                }
                i = j;
                break skipPseudoAndGetNextPos;
              }
            }
            i -= 1;

            addUniversalSelector: {
              const prevToken = result[result.length - 1];
              if (!prevToken || (prevToken.type === 'operator' && prevToken.value !== ')')) {
                result.push({
                  type: 'name',
                  value: '*',
                  depth: token.depth,
                });
              }
            }

            continue;
          }
        }

        result.push(token);
      }

      return tokenizer.tokensToString(result);
    };

    Object.defineProperty(this, 'getSelectorVerifier', {value: fn});
    return fn(...args);
  }

  getSelectorVerifier(...args) {
    return this.constructor.getSelectorVerifier.apply(this, args);
  }

  /**
   * Verify whether rule matches something in root.
   *
   * @param {Element|DocumentFragment} root
   * @param {CSSStyleRule} rule
   */
  verifySelector(root, rule) {
    const selectorText = this.getSelectorText(rule);

    let selectorTextInvalid = false;
    try {
      // querySelector of a pseudo selector like a:hover always return null
      if (root.querySelector(selectorText)) { return true; }
    } catch (ex) {
      // As CSSStyleRule.selectorText is already a valid selector,
      // an error means it's valid but not supported by querySelector.
      // One example is a namespaced selector like: svg|a,
      // as querySelector cannot consume a @namespace rule in prior.
      // Mark selectorText as invalid and test the rewritten selector text
      // instead.
      selectorTextInvalid = true;
    }

    let selectorTextRewritten = this.getSelectorVerifier(selectorText);
    if (!selectorTextRewritten) {
      // The selector cannot be reliably rewritten.
      return true;
    }
    if (selectorTextInvalid || selectorTextRewritten !== selectorText) {
      try {
        if (root.querySelector(selectorTextRewritten)) {
          return true;
        }
      } catch (ex) {
        // Rewritten selector still not supported by querySelector due to an
        // unexpected reason.
        // Return true as false positive is safer than false negative.
        return true;
      }
    }

    return false;
  }

  getElemCss(elem) {
    const {origNodeMap} = this;
    const origElem = origNodeMap.get(elem);

    // origElem.sheet may be null for a headless document in some browsers
    return origElem?.sheet;
  }

  static getRulesFromCssText(cssText) {
    // In Chromium, BOM causes returned cssRules be empty.
    // Remove it to prevent the issue.
    if (cssText[0] === '\uFEFF') {
      cssText = cssText.slice(1);
    }

    const d = document.implementation.createHTMLDocument('');
    const styleElem = d.createElement('style');
    styleElem.textContent = cssText;
    d.head.appendChild(styleElem);
    return styleElem.sheet.cssRules;
  }

  getRulesFromCssText(...args) {
    return this.constructor.getRulesFromCssText.apply(this, args);
  }

  /**
   * @param {Object} params
   * @param {?CSSStyleSheet} params.css - The CSS to get rules from.
   * @param {string} [params.url] - The overriding source URL for retrieving a
   *   cross-orign CSS.
   * @param {string} [params.refUrl] - The referrer URL for retrieving a
   *   cross-orign CSS.
   * @param {string} [params.refPolicy] - The referrer policy for retrieving a
   *   cross-orign CSS.
   * @param {string} [params.envCharset] - The environment charset for
   *   retrieving a cross-orign CSS.
   * @param {boolean} [params.crossOrigin] - Whether to retrieve CSS via web
   *   request if it's cross origin.
   * @param {boolean} [params.errorWithNull] - Whether to return null if CSS
   *   not retrievable.
   * @return {?CSSStyleRule[]}
   */
  async getRulesFromCss({css, url, refUrl, refPolicy, envCharset, crossOrigin = true, errorWithNull = false}) {
    let rules = null;
    try {
      // Firefox may get this for a stylesheet with relative URL imported from
      // a stylesheet with null href (mostly when the owner document is created
      // using document.implementation.createHTMLDocument). In such case
      // css.cssRules is an empty CSSRuleList.
      if (css.href === 'about:invalid') {
        throw new Error('cssRules not accessible.');
      }

      // If cross-origin, css.cssRules may return null or throw an error.
      // In Chromium >= 120, css (CSSImportRule.styleSheet) is null for an
      // imported CSS.
      rules = css.cssRules;

      if (!rules) {
        throw new Error('cssRules not accessible.');
      }
    } catch (ex) {
      // cssRules not accessible, probably a cross-domain CSS.
      if (crossOrigin) {
        if (css?.ownerNode?.nodeName.toLowerCase() === 'style') {
          rules = this.getRulesFromCssText(css.ownerNode.textContent);
        } else {
          const {settings, options} = this;

          try {
            const response = await this.capturer.fetchCss({
              url: url || css.href,
              refUrl,
              refPolicy,
              envCharset,
              settings,
              options,
            });
            rules = this.getRulesFromCssText(response.text);
          } catch (ex) {
            console.error(ex);
          }
        }
      }
    }

    if (!rules && !errorWithNull) {
      return [];
    }

    return rules;
  }

  /**
   * Rewrite a given CSS Text.
   *
   * @param {Object} params
   * @param {string} params.cssText - The CSS text to rewrite.
   * @param {string} params.baseUrl - The base URL for URL resolving.
   * @param {string} params.refUrl - The referrer URL for fetching resources.
   * @param {string} [params.refPolicy] - The referrer policy for fetching
   *   resources.
   * @param {string} [params.envCharset] - The environment charset for fetching
   *   resources.
   * @param {CSSStyleSheet} [params.refCss] - The reference CSS (which holds
   *   the @import rule(s), for an imported CSS).
   * @param {Node} [params.rootNode] - The reference root node for an imported
   *   CSS.
   * @param {boolean} [params.isInline] - whether cssText is inline.
   * @param {captureSettings} [params.settings]
   * @param {captureOptions} [params.options]
   */
  async rewriteCssText({cssText, baseUrl, refUrl, refPolicy, envCharset, refCss = null, rootNode, isInline = false, settings, options}) {
    settings = Object.assign({}, this.settings, settings);
    settings = Object.assign(settings, {
      recurseChain: [...settings.recurseChain, utils.splitUrlByAnchor(refUrl)[0]],
    });
    options = options ? Object.assign({}, this.options, options) : this.options;

    const {usedCssFontUrl, usedCssImageUrl} = settings;

    const resolveCssUrl = (sourceUrl, baseUrl) => {
      const url = this.capturer.resolveRelativeUrl(sourceUrl, baseUrl);
      let valid = true;

      // do not fetch if the URL is not resolved
      if (!utils.isUrlAbsolute(url)) {
        valid = false;
      }

      return {
        url,
        recordUrl: options["capture.recordRewrites"] ? sourceUrl : "",
        valid,
      };
    };

    const downloadFileInCss = async (url) => {
      // keep original URL for non-supported protocols
      if (!['http:', 'https:', 'file:', 'data:', 'blob:'].some(p => url.startsWith(p))) {
        return url;
      }

      const response = await this.capturer.downloadFile({
        url,
        refUrl,
        refPolicy,
        settings,
        options,
      }).catch((ex) => {
        console.error(ex);
        this.warn(utils.lang("ErrorFileDownloadError", [url, ex.message]));
        return {url: this.capturer.getErrorUrl(url, options), error: {message: ex.message}};
      });
      return response.url;
    };

    const importRules = [];
    let importRuleIdx = 0;
    if (refCss) {
      const rules = await this.getRulesFromCss({css: refCss, url: refUrl, refUrl, refPolicy, envCharset});
      for (const rule of rules) {
        if (rule.type === 3) {
          importRules.push(rule);
        }
      }
    }

    const rewriteImportUrl = async (sourceUrl) => {
      let {url, recordUrl, valid} = resolveCssUrl(sourceUrl, baseUrl);
      switch (options["capture.style"]) {
        case "link":
          // do nothing
          break;
        case "blank":
        case "remove":
          url = "";
          break;
        case "save":
        default:
          if (valid) {
            const rule = importRules[importRuleIdx++];
            await this.rewriteCss({
              url,
              refCss: rule?.styleSheet,
              baseUrl,
              refUrl,
              refPolicy,
              envCharset,
              rootNode,
              settings,
              options,
              callback: (elem, response) => {
                url = response.url;
              },
            });
          }
          break;
      }
      return {url, recordUrl};
    };

    const rewriteFontFaceUrl = async (sourceUrl) => {
      let {url, recordUrl, valid} = resolveCssUrl(sourceUrl, baseUrl);
      switch (options["capture.font"]) {
        case "link":
          // do nothing
          break;
        case "blank":
        case "remove": // deprecated
          url = "";
          break;
        case "save-used":
        case "save":
        default:
          if (usedCssFontUrl && !usedCssFontUrl[url]) {
            url = "";
            break;
          }

          if (valid) {
            url = await downloadFileInCss(url);
          }
          break;
      }
      return {url, recordUrl};
    };

    const rewriteBackgroundUrl = async (sourceUrl) => {
      let {url, recordUrl, valid} = resolveCssUrl(sourceUrl, baseUrl);
      switch (options["capture.imageBackground"]) {
        case "link":
          // do nothing
          break;
        case "blank":
        case "remove": // deprecated
          url = "";
          break;
        case "save-used":
        case "save":
        default:
          if (usedCssImageUrl && !usedCssImageUrl[url]) {
            url = "";
            break;
          }

          if (valid) {
            url = await downloadFileInCss(url);
          }
          break;
      }
      return {url, recordUrl};
    };

    const rewriteDummy = (x) => ({url: x, recordUrl: ''});

    return await utils.rewriteCssText(cssText, {
      rewriteImportUrl: !isInline ? rewriteImportUrl : rewriteDummy,
      rewriteFontFaceUrl: !isInline ? rewriteFontFaceUrl : rewriteDummy,
      rewriteBackgroundUrl,
      resourceMap: this.resourceMap,
    });
  }

  /**
   * Rewrite given cssRules to cssText.
   *
   * @param {Object} params
   * @param {CSSRuleList|CSSRule[]} params.cssRules - The CSS rules to rewrite.
   * @param {string} params.baseUrl - The base URL for URL resolving.
   * @param {string} params.refUrl - The referrer URL for fetching resources.
   * @param {string} [params.refPolicy] - The referrer policy for fetching
   *   resources.
   * @param {string} [params.envCharset] - The environment charset for fetching
   *   resources.
   * @param {CSSStyleSheet} [params.refCss] - The reference CSS (which holds
   *   the @import rule(s), for an imported CSS).
   * @param {Node|Node[]} [params.rootNode] - The document or ShadowRoot nodes
   *   for verifying selectors.
   * @param {string} [params.indent] - The string to indent the output CSS
   *   text.
   * @param {string} [params.sep] - The string to separate each CSS rule.
   * @param {captureSettings} [params.settings]
   * @param {captureOptions} [params.options]
   */
  async rewriteCssRules({cssRules, baseUrl, refUrl, refPolicy, envCharset, refCss, rootNode, indent = '', sep = '\n', settings, options}) {
    const rules = [];
    for (const cssRule of cssRules) {
      switch (cssRule.type) {
        case CSSRule.STYLE_RULE: {
          // skip if this CSS rule applies to no node in the related root nodes
          if (rootNode) {
            if (!Array.isArray(rootNode)) {
              rootNode = [rootNode];
            }
            if (rootNode.every(rootNode => !this.verifySelector(rootNode, cssRule))) {
              break;
            }
          }

          if (cssRule.cssRules?.length) {
            // nesting CSS

            // style declarations of this rule
            const cssText1 = await this.rewriteCssText({
              cssText: cssRule.style.cssText,
              baseUrl,
              refUrl,
              refPolicy,
              envCharset,
              refCss,
              settings,
              options,
            });

            // recurse into sub-rules
            const cssText2 = (await this.rewriteCssRules({
              cssRules: cssRule.cssRules,
              baseUrl,
              refUrl,
              refPolicy,
              envCharset,
              refCss,
              rootNode,
              indent: indent + '  ',
              settings,
              options,
            }));

            const cssText = (cssText1 ? indent + '  ' + cssText1 + '\n' : '') + cssText2;
            if (cssText) {
              rules[rules.length] = indent + cssRule.selectorText + ' {\n'
                + cssText + '\n'
                + indent + '}';
            }
          } else {
            const cssText = await this.rewriteCssText({
              cssText: cssRule.cssText,
              baseUrl,
              refUrl,
              refPolicy,
              envCharset,
              refCss,
              settings,
              options,
            });
            if (cssText) {
              rules[rules.length] = indent + cssText;
            }
          }
          break;
        }
        case CSSRule.IMPORT_RULE: {
          const cssText = await this.rewriteCssText({
            cssText: cssRule.cssText,
            baseUrl,
            refUrl,
            refPolicy,
            envCharset,
            refCss,
            rootNode,
            settings,
            options,
          });
          if (cssText) {
            rules[rules.length] = indent + cssText;
          }
          break;
        }
        case CSSRule.MEDIA_RULE: {
          const cssText = (await this.rewriteCssRules({
            cssRules: cssRule.cssRules,
            baseUrl,
            refUrl,
            refPolicy,
            envCharset,
            refCss,
            rootNode,
            indent: indent + '  ',
            settings,
            options,
          }));
          if (cssText) {
            rules[rules.length] = indent + '@media ' + cssRule.conditionText + ' {\n'
                + cssText + '\n'
                + indent + '}';
          }
          break;
        }
        case CSSRule.KEYFRAMES_RULE: {
          const cssText = (await this.rewriteCssRules({
            cssRules: cssRule.cssRules,
            baseUrl,
            refUrl,
            refPolicy,
            envCharset,
            refCss,
            rootNode,
            indent: indent + '  ',
            settings,
            options,
          }));
          if (cssText) {
            rules[rules.length] = indent + '@keyframes ' + CSS.escape(cssRule.name) + ' {\n'
                + cssText + '\n'
                + indent + '}';
          }
          break;
        }
        case CSSRule.SUPPORTS_RULE: {
          const cssText = (await this.rewriteCssRules({
            cssRules: cssRule.cssRules,
            baseUrl,
            refUrl,
            refPolicy,
            envCharset,
            refCss,
            rootNode,
            indent: indent + '  ',
            settings,
            options,
          }));
          if (cssText) {
            rules[rules.length] = indent + '@supports ' + cssRule.conditionText + ' {\n'
                + cssText + '\n'
                + indent + '}';
          }
          break;
        }
        case CSSRule.NAMESPACE_RULE: {
          const cssText = cssRule.cssText;
          if (cssText) {
            rules[rules.length] = indent + cssText;
          }
          break;
        }
        case CSSRule.FONT_FACE_RULE:
        case CSSRule.PAGE_RULE:
        case CSSRule.KEYFRAME_RULE:
        case 11/* CSSRule.COUNTER_STYLE_RULE */:
        default: {
          const cssText = await this.rewriteCssText({
            cssText: cssRule.cssText,
            baseUrl,
            refUrl,
            refPolicy,
            envCharset,
            refCss,
            settings,
            options,
          });
          if (cssText) {
            rules[rules.length] = indent + cssText;
          }
          break;
        }
      }
    }
    return rules.join(sep);
  }

  /**
   * @callback rewriteCssRewriter
   * @param {Element} elem
   * @param {fetchCssResponse} response
   */

  /**
   * Rewrite an internal, external, or imported CSS.
   *
   * - Pass {elem, callback} for internal or external CSS.
   * - Pass {url, refCss, callback} for imported CSS.
   *
   * @param {Object} params
   * @param {HTMLElement} [params.elem] - The elem to have CSS rewritten.
   * @param {string} [params.url] - The source URL of the imported CSS.
   * @param {?CSSStyleSheet} [params.refCss] - The reference CSS of the
   *   imported CSS (CSSImportRule.styleSheet).
   * @param {string} [params.baseUrl] - The base URL for URL resolving.
   * @param {string} [params.refUrl] - The referrer URL for fetching
   *   resources.
   * @param {string} [params.refPolicy] - The referrer policy for fetching
   *   resources.
   * @param {string} [params.envCharset] - The environment charset for
   *   fetching resources.
   * @param {Node} [params.rootNode] - The reference root node for an
   *   imported CSS.
   * @param {rewriteCssRewriter} params.callback
   * @param {captureSettings} [params.settings]
   * @param {captureOptions} [params.options]
   */
  async rewriteCss({elem, url, refCss, baseUrl, refUrl, refPolicy, envCharset, rootNode, callback, settings, options}) {
    settings = settings ? Object.assign({}, this.settings, settings) : this.settings;
    options = options ? Object.assign({}, this.options, options) : this.options;

    let sourceUrl;
    let cssType = !elem ? 'imported' : elem.nodeName.toLowerCase() === 'link' ? 'external' : 'internal';
    let cssText = "";
    let cssRules;
    let charset;
    let newFilename = "";
    let isCircular = false;
    let isDynamic = false;

    init: {
      if (cssType === 'internal') {
        // prevent missing rootNode
        rootNode = rootNode || elem.getRootNode();

        refCss = this.getElemCss(elem);
        cssText = elem.textContent;
        charset = envCharset;
        break init;
      }

      if (cssType === 'external') {
        // prevent missing rootNode
        rootNode = rootNode || elem.getRootNode();

        refCss = this.getElemCss(elem);
        sourceUrl = elem.getAttribute("href");
      } else if (cssType === 'imported') {
        // rootNode should exist (passed by the importer CSS)

        sourceUrl = url;
      }

      let response;
      try {
        response = await this.capturer.fetchCss({
          url: sourceUrl,
          refUrl,
          refPolicy,
          envCharset,
          settings,
          options,
        });
      } catch (ex) {
        console.error(ex);
        this.warn(utils.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
        response = {url: this.capturer.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
        await callback(elem, response);
        return;
      }

      cssText = response.text;
      charset = response.charset;

      isCircular = settings.recurseChain.includes(utils.splitUrlByAnchor(sourceUrl)[0]);
    }

    checkDynamicCss: {
      // Ignore refCss if sourceUrl is circularly referenced, as we cannot get
      // original cssRules from CSSOM in this case and thus cannot reliably
      // determine whether it's dynamic.
      //
      // If style1.css => style2.css => style3.css => style1.css
      // - Chromium: styleSheet of StyleSheet "style3.css" is null
      // - Firefox: cssRules of the circularly referenced StyleSheet "style1.css"
      //            is empty, but can be modified by scripts.
      if (isCircular) {
        break checkDynamicCss;
      }

      if (!refCss) {
        break checkDynamicCss;
      }

      // real rules from CSSOM
      cssRules = await this.getRulesFromCss({
        css: refCss,
        crossOrigin: false,
        errorWithNull: true,
      });

      if (!cssRules) {
        break checkDynamicCss;
      }

      // if charset is not known, force conversion to UTF-8
      // utils.utf8ToUnicode throws an error if cssText contains a UTF-8 invalid char
      const cssTextUnicode = charset ? cssText : await utils.readFileAsText(new Blob([utils.byteStringToArrayBuffer(cssText)]));

      // rules from source CSS text
      const cssRulesSource = this.getRulesFromCssText(cssTextUnicode);

      // difference between cssRulesSource and cssRules is considered dynamic
      // use CSSOM rules instead
      if (cssRulesSource.length !== cssRules.length ||
          !Array.prototype.every.call(
            cssRulesSource,
            (cssRule, i) => (cssRule.cssText === cssRules[i].cssText),
          )) {
        isDynamic = true;

        // Force UTF-8 charset since rules from CSSOM is already parsed by JS
        // and cannot be converted to other charset even if it's gibberish.
        charset = "UTF-8";

        cssText = Array.prototype.map.call(
          cssRules,
          cssRule => cssRule.cssText,
        ).join("\n");
      }
    }

    // register the filename to save (for imported or external CSS)
    // and store in newFilename
    registerFilename: {
      if (cssType === 'internal') {
        break registerFilename;
      }

      // special management for a data URI to be saved as data URI
      if (sourceUrl.startsWith("data:") &&
          (!options["capture.saveDataUriAsFile"] || options["capture.saveAs"] === "singleHtml")) {
        // Save inner URLs as data URL since data URL is null origin
        // and no relative URLs are allowed in it.
        options = Object.assign({}, options, {
          "capture.saveAs": "singleHtml",
        });
        break registerFilename;
      }

      const registry = await this.capturer.invoke("registerFile", [{
        url: sourceUrl,
        role: options["capture.saveAs"] === "singleHtml" ? undefined :
            isDynamic ? `css-${utils.getUuid()}` :
            envCharset ? `css-${envCharset.toLowerCase()}` : 'css',
        settings,
        options,
      }]);

      // handle circular CSS if it's a file to be saved as data URI
      if (isCircular && options["capture.saveAs"] === "singleHtml") {
        const target = sourceUrl;
        const source = settings.recurseChain[settings.recurseChain.length - 1];
        this.warn(utils.lang("WarnCaptureCircular", [source, target]));
        await callback(elem, Object.assign({}, registry, {
          url: `urn:scrapbook:download:circular:url:${sourceUrl}`,
        }));
        return;
      }

      // handle duplicated CSS
      if (registry.isDuplicate) {
        await callback(elem, Object.assign({}, registry, {
          url: registry.url + utils.splitUrlByAnchor(sourceUrl)[1],
        }));
        return;
      }

      newFilename = registry.filename;
    }

    // do the rewriting according to options
    switch (options["capture.rewriteCss"]) {
      case "url": {
        cssText = await this.rewriteCssText({
          cssText,
          baseUrl: sourceUrl || baseUrl,
          refUrl: sourceUrl || refUrl,
          refPolicy,
          envCharset,
          refCss,
          settings,
          options,
        });
        break;
      }
      case "tidy": {
        if (!isDynamic) {
          charset = "UTF-8";
          if (!isCircular) {
            cssRules = cssRules || this.getRulesFromCssText(cssText);
            cssText = Array.prototype.map.call(
              cssRules,
              cssRule => cssRule.cssText,
            ).join("\n");
          } else {
            cssText = '';
          }
        }
        cssText = await this.rewriteCssText({
          cssText,
          baseUrl: sourceUrl || baseUrl,
          refUrl: sourceUrl || refUrl,
          refPolicy,
          envCharset,
          refCss,
          settings,
          options,
        });
        break;
      }
      case "match": {
        if (!cssRules) {
          charset = "UTF-8";
          if (!isCircular) {
            cssRules = this.getRulesFromCssText(cssText);
          }
        }
        if (cssRules) {
          cssText = await this.rewriteCssRules({
            cssRules,
            baseUrl: sourceUrl || baseUrl,
            refUrl: sourceUrl || refUrl,
            refPolicy,
            envCharset,
            refCss,
            rootNode,
            settings,
            options,
          });
        } else {
          cssText = '';
        }
        break;
      }
      case "none":
      default: {
        // do nothing
        break;
      }
    }

    // save result back
    {
      if (cssType === 'internal') {
        await callback(elem, {cssText});
        return;
      }

      // Save as byte string when charset is unknown so that the user can
      // convert the saved CSS file if the assumed charset is incorrect.
      let blob = new Blob(
        [charset ? cssText : utils.byteStringToArrayBuffer(cssText)],
        {type: charset ? "text/css;charset=UTF-8" : "text/css"},
      );
      blob = await this.capturer.saveBlobCache(blob);

      // imported or external CSS
      const response = await this.capturer.invoke("downloadBlob", [{
        blob,
        filename: newFilename,
        sourceUrl,
        settings,
        options,
      }]);

      await callback(elem, Object.assign({}, response, {
        url: response.url + utils.splitUrlByAnchor(sourceUrl)[1],
      }));
    }
  }
}

/**
 * A class that calculates used CSS resources of a document.
 *
 * - Currently we only check whether a font is USED (font-family referred
 *   by CSS) rather than LOADED due to performance consideration and
 *   technical restriction—even if Document.fonts can be checked, it's
 *   hard to trace whether a "loading" status will become "loaded" or
 *   "error".
 * - Implement scoping of @font-face, @keyframes, etc., according to the
 *   spec (https://drafts.csswg.org/css-scoping/#shadow-names), regardless
 *   that it's not yet correctly implemented by most browsers:
 *   - e.g. In Chromium 121 and Firefox 124, @font-face in a shadow DOM
 *     doesn't work.
 *   - e.g. In Chromium 121 and Firefox 124, animation in a shadow DOM
 *     does not search @keyframes from the ancestor scopes.
 *   - ref: https://wiki.csswg.org/spec/css-scoping
 * - A font/keyframe name referenced in a shadow DOM is treated as referenced
 *   in local and all upper scopes, since the local @font-face/@keyframes rule
 *   may be inside a conditional rule and not really used.
 */
class DocumentCssResourcesHandler {
  constructor(cssHandler) {
    this.cssHandler = cssHandler;
    this.capturer = cssHandler.capturer;
  }

  /** @public */
  start() {
    this.scopes = [];
    this.usedFontUrls = {};
    this.usedImageUrls = {};

    this.scopePush(this.cssHandler.doc);
  }

  /** @public */
  stop() {
    while (this.scopes.length) {
      this.scopePop();
    }
  }

  /** @public */
  scopePush(docOrShadowRoot) {
    this.scopes.push({
      root: docOrShadowRoot,
      fontMap: new MapWithDefault(() => ({
        used: false,
        urls: new Set(),
      })),
      keyFrameMap: new MapWithDefault(() => ({
        used: false,
        fonts: new Set(),
        urls: new Set(),
      })),
      fontUsed: new Set(),
      keyFrameUsed: new Set(),
    });
  }

  /** @public */
  scopePop() {
    // mark used keyFrames
    for (let name of this.scopes[this.scopes.length - 1].keyFrameUsed) {
      for (let i = this.scopes.length; i--;) {
        this.scopes[i].keyFrameMap.get(name).used = true;
      }
    }

    // mark used fonts
    for (let ff of this.scopes[this.scopes.length - 1].fontUsed) {
      for (let i = this.scopes.length; i--;) {
        this.scopes[i].fontMap.get(ff).used = true;
      }
    }

    const scope = this.scopes.pop();

    // collect used keyFrames and their used fonts and images
    for (const {used, fonts, urls} of scope.keyFrameMap.values()) {
      if (!used) { continue; }
      for (const font of fonts) {
        scope.fontMap.get(font).used = true;
      }
      for (const url of urls) {
        this.usedImageUrls[url] = true;
      }
    }

    // collect used fonts
    for (const {used, urls} of scope.fontMap.values()) {
      if (!used) { continue; }
      for (const url of urls) {
        this.usedFontUrls[url] = true;
      }
    }
  }

  /** @public */
  async inspectCss({css, baseUrl, refUrl, refPolicy, envCharset, root}) {
    const rules = await this.cssHandler.getRulesFromCss({css, refUrl, refPolicy, envCharset});
    for (const rule of rules) {
      await this.parseCssRule({
        rule,
        baseUrl: css.href || baseUrl,
        refUrl: css.href || refUrl,
        refPolicy,
        envCharset,
        root,
      });
    }
  }

  /** @public */
  inspectStyle({style, baseUrl, isInline = false}) {
    for (let prop of style) {
      if (prop === 'font-family') {
        this.useFont(style.getPropertyValue('font-family'));
      } else if (prop === 'animation-name') {
        this.useKeyFrame(style.getPropertyValue('animation-name'));
      } else if (!isInline) {
        this.forEachUrl(style.getPropertyValue(prop), baseUrl, (url) => {
          this.useImage(url);
        });
      }
    }
  }

  async parseCssRule({rule: cssRule, baseUrl, refUrl, refPolicy, envCharset, root}) {
    switch (cssRule.type) {
      case CSSRule.STYLE_RULE: {
        // this CSS rule applies to no node in the captured area
        if (!this.cssHandler.verifySelector(root, cssRule)) { break; }

        this.inspectStyle({style: cssRule.style, baseUrl});

        // recurse into sub-rules for nesting CSS
        if (cssRule.cssRules?.length) {
          for (const rule of cssRule.cssRules) {
            await this.parseCssRule({rule, baseUrl, refUrl, refPolicy, envCharset, root});
          }
        }

        break;
      }
      case CSSRule.IMPORT_RULE: {
        if (!cssRule.styleSheet) { break; }

        const css = cssRule.styleSheet;
        const url = new URL(cssRule.href, baseUrl).href;
        const rules = await this.cssHandler.getRulesFromCss({css, url, refUrl, refPolicy, envCharset});
        for (const rule of rules) {
          await this.parseCssRule({rule, baseUrl: url, refUrl: url, refPolicy, envCharset, root});
        }
        break;
      }
      case CSSRule.MEDIA_RULE: {
        if (!cssRule.cssRules) { break; }

        for (const rule of cssRule.cssRules) {
          await this.parseCssRule({rule, baseUrl, refUrl, refPolicy, envCharset, root});
        }
        break;
      }
      case CSSRule.FONT_FACE_RULE: {
        if (!cssRule.cssText) { break; }

        const fontFamily = cssRule.style.getPropertyValue('font-family');
        const src = cssRule.style.getPropertyValue('src');

        if (!fontFamily || !src) { break; }

        // record this font family and its font URLs
        this.forEachUrl(src, baseUrl, (url) => {
          this.addFontUrl(fontFamily, url);
        });

        break;
      }
      case CSSRule.PAGE_RULE: {
        if (!cssRule.cssText) { break; }

        this.inspectStyle({style: cssRule.style, baseUrl});
        break;
      }
      case CSSRule.KEYFRAMES_RULE: {
        if (!cssRule.cssRules) { break; }

        for (const rule of cssRule.cssRules) {
          await this.parseCssRule({rule, baseUrl, refUrl, refPolicy, envCharset, root});
        }
        break;
      }
      case CSSRule.KEYFRAME_RULE: {
        if (!cssRule.cssText) { break; }

        this.addKeyFrameFont(cssRule.parentRule.name, cssRule.style.getPropertyValue('font-family'));

        this.forEachUrl(cssRule.cssText, baseUrl, (url) => {
          this.addKeyFrameUrl(cssRule.parentRule.name, url);
        });
        break;
      }
      // Chromium < 91: COUNTER_STYLE_RULE not supported
      case 11/* CSSRule.COUNTER_STYLE_RULE */: {
        if (!cssRule.symbols) { break; }

        this.forEachUrl(cssRule.symbols, baseUrl, (url) => {
          this.useImage(url);
        });
        break;
      }
      default: {
        if (!cssRule.cssRules) { break; }

        for (const rule of cssRule.cssRules) {
          await this.parseCssRule({rule, baseUrl, refUrl, refPolicy, envCharset, root});
        }
        break;
      }
    }
  }

  /**
   * - propText is CSS property value of font-family or animation-name,
   *   which is normalized.
   * - Names are separated with ", ".
   * - An identifier is not quoted, with special chars escaped with '\'.
   * - A string is quoted with "", and '"'s inside are escaped with '\"'.
   * - Unicode escape sequences are unescaped.
   * - CSS comments are removed.
   */
  parseNames(...args) {
    const regex = /"[^\\"]*(?:\\.[^\\"]*)*"|((?:[^,\s\\"]|\\(?:[0-9A-Fa-f]{1,6} ?|.))+)(?:,|$)/g;
    const fn = (propText) => {
      const names = [];
      let m;
      while (m = regex.exec(propText)) {
        let value = m[1] || m[0].slice(1, -1);
        value = utils.unescapeCss(value);
        names.push(value);
      }
      return names;
    };
    Object.defineProperty(this, 'parseNames', {value: fn});
    return fn(...args);
  }

  forEachUrl(cssText, baseUrl, callback = x => x) {
    // We pass only inline css text, which should not contain any at-rule
    utils.rewriteCssText(cssText, {
      rewriteImportUrl: (url) => ({url}),
      rewriteFontFaceUrl: (url) => ({url}),
      rewriteBackgroundUrl: (url) => {
        const targetUrl = this.capturer.resolveRelativeUrl(url, baseUrl);
        callback(targetUrl);
        return {url};
      },
      resourceMap: this.cssHandler.resourceMap,
    });
  }

  addFontUrl(fontFamilyText, url) {
    if (!url) { return; }
    for (const ff of this.parseNames(fontFamilyText)) {
      this.scopes[this.scopes.length - 1].fontMap.get(ff).urls.add(url);
    }
  }

  useFont(fontFamilyText) {
    if (!fontFamilyText) { return; }
    for (const ff of this.parseNames(fontFamilyText)) {
      this.scopes[this.scopes.length - 1].fontUsed.add(ff);
    }
  }

  addKeyFrameFont(name, fontFamilyText) {
    if (!fontFamilyText) { return; }
    for (const ff of this.parseNames(fontFamilyText)) {
      this.scopes[this.scopes.length - 1].keyFrameMap.get(name).fonts.add(ff);
    }
  }

  addKeyFrameUrl(name, url) {
    if (!url) { return; }
    this.scopes[this.scopes.length - 1].keyFrameMap.get(name).urls.add(url);
  }

  useKeyFrame(animationNameText) {
    if (!animationNameText) { return; }

    for (const name of this.parseNames(animationNameText)) {
      this.scopes[this.scopes.length - 1].keyFrameUsed.add(name);
    }
  }

  useImage(url) {
    this.usedImageUrls[url] = true;
  }
}

export {
  CssSelectorTokenizer,
  DocumentCssHandler,
  DocumentCssResourcesHandler,
};
