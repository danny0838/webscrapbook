import {ANNOTATION_CSS} from "../utils/common.mjs";
import * as utils from "../utils/common.mjs";
import {BaseDocumentRewriter, MapperMixin} from "../utils/doc-handler.mjs";

// Keep downward compatibility with IE8.
// indeterminate checkbox: IE >= 6, getAttribute: IE >= 8
// HTMLCanvasElement: Firefox >= 1.5, querySelectorAll: Firefox >= 3.5
// getElementsByTagName is not implemented for DocumentFragment (shadow root)
const BASIC_LOADER = "(" + utils.compressJsFunc(function () {
  var k1 = "data-scrapbook-shadowdom",
      k2 = "data-scrapbook-canvas",
      k3 = "data-scrapbook-input-indeterminate",
      k4 = "data-scrapbook-input-checked",
      k5 = "data-scrapbook-option-selected",
      k6 = "data-scrapbook-input-value",
      k7 = "data-scrapbook-textarea-value",
      k8 = "data-scrapbook-adoptedstylesheets",
      k9 = /^data-scrapbook-adoptedstylesheet-(\d+)$/,
      k10 = "data-scrapbook-shadowdom-mode",
      k11 = "data-scrapbook-shadowdom-clonable",
      k12 = "data-scrapbook-shadowdom-delegates-focus",
      k13 = "data-scrapbook-shadowdom-serializable",
      k14 = "data-scrapbook-shadowdom-slot-assignment",
      k15 = "data-scrapbook-slot-assigned",
      k16 = "data-scrapbook-slot-index",
      k17 = /^scrapbook-slot-index=(\d+)$/,
      k18 = '/scrapbook-slot-index',
      d = document,
      r = d.documentElement,
      $s = !!r.attachShadow,
      $as = !!d.adoptedStyleSheets,
      $c = !!window.HTMLCanvasElement,
      $sa = !!d.createElement('slot').assign,
      sle = [],
      sls = [],
      slt = function (r) {
        if ($sa) {
          var E = r.childNodes, i, e, s, m;
          for (i = 0; i < E.length; i++) {
            e = E[i];
            if (e.nodeType === 8) {
              s = e.nodeValue;
              if (m = s.match(k17)) {
                s = e.nextSibling;
                if (s.nodeType === 3) {
                  sls[m[1]] = s;
                }
                r.removeChild(e);
                i--;
              } else if (s === k18) {
                r.removeChild(e);
                i--;
              }
            }
          }
        }
      },
      sl = function () {
        var i = sle.length, j, d, e;
        while (i--) {
          d = sle[i];
          e = d.elem;
          d = d.value.split(',');
          j = d.length;
          while (j--) {
            d[j] = sls[parseInt(d[j], 10)];
          }
          try {
            try {
              e.assign.apply(e, d);
            } catch (ex) {
              if (ex.message.includes('must have a callable @@iterator')) {
                e.assign(d);
              } else {
                throw ex;
              }
            }
          } catch (ex) {
            console.error(ex);
          }
        }
      },
      asl = (function (r) {
        var l = [], E, i, e, m, c, j;
        if ($as) {
          E = r.attributes;
          i = E.length;
          while (i--) {
            e = E[i];
            if (!(m = e.nodeName.match(k9))) { continue; }
            c = l[m[1]] = new CSSStyleSheet();
            r.removeAttribute(m[0]);
            m = e.nodeValue.split('\n\n');
            j = m.length;
            while (j--) {
              try {
                m[j] && c.insertRule(m[j]);
              } catch (ex) {
                console.error(ex);
              }
            }
          }
        }
        return l;
      })(r),
      as = function (d, e) {
        var l, i, I;
        if ($as && (l = e.getAttribute(k8)) !== null) {
          l = l.split(',').map(i => asl[i]);
          d.adoptedStyleSheets = d.adoptedStyleSheets.concat(l);
          e.removeAttribute(k8);
        }
      },
      fn = function (r) {
        var E = r.querySelectorAll ? r.querySelectorAll("*") : r.getElementsByTagName("*"), i = E.length, e, d, s, m;
        while (i--) {
          e = E[i];
          s = e.shadowRoot;
          if ($s && (d = e.getAttribute(k1))) {
            if (!s) {
              try {
                s = e.attachShadow({
                  mode: (m = e.getAttribute(k10)) !== null ? m : 'open',
                  clonable: e.hasAttribute(k11),
                  delegatesFocus: e.hasAttribute(k12),
                  serializable: e.hasAttribute(k13),
                  slotAssignment: (m = e.getAttribute(k14)) !== null ? m : void 0,
                });
                s.innerHTML = d;
              } catch (ex) {
                console.error(ex);
              }
            }
            e.removeAttribute(k1);
            e.removeAttribute(k10);
            e.removeAttribute(k11);
            e.removeAttribute(k12);
            e.removeAttribute(k13);
            e.removeAttribute(k14);
          }
          if ($c && (d = e.getAttribute(k2)) !== null) {
            (function () {
              var c = e, g = new Image();
              g.onload = function () { c.getContext('2d').drawImage(g, 0, 0); };
              g.src = d;
            })();
            e.removeAttribute(k2);
          }
          if ((d = e.getAttribute(k3)) !== null) {
            e.indeterminate = true;
            e.removeAttribute(k3);
          }
          if ((d = e.getAttribute(k4)) !== null) {
            e.checked = d === 'true';
            e.removeAttribute(k4);
          }
          if ((d = e.getAttribute(k5)) !== null) {
            e.selected = d === 'true';
            e.removeAttribute(k5);
          }
          if ((d = e.getAttribute(k6)) !== null) {
            e.value = d;
            e.removeAttribute(k6);
          }
          if ((d = e.getAttribute(k7)) !== null) {
            e.value = d;
            e.removeAttribute(k7);
          }
          if ($sa && (d = e.getAttribute(k15)) !== null) {
            sle.push({elem: e, value: d});
            e.removeAttribute(k15);
          }
          if ($sa && (d = e.getAttribute(k16)) !== null) {
            sls[d] = e;
            e.removeAttribute(k16);
          }
          if (s) {
            slt(e);
            as(s, e);
            fn(s);
          }
        }
      };
  as(d, r);
  fn(d);
  sl();
}) + ")()";

