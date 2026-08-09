import {NS_HTML, NS_SVG, NS_XLINK, NS_MATHML} from "../utils/common.mjs";
import {DocumentRewriter} from "../utils/doc-handler.mjs";
import * as utils from "../utils/common.mjs";

const SITEMAP_DOCTYPE = new Set(["text/html", "application/xhtml+xml"]);

class DocumentLinksReader extends DocumentRewriter {
  static read(doc) {
    const reader = new this();
    reader.run(doc);
    return reader.items;
  }

  run(doc) {
    this.doc = doc;
    this.items = [];
    this.refreshItems = [];
    this.frameItems = [];
    this.anchorItems = [];

    this.processRootNode(this.doc);

    for (const item of this.refreshItems) {
      this.items.push(item);
    }
    for (const item of this.frameItems) {
      this.items.push(item);
    }
    for (const item of this.anchorItems) {
      this.items.push(item);
    }
  }

  processRootNode(rootNode) {
    for (const elem of rootNode.querySelectorAll([
      // 'a[href]:not([download])',
      // 'area[href]:not([download])',
      'meta[http-equiv="refresh" i][content]',
      'frame[src]',
      'iframe[src]:not([srcdoc])',
      'embed[src]',
      'object[data]',
      '[data-scrapbook-shadowdom]',

      // SVG
      'a[*|href]',

      // MathML
      '[href]',
    ].join(', '))) {
      this[`_handle_{${elem.namespaceURI}}`]?.(elem);
    }
  }

  [`_handle_{${NS_HTML}}`](elem) {
    this[`_handle_{${NS_HTML}}${elem.localName}`]?.(elem);
    this.rewriteScrapBookShadowDom(elem);
  }

  [`_handle_{${NS_HTML}}a`](elem) {
    if (elem.hasAttribute('download')) { return; }
    const url = elem.getAttribute('href');
    if (!this.checkInterlinkingUrl(url)) { return; }
    this.anchorItems.push({
      url: this.resolveRelativeUrl(url),
      type: 'anchor',
      ...(elem.matches('a') && {title: elem.textContent}),
    });
  }

  [`_handle_{${NS_HTML}}area`](elem) {
    return this[`_handle_{${NS_HTML}}a`](elem);
  }

  [`_handle_{${NS_HTML}}meta`](elem) {
    if (elem.getRootNode().host) { return; }
    const {time, url} = utils.parseMetaRefresh(elem.getAttribute("content"));
    if (!this.checkInterlinkingUrl(url)) { return; }
    this.refreshItems.push({
      url: this.resolveRelativeUrl(url),
      type: 'refresh',
    });
  }

  [`_handle_{${NS_HTML}}iframe`](elem) {
    const type = elem.localName;
    const urlAttr = (type === 'object') ? 'data' : 'src';
    const url = elem.getAttribute(urlAttr);
    if (!this.checkInterlinkingUrl(url)) { return; }
    this.frameItems.push({
      url: this.resolveRelativeUrl(url),
      type,
    });
  }

  [`_handle_{${NS_HTML}}frame`](elem) {
    return this[`_handle_{${NS_HTML}}iframe`](elem);
  }

  [`_handle_{${NS_HTML}}embed`](elem) {
    return this[`_handle_{${NS_HTML}}iframe`](elem);
  }

  [`_handle_{${NS_HTML}}object`](elem) {
    return this[`_handle_{${NS_HTML}}iframe`](elem);
  }

  [`_handle_{${NS_SVG}}`](elem) {
    this[`_handle_{${NS_SVG}}${elem.localName}`]?.(elem);
  }

  [`_handle_{${NS_SVG}}a`](elem) {
    // take href if both attributes exist
    for (const ns of [null, NS_XLINK]) {
      const url = elem.getAttributeNS(ns, 'href');
      if (url === null) { continue; }
      if (!this.checkInterlinkingUrl(url)) { break; }
      this.anchorItems.push({
        url: this.resolveRelativeUrl(url),
        type: 'anchor',
      });
      break;
    }
  }