// Mobile support with showing title on long touch.
// Firefox >= 52, Chrome >= 22, Edge >= 12
const ANNOTATION_LOADER_TEMPLATE = ("(" + utils.compressJsFunc(function () {
  var w = window, d = document, r = d.documentElement, e;
  d.addEventListener('click', function (E) {
    if (r.hasAttribute('data-scrapbook-toolbar-active')) { return; }
    if (!w.getSelection().isCollapsed) { return; }
    e = E.target;
    if (e.matches('[data-scrapbook-elem="linemarker"]')) {
      if (e.title) {
        if (!confirm(e.title)) {
          E.preventDefault();
          E.stopPropagation();
        }
      }
    } else if (e.matches('[data-scrapbook-elem="sticky"]')) {
      if (confirm('%EditorDeleteAnnotationConfirm%')) {
        e.parentNode.removeChild(e);
        E.preventDefault();
        E.stopPropagation();
      }
    }
  }, true);
}) + ")()");

// This is compatible with IE5 (though position: fixed doesn't work in IE < 7).
// setAttribute('style', ...) doesn't work for IE < 8
const INFOBAR_LOADER_TEMPLATE = ("(" + utils.compressJsFunc(function () {
  var d = document, b = d.body,
      i = d.createElement('scrapbook-infobar'),
      c = i.appendChild(d.createElement('span')),
      t = i.appendChild(d.createElement('span')),
      a = i.appendChild(d.createElement('a'));

  i.setAttribute('data-scrapbook-elem', 'infobar');
  i.style.position = 'fixed';
  i.style.display = 'block';
  i.style.clear = 'both';
  i.style.zIndex = '2147483647';
  i.style.top = '0';
  i.style.left = '0';
  i.style.right = '0';
  i.style.margin = '0';
  i.style.border = '0';
  i.style.padding = '0';
  i.style.width = '100%';
  i.style.backgroundColor = '#FFFFE1';
  i.style.fontSize = '14px';

  a.style.display = 'block';
  a.style.float = '%@@bidi_start_edge%';
  a.style.margin = '0';
  a.style.border = '0';
  a.style.padding = '.35em';
  a.style.color = 'black';
  a.style.fontSize = '1em';
  a.style.textDecoration = 'none';
  a.href = "%url%";
  a.appendChild(d.createTextNode("%domain%"));

  t.style.display = 'block';
  t.style.float = '%@@bidi_end_edge%';
  t.style.margin = '0';
  t.style.border = '0';
  t.style.padding = '.35em';
  t.style.color = 'black';
  t.style.fontSize = '1em';
  t.appendChild(d.createTextNode("%date%"));

  c.style.display = 'block';
  c.style.float = '%@@bidi_end_edge%';
  c.style.margin = '0';
  c.style.border = '0';
  c.style.padding = '.35em';
  c.style.color = 'black';
  c.style.fontSize = '1em';
  c.style.cursor = 'pointer';
  c.appendChild(d.createTextNode('✕'));
  c.onclick = function () { i.parentNode.removeChild(i); };

  b.appendChild(i);
}) + ")()");

const REBUILD_LINK_SVG_HREF_ATTRS = ['href', 'xlink:href'];

class PresaveDocumentRewriter extends BaseDocumentRewriter {
  run(doc, {isMainDocument, deleteErased, requireBasicLoader, insertInfoBar}) {
    Object.assign(this, {doc, isMainDocument, deleteErased, requireBasicLoader, insertInfoBar});
    this.processRootNode(doc.documentElement);
  }

  processRootNode(rootNode) {
    // delete all erased contents
    if (this.deleteErased) {
      this.removeErasedContents(rootNode);
    }

    // update loader
    this.updateLoaders(rootNode);
  }

  removeErasedContents(rootNode) {
    const selectedNodes = [];
    const nodeIterator = this.doc.createNodeIterator(
      rootNode,
      NodeFilter.SHOW_COMMENT,
      node => utils.getScrapBookObjectRemoveType(node) === 3 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    );
    let node;
    while (node = nodeIterator.nextNode()) {
      selectedNodes.push(node);
    }

    for (const node of selectedNodes) {
      node.remove();
    }
  }

  updateLoaders(rootNode) {
    this.removeLoaders(rootNode);

    const bodyNode = rootNode.querySelector('body') || rootNode;

    if (this.requireBasicLoader) {
      this.insertBasicLoader(bodyNode);
    }

    if (this.insertInfoBar && this.isMainDocument) {
      let data;
      try {
        const itemSource = rootNode.getAttribute('data-scrapbook-source');
        const itemCreate = rootNode.getAttribute('data-scrapbook-create');

        const url = utils.normalizeUrl(itemSource);
        const domain = new URL(url).origin;
        const date = utils.idToDate(itemCreate).toString();
        data = {url, domain, date};

        this.insertInfoBarLoader(bodyNode, data);
      } catch (ex) {
        console.error(ex);
      }
    }

    if (rootNode.querySelector('[data-scrapbook-elem="linemarker"][title], [data-scrapbook-elem="sticky"]')) {
      this.insertAnnotationLoader(bodyNode);
    }
  }

  insertBasicLoader(bodyNode) {
    const loader = bodyNode.appendChild(this.doc.createElement("script"));
    loader.setAttribute("data-scrapbook-elem", "basic-loader");
    loader.textContent = BASIC_LOADER;
  }

  insertAnnotationLoader(bodyNode) {
    const css = bodyNode.appendChild(this.doc.createElement("style"));
    css.setAttribute("data-scrapbook-elem", "annotation-css");
    css.textContent = utils.compressCode(ANNOTATION_CSS);
    const loader = bodyNode.appendChild(this.doc.createElement("script"));
    loader.setAttribute("data-scrapbook-elem", "annotation-loader");
    loader.textContent = ANNOTATION_LOADER_TEMPLATE.replace(/%(\w*)%/g, (_, key) => utils.lang(key) || '');
  }