  [`_handle_{${NS_MATHML}}`](elem) {
    const url = elem.getAttribute('href');
    if (!this.checkInterlinkingUrl(url)) { return; }
    this.anchorItems.push({
      url: this.resolveRelativeUrl(url),
      type: 'anchor',
    });
  }

  rewriteScrapBookShadowDom(elem) {
    const html = elem.getAttribute("data-scrapbook-shadowdom");
    if (!html) { return; }

    let shadowRoot;
    try {
      shadowRoot = elem.attachShadow({mode: 'open'});
    } catch {
      // skip an element that cannot attach a shadow root
      return;
    }

    shadowRoot.innerHTML = html;
    this.processRootNode(shadowRoot);
  }

  checkInterlinkingUrl(url) {
    if (!url) {
      return false;
    }
    if (utils.isUrlAbsolute(url)) {
      return false;
    }
    const [urlMain, urlHash] = utils.splitUrlByAnchor(url);
    if (!urlMain
      || urlMain.startsWith('/')
      || urlMain.startsWith('./')
      || urlMain.startsWith('../')
      || urlMain.includes('?')
    ) {
      return false;
    }
    return true;
  }

  resolveRelativeUrl(url, baseUrl = this.doc.URL) {
    try {
      return new URL(url, baseUrl).href;
    } catch (ex) {
      return url;
    }
  }
}

class SitemapBuilder {
  static async run(...args) {
    const builder = new this(...args);
    await builder.run();
    return builder;
  }

  constructor(indexPages, indexUrl, wrapper) {
    this.indexPages = indexPages;
    this.indexUrl = indexUrl;
    this.wrapper = wrapper;

    this.pages = new Set();
    this.queue = [];
  }

  async run() {
    const wrapper = this.wrapper.appendChild(document.createElement('ul'));

    for (const indexPage of this.indexPages) {
      const url = new URL(utils.quote(indexPage), this.indexUrl).href;
      const anchor = this.addPage(url, {
        label: indexPage,
        parent: wrapper,
      });
      if (anchor) {
        await this.loadPageMap(anchor);
      }

      while (this.queue.length) {
        const anchor = this.queue.pop();
        await this.loadPageMap(anchor);
      }
    }
  }

  async loadPageMap(elem) {
    const url = elem.href;
    const doc = await utils.xhr({
      url,
      responseType: 'document',
    }).then(xhr => xhr.response).catch(ex => {
      console.error(`Unable to load page ${url}`);
      return null;
    });

    // remove the element if not (X)HTML document
    if (!(doc && SITEMAP_DOCTYPE.has(doc.contentType))) {
      elem.parentNode.remove();
      return;
    }

    if (doc.title) {
      elem.textContent = doc.title;
    }

    elem.parentNode.hidden = false;

    const subqueue = [];
    const ul = elem.insertAdjacentElement('afterend', document.createElement('ul'));

    const items = DocumentLinksReader.read(doc);
    for (const {url, type, label, title} of items) {
      const anchor = this.addPage(url, {
        type,
        label,
        title,
        parent: ul,
      });
      if (anchor) {
        subqueue.push(anchor);
      }
    }
    while (subqueue.length) {
      this.queue.push(subqueue.pop());
    }
  }

  addPage(url, {
    type = 'anchor',
    label = null,
    title = null,
    parent = this.wrapper,
  } = {}) {
    const [urlMain] = utils.splitUrlByAnchor(url);
    if (this.pages.has(urlMain)) { return; }
    this.pages.add(urlMain);

    if (!label) {
      label = utils.urlToFilename(url);
    }

    const li = parent.appendChild(document.createElement('li'));
    li.hidden = true;
    const anchor = li.appendChild(document.createElement('a'));
    anchor.href = url;
    anchor.className = type;
    anchor.textContent = label;
    if (title) { anchor.title = title; }
    return anchor;
  }
}

export {
  SITEMAP_DOCTYPE,
  DocumentLinksReader,
  SitemapBuilder,
};