  insertInfoBarLoader(bodyNode, data) {
    const loader = bodyNode.appendChild(this.doc.createElement("script"));
    loader.setAttribute("data-scrapbook-elem", "infobar-loader");
    loader.textContent = INFOBAR_LOADER_TEMPLATE.replace(/%([\w@]*)%/g, (_, key) => data[key] || utils.lang(key) || '');
  }

  removeLoaders(rootNode) {
    for (const elem of rootNode.querySelectorAll([
      'style[data-scrapbook-elem="annotation-css"]',
      'script[data-scrapbook-elem="basic-loader"]',
      'script[data-scrapbook-elem="annotation-loader"]',
      'script[data-scrapbook-elem="canvas-loader"]', // WebScrapBook < 0.69
      'script[data-scrapbook-elem="shadowroot-loader"]', // WebScrapBook < 0.69
      '[data-scrapbook-elem="infobar"]',
      'script[data-scrapbook-elem="infobar-loader"]',
    ].join(','))) {
      elem.remove();
    }
  }
}

class RetrieveDocumentRewriter extends MapperMixin(BaseDocumentRewriter) {
  async run(doc, {
    capturer,
    internalize, item,
    isMainPage, isMainFrame,
    origNodeMap, clonedNodeMap,
  }) {
    Object.assign(this, {
      doc, capturer,
      internalize, item,
      isMainPage, isMainFrame,
      origNodeMap, clonedNodeMap,
    });

    this.slotMap = new Map();
    this.adoptedStyleSheetMap = new Map();

    this.info = {
      isMainFrame,
      title: (isMainPage && isMainFrame ? item?.title : this.origDoc.title) || "",
    };
    this.resources = {};
    this.requireBasicLoader = false;

    await this.processMain();
  }

  async processMain() {
    const rootNode = this.doc.documentElement;

    // remove webscrapbook toolbar related
    rootNode.removeAttribute('data-scrapbook-toolbar-active');
    for (const elem of rootNode.querySelectorAll(`[data-scrapbook-elem|="toolbar"]`)) {
      elem.remove();
    }

    this.processRootNode(rootNode);

    // handle adoptedStyleSheet
    // don't refresh related attributes if not supported by the browser
    if ('adoptedStyleSheets' in document) {
      const regex = /^data-scrapbook-adoptedstylesheet-(\d+)$/;
      for (const attrNode of rootNode.attributes) {
        const attr = attrNode.nodeName;
        if (regex.test(attr)) {
          rootNode.removeAttribute(attr);
        }
      }
      if (this.adoptedStyleSheetMap.size) {
        for (const [css, id] of this.adoptedStyleSheetMap) {
          const cssTexts = Array.prototype.map.call(
            css.cssRules,
            cssRule => cssRule.cssText,
          );
          rootNode.setAttribute(`data-scrapbook-adoptedstylesheet-${id}`, cssTexts.join('\n\n'));
        }
        this.requireBasicLoader = true;
      }
    }
  }

  processRootNode(rootNode) {
    // handle adoptedStyleSheet
    // don't refresh related attributes if not supported by the browser
    if ('adoptedStyleSheets' in document) {
      const docOrShadowRoot = this.origNodeMap.get(rootNode).getRootNode();

      const elem = rootNode.host || rootNode;
      elem.removeAttribute("data-scrapbook-adoptedstylesheets");

      const ids = [];
      for (const css of utils.getAdoptedStyleSheets(docOrShadowRoot)) {
        let id = this.adoptedStyleSheetMap.get(css);
        if (typeof id === 'undefined') {
          id = this.adoptedStyleSheetMap.size;
          this.adoptedStyleSheetMap.set(css, id);
        }
        ids.push(id);
      }
      if (ids.length) {
        elem.setAttribute("data-scrapbook-adoptedstylesheets", ids.join(','));
      }
    }

    // fix noscript
    // noscript cannot be nested
    for (const elem of rootNode.querySelectorAll('noscript')) {
      const elemOrig = this.origNodeMap.get(elem);
      if (elemOrig.innerHTML === elemOrig.textContent) {
        const tempElem = this.doc.createElement('scrapbook-noscript');
        tempElem.innerHTML = elem.textContent;
        let child;
        elem.textContent = '';
        while (child = tempElem.firstChild) {
          elem.appendChild(child);
        }
      }
    }

    // handle internalization
    if (this.internalize) {
      for (const elem of rootNode.querySelectorAll('img')) {
        if (elem.hasAttribute('src')) {
          elem.setAttribute('src', this.addResource(elem.getAttribute('src')));
        }
        if (elem.hasAttribute("srcset")) {
          elem.setAttribute("srcset", utils.rewriteSrcset(elem.getAttribute("srcset"), url => this.addResource(url)));
        }
      }

      for (const elem of rootNode.querySelectorAll('input[type="image"]')) {
        if (elem.hasAttribute('src')) {
          elem.setAttribute('src', this.addResource(elem.getAttribute('src')));
        }
      }

      for (const elem of rootNode.querySelectorAll('audio')) {
        if (elem.hasAttribute('src')) {
          elem.setAttribute('src', this.addResource(elem.getAttribute('src')));
        }
      }

      for (const elem of rootNode.querySelectorAll('video')) {
        if (elem.hasAttribute('src')) {
          elem.setAttribute('src', this.addResource(elem.getAttribute('src')));
        }
        if (elem.hasAttribute('poster')) {
          elem.setAttribute('poster', this.addResource(elem.getAttribute('poster')));
        }
      }

      for (const elem of rootNode.querySelectorAll('audio source, video source, picture source')) {
        if (elem.hasAttribute('src')) {
          elem.setAttribute('src', this.addResource(elem.getAttribute('src')));
        }
        if (elem.hasAttribute("srcset")) {
          elem.setAttribute("srcset", utils.rewriteSrcset(elem.getAttribute("srcset"), url => this.addResource(url)));
        }
      }

      for (const elem of rootNode.querySelectorAll('audio track, video track')) {
        if (elem.hasAttribute('src')) {
          elem.setAttribute('src', this.addResource(elem.getAttribute('src')));
        }
      }
    }

    // record form element status
    for (const elem of rootNode.querySelectorAll("input")) {
      const elemOrig = this.origNodeMap.get(elem);
      if (!elemOrig) { continue; }
      switch (elem.type.toLowerCase()) {
        case "checkbox": {
          // indeterminate
          if (elemOrig.indeterminate) {
            elem.setAttribute("data-scrapbook-input-indeterminate", "");
            this.requireBasicLoader = true;
          } else {
            elem.removeAttribute("data-scrapbook-input-indeterminate");
          }
        }
        // eslint-disable-next-line no-fallthrough
        case "radio":
          if (elemOrig.checked) {
            elem.setAttribute("checked", "");
          } else {
            elem.removeAttribute("checked");
          }
          break;
        case "password":
        case "file":
          // skip for security
          // eslint-disable-next-line no-fallthrough
        case "image":
          // skip image
          break;
        case "text":
        default:
          elem.setAttribute("value", elemOrig.value);
          break;
      }
    }

    for (const elem of rootNode.querySelectorAll("option")) {
      const elemOrig = this.origNodeMap.get(elem);
      if (!elemOrig) { continue; }
      if (elemOrig.selected) {
        elem.setAttribute("selected", "");
      } else {
        elem.removeAttribute("selected");
      }
    }

    for (const elem of rootNode.querySelectorAll("textarea")) {
      const elemOrig = this.origNodeMap.get(elem);
      if (!elemOrig) { continue; }
      elem.textContent = elemOrig.value;
    }

    // handle special scrapbook elements
    // -- "title", "title-src" elements
    {
      const titleNodes = [];
      const titleSrcNodes = [];
      for (const elem of rootNode.querySelectorAll("*")) {
        switch (utils.getScrapbookObjectType(elem)) {
          case "title":
            titleNodes.push(elem);
            break;
          case "title-src":
            titleSrcNodes.push(elem);
            break;
        }
      }
      for (const elem of titleSrcNodes) {
        const text = elem.textContent;
        if (text) { this.info.title = text; }
      }
      for (const elem of titleNodes.concat(titleSrcNodes)) {
        if (elem.textContent !== this.info.title) {
          elem.textContent = this.info.title;
        }
      }
    }

    // update canvas data
    for (const elem of rootNode.querySelectorAll("canvas")) {
      elem.removeAttribute("data-scrapbook-canvas");
      const elemOrig = this.origNodeMap.get(elem);
      if (!elemOrig) { continue; }
      try {
        const data = elemOrig.toDataURL();
        if (data !== utils.getBlankCanvasData(elemOrig)) {
          elem.setAttribute("data-scrapbook-canvas", data);
          this.requireBasicLoader = true;
        }
      } catch (ex) {
        console.error(ex);
      }
    }

    // update slot data
    // don't refresh related attributes if not supported by the browser
    if (rootNode instanceof ShadowRoot && rootNode.slotAssignment === 'manual') {
      // clear attributes for all slottables
      const regexes = [/^scrapbook-slot-index=(\d+)$/, /^\/scrapbook-slot-index$/];
      const children = rootNode.host.childNodes;
      for (let i = children.length - 1; i >= 0; i--) {
        const node = children[i];
        switch (node.nodeType) {
          case Node.ELEMENT_NODE: {
            node.removeAttribute("data-scrapbook-slot-index");
            break;
          }
          case Node.COMMENT_NODE: {
            if (regexes.some(r => r.test(node.nodeValue))) {
              node.remove();
            }
            break;
          }
        }
      }

      for (const elem of rootNode.querySelectorAll("slot")) {
        elem.removeAttribute("data-scrapbook-slot-assigned");
        const elemOrig = this.origNodeMap.get(elem);
        if (!elemOrig) { continue; }
        const ids = [];
        for (const targetNodeOrig of elemOrig.assignedNodes()) {
          const targetNode = this.clonedNodeMap.get(targetNodeOrig);
          let id = this.slotMap.get(targetNode);
          if (typeof id === 'undefined') {
            id = this.slotMap.size;
            this.slotMap.set(targetNode, id);
          }
          if (targetNode.nodeType === 1) {
            targetNode.setAttribute("data-scrapbook-slot-index", id);
          } else {
            targetNode.before(document.createComment(`scrapbook-slot-index=${id}`));
            targetNode.after(document.createComment(`/scrapbook-slot-index`));
          }
          ids.push(id);
        }
        if (ids.length) {
          elem.setAttribute("data-scrapbook-slot-assigned", ids.join(','));
        }
      }
    }

    // update shadow root data
    for (const elem of rootNode.querySelectorAll("*")) {
      elem.removeAttribute("data-scrapbook-shadowdom");
      elem.removeAttribute("data-scrapbook-shadowdom-mode");
      elem.removeAttribute("data-scrapbook-shadowdom-clonable");
      elem.removeAttribute("data-scrapbook-shadowdom-delegates-focus");
      elem.removeAttribute("data-scrapbook-shadowdom-serializable");
      elem.removeAttribute("data-scrapbook-shadowdom-slot-assignment");
      const shadowRoot = utils.getShadowRoot(elem);
      if (!shadowRoot) { continue; }
      this.processRootNode(shadowRoot);
      elem.setAttribute("data-scrapbook-shadowdom", shadowRoot.innerHTML);
      if (shadowRoot.mode !== 'open') {
        elem.setAttribute("data-scrapbook-shadowdom-mode", shadowRoot.mode);
      }
      if (shadowRoot.clonable) {
        elem.setAttribute("data-scrapbook-shadowdom-clonable", "");
      }
      if (shadowRoot.delegatesFocus) {
        elem.setAttribute("data-scrapbook-shadowdom-delegates-focus", "");
      }
      if (shadowRoot.serializable) {
        elem.setAttribute("data-scrapbook-shadowdom-serializable", "");
      }
      if (shadowRoot.slotAssignment && shadowRoot.slotAssignment !== 'named') {
        elem.setAttribute("data-scrapbook-shadowdom-slot-assignment", shadowRoot.slotAssignment);
      }
      this.requireBasicLoader = true;
    }
  }

  addResource(url) {
    const uuid = utils.getUuid();
    const key = "urn:scrapbook:url:" + uuid;
    this.resources[uuid] = url;
    return key;
  }
}

class RebuildLinksDocumentRewriter extends BaseDocumentRewriter {
  run(doc, {capturer, filenameMap, redirects}) {
    Object.assign(this, {
      doc, capturer, filenameMap, redirects,
    });
    this.processRootNode(doc.documentElement);
  }

  processRootNode(rootNode) {
    // rewrite links
    this[`_handle_${rootNode.nodeName.toLowerCase()}`]?.call(this, rootNode);

    // recurse into shadow roots
    this.rewriteScrapBookShadowDom(rootNode);
  }

  rewriteScrapBookShadowDom(rootNode) {
    for (const elem of rootNode.querySelectorAll('[data-scrapbook-shadowdom]')) {
      const shadowRoot = elem.attachShadow({mode: 'open'});
      shadowRoot.innerHTML = elem.getAttribute('data-scrapbook-shadowdom');
      this.processRootNode(shadowRoot);
      elem.setAttribute("data-scrapbook-shadowdom", shadowRoot.innerHTML);
    }
  }

  ['_handle_html'](rootNode) {
    for (const elem of rootNode.querySelectorAll('a[href], area[href]')) {
      if (elem.closest('svg, math')) { continue; }
      if (elem.hasAttribute('download')) { continue; }
      this.rewriteHref(elem, 'href');
    }
    for (const elem of rootNode.querySelectorAll('meta[http-equiv="refresh" i][content]')) {
      this.rewriteMetaRefresh(elem);
    }
    for (const elem of rootNode.querySelectorAll('iframe[srcdoc]')) {
      const doc = (new DOMParser()).parseFromString(elem.srcdoc, 'text/html');
      this.processRootNode(doc.documentElement);
      elem.srcdoc = doc.documentElement.outerHTML;
    }
    for (const elem of rootNode.querySelectorAll('svg, math')) {
      this.processRootNode(elem);
    }
  }

  ['_handle_#document-fragment'](rootNode) {
    return this['_handle_html'].call(this, rootNode);
  }

  ['_handle_svg'](rootNode) {
    for (const elem of rootNode.querySelectorAll('a[*|href]')) {
      for (const attr of REBUILD_LINK_SVG_HREF_ATTRS) {
        if (!elem.hasAttribute(attr)) { continue; }
        this.rewriteHref(elem, attr);
      }
    }
  }

  ['_handle_math'](rootNode) {
    for (const elem of rootNode.querySelectorAll('[href]')) {
      this.rewriteHref(elem, 'href');
    }
  }

  rewriteUrl(url) {
    // assume a non-absolute URL to be already mapped
    if (!utils.isUrlAbsolute(url)) {
      return null;
    }

    let [urlMain, urlHash] = utils.splitUrlByAnchor(url);

    // handle possible redirect
    const redirectedUrl = this.redirects.get(urlMain);
    if (redirectedUrl) {
      [urlMain, urlHash] = utils.splitUrlByAnchor(this.getRedirectedUrl(redirectedUrl, urlHash));
    }

    const token = this.getRegisterToken(urlMain, 'document');
    if (!token) {
      // skip invalid URL
      return null;
    }
    const p = this.filenameMap.get(token);
    if (!p) { return null; }

    return this.getRedirectedUrl(p.url, urlHash);
  }

  rewriteHref(elem, attr) {
    const url = elem.getAttribute(attr);
    const newUrl = this.rewriteUrl(url);
    if (!newUrl) { return; }
    elem.setAttribute(attr, newUrl);
  }

  rewriteMetaRefresh(elem) {
    const {time, url} = utils.parseHeaderRefresh(elem.getAttribute("content"));
    if (!url) { return; }
    const newUrl = this.rewriteUrl(url);
    if (!newUrl) { return; }
    elem.setAttribute("content", `${time}; url=${newUrl}`);
  }

  getRedirectedUrl(...args) {
    return this.capturer.getRedirectedUrl(...args);
  }

  getRegisterToken(...args) {
    return this.capturer.getRegisterToken(...args);
  }
}

export {
  BASIC_LOADER,
  ANNOTATION_LOADER_TEMPLATE,
  INFOBAR_LOADER_TEMPLATE,
  PresaveDocumentRewriter,
  RetrieveDocumentRewriter,
  RebuildLinksDocumentRewriter,
};
