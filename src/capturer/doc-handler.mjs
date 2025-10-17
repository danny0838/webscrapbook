import {isDebug} from "../utils/debug.mjs";
import {ANNOTATION_CSS, NS_HTML, NS_SVG, NS_XLINK, NS_MATHML} from "../utils/common.mjs";
import * as utils from "../utils/common.mjs";
import {DocumentCloner, PartialDocumentCloner} from "../utils/doc-cloner.mjs";
import {BaseDocumentRewriter, MapperMixin} from "../utils/doc-handler.mjs";
import {dataUriToFile} from "../utils/datauri.mjs";
import {DocumentCssHandler, DocumentCssResourcesHandler} from "./css-handler.mjs";
import {CaptureHelperHandler} from "./helper-handler.mjs";

// ref: https://html.spec.whatwg.org/#meta-referrer
const META_REFERRER_POLICY = new Set([
  "",
  "no-referrer",
  "no-referrer-when-downgrade",
  "same-origin",
  "origin",
  "strict-origin",
  "origin-when-cross-origin",
  "strict-origin-when-cross-origin",
  "unsafe-url",
]);

const META_REFERRER_POLICY_LEGACY = new Map([
  ['never', 'no-referrer'],
  ['default', ''],
  ['always', 'unsafe-url'],
  ['origin-when-crossorigin', 'origin-when-cross-origin'],
]);

const CUSTOM_ELEMENT_NAME_PATTERN = /^[a-z](.+)-(.+)$/;

// ref: https://html.spec.whatwg.org/multipage/custom-elements.html#valid-custom-element-name
const CUSTOM_ELEMENT_NAME_FORBIDDEN = new Set([
  "annotation-xml",
  "color-profile",
  "font-face",
  "font-face-src",
  "font-face-uri",
  "font-face-format",
  "font-face-name",
  "missing-glyph",
]);

const REWRITABLE_SPECIAL_OBJECTS = new Set([false, 'adoptedStyleSheet']);

const REMOVE_HIDDEN_EXCLUDE = {
  [NS_HTML]: "html, head, title, meta, link, style, script, body, noscript, template, source, track",
  [NS_SVG]: "svg",
  [NS_MATHML]: "math",
};

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

const CUSTOM_ELEMENT_NAME_LOADER_TEMPLATE = "(" + utils.compressJsFunc(function (names) {
  if (!customElements) { return; }
  for (const name of names) {
    customElements.define(name, class CustomElement extends HTMLElement {});
  }
}) + ")(%names%)";

const REBUILD_LINK_SVG_HREF_ATTRS = ['href', 'xlink:href'];

class NodeSkipIteration extends Error {
  constructor(node, msg = 'The node should not be iterated deeper.') {
    super(msg);
    this.name = 'NodeSkipIteration';
    this.node = node;
  }
}

class NodeDisconnect extends NodeSkipIteration {
  constructor(node, msg = 'The node has been removed from DOM.') {
    super(msg);
    this.name = 'NodeDisconnect';
    this.node = node;
  }
}

class PresaveDocumentRewriter extends BaseDocumentRewriter {
  run(doc, {isMainDocument, deleteErased, requireBasicLoader, insertInfoBar}) {
    Object.assign(this, {doc, isMainDocument, deleteErased, requireBasicLoader, insertInfoBar});
    this.processRootNode(doc);
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

    const bodyNode = (rootNode.nodeType === Node.DOCUMENT_NODE && rootNode.body) || rootNode.documentElement;

    if (this.requireBasicLoader) {
      this.insertBasicLoader(bodyNode);
    }

    if (this.insertInfoBar && this.isMainDocument) {
      try {
        this.insertInfoBarLoader(bodyNode);
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

  insertInfoBarLoader(bodyNode) {
    const rootNode = this.doc.documentElement;
    const itemSource = rootNode.getAttribute('data-scrapbook-source');
    const itemCreate = rootNode.getAttribute('data-scrapbook-create');

    const url = utils.normalizeUrl(itemSource);
    const domain = new URL(url).origin;
    const date = utils.idToDate(itemCreate).toString();
    const data = {url, domain, date};

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
          if (targetNode.nodeType === Node.ELEMENT_NODE) {
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
    this[`_handle_{${rootNode.namespaceURI ?? NS_HTML}}`]?.call(this, rootNode);

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

  [`_handle_{${NS_HTML}}`](rootNode) {
    for (const elem of rootNode.querySelectorAll('a[href], area[href]')) {
      if (elem.namespaceURI !== NS_HTML) { continue; }
      if (elem.hasAttribute('download')) { continue; }
      this.rewriteHref(elem, 'href');
    }
    if (!rootNode.host) {
      for (const elem of rootNode.querySelectorAll('meta[http-equiv="refresh" i][content]')) {
        this.rewriteMetaRefresh(elem);
      }
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

  [`_handle_{${NS_SVG}}`](rootNode) {
    for (const elem of rootNode.querySelectorAll('a[*|href]')) {
      for (const ns of [null, NS_XLINK]) {
        if (!elem.hasAttributeNS(ns, 'href')) { continue; }
        this.rewriteHref(elem, 'href', ns);
      }
    }
  }

  [`_handle_{${NS_MATHML}}`](rootNode) {
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

  rewriteHref(elem, attr, ns = null) {
    const url = elem.getAttributeNS(ns, attr);
    const newUrl = this.rewriteUrl(url);
    if (!newUrl) { return; }
    elem.setAttributeNS(ns, attr, newUrl);
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

class CaptureDocumentRewriter extends MapperMixin(BaseDocumentRewriter) {
  static runWithClone(doc, {
    capturer, settings, options,
    isHeadless,
    docUrl, docUrlHash, envDocUrl,
    baseUrl, refPolicy,
    mime,
  }) {
    const includeShadowDom = options["capture.shadowDom"] === "save";

    const selection = (() => {
      if (settings.fullPage) { return null; }
      const sel = utils.getSelection(doc);
      if (sel?.type !== 'Range') { return null; }
      return sel;
    })();

    const {
      newDoc, origNodeMap, clonedNodeMap,
    } = this.clone(doc, {includeShadowDom, selection});

    return super.run(newDoc, {
      capturer, settings, options,
      isHeadless, isPartial: !!selection,
      docUrl, docUrlHash, envDocUrl,
      baseUrl, refPolicy,
      mime,
      origNodeMap, clonedNodeMap,
    });
  }

  static clone(doc, {includeShadowDom, selection} = {}) {
    const origNodeMap = new WeakMap();
    const clonedNodeMap = new WeakMap();

    // create a new document to replicate nodes via import
    const newDoc = (() => {
      if (selection) {
        const hookBeforeRange = (refNode) => {
          const doc = refNode.ownerDocument || refNode;
          refNode.appendChild(doc.createComment("scrapbook-capture-selected"));
        };
        const hookAfterRange = (refNode) => {
          const doc = refNode.ownerDocument || refNode;
          refNode.appendChild(doc.createComment("/scrapbook-capture-selected"));
        };
        const hookBetweenText = (refNode) => {
          const doc = refNode.ownerDocument || refNode;
          refNode.appendChild(doc.createComment("scrapbook-capture-selected-splitter"));
          refNode.appendChild(doc.createTextNode(" … "));
          refNode.appendChild(doc.createComment("/scrapbook-capture-selected-splitter"));
        };
        const hookBetweenComment = (refNode) => {
          const doc = refNode.ownerDocument || refNode;
          refNode.appendChild(doc.createComment("scrapbook-capture-selected-splitter"));
          refNode.appendChild(doc.createComment(" … "));
          refNode.appendChild(doc.createComment("/scrapbook-capture-selected-splitter"));
        };
        const hookBetweenCdata = hookBetweenText;

        const newDoc = PartialDocumentCloner.clone(doc, {
          selection,
          origNodeMap,
          clonedNodeMap,
          includeShadowDom,
          hookBeforeRange,
          hookAfterRange,
          hookBetweenText,
          hookBetweenComment,
          hookBetweenCdata,
        });

        // clone doctype if not yet done
        const doctypeNode = doc.doctype;
        if (doctypeNode && !clonedNodeMap.has(doctypeNode)) {
          newDoc.insertBefore(
            PartialDocumentCloner.cloneNode(doctypeNode, false, {
              newDoc, origNodeMap, clonedNodeMap, includeShadowDom,
            }),
            newDoc.firstChild,
          );
        }

        // clone html if not yet done
        const {documentElement: docElemNode} = doc;
        let rootNode = clonedNodeMap.get(docElemNode);
        if (!rootNode) {
          PartialDocumentCloner.cloneNodeAndAncestors(docElemNode, {
            newDoc, origNodeMap, clonedNodeMap, includeShadowDom,
          });
          rootNode = clonedNodeMap.get(docElemNode);
        }

        // clone head if not yet done
        // (treated as all head is selected if not involved yet)
        if (rootNode.namespaceURI === NS_HTML) {
          const headNode = doc.head;
          if (headNode && !clonedNodeMap.has(headNode)) {
            rootNode.insertBefore(
              PartialDocumentCloner.cloneNode(headNode, true, {
                newDoc, origNodeMap, clonedNodeMap, includeShadowDom,
              }),
              rootNode.firstChild,
            );
          }
        }

        return newDoc;
      }

      return DocumentCloner.clone(doc, {
        origNodeMap,
        clonedNodeMap,
        includeShadowDom,
      });
    })();

    return {newDoc, origNodeMap, clonedNodeMap};
  }

  async run(doc, {
    capturer, settings, options,
    isHeadless, isPartial,
    docUrl, docUrlHash, envDocUrl,
    baseUrl, refPolicy,
    mime,
    origNodeMap, clonedNodeMap,
  }) {
    this.doc = doc;
    this.capturer = capturer;
    this.origNodeMap = origNodeMap;
    this.clonedNodeMap = clonedNodeMap;

    const {missionId, timeId, isMainPage, isMainFrame} = settings;
    const {characterSet: charset, title} = this.origDoc;

    // baseUrl: updates dynamically when the first base[href] is parsed.
    // baseUrlFallback: the initial baseUrl, used for resolving base elements.
    // baseUrlFinal: the final baseUrl, used for resolving links etc.
    //
    // URLs in the document are usually resolved using baseUrl, which can be
    // dynamically changed when the first base[href] element is parsed, when
    // its "href" attribute changes, or when it's removed from DOM (and another
    // first base element will takes place). If its value is an invalid URL,
    // baseUrlFallback will be used (instead of finding another base element).
    //
    // Nevertheless, links and citations should be updated when the baseUrl
    // changes, such as a[href], a[ping], q[cite]. As a result, they should
    // be resolved using baseUrlFinal.
    //
    // Normally baseUrl should be equivalent to baseUrlFinal as base[href]
    // should appear at first according to spec. Though we still implement
    // dynamic baseUrl for a bad document with an URL before base[href].
    //
    // ref: https://html.spec.whatwg.org/#dynamic-changes-to-base-urls
    const baseUrlFallback = baseUrl;
    const baseUrlFinal = (() => {
      let base = baseUrlFallback;
      for (const elem of doc.querySelectorAll('base[href]')) {
        if (elem.namespaceURI !== NS_HTML) { continue; }
        try {
          base = new URL(elem.getAttribute('href'), baseUrlFallback).href;
        } catch {
          // don't update for invalid URL
        }
        break;
      }
      return base;
    })();

    Object.assign(this, {
      missionId, timeId, settings, options,
      isHeadless,
      isPartial,
      docUrl, docUrlHash, envDocUrl,
      baseUrl, baseUrlFinal, baseUrlFallback,
      refUrl: envDocUrl, docRefPolicy: refPolicy,
      mime, charset, title,
    });

    this.cssHandler = new DocumentCssHandler({
      doc: this.origDoc,
      rootNode: doc,
      origNodeMap, clonedNodeMap,
      settings, options,
    }, this.capturer);
    this.cssResourcesHandler = new DocumentCssResourcesHandler(this.cssHandler);

    this.favIconSelector = utils.split(options["capture.faviconAttrs"])
      .map(attr => `[rel~="${CSS.escape(attr)}"][href]`)
      .join(', ');

    this.shadowRootList = [];
    this.slotMap = new Map();
    this.adoptedStyleSheetMap = new Map();
    this.customElementNames = new Set();

    this.cssTasks = [];
    this.tasks = [];
    this.downLinkTasks = [];

    this.baseElem = undefined;
    this.metaCharsetNode = undefined;
    this.favIconUrl = undefined;
    this.requireBasicLoader = false;

    return await this._run();
  }

  async _run() {
    const rootNode = this.doc.documentElement;
    this.initHeadNode();

    this.handlePrettyPrint();
    this.removeToolbar();
    this.processCaptureHelpers();

    // inspect all nodes (and register async tasks)
    this.handleDownLinkExtras();
    this.addAdoptedStyleSheets(this.origDoc, rootNode);
    this.rewriteRecursively(rootNode, this.rewriteNode);

    // register additional tasks that require data from inspected nodes
    this.recordMetadata();
    this.ensureMetaCharset();
    this.fetchSiteFavIcon();
    this.recordAdoptedStyleSheets();

    // start async tasks and wait for them to complete
    await this.collectUsedCssResources();
    await this.fetchResources();
    await this.fetchDownLinkResources();

    this.recordShadowRoots();
    this.recordCssResourceMap();
    this.recordCustomElements();
  }

  initHeadNode({
    doc = this.doc,
  } = {}) {
    const rootNode = doc.documentElement;

    if (rootNode.namespaceURI !== NS_HTML) { return; }

    let headNode = doc.head;

    // generate head if not exists
    if (!headNode) {
      headNode = rootNode.insertBefore(doc.createElement("head"), rootNode.firstChild);
      this.captureRecordAddedNode(headNode);
    }

    return headNode;
  }

  /**
   * Add linefeeds to head and body to improve layout.
   */
  handlePrettyPrint({
    doc = this.doc,
    options = this.options,
  } = {}) {
    if (!options["capture.prettyPrint"]) { return; }

    const rootNode = doc.documentElement;
    const headNode = doc.head;
    const bodyNode = doc.body;

    if (rootNode.namespaceURI !== NS_HTML) { return; }

    if (headNode.previousSibling?.nodeType !== Node.TEXT_NODE) {
      headNode.before("\n");
    }
    if (headNode.firstChild?.nodeType !== Node.TEXT_NODE) {
      headNode.prepend("\n");
    }
    if (headNode.lastChild?.nodeType !== Node.TEXT_NODE) {
      headNode.append("\n");
    }
    if (headNode.nextSibling?.nodeType !== Node.TEXT_NODE) {
      headNode.after("\n");
    }

    if (bodyNode) {
      const bodyNodeAfter = bodyNode.nextSibling;
      if (!bodyNodeAfter) {
        bodyNode.after("\n");
      }
    }
  }

  /**
   * Remove scrapbook toolbar related elements and attributes.
   */
  removeToolbar({
    rootNode = this.doc.documentElement,
  } = {}) {
    rootNode.removeAttribute('data-scrapbook-toolbar-active');
    for (const elem of rootNode.querySelectorAll(`[data-scrapbook-elem|="toolbar"]`)) {
      elem.remove();
    }
  }

  /**
   * Preprocess with helpers
   *
   * Expect options["capture.helpers"] to be parsable when
   * options["capture.helpersEnabled"] is truthy, as validated in
   * `captureGeneral`.
   */
  processCaptureHelpers({
    rootNode = this.doc.documentElement,
    envDocUrl = this.envDocUrl,
    origNodeMap = this.origNodeMap,
    options = this.options,
  } = {}) {
    if (!options["capture.helpersEnabled"]) { return; }

    const helpers = utils.parseOption("capture.helpers", options["capture.helpers"]);
    const parser = new CaptureHelperHandler({
      helpers,
      rootNode,
      docUrl: envDocUrl,
      origNodeMap,
      options,
    });
    const result = parser.run();

    if (result.errors.length) {
      (async () => {
        for (const error of result.errors) {
          await this.warn(error);
        }
      })();
    }
  }

  /**
   * Add `capture.downLink.urlExtra` defined URLs with depth 0.
   */
  handleDownLinkExtras({
    refUrl = this.refUrl,
    settings = this.settings,
    options = this.options,
    downLinkTasks = this.downLinkTasks,
  } = {}) {
    if (!(settings.isMainPage && settings.isMainFrame)) { return; }
    if (!(
      ["header", "url"].includes(options["capture.downLink.file.mode"]) ||
      (parseInt(options["capture.downLink.doc.depth"], 10) >= 0 && options['capture.saveAs'] !== 'singleHtml')
    )) { return; }

    const downLinkSettings = Object.assign({}, settings, {
      depth: 0,
      isMainPage: false,
      isMainFrame: true,
    });
    const urls = utils.parseOption("capture.downLink.urlExtra", options["capture.downLink.urlExtra"]);
    for (const url of urls) {
      downLinkTasks.push(async () => {
        const response = await this.captureUrl({
          url,
          refUrl,
          downLink: true,
          downLinkExtra: true,
          settings: downLinkSettings,
          options,
        })
        .catch((ex) => {
          console.error(ex);
          this.warn(utils.lang("ErrorFileDownloadError", [url, ex.message]));
          return {url: this.getErrorUrl(url, options), error: {message: ex.message}};
        });
        return response;
      });
    }
  }

  recordMetadata({
    rootNode = this.doc.documentElement,
    docUrl = this.docUrl,
    docUrlHash = this.docUrlHash,
    mime = this.mime,
    settings: {timeId, isMainPage, isMainFrame, title, favIconUrl, type} = this.settings,
    options = this.options,
    isIndexPage = isMainPage && isMainFrame && (mime === "text/html" || options["capture.saveAs"] === "singleHtml"),
  } = {}) {
    if (!options["capture.recordDocumentMeta"]) { return; }

    let url = docUrl.startsWith("data:") ? "data:" : docUrl;

    // add hash only for index.html as subframes with different hash
    // must share the same file and record (e.g. foo.html and foo.html#bar)
    if (isIndexPage) {
      url += docUrlHash;
    }

    rootNode.setAttribute("data-scrapbook-source", url);

    // record item metadata for index.html
    if (isIndexPage) {
      rootNode.setAttribute("data-scrapbook-create", timeId);

      if (title) {
        rootNode.setAttribute("data-scrapbook-title", title);
      }

      if (favIconUrl) {
        rootNode.setAttribute("data-scrapbook-icon", favIconUrl);
      }

      if (type) {
        rootNode.setAttribute("data-scrapbook-type", type);
      }
    }
  }

  /**
   * Generate meta charset with UTF-8 if not exist.
   */
  ensureMetaCharset({
    doc = this.doc,
    options = this.options,
  } = {}) {
    const rootNode = doc.documentElement;
    const headNode = doc.head;

    if (rootNode.namespaceURI !== NS_HTML) { return; }
    if (this.metaCharsetNode) { return; }

    this.metaCharsetNode = headNode.insertBefore(doc.createElement("meta"), headNode.firstChild);
    this.metaCharsetNode.setAttribute("charset", "UTF-8");
    this.captureRecordAddedNode(this.metaCharsetNode);
    if (options["capture.prettyPrint"]) {
      this.metaCharsetNode.before("\n");
    }
  }

  /**
   * Attempt to fetch site favicon if none yet.
   *
   * Asynchronously modifies this.favIconUrl.
   */
  fetchSiteFavIcon({
    doc = this.doc,
    envDocUrl = this.envDocUrl,
    refUrl = this.refUrl,
    refPolicy = this.docRefPolicy,
    settings = this.settings,
    options = this.options,
    tasks = this.tasks,
  } = {}) {
    const rootNode = doc.documentElement;
    const headNode = doc.head;

    if (rootNode.namespaceURI !== NS_HTML) { return; }
    if (this.favIconUrl) { return; }

    switch (options["capture.favicon"]) {
      case "blank":
      case "remove":
        break;
      case "link":
      case "save":
      default: {
        const u = new URL(envDocUrl);
        if (!['http:', 'https:'].includes(u.protocol)) {
          break;
        }

        const url = u.origin + '/' + 'favicon.ico';
        tasks.push(async () => {
          const fetchResponse = await this.invoke("fetch", [{
            url: url,
            refUrl,
            refPolicy,
            settings,
            options,
          }]);
          if (!fetchResponse.error) {
            const favIconNode = headNode.appendChild(doc.createElement('link'));
            favIconNode.rel = 'shortcut icon';
            favIconNode.href = this.favIconUrl = url;
            this.captureRecordAddedNode(favIconNode);
            if (options["capture.prettyPrint"]) {
              favIconNode.after("\n");
            }
            if (options["capture.favicon"] !== "link") {
              const response = await this.downloadFile({
                url,
                refUrl,
                refPolicy,
                settings,
                options,
              });
              favIconNode.href = this.favIconUrl = response.url;
            }
          }
        });
        break;
      }
    }
  }

  recordAdoptedStyleSheets({
    rootNode = this.doc.documentElement,
    baseUrl = this.baseUrl,
    refUrl = this.refUrl,
    refPolicy = this.docRefPolicy,
    charset = this.charset,
    settings = this.settings,
    options = this.options,
    adoptedStyleSheetMap = this.adoptedStyleSheetMap,
    cssHandler = this.cssHandler,
    tasks = this.tasks,
  } = {}) {
    if (!adoptedStyleSheetMap.size) { return; }
    if (["blank", "remove"].includes(options["capture.style"])) { return; }

    const option = options["capture.rewriteCss"];
    for (const [css, {id, roots}] of adoptedStyleSheetMap) {
      tasks.push(async () => {
        let cssText;
        switch (option) {
          case "url":
          case "tidy":
          case "match": {
            cssText = await cssHandler.rewriteCssRules({
              cssRules: css.cssRules,
              baseUrl,
              refUrl,
              refPolicy,
              envCharset: charset,
              refCss: css,
              rootNode: option === 'match' ? roots : null,
              sep: '\n\n',
              settings,
              options,
            });
            break;
          }
          case "none":
          default: {
            cssText = Array.prototype.map.call(css.cssRules, x => x.cssText).join('\n\n');
            break;
          }
        }
        rootNode.setAttribute(`data-scrapbook-adoptedstylesheet-${id}`, cssText);
      });
    }
    this.requireBasicLoader = true;
  }

  async collectUsedCssResources({
    isHeadless = this.isHeadless,
    settings = this.settings,
    options = this.options,
    cssTasks = this.cssTasks,
    cssResourcesHandler = this.cssResourcesHandler,
  } = {}) {
    if (!(options["capture.imageBackground"] === "save-used" || options["capture.font"] === "save-used")) { return; }
    if (isHeadless) { return; }

    cssTasks.unshift(() => { cssResourcesHandler.start(); });
    cssTasks.push(() => { cssResourcesHandler.stop(); });
    await cssTasks.reduce((prevTask, curTask) => {
      return prevTask.then(curTask);
    }, Promise.resolve());

    // expose filter to settings
    if (options["capture.imageBackground"] === "save-used") {
      settings.usedCssImageUrl = cssResourcesHandler.usedImageUrls;
    }
    if (options["capture.font"] === "save-used") {
      settings.usedCssFontUrl = cssResourcesHandler.usedFontUrls;
    }
  }

  async fetchResources({
    options = this.options,
    tasks = this.tasks,
  } = {}) {
    if (options["capture.saveResourcesSequentially"]) {
      await tasks.reduce((prevTask, curTask) => {
        return prevTask.then(curTask);
      }, Promise.resolve());
    } else {
      await Promise.all(tasks.map(task => task()));
    }
  }

  async fetchDownLinkResources({
    downLinkTasks = this.downLinkTasks,
  } = {}) {
    // run downLink tasks sequentially
    await downLinkTasks.reduce((prevTask, curTask) => {
      return prevTask.then(curTask);
    }, Promise.resolve());
  }

  /**
   * Record shadow roots as special attributes on their hosts.
   *
   * Should run after the content of all nested shadow roots have been processed.
   */
  recordShadowRoots({
    shadowRootList = this.shadowRootList,
  } = {}) {
    for (const shadowRoot of shadowRootList) {
      const host = shadowRoot.host;
      host.setAttribute("data-scrapbook-shadowdom", shadowRoot.innerHTML);
      if (shadowRoot.mode !== 'open') {
        host.setAttribute("data-scrapbook-shadowdom-mode", shadowRoot.mode);
      }
      if (shadowRoot.clonable) {
        host.setAttribute("data-scrapbook-shadowdom-clonable", "");
      }
      if (shadowRoot.delegatesFocus) {
        host.setAttribute("data-scrapbook-shadowdom-delegates-focus", "");
      }
      if (shadowRoot.serializable) {
        host.setAttribute("data-scrapbook-shadowdom-serializable", "");
      }
      if (shadowRoot.slotAssignment && shadowRoot.slotAssignment !== 'named') {
        host.setAttribute("data-scrapbook-shadowdom-slot-assignment", shadowRoot.slotAssignment);
      }
    }
  }

  recordCssResourceMap({
    doc = this.doc,
    resourceMap = this.cssHandler.resourceMap,
  } = {}) {
    if (!(resourceMap && Object.keys(resourceMap).length)) { return; }

    const elem = doc.createElement('style');
    elem.setAttribute("data-scrapbook-elem", "css-resource-map");
    elem.textContent = ':root {'
        + Object.entries(resourceMap).map(([k, v]) => `${v}:url("${k}");`).join('')
        + '}';
    doc.head.appendChild(elem);
  }

  /**
   * Add a dummy custom element registration to prevent breaking :defined css rules
   * if scripts are not captured.
   */
  recordCustomElements({
    doc = this.doc,
    options = this.options,
    customElementNames = this.customElementNames,
  } = {}) {
    if (!customElementNames.size) { return; }
    if (['save', 'link'].includes(options["capture.script"])) { return; }

    const data = {
      names: JSON.stringify([...customElementNames]),
    };

    const elem = doc.createElement('script');
    elem.setAttribute("data-scrapbook-elem", "custom-elements-loader");
    elem.textContent = CUSTOM_ELEMENT_NAME_LOADER_TEMPLATE.replace(/%([\w@]*)%/g, (_, key) => data[key] || '');
    doc.head.appendChild(elem);
  }

  rewriteRecursively(elem, callback) {
    try {
      callback.call(this, elem);
    } catch (ex) {
      // skip iterating into descendants when NodeSkipIteration is caught
      if (ex instanceof NodeSkipIteration) {
        return;
      }

      throw ex;
    }

    let child = elem.firstElementChild, next;
    while (child) {
      // record next child in prior so that we don't get a problem if child
      // is removed in this run
      next = child.nextElementSibling;

      this.rewriteRecursively(child, callback);

      child = next;
    }
  }

  rewriteNode(node) {
    // skip non-element nodes
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return;
    }

    // skip processing a special node
    if (!REWRITABLE_SPECIAL_OBJECTS.has(utils.getScrapbookObjectType(node))) {
      throw new NodeSkipIteration(node);
    }

    const {
      settings, options,
      isHeadless,
      refUrl,
      charset,
      shadowRootList, customElementNames,
      cssHandler, cssResourcesHandler,
      cssTasks, tasks,
    } = this;

    const elem = node;
    const elemOrig = this.getOrigNode(elem);

    // remove hidden elements
    if (!isHeadless && elemOrig) {
      switch (options["capture.removeHidden"]) {
        case "undisplayed": {
          const excludeSelector = REMOVE_HIDDEN_EXCLUDE[elem.namespaceURI] ?? REMOVE_HIDDEN_EXCLUDE[NS_HTML];
          if (!elem.matches(excludeSelector)) {
            const styles = this.origDoc.defaultView.getComputedStyle(elemOrig, null);
            if (styles.getPropertyValue("display") === "none") {
              this.captureRemoveNode(elem);
              throw new NodeDisconnect(elem);
            }
          }
          break;
        }
      }
    }

    this[`_handle_{${elem.namespaceURI}}`]?.call(this, elem);

    // styles: style attribute
    if (elem.hasAttribute("style")) {
      const baseUrlCurrent = this.baseUrl;
      const refPolicy = this.docRefPolicy;
      const style = elem.style;
      if (style) {
        cssTasks.push(async () => {
          await cssResourcesHandler.inspectStyle({
            style,
            baseUrl: baseUrlCurrent,
            isInline: true,
          });
        });
      }

      switch (options["capture.styleInline"]) {
        case "blank":
          this.captureRewriteAttr(elem, "style", "");
          break;
        case "remove":
          this.captureRewriteAttr(elem, "style", null);
          break;
        case "save":
        default:
          switch (options["capture.rewriteCss"]) {
            case "url": {
              tasks.push(async () => {
                const response = await cssHandler.rewriteCssText({
                  cssText: elem.getAttribute("style"),
                  baseUrl: baseUrlCurrent,
                  refUrl,
                  refPolicy,
                  envCharset: charset,
                  isInline: true,
                  settings: {
                    usedCssFontUrl: undefined,
                    usedCssImageUrl: undefined,
                  },
                });
                this.captureRewriteAttr(elem, "style", response);
                return response;
              });
              break;
            }
            case "tidy":
            case "match": {
              tasks.push(async () => {
                const response = await cssHandler.rewriteCssText({
                  cssText: elem.style.cssText,
                  baseUrl: baseUrlCurrent,
                  refUrl,
                  refPolicy,
                  envCharset: charset,
                  isInline: true,
                  settings: {
                    usedCssFontUrl: undefined,
                    usedCssImageUrl: undefined,
                  },
                });
                this.captureRewriteAttr(elem, "style", response);
                return response;
              });
              break;
            }
            case "none":
            default: {
              // do nothing
              break;
            }
          }
          break;
      }
    }

    // scripts: script-like attributes (on* attributes)
    switch (options["capture.script"]) {
      case "save":
      case "link":
        // do nothing
        break;
      case "blank":
      case "remove":
      default:
        // removing an attribute shrinks elem.attributes list
        Array.prototype.filter.call(
          elem.attributes,
          attr => attr.name.toLowerCase().startsWith("on"),
        ).forEach((attr) => {
          this.captureRewriteAttr(elem, attr.name, null);
        });
        break;
    }

    // record custom elements
    {
      const localName = elem.localName;
      if (CUSTOM_ELEMENT_NAME_PATTERN.test(localName) && !CUSTOM_ELEMENT_NAME_FORBIDDEN.has(localName)) {
        customElementNames.add(localName);
      }
    }
  }

  [`_handle_{${NS_HTML}}`](elem) {
    this[`_handle_{${NS_HTML}}${elem.localName}`]?.call(this, elem);

    const {cssResourcesHandler, shadowRootList, cssTasks, options} = this;

    // handle shadow DOM
    if (options["capture.shadowDom"] === "save") {
      const shadowRoot = utils.getShadowRoot(elem);
      if (shadowRoot) {
        const shadowRootOrig = this.getOrigNode(shadowRoot);
        cssTasks.push(() => { cssResourcesHandler.scopePush(shadowRootOrig); });
        this.addAdoptedStyleSheets(shadowRootOrig, shadowRoot);
        this.rewriteRecursively(shadowRoot, this.rewriteNode);
        cssTasks.push(() => { cssResourcesHandler.scopePop(); });
        shadowRootList.push(shadowRoot);
        this.requireBasicLoader = true;
      }
    }

    // handle nonce
    switch (options["capture.contentSecurityPolicy"]) {
      case "save":
        // do nothing
        break;
      case "remove":
      default:
        this.captureRewriteAttr(elem, "nonce", null); // this is meaningless as CSP is removed
        break;
    }
  }

  [`_handle_{${NS_HTML}}base`](elem) {
    const {options} = this;

    if (!elem.hasAttribute("href")) { return; }

    // resolve using baseUrlFallback
    const newUrl = this.resolveRelativeUrl(elem.getAttribute("href"), this.baseUrlFallback, {skipLocal: false});
    this.captureRewriteAttr(elem, "href", newUrl);

    // Update baseUrl for the first base[href].
    // Note: don't consider a <base> elem in a shadowRoot.
    if (!this.baseElem && elem.getRootNode().nodeType === Node.DOCUMENT_NODE) {
      try {
        this.baseUrl = new URL(newUrl).href;
      } catch {
        // don't update for invalid URL
      }
      this.baseElem = elem;
    }

    switch (options["capture.base"]) {
      case "blank":
        this.captureRewriteAttr(elem, "href", null);
        break;
      case "remove":
        this.captureRemoveNode(elem);
        throw new NodeDisconnect(elem);
      case "save":
      default:
        // do nothing
        break;
    }
  }

  [`_handle_{${NS_HTML}}meta`](elem) {
    const {refUrl, downLinkTasks, settings, options} = this;

    // <meta> elements in a shadowRoot never works. Don't process or
    // rewrite them.
    if (elem.getRootNode().nodeType !== Node.DOCUMENT_NODE) { return; }

    // Exactly one of the name, http-equiv, charset, and itemprop
    // attributes must be specified, according to the spec. Though we
    // check all of them in case that a bad element contains multiple
    // attributes. It's tested that Firefox and Chromium will take the
    // charset of meta[charset] or meta[http-equiv=content-type][content]
    // even if another http-equiv or name also exists.

    if (elem.matches('[charset]') && !this.metaCharsetNode) {
      // force UTF-8
      this.metaCharsetNode = elem;
      this.captureRewriteAttr(elem, "charset", "UTF-8");
    }

    // spaced value e.g. http-equiv=" refresh " doesn't take effect
    if (elem.matches('[http-equiv][content]')) {
      switch (elem.getAttribute("http-equiv").toLowerCase()) {
        case "content-type": {
          const contentType = utils.parseHeaderContentType(elem.getAttribute("content"));
          if (contentType.parameters.charset && !this.metaCharsetNode) {
            // force UTF-8
            this.metaCharsetNode = elem;
            const regexToken = /^[!#$%&'*+.0-9A-Z^_`a-z|~-]+$/;
            let value = contentType.type;
            for (const field in contentType.parameters) {
              let v = contentType.parameters[field];
              if (field === 'charset') { v = 'UTF-8'; }
              value += '; ' + field + '=' + (regexToken.test(v) ? v : '"' + utils.escapeQuotes(v) + '"');
            }
            this.captureRewriteAttr(elem, "content", value);
          }
          break;
        }
        case "refresh": {
          // rewrite meta refresh
          const metaRefresh = utils.parseHeaderRefresh(elem.getAttribute("content"));
          if (metaRefresh.url) {
            const url = this.resolveLocalLink(metaRefresh.url, this.baseUrl);
            this.captureRewriteAttr(elem, "content", metaRefresh.time + (url ? "; url=" + url : ""));

            // check downLink
            if (['http:', 'https:', 'file:'].some(p => url.startsWith(p))) {
              if (["header", "url"].includes(options["capture.downLink.file.mode"]) ||
                  (parseInt(options["capture.downLink.doc.depth"], 10) > 0 && options['capture.saveAs'] !== 'singleHtml')) {
                downLinkTasks.push(async () => {
                  const downLinkSettings = Object.assign({}, settings, {
                    depth: settings.depth + 1,
                    isMainPage: false,
                    isMainFrame: true,
                  });
                  const response = await this.captureUrl({
                    url,
                    refUrl,
                    downLink: true,
                    settings: downLinkSettings,
                    options,
                  })
                  .catch((ex) => {
                    console.error(ex);
                    this.warn(utils.lang("ErrorFileDownloadError", [url, ex.message]));
                    return {url: this.getErrorUrl(url, options), error: {message: ex.message}};
                  });

                  if (response) {
                    const url = response.url;
                    this.captureRewriteAttr(elem, "content", metaRefresh.time + (url ? "; url=" + url : ""));
                  }
                  return response;
                });
              }
            }
          }
          break;
        }
        case "content-security-policy": {
          // content security policy could make resources not loaded when viewed offline
          switch (options["capture.contentSecurityPolicy"]) {
            case "save":
              // do nothing
              break;
            case "remove":
            default:
              this.captureRemoveNode(elem);
              throw new NodeDisconnect(elem);
          }
          break;
        }
      }
    }

    // dynamically update document referrer policy
    // spaced value e.g. name=" referrer " or content=" origin " doesn't take effect
    // ref: https://html.spec.whatwg.org/multipage/semantics.html#meta-referrer
    if (elem.matches('[name="referrer" i]')) {
      const policy = elem.getAttribute('content').toLowerCase();
      if (META_REFERRER_POLICY.has(policy)) {
        this.docRefPolicy = policy;
      } else {
        const policyLegacy = META_REFERRER_POLICY_LEGACY.get(policy);
        if (policyLegacy !== undefined) {
          this.docRefPolicy = policy;
        }
      }
    }

    // An open graph URL does not acknowledge <base> and should always use an absolute URL,
    // and thus we simply skip meta[property="og:*"].
  }

  [`_handle_{${NS_HTML}}link`](elem) {
    if (elem.hasAttribute("href")) {
      const newUrl = this.resolveRelativeUrl(elem.getAttribute("href"), this.baseUrl);
      this.captureRewriteAttr(elem, "href", newUrl);
    }

    if (elem.hasAttribute("imagesrcset")) {
      const rewriteSrcset = utils.rewriteSrcset(elem.getAttribute("imagesrcset"), (url) => {
        return this.resolveRelativeUrl(url, this.baseUrl);
      });
      this.captureRewriteAttr(elem, "imagesrcset", rewriteSrcset);
    }

    // integrity won't work due to rewriting or crossorigin issue
    this.captureRewriteAttr(elem, "integrity", null);

    if (elem.matches('[rel~="stylesheet"][href]')) {
      return this[`_handle_{${NS_HTML}}link#stylesheet`].call(this, elem);
    } else if (elem.matches('[rel~="icon"][href]')) {
      return this[`_handle_{${NS_HTML}}link#icon`].call(this, elem);
    } else if (elem.matches('[rel~="preload"][href], [rel~="preload"][imagesrcset], [rel~="modulepreload"][href], [rel~="dns-prefetch"][href], [rel~="preconnect"][href]')) {
      return this[`_handle_{${NS_HTML}}link#preload`].call(this, elem);
    } else if (elem.matches('[rel~="prefetch"][href], [rel~="prerender"][href]')) {
      return this[`_handle_{${NS_HTML}}link#prefetch`].call(this, elem);
    } else if (this.favIconSelector && elem.matches(this.favIconSelector)) {
      return this[`_handle_{${NS_HTML}}link#icon_like`].call(this, elem);
    }
  }

  [`_handle_{${NS_HTML}}link#stylesheet`](elem) {
    const {baseUrl, refUrl, charset, cssHandler, cssResourcesHandler, cssTasks, tasks, settings, options} = this;

    const refPolicy = elem.matches('[rel~="noreferrer"]') ? 'no-referrer' : elem.referrerPolicy || this.docRefPolicy;
    const envCharset = elem.getAttribute("charset") || charset;
    let disableCss = false;
    const css = cssHandler.getElemCss(elem);
    if (css) {
      if (css.title) {
        if (!cssHandler.isBrowserPick) {
          this.captureRewriteAttr(elem, "title", null);

          // Chromium has a bug that alternative stylesheets has disabled = false,
          // but actually not enabled and cannot be enabled.
          // https://bugs.chromium.org/p/chromium/issues/detail?id=965554
          if (!utils.userAgent.is("chromium")) {
            // In Firefox, stylesheets with [rel~="alternate"]:not([title]) is
            // disabled initially. Remove "alternate" to get it work.
            if (elem.matches('[rel~="alternate"]')) {
              const rel = Array.prototype.filter.call(
                elem.relList, x => x.toLowerCase() !== "alternate",
              ).join(" ");
              this.captureRewriteAttr(elem, "rel", rel);
            }
          }

          if (css.disabled) {
            disableCss = true;
          }
        }
      } else {
        if (css.disabled) {
          disableCss = true;
        }
      }
      cssTasks.push(async () => {
        await cssResourcesHandler.inspectCss({
          css,
          baseUrl: css.href || baseUrl,
          refUrl: css.href || refUrl,
          refPolicy,
          envCharset,
          root: elem.getRootNode(),
        });
      });
    }

    switch (options["capture.style"]) {
      case "link": {
        if (disableCss) {
          this.captureRewriteAttr(elem, "href", null);
          elem.setAttribute("data-scrapbook-css-disabled", "");
          break;
        }
        break;
      }
      case "blank": {
        // HTML 5.1 2nd Edition / W3C Recommendation:
        // If the href attribute is absent, then the element does not define a link.
        this.captureRewriteAttr(elem, "href", null);
        break;
      }
      case "remove": {
        this.captureRemoveNode(elem);
        throw new NodeDisconnect(elem);
      }
      case "save":
      default: {
        if (disableCss) {
          this.captureRewriteAttr(elem, "href", null);
          elem.setAttribute("data-scrapbook-css-disabled", "");
          break;
        }
        tasks.push(async () => {
          await cssHandler.rewriteCss({
            elem,
            baseUrl,
            refUrl,
            refPolicy,
            envCharset,
            settings,
            callback: (elem, response) => {
              this.captureRewriteAttr(elem, "href", response.url);
              this.captureRewriteAttr(elem, "charset", null);
            },
          });
        });

        // remove crossorigin as the origin has changed
        this.captureRewriteAttr(elem, "crossorigin", null);
        break;
      }
    }
  }

  [`_handle_{${NS_HTML}}link#icon`](elem) {
    const {refUrl, tasks, settings, options} = this;

    switch (options["capture.favicon"]) {
      case "link":
        if (typeof this.favIconUrl === 'undefined' && elem.getRootNode().nodeType === Node.DOCUMENT_NODE) {
          this.favIconUrl = elem.getAttribute("href");
        }
        break;
      case "blank":
        if (typeof this.favIconUrl === 'undefined' && elem.getRootNode().nodeType === Node.DOCUMENT_NODE) {
          this.favIconUrl = "";
        }

        // HTML 5.1 2nd Edition / W3C Recommendation:
        // If the href attribute is absent, then the element does not define a link.
        this.captureRewriteAttr(elem, "href", null);
        break;
      case "remove":
        if (typeof this.favIconUrl === 'undefined' && elem.getRootNode().nodeType === Node.DOCUMENT_NODE) {
          this.favIconUrl = "";
        }
        this.captureRemoveNode(elem);
        throw new NodeDisconnect(elem);
      case "save":
      default: {
        let useFavIcon = false;
        if (typeof this.favIconUrl === 'undefined' && elem.getRootNode().nodeType === Node.DOCUMENT_NODE) {
          this.favIconUrl = elem.getAttribute("href");
          useFavIcon = true;
        }
        const refPolicy = elem.matches('[rel~="noreferrer"]') ? 'no-referrer' : elem.referrerPolicy || this.docRefPolicy;
        tasks.push(async () => {
          const response = await this.downloadFile({
            url: elem.getAttribute("href"),
            refUrl,
            refPolicy,
            settings,
            options,
          });
          this.captureRewriteAttr(elem, "href", response.url);
          if (useFavIcon) {
            if (options["capture.saveAs"] === 'folder') {
              this.favIconUrl = response.url;
            }
          }
          return response;
        });

        // remove crossorigin as the origin has changed
        this.captureRewriteAttr(elem, "crossorigin", null);
        break;
      }
    }
  }

  [`_handle_{${NS_HTML}}link#icon_like`](elem) {
    const {refUrl, tasks, settings, options} = this;

    switch (options["capture.favicon"]) {
      case "link":
        break;
      case "blank":
        // HTML 5.1 2nd Edition / W3C Recommendation:
        // If the href attribute is absent, then the element does not define a link.
        this.captureRewriteAttr(elem, "href", null);
        break;
      case "remove":
        this.captureRemoveNode(elem);
        throw new NodeDisconnect(elem);
      case "save":
      default: {
        const refPolicy = elem.matches('[rel~="noreferrer"]') ? 'no-referrer' : elem.referrerPolicy || this.docRefPolicy;
        tasks.push(async () => {
          const response = await this.downloadFile({
            url: elem.getAttribute("href"),
            refUrl,
            refPolicy,
            settings,
            options,
          });
          this.captureRewriteAttr(elem, "href", response.url);
          return response;
        });

        // remove crossorigin as the origin has changed
        this.captureRewriteAttr(elem, "crossorigin", null);
        break;
      }
    }
  }

  [`_handle_{${NS_HTML}}link#preload`](elem) {
    const {options} = this;

    // @TODO: handle preloads according to its "as" attribute
    switch (options["capture.preload"]) {
      case "blank":
        // HTML 5.1 2nd Edition / W3C Recommendation:
        // If the href attribute is absent, then the element does not define a link.
        this.captureRewriteAttr(elem, "href", null);
        this.captureRewriteAttr(elem, "imagesrcset", null);
        break;
      case "remove":
      default:
        this.captureRemoveNode(elem);
        throw new NodeDisconnect(elem);
    }
  }

  [`_handle_{${NS_HTML}}link#prefetch`](elem) {
    const {options} = this;

    // @TODO: handle prefetches according to its "as" attribute
    switch (options["capture.prefetch"]) {
      case "blank":
        // HTML 5.1 2nd Edition / W3C Recommendation:
        // If the href attribute is absent, then the element does not define a link.
        this.captureRewriteAttr(elem, "href", null);
        break;
      case "remove":
      default:
        this.captureRemoveNode(elem);
        throw new NodeDisconnect(elem);
    }
  }

  [`_handle_{${NS_HTML}}style`](elem) {
    this[`_handle_style`].call(this, elem);
  }

  [`_handle_{${NS_HTML}}script`](elem) {
    const {refUrl, tasks, settings, options} = this;

    if (elem.hasAttribute("src")) {
      const newUrl = this.resolveRelativeUrl(elem.getAttribute("src"), this.baseUrl);
      this.captureRewriteAttr(elem, "src", newUrl);
    }

    // integrity won't work due to rewriting or crossorigin issue
    this.captureRewriteAttr(elem, "integrity", null);

    switch (options["capture.script"]) {
      case "link":
        // do nothing
        break;
      case "blank":
        // HTML 5.1 2nd Edition / W3C Recommendation:
        // If src is specified, it must be a valid non-empty URL.
        //
        // script with src="about:blank" can cause an error in some contexts
        if (elem.hasAttribute("src")) {
          this.captureRewriteAttr(elem, "src", null);
        }
        this.captureRewriteTextContent(elem, "");
        break;
      case "remove":
        this.captureRemoveNode(elem);
        throw new NodeDisconnect(elem);
      case "save":
      default: {
        if (elem.hasAttribute("src")) {
          const refPolicy = elem.referrerPolicy || this.docRefPolicy;
          tasks.push(async () => {
            const response = await this.downloadFile({
              url: elem.getAttribute("src"),
              refUrl,
              refPolicy,
              settings,
              options,
            });
            this.captureRewriteAttr(elem, "src", response.url);
            return response;
          });
        }

        // remove crossorigin as the origin has changed
        this.captureRewriteAttr(elem, "crossorigin", null);
        break;
      }
    }

    this.escapeRawTextTag(elem);
  }

  [`_handle_{${NS_HTML}}noscript`](elem) {
    const {options} = this;

    switch (options["capture.noscript"]) {
      case "blank":
        this.captureRewriteTextContent(elem, "");
        break;
      case "remove":
        this.captureRemoveNode(elem);
        throw new NodeDisconnect(elem);
      case "save":
      default: {
        // In browsers conforming the spec, elem contains only text
        // (innerHTML and textContent work like <style>)
        // when JavaScript is enabled. Replace with normal HTML content.
        // https://html.spec.whatwg.org/multipage/scripting.html#the-noscript-element
        const elemOrig = this.getOrigNode(elem);
        if (elemOrig && elemOrig.innerHTML === elemOrig.textContent) {
          // elemOrig may not exist for nested <noscript> when handling the inner level,
          // skip as the replacement should have been done in the outer level
          const tempElem = this.doc.createElement('template');
          tempElem.innerHTML = elem.textContent;
          elem.textContent = '';
          elem.appendChild(tempElem.content.cloneNode(true));
        }
        break;
      }
    }
  }

  [`_handle_{${NS_HTML}}body`](elem) {
    return this[`_handle_{${NS_HTML}}td`].call(this, elem);
  }

  [`_handle_{${NS_HTML}}table`](elem) {
    return this[`_handle_{${NS_HTML}}td`].call(this, elem);
  }

  [`_handle_{${NS_HTML}}tr`](elem) {
    return this[`_handle_{${NS_HTML}}td`].call(this, elem);
  }

  [`_handle_{${NS_HTML}}th`](elem) {
    return this[`_handle_{${NS_HTML}}td`].call(this, elem);
  }

  [`_handle_{${NS_HTML}}td`](elem) {
    const {refUrl, docRefPolicy: refPolicy, tasks, settings, options} = this;

    // deprecated: background attribute (deprecated since HTML5)
    if (elem.hasAttribute("background")) {
      const newUrl = this.resolveRelativeUrl(elem.getAttribute("background"), this.baseUrl);
      this.captureRewriteAttr(elem, "background", newUrl);

      switch (options["capture.imageBackground"]) {
        case "link":
          // do nothing
          break;
        case "blank":
        case "remove": // deprecated
          this.captureRewriteAttr(elem, "background", null);
          break;
        case "save-used":
        case "save":
        default: {
          tasks.push(async () => {
            const response = await this.downloadFile({
              url: newUrl,
              refUrl,
              refPolicy,
              settings,
              options,
            });
            this.captureRewriteAttr(elem, "background", response.url);
            return response;
          });
          break;
        }
      }
    }
  }

  [`_handle_{${NS_HTML}}frame`](elem) {
    return this[`_handle_{${NS_HTML}}iframe`].call(this, elem);
  }

  [`_handle_{${NS_HTML}}iframe`](elem) {
    const {envDocUrl, baseUrl, refUrl, tasks, settings, options} = this;

    const frame = elem;
    const frameSrc = this.getOrigNode(frame);
    let sourceUrl;
    if (frame.hasAttribute("src")) {
      sourceUrl = this.resolveRelativeUrl(frame.getAttribute("src"), baseUrl, {checkJavascript: true});
      this.captureRewriteAttr(frame, "src", sourceUrl);
    }

    // @TODO: javascript: URL content is preserved only when the frame
    // page content is not saved.
    const refPolicy = frame.referrerPolicy || this.docRefPolicy;
    switch (options["capture.frame"]) {
      case "link": {
        // if the frame has srcdoc, use it
        if (frame.localName === 'iframe' &&
            frame.hasAttribute("srcdoc")) {
          const captureFrameCallback = async (response) => {
            isDebug && console.debug("captureFrameCallback", response);
            const file = dataUriToFile(response.url);
            const content = await utils.readFileAsText(file);
            this.captureRewriteAttr(frame, "srcdoc", content);
            return response;
          };

          const captureFrameErrorHandler = async (ex) => {
            console.error(ex);
            this.warn(utils.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
            // don't rewrite srcdoc if error
          };

          const frameSettings = Object.assign({}, settings, {
            recurseChain: [...settings.recurseChain],
            isMainFrame: false,
            fullPage: true,
            usedCssFontUrl: undefined,
            usedCssImageUrl: undefined,
          });

          // save resources in srcdoc as data URL
          const frameOptions = Object.assign({}, options, {
            "capture.saveAs": "singleHtml",
          });

          sourceUrl = 'about:srcdoc';

          tasks.push(async () => {
            const frameDoc = (() => {
              try {
                return frameSrc.contentDocument;
              } catch (ex) {
                // console.debug(ex);
              }
            })();

            // frame document accessible:
            // capture the content document directly
            if (frameDoc) {
              return this.captureDocumentOrFile({
                doc: frameDoc,
                docUrl: sourceUrl,
                envDocUrl,
                baseUrl,
                refUrl,
                refPolicy,
                settings: frameSettings,
                options: frameOptions,
              }).then(captureFrameCallback).catch(captureFrameErrorHandler);
            }

            // frame document inaccessible (headless capture):
            // contentType of srcdoc is always text/html
            const doc = (new DOMParser()).parseFromString(frame.getAttribute("srcdoc"), 'text/html');

            return this.captureDocument({
              doc,
              docUrl: sourceUrl,
              envDocUrl,
              baseUrl,
              refPolicy,
              settings: frameSettings,
              options: frameOptions,
            }).then(captureFrameCallback).catch(captureFrameErrorHandler);
          });
        }
        break;
      }
      case "blank": {
        // HTML 5.1 2nd Edition / W3C Recommendation:
        // The src attribute, if present, must be a valid non-empty URL.
        this.captureRewriteAttr(frame, "src", null);
        if (frame.localName === 'iframe') {
          this.captureRewriteAttr(frame, "srcdoc", null);
        }
        break;
      }
      case "remove": {
        this.captureRemoveNode(frame);
        throw new NodeDisconnect(frame);
      }
      case "save":
      default: {
        const captureFrameCallback = async (response) => {
          isDebug && console.debug("captureFrameCallback", response);

          // use srcdoc for data URL document for iframe
          if (response.url.startsWith('data:') &&
              frame.localName === 'iframe' &&
              options["capture.saveDataUriAsSrcdoc"]) {
            const file = dataUriToFile(response.url);
            const {type: mime, parameters: {charset}} = utils.parseHeaderContentType(file.type);
            if (mime === "text/html") {
              // assume the charset is UTF-8 if not defined
              const content = await utils.readFileAsText(file, charset || "UTF-8");
              this.captureRewriteAttr(frame, "srcdoc", content);
              this.captureRewriteAttr(frame, "src", null);
              return response;
            }
          }

          this.captureRewriteAttr(frame, "src", response.url);
          if (frame.localName === 'iframe') {
            this.captureRewriteAttr(frame, "srcdoc", null);
          }
          return response;
        };

        const captureFrameErrorHandler = async (ex) => {
          console.error(ex);
          this.warn(utils.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
          return {url: this.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
        };

        const frameSettings = Object.assign({}, settings, {
          recurseChain: [...settings.recurseChain],
          isMainFrame: false,
          fullPage: true,
          usedCssFontUrl: undefined,
          usedCssImageUrl: undefined,
        });

        sourceUrl = frame.getAttribute("src");

        tasks.push(async () => {
          const frameDoc = (() => {
            try {
              return frameSrc.contentDocument;
            } catch (ex) {
              // console.debug(ex);
            }
          })();

          // frame document accessible:
          // capture the content document directly
          if (frameDoc) {
            sourceUrl = frameDoc.URL;
            return this.captureDocumentOrFile({
              doc: frameDoc,
              envDocUrl,
              baseUrl,
              refUrl,
              refPolicy,
              settings: frameSettings,
              options,
            }).catch(captureFrameErrorHandler).then(captureFrameCallback);
          }

          const frameWindow = (() => {
            try {
              return frameSrc.contentWindow;
            } catch (ex) {
              // console.debug(ex);
            }
          })();

          // frame window accessible:
          // capture the content document through messaging if viable
          if (frameWindow) {
            const response = await this.invoke("captureDocumentOrFile", [{
              refUrl,
              refPolicy,
              settings: frameSettings,
              options,
            }], {frameWindow}).catch(captureFrameErrorHandler);
            // undefined for data URL, sandboxed blob URL, etc.
            if (response) {
              return captureFrameCallback(response);
            }
          }

          // frame window accessible with special cases:
          // frame window inaccessible: (headless capture)

          // if the frame has srcdoc, use it
          if (frame.localName === 'iframe' &&
              frame.hasAttribute("srcdoc")) {
            sourceUrl = 'about:srcdoc';

            // contentType of srcdoc is always text/html
            const doc = (new DOMParser()).parseFromString(frame.getAttribute("srcdoc"), 'text/html');

            return this.captureDocument({
              doc,
              docUrl: sourceUrl,
              envDocUrl,
              baseUrl,
              refPolicy,
              settings: frameSettings,
              options,
            }).catch(captureFrameErrorHandler).then(captureFrameCallback);
          }

          // if the frame src is not absolute,
          // skip further processing and keep current src
          // (point to self, or not resolvable)
          if (!utils.isUrlAbsolute(sourceUrl)) {
            return;
          }

          // keep original about:blank etc. if the real content is not
          // accessible
          if (sourceUrl.startsWith('about:')) {
            return;
          }

          // otherwise, headlessly capture src
          let frameOptions = options;

          // special handling for data URL
          if (sourceUrl.startsWith("data:") &&
              !options["capture.saveDataUriAsFile"] &&
              !(frame.localName === 'iframe' && options["capture.saveDataUriAsSrcdoc"]) &&
              options["capture.saveAs"] !== "singleHtml") {
            // Save frame document and inner URLs as data URL since data URL
            // is null origin and no relative URL is allowed in it.
            frameOptions = Object.assign({}, options, {
              "capture.saveAs": "singleHtml",
            });
          }

          const [sourceUrlMain, sourceUrlHash] = utils.splitUrlByAnchor(sourceUrl);
          frameSettings.recurseChain.push(envDocUrl);

          // check circular reference if saving as data URL
          if (frameOptions["capture.saveAs"] === "singleHtml") {
            if (frameSettings.recurseChain.includes(sourceUrlMain)) {
              this.warn(utils.lang("WarnCaptureCircular", [refUrl, sourceUrlMain]));
              this.captureRewriteAttr(frame, "src", `urn:scrapbook:download:circular:url:${sourceUrl}`);
              return;
            }
          }

          return this.captureUrl({
            url: sourceUrl,
            refUrl,
            refPolicy,
            settings: frameSettings,
            options: frameOptions,
          }).catch(captureFrameErrorHandler).then(captureFrameCallback);
        });
        break;
      }
    }
  }

  [`_handle_{${NS_HTML}}a`](elem) {
    const {baseUrlFinal, options} = this;

    if (elem.hasAttribute("ping")) {
      switch (options["capture.ping"]) {
        case "link": {
          const newUrls = utils.rewriteUrls(elem.getAttribute("ping"), (url) => {
            return this.resolveRelativeUrl(url, baseUrlFinal);
          });
          this.captureRewriteAttr(elem, "ping", newUrls);
          break;
        }
        case "blank":
        default: {
          this.captureRewriteAttr(elem, "ping", null);
          break;
        }
      }
    }

    this.rewriteAnchor(elem, "href");
  }

  [`_handle_{${NS_HTML}}area`](elem) {
    return this[`_handle_{${NS_HTML}}a`].call(this, elem);
  }

  [`_handle_{${NS_HTML}}img`](elem) {
    const {isHeadless, refUrl, tasks, settings, options} = this;

    if (elem.hasAttribute("src")) {
      const newUrl = this.resolveRelativeUrl(elem.getAttribute("src"), this.baseUrl);
      this.captureRewriteAttr(elem, "src", newUrl);
    }

    if (elem.hasAttribute("srcset")) {
      const rewriteSrcset = utils.rewriteSrcset(elem.getAttribute("srcset"), (url) => {
        return this.resolveRelativeUrl(url, this.baseUrl);
      });
      this.captureRewriteAttr(elem, "srcset", rewriteSrcset);
    }

    const refPolicy = elem.referrerPolicy || this.docRefPolicy;
    switch (options["capture.image"]) {
      case "link":
        // do nothing
        break;
      case "blank":
        // HTML 5.1 2nd Edition / W3C Recommendation:
        // The src attribute must be present, and must contain a valid non-empty URL.
        if (elem.hasAttribute("src")) {
          this.captureRewriteAttr(elem, "src", "about:blank");
        }

        if (elem.hasAttribute("srcset")) {
          this.captureRewriteAttr(elem, "srcset", null);
        }

        break;
      case "remove":
        this.captureRemoveNode(elem);
        throw new NodeDisconnect(elem);
      case "save-current":
        if (!isHeadless) {
          const elemOrig = this.getOrigNode(elem);
          if (elemOrig?.currentSrc) {
            const url = elemOrig.currentSrc;
            this.captureRewriteAttr(elem, "srcset", null);
            tasks.push(async () => {
              const response = await this.downloadFile({
                url,
                refUrl,
                refPolicy,
                settings,
                options,
              });
              this.captureRewriteAttr(elem, "src", response.url);
              return response;
            });
          }
          break;
        }
        // Headless capture doesn't support currentSrc, fallback to "save".
        // eslint-disable-next-line no-fallthrough
      case "save":
      default:
        if (elem.hasAttribute("src")) {
          tasks.push(async () => {
            const response = await this.downloadFile({
              url: elem.getAttribute("src"),
              refUrl,
              refPolicy,
              settings,
              options,
            });
            this.captureRewriteAttr(elem, "src", response.url);
            return response;
          });
        }

        if (elem.hasAttribute("srcset")) {
          tasks.push(async () => {
            const response = await utils.rewriteSrcset(elem.getAttribute("srcset"), async (url) => {
              return (await this.downloadFile({
                url,
                refUrl,
                refPolicy,
                settings,
                options,
              })).url;
            });
            this.captureRewriteAttr(elem, "srcset", response);
            return response;
          });
        }

        // remove crossorigin as the origin has changed
        this.captureRewriteAttr(elem, "crossorigin", null);
        break;
    }
  }

  [`_handle_{${NS_HTML}}picture`](elem) {
    const {isHeadless, refUrl, tasks, settings, options} = this;

    for (const subElem of elem.querySelectorAll('source[srcset]')) {
      if (subElem.namespaceURI !== NS_HTML) { continue; }
      const rewriteSrcset = utils.rewriteSrcset(subElem.getAttribute("srcset"), (url) => {
        return this.resolveRelativeUrl(url, this.baseUrl);
      });
      this.captureRewriteAttr(subElem, "srcset", rewriteSrcset);
    }

    switch (options["capture.image"]) {
      case "link":
        // do nothing
        break;
      case "blank":
        for (const subElem of elem.querySelectorAll('source[srcset]')) {
          if (subElem.namespaceURI !== NS_HTML) { continue; }
          this.captureRewriteAttr(subElem, "srcset", null);
        }
        break;
      case "remove":
        this.captureRemoveNode(elem);
        throw new NodeDisconnect(elem);
      case "save-current":
        if (!isHeadless) {
          for (const subElem of elem.querySelectorAll('img')) {
            if (subElem.namespaceURI !== NS_HTML) { continue; }
            const subElemOrig = this.getOrigNode(subElem);

            if (subElemOrig?.currentSrc) {
              // subElem will be further processed in the following loop that handles "img"
              this.captureRewriteAttr(subElem, "src", subElemOrig.currentSrc);
              this.captureRewriteAttr(subElem, "srcset", null);
            }
          }

          for (const subElem of elem.querySelectorAll('source[srcset]')) {
            if (subElem.namespaceURI !== NS_HTML) { continue; }
            this.captureRemoveNode(subElem);
          }

          break;
        }
        // Headless capture doesn't support currentSrc, fallback to "save".
        // eslint-disable-next-line no-fallthrough
      case "save":
      default: {
        const refPolicy = this.docRefPolicy;
        for (const subElem of elem.querySelectorAll('source[srcset]')) {
          if (subElem.namespaceURI !== NS_HTML) { continue; }
          tasks.push(async () => {
            const response = await utils.rewriteSrcset(subElem.getAttribute("srcset"), async (url) => {
              const newUrl = this.resolveRelativeUrl(url, this.baseUrl);
              return (await this.downloadFile({
                url: newUrl,
                refUrl,
                refPolicy,
                settings,
                options,
              })).url;
            });
            this.captureRewriteAttr(subElem, "srcset", response);
            return response;
          });
        }
        break;
      }
    }
  }

  [`_handle_{${NS_HTML}}audio`](elem) {
    const {isHeadless, refUrl, docRefPolicy: refPolicy, tasks, settings, options} = this;

    if (elem.hasAttribute("src")) {
      const newUrl = this.resolveRelativeUrl(elem.getAttribute("src"), this.baseUrl);
      this.captureRewriteAttr(elem, "src", newUrl);
    }

    for (const subElem of elem.querySelectorAll('source[src], track[src]')) {
      if (subElem.namespaceURI !== NS_HTML) { continue; }
      const newUrl = this.resolveRelativeUrl(subElem.getAttribute("src"), this.baseUrl);
      this.captureRewriteAttr(subElem, "src", newUrl);
    }

    switch (options["capture.audio"]) {
      case "link":
        // do nothing
        break;
      case "blank":
        if (elem.hasAttribute("src")) {
          this.captureRewriteAttr(elem, "src", "about:blank");
        }

        // HTML 5.1 2nd Edition / W3C Recommendation:
        // The src attribute must be present and be a valid non-empty URL.
        for (const subElem of elem.querySelectorAll('source[src], track[src]')) {
          if (subElem.namespaceURI !== NS_HTML) { continue; }
          this.captureRewriteAttr(subElem, "src", "about:blank");
        }

        break;
      case "remove":
        this.captureRemoveNode(elem);
        throw new NodeDisconnect(elem);
      case "save-current":
        if (!isHeadless) {
          const elemOrig = this.getOrigNode(elem);
          if (elemOrig?.currentSrc) {
            const url = elemOrig.currentSrc;
            for (const subElem of elem.querySelectorAll('source[src]')) {
              if (subElem.namespaceURI !== NS_HTML) { continue; }
              this.captureRemoveNode(subElem);
            }
            tasks.push(async () => {
              const response = await this.downloadFile({
                url,
                refUrl,
                refPolicy,
                settings,
                options,
              });
              this.captureRewriteAttr(elem, "src", response.url);
              return response;
            });
          }

          for (const subElem of elem.querySelectorAll('track[src]')) {
            if (subElem.namespaceURI !== NS_HTML) { continue; }
            tasks.push(async () => {
              const response = await this.downloadFile({
                url: subElem.getAttribute("src"),
                refUrl,
                refPolicy,
                settings,
                options,
              });
              this.captureRewriteAttr(subElem, "src", response.url);
              return response;
            });
          }

          break;
        }
        // Headless capture doesn't support currentSrc, fallback to "save".
        // eslint-disable-next-line no-fallthrough
      case "save":
      default:
        if (elem.hasAttribute("src")) {
          tasks.push(async () => {
            const response = await this.downloadFile({
              url: elem.getAttribute("src"),
              refUrl,
              refPolicy,
              settings,
              options,
            });
            this.captureRewriteAttr(elem, "src", response.url);
            return response;
          });
        }

        for (const subElem of elem.querySelectorAll('source[src], track[src]')) {
          if (subElem.namespaceURI !== NS_HTML) { continue; }
          tasks.push(async () => {
            const response = await this.downloadFile({
              url: subElem.getAttribute("src"),
              refUrl,
              refPolicy,
              settings,
              options,
            });
            this.captureRewriteAttr(subElem, "src", response.url);
            return response;
          });
        }

        // remove crossorigin as the origin has changed
        this.captureRewriteAttr(elem, "crossorigin", null);
        break;
    }
  }

  [`_handle_{${NS_HTML}}video`](elem) {
    const {isHeadless, refUrl, docRefPolicy: refPolicy, tasks, settings, options} = this;

    if (elem.hasAttribute("poster")) {
      const newUrl = this.resolveRelativeUrl(elem.getAttribute("poster"), this.baseUrl);
      this.captureRewriteAttr(elem, "poster", newUrl);
    }

    if (elem.hasAttribute("src")) {
      const newUrl = this.resolveRelativeUrl(elem.getAttribute("src"), this.baseUrl);
      this.captureRewriteAttr(elem, "src", newUrl);
    }

    for (const subElem of elem.querySelectorAll('source[src], track[src]')) {
      if (subElem.namespaceURI !== NS_HTML) { continue; }
      const newUrl = this.resolveRelativeUrl(subElem.getAttribute("src"), this.baseUrl);
      this.captureRewriteAttr(subElem, "src", newUrl);
    }

    switch (options["capture.video"]) {
      case "link":
        // do nothing
        break;
      case "blank":
        // HTML 5.1 2nd Edition / W3C Recommendation:
        // The attribute, if present, must contain a valid non-empty URL.
        if (elem.hasAttribute("poster")) {
          this.captureRewriteAttr(elem, "poster", null);
        }

        if (elem.hasAttribute("src")) {
          this.captureRewriteAttr(elem, "src", "about:blank");
        }

        // HTML 5.1 2nd Edition / W3C Recommendation:
        // The src attribute must be present and be a valid non-empty URL.
        for (const subElem of elem.querySelectorAll('source[src], track[src]')) {
          if (subElem.namespaceURI !== NS_HTML) { continue; }
          this.captureRewriteAttr(subElem, "src", "about:blank");
        }

        break;
      case "remove":
        this.captureRemoveNode(elem);
        throw new NodeDisconnect(elem);
      case "save-current":
        if (!isHeadless) {
          if (elem.hasAttribute("poster")) {
            tasks.push(async () => {
              const response = await this.downloadFile({
                url: elem.getAttribute("poster"),
                refUrl,
                refPolicy,
                settings,
                options,
              });
              this.captureRewriteAttr(elem, "poster", response.url);
              return response;
            });
          }

          const elemOrig = this.getOrigNode(elem);
          if (elemOrig?.currentSrc) {
            const url = elemOrig.currentSrc;
            for (const subElem of elem.querySelectorAll('source[src]')) {
              if (subElem.namespaceURI !== NS_HTML) { continue; }
              this.captureRemoveNode(subElem);
            }
            tasks.push(async () => {
              const response = await this.downloadFile({
                url,
                refUrl,
                refPolicy,
                settings,
                options,
              });
              this.captureRewriteAttr(elem, "src", response.url);
              return response;
            });
          }

          for (const subElem of elem.querySelectorAll('track[src]')) {
            if (subElem.namespaceURI !== NS_HTML) { continue; }
            tasks.push(async () => {
              const response = await this.downloadFile({
                url: subElem.getAttribute("src"),
                refUrl,
                refPolicy,
                settings,
                options,
              });
              this.captureRewriteAttr(subElem, "src", response.url);
              return response;
            });
          }

          break;
        }
        // Headless capture doesn't support currentSrc, fallback to "save".
        // eslint-disable-next-line no-fallthrough
      case "save":
      default:
        if (elem.hasAttribute("poster")) {
          tasks.push(async () => {
            const response = await this.downloadFile({
              url: elem.getAttribute("poster"),
              refUrl,
              refPolicy,
              settings,
              options,
            });
            this.captureRewriteAttr(elem, "poster", response.url);
            return response;
          });
        }

        if (elem.hasAttribute("src")) {
          tasks.push(async () => {
            const response = await this.downloadFile({
              url: elem.getAttribute("src"),
              refUrl,
              refPolicy,
              settings,
              options,
            });
            this.captureRewriteAttr(elem, "src", response.url);
            return response;
          });
        }

        for (const subElem of elem.querySelectorAll('source[src], track[src]')) {
          if (subElem.namespaceURI !== NS_HTML) { continue; }
          tasks.push(async () => {
            const response = await this.downloadFile({
              url: subElem.getAttribute("src"),
              refUrl,
              refPolicy,
              settings,
              options,
            });
            this.captureRewriteAttr(subElem, "src", response.url);
            return response;
          });
        }

        // remove crossorigin as the origin has changed
        this.captureRewriteAttr(elem, "crossorigin", null);
        break;
    }
  }

  [`_handle_{${NS_HTML}}embed`](elem) {
    const {refUrl, tasks, settings, options} = this;

    if (elem.hasAttribute("src")) {
      const newUrl = this.resolveRelativeUrl(elem.getAttribute("src"), this.baseUrl);
      this.captureRewriteAttr(elem, "src", newUrl);
    }

    if (elem.hasAttribute("pluginspage")) {
      const newUrl = this.resolveRelativeUrl(elem.getAttribute("pluginspage"), this.baseUrl);
      this.captureRewriteAttr(elem, "pluginspage", newUrl);
    }

    switch (options["capture.embed"]) {
      case "link":
        // do nothing
        break;
      case "blank":
        // HTML 5.1 2nd Edition / W3C Recommendation:
        // The src attribute, if present, must contain a valid non-empty URL.
        if (elem.hasAttribute("src")) {
          this.captureRewriteAttr(elem, "src", null);
        }
        break;
      case "remove":
        this.captureRemoveNode(elem);
        throw new NodeDisconnect(elem);
      case "save":
      default:
        if (elem.hasAttribute("src")) {
          const refPolicy = this.docRefPolicy;
          tasks.push(async () => {
            const sourceUrl = elem.getAttribute("src");

            // skip further processing and keep current src
            // (point to self, or not resolvable)
            if (!utils.isUrlAbsolute(sourceUrl)) {
              return;
            }

            // keep original about:blank etc. as the real content is
            // not accessible
            if (sourceUrl.startsWith('about:')) {
              return;
            }

            const [sourceUrlMain, sourceUrlHash] = utils.splitUrlByAnchor(sourceUrl);

            // headlessly capture
            const embedSettings = Object.assign({}, settings, {
              recurseChain: [...settings.recurseChain, refUrl],
              isMainFrame: false,
              fullPage: true,
              usedCssFontUrl: undefined,
              usedCssImageUrl: undefined,
            });

            let embedOptions = options;

            // special handling for data URL
            if (sourceUrl.startsWith("data:") &&
                !options["capture.saveDataUriAsFile"] &&
                options["capture.saveAs"] !== "singleHtml") {
              // Save object document and inner URLs as data URL since data URL
              // is null origin and no relative URL is allowed in it.
              embedOptions = Object.assign({}, options, {
                "capture.saveAs": "singleHtml",
              });
            }

            // check circular reference if saving as data URL
            if (embedOptions["capture.saveAs"] === "singleHtml") {
              if (embedSettings.recurseChain.includes(sourceUrlMain)) {
                this.warn(utils.lang("WarnCaptureCircular", [refUrl, sourceUrlMain]));
                this.captureRewriteAttr(elem, "src", `urn:scrapbook:download:circular:url:${sourceUrl}`);
                return;
              }
            }

            return this.captureUrl({
              url: sourceUrl,
              refUrl,
              refPolicy,
              settings: embedSettings,
              options: embedOptions,
            }).catch((ex) => {
              console.error(ex);
              this.warn(utils.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
              return {url: this.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
            }).then((response) => {
              this.captureRewriteAttr(elem, "src", response.url);
              return response;
            });
          });
        }
        break;
    }
  }

  [`_handle_{${NS_HTML}}object`](elem) {
    const {refUrl, tasks, settings, options} = this;

    let objectBaseUrl = this.baseUrl;

    // Some browsers ignore the codebase attribute (e.g. Chromium).
    // We follow it anyway.
    if (elem.hasAttribute("codebase")) {
      objectBaseUrl = this.resolveRelativeUrl(elem.getAttribute("codebase"), objectBaseUrl);
      this.captureRewriteAttr(elem, "codebase", null);
    }

    // According to doc, classid is resolved using codebase, although
    // it's usually an absolute non-http URI.
    // https://developer.mozilla.org/en-US/docs/Web/HTML/Element/object
    if (elem.hasAttribute("classid")) {
      const newUrl = this.resolveRelativeUrl(elem.getAttribute("classid"), objectBaseUrl);
      this.captureRewriteAttr(elem, "classid", newUrl);
    }

    if (elem.hasAttribute("data")) {
      const newUrl = this.resolveRelativeUrl(elem.getAttribute("data"), objectBaseUrl);
      this.captureRewriteAttr(elem, "data", newUrl);
    }

    if (elem.hasAttribute("archive")) {
      const newUrls = utils.rewriteUrls(elem.getAttribute("archive"), (url) => {
        return this.resolveRelativeUrl(url, objectBaseUrl);
      });
      this.captureRewriteAttr(elem, "archive", newUrls);
    }

    switch (options["capture.object"]) {
      case "link":
        // do nothing
        break;
      case "blank":
        // HTML 5.1 2nd Edition / W3C Recommendation:
        // The data attribute, if present, must be a valid non-empty URL.
        if (elem.hasAttribute("data")) {
          this.captureRewriteAttr(elem, "data", null);
        }

        if (elem.hasAttribute("archive")) {
          this.captureRewriteAttr(elem, "archive", null);
        }
        break;
      case "remove":
        this.captureRemoveNode(elem);
        throw new NodeDisconnect(elem);
      case "save":
      default: {
        const refPolicy = this.docRefPolicy;
        if (elem.hasAttribute("data")) {
          tasks.push(async () => {
            const sourceUrl = elem.getAttribute("data");

            // skip further processing and keep current src
            // (point to self, or not resolvable)
            if (!utils.isUrlAbsolute(sourceUrl)) {
              return;
            }

            // keep original about:blank etc. as the real content is
            // not accessible
            if (sourceUrl.startsWith('about:')) {
              return;
            }

            const [sourceUrlMain, sourceUrlHash] = utils.splitUrlByAnchor(sourceUrl);

            // headlessly capture
            const objectSettings = Object.assign({}, settings, {
              recurseChain: [...settings.recurseChain, refUrl],
              isMainFrame: false,
              fullPage: true,
              usedCssFontUrl: undefined,
              usedCssImageUrl: undefined,
            });

            let objectOptions = options;

            // special handling for data URL
            if (sourceUrl.startsWith("data:") &&
                !options["capture.saveDataUriAsFile"] &&
                options["capture.saveAs"] !== "singleHtml") {
              // Save object document and inner URLs as data URL since data URL
              // is null origin and no relative URL is allowed in it.
              objectOptions = Object.assign({}, options, {
                "capture.saveAs": "singleHtml",
              });
            }

            // check circular reference if saving as data URL
            if (objectOptions["capture.saveAs"] === "singleHtml") {
              if (objectSettings.recurseChain.includes(sourceUrlMain)) {
                this.warn(utils.lang("WarnCaptureCircular", [refUrl, sourceUrlMain]));
                this.captureRewriteAttr(elem, "data", `urn:scrapbook:download:circular:url:${sourceUrl}`);
                return;
              }
            }

            return this.captureUrl({
              url: sourceUrl,
              refUrl,
              refPolicy,
              settings: objectSettings,
              options: objectOptions,
            }).catch(async (ex) => {
              console.error(ex);
              this.warn(utils.lang("ErrorFileDownloadError", [sourceUrl, ex.message]));
              return {url: this.getErrorUrl(sourceUrl, options), error: {message: ex.message}};
            }).then(async (response) => {
              this.captureRewriteAttr(elem, "data", response.url);
              return response;
            });
          });
        }

        // plugins referenced by legacy archive are static and do not require rewriting
        if (elem.hasAttribute("archive")) {
          tasks.push(async () => {
            const response = await utils.rewriteUrls(elem.getAttribute("archive"), async (url) => {
              return (await this.downloadFile({
                url,
                refUrl,
                refPolicy,
                settings,
                options,
              })).url;
            });
            this.captureRewriteAttr(elem, "archive", response);
            return response;
          });
        }
        break;
      }
    }
  }

  [`_handle_{${NS_HTML}}applet`](elem) {
    const {refUrl, tasks, settings, options} = this;

    let appletBaseUrl = this.baseUrl;

    if (elem.hasAttribute("codebase")) {
      appletBaseUrl = this.resolveRelativeUrl(elem.getAttribute("codebase"), appletBaseUrl);
      this.captureRewriteAttr(elem, "codebase", null);
    }

    // According to doc, classid is used by applet.
    // http://help.dottoro.com/lhbvlpge.php
    if (elem.hasAttribute("classid")) {
      const newUrl = this.resolveRelativeUrl(elem.getAttribute("classid"), appletBaseUrl);
      this.captureRewriteAttr(elem, "classid", newUrl);
    }

    if (elem.hasAttribute("code")) {
      let newUrl = this.resolveRelativeUrl(elem.getAttribute("code"), appletBaseUrl);
      this.captureRewriteAttr(elem, "code", newUrl);
    }

    if (elem.hasAttribute("archive")) {
      let newUrl = this.resolveRelativeUrl(elem.getAttribute("archive"), appletBaseUrl);
      this.captureRewriteAttr(elem, "archive", newUrl);
    }

    switch (options["capture.applet"]) {
      case "link":
        // do nothing
        break;
      case "blank":
        if (elem.hasAttribute("code")) {
          this.captureRewriteAttr(elem, "code", null);
        }

        if (elem.hasAttribute("archive")) {
          this.captureRewriteAttr(elem, "archive", null);
        }
        break;
      case "remove":
        this.captureRemoveNode(elem);
        throw new NodeDisconnect(elem);
      case "save":
      default: {
        const refPolicy = this.docRefPolicy;
        if (elem.hasAttribute("code")) {
          tasks.push(async () => {
            const response = await this.downloadFile({
              url: elem.getAttribute("code"),
              refUrl,
              refPolicy,
              settings,
              options,
            });
            this.captureRewriteAttr(elem, "code", response.url);
            return response;
          });
        }

        if (elem.hasAttribute("archive")) {
          tasks.push(async () => {
            const response = await this.downloadFile({
              url: elem.getAttribute("archive"),
              refUrl,
              refPolicy,
              settings,
              options,
            });
            this.captureRewriteAttr(elem, "archive", response.url);
            return response;
          });
        }
        break;
      }
    }
  }

  [`_handle_{${NS_HTML}}canvas`](elem) {
    const {isHeadless, options} = this;

    switch (options["capture.canvas"]) {
      case "blank":
        // do nothing
        break;
      case "remove":
        this.captureRemoveNode(elem);
        throw new NodeDisconnect(elem);
      case "save":
      default: {
        // we get only blank canvas in headless capture
        if (isHeadless) { break; }

        const elemOrig = this.getOrigNode(elem);
        if (!elemOrig) { break; }

        try {
          const data = elemOrig.toDataURL();
          if (data !== utils.getBlankCanvasData(elemOrig)) {
            elem.setAttribute("data-scrapbook-canvas", data);
            this.requireBasicLoader = true;
          }
        } catch (ex) {
          console.error(ex);
        }

        break;
      }
    }
  }

  [`_handle_{${NS_HTML}}form`](elem) {
    const {baseUrlFinal} = this;

    if (elem.hasAttribute("action")) {
      const newUrl = this.resolveRelativeUrl(elem.getAttribute("action"), baseUrlFinal, {checkJavascript: true});
      this.captureRewriteAttr(elem, "action", newUrl);
    }
  }

  [`_handle_{${NS_HTML}}input`](elem) {
    const {baseUrlFinal, refUrl, tasks, settings, options} = this;
    const elemOrig = this.getOrigNode(elem);

    switch (elem.type.toLowerCase()) {
      case "image": {
        if (elem.hasAttribute("formaction")) {
          const newUrl = this.resolveRelativeUrl(elem.getAttribute("formaction"), baseUrlFinal, {checkJavascript: true});
          this.captureRewriteAttr(elem, "formaction", newUrl);
        }

        if (elem.hasAttribute("src")) {
          const newUrl = this.resolveRelativeUrl(elem.getAttribute("src"), this.baseUrl);
          this.captureRewriteAttr(elem, "src", newUrl);
        }
        switch (options["capture.image"]) {
          case "link":
            // do nothing
            break;
          case "blank":
            // HTML 5.1 2nd Edition / W3C Recommendation:
            // The src attribute must be present, and must contain a valid non-empty URL.
            if (elem.hasAttribute("src")) {
              this.captureRewriteAttr(elem, "src", "about:blank");
            }
            break;
          case "remove":
            this.captureRemoveNode(elem);
            throw new NodeDisconnect(elem);
          case "save-current":
            // srcset and currentSrc are not supported, do the same as save
            // eslint-disable-next-line no-fallthrough
          case "save":
          default: {
            if (elem.hasAttribute("src")) {
              const refPolicy = this.docRefPolicy;
              tasks.push(async () => {
                const response = await this.downloadFile({
                  url: elem.getAttribute("src"),
                  refUrl,
                  refPolicy,
                  settings,
                  options,
                });
                this.captureRewriteAttr(elem, "src", response.url);
                return response;
              });
            }
            break;
          }
        }
        break;
      }

      case "file": {
        break;
      }

      case "password": {
        switch (options["capture.formStatus"]) {
          case "save-all":
            if (elemOrig) {
              const value = elemOrig.value;
              if (value !== elem.getAttribute('value')) {
                elem.setAttribute("data-scrapbook-input-value", value);
                this.requireBasicLoader = true;
              }
            }
            break;
          case "keep-all":
          case "html-all":
            if (elemOrig) {
              this.captureRewriteAttr(elem, "value", elemOrig.value);
            }
            break;
          case "save":
          case "keep":
          case "html":
          case "reset":
          default:
            // do nothing
            break;
        }
        break;
      }

      case "radio":
      case "checkbox": {
        switch (options["capture.formStatus"]) {
          case "save-all":
          case "save":
            if (elemOrig) {
              const checked = elemOrig.checked;
              if (checked !== elem.hasAttribute('checked')) {
                elem.setAttribute("data-scrapbook-input-checked", checked);
                this.requireBasicLoader = true;
              }
              const indeterminate = elemOrig.indeterminate;
              if (indeterminate && elem.type.toLowerCase() === 'checkbox') {
                elem.setAttribute("data-scrapbook-input-indeterminate", "");
                this.requireBasicLoader = true;
              }
            }
            break;
          case "keep-all":
          case "keep":
            if (elemOrig) {
              const indeterminate = elemOrig.indeterminate;
              if (indeterminate && elem.type.toLowerCase() === 'checkbox') {
                elem.setAttribute("data-scrapbook-input-indeterminate", "");
                this.requireBasicLoader = true;
              }
            }
            // eslint-disable-next-line no-fallthrough
          case "html-all":
          case "html":
            if (elemOrig) {
              this.captureRewriteAttr(elem, "checked", elemOrig.checked);
            }
            break;
          case "reset":
          default:
            // do nothing
            break;
        }
        break;
      }

      case "submit": {
        if (elem.hasAttribute("formaction")) {
          const newUrl = this.resolveRelativeUrl(elem.getAttribute("formaction"), baseUrlFinal, {checkJavascript: true});
          this.captureRewriteAttr(elem, "formaction", newUrl);
        }
      }

      // eslint-disable-next-line no-fallthrough
      default: {
        switch (options["capture.formStatus"]) {
          case "save-all":
          case "save":
            if (elemOrig) {
              const value = elemOrig.value;
              if (value !== elem.getAttribute('value')) {
                elem.setAttribute("data-scrapbook-input-value", value);
                this.requireBasicLoader = true;
              }
            }
            break;
          case "keep-all":
          case "keep":
          case "html-all":
          case "html":
            if (elemOrig) {
              this.captureRewriteAttr(elem, "value", elemOrig.value);
            }
            break;
          case "reset":
          default:
            // do nothing
            break;
        }
        break;
      }
    }
  }

  [`_handle_{${NS_HTML}}button`](elem) {
    const {baseUrlFinal} = this;

    if (elem.hasAttribute("formaction")) {
      const newUrl = this.resolveRelativeUrl(elem.getAttribute("formaction"), baseUrlFinal, {checkJavascript: true});
      this.captureRewriteAttr(elem, "formaction", newUrl);
    }
  }

  [`_handle_{${NS_HTML}}option`](elem) {
    const {options} = this;
    const elemOrig = this.getOrigNode(elem);

    switch (options["capture.formStatus"]) {
      case "save-all":
      case "save":
        if (elemOrig) {
          const selected = elemOrig.selected;
          if (selected !== elem.hasAttribute('selected')) {
            elem.setAttribute("data-scrapbook-option-selected", selected);
            this.requireBasicLoader = true;
          }
        }
        break;
      case "keep-all":
      case "keep":
      case "html-all":
      case "html":
        if (elemOrig) {
          this.captureRewriteAttr(elem, "selected", elemOrig.selected);
        }
        break;
      case "reset":
      default:
        // do nothing
        break;
    }
  }

  [`_handle_{${NS_HTML}}textarea`](elem) {
    const {options} = this;
    const elemOrig = this.getOrigNode(elem);

    switch (options["capture.formStatus"]) {
      case "save-all":
      case "save":
        if (elemOrig) {
          const value = elemOrig.value;
          if (value !== elem.textContent) {
            elem.setAttribute("data-scrapbook-textarea-value", value);
            this.requireBasicLoader = true;
          }
        }
        break;
      case "keep-all":
      case "keep":
      case "html-all":
      case "html":
        if (elemOrig) {
          this.captureRewriteTextContent(elem, elemOrig.value);
        }
        break;
      case "reset":
      default:
        // do nothing
        break;
    }
  }

  [`_handle_{${NS_HTML}}q`](elem) {
    return this[`_handle_{${NS_HTML}}blockquote`].call(this, elem);
  }

  [`_handle_{${NS_HTML}}blockquote`](elem) {
    const {baseUrlFinal} = this;

    if (elem.hasAttribute("cite")) {
      const newUrl = this.resolveRelativeUrl(elem.getAttribute("cite"), baseUrlFinal);
      this.captureRewriteAttr(elem, "cite", newUrl);
    }
  }

  [`_handle_{${NS_HTML}}ins`](elem) {
    return this[`_handle_{${NS_HTML}}blockquote`].call(this, elem);
  }

  [`_handle_{${NS_HTML}}del`](elem) {
    return this[`_handle_{${NS_HTML}}blockquote`].call(this, elem);
  }

  [`_handle_{${NS_HTML}}slot`](elem) {
    const {slotMap} = this;

    const root = elem.getRootNode();
    if (!(root instanceof ShadowRoot && root.slotAssignment === 'manual')) {
      return;
    }

    const elemOrig = this.getOrigNode(elem);
    const ids = [];
    for (const targetNodeOrig of elemOrig.assignedNodes()) {
      const targetNode = this.getClonedNode(targetNodeOrig);
      let id = slotMap.get(targetNode);
      if (typeof id === 'undefined') {
        id = slotMap.size;
        slotMap.set(targetNode, id);
      }
      if (targetNode.nodeType === Node.ELEMENT_NODE) {
        targetNode.setAttribute("data-scrapbook-slot-index", id);
      } else {
        targetNode.before(this.doc.createComment(`scrapbook-slot-index=${id}`));
        targetNode.after(this.doc.createComment(`/scrapbook-slot-index`));
      }
      ids.push(id);
    }
    if (ids.length) {
      elem.setAttribute("data-scrapbook-slot-assigned", ids.join(','));
    }
  }

  [`_handle_{${NS_HTML}}xmp`](elem) {
    this.escapeRawTextTag(elem);
  }

  [`_handle_{${NS_SVG}}`](elem) {
    this[`_handle_{${NS_SVG}}${elem.localName}`]?.call(this, elem);
  }

  [`_handle_{${NS_SVG}}a`](elem) {
    for (const ns of [null, NS_XLINK]) {
      this.rewriteAnchor(elem, 'href', {ns});
    }
  }

  [`_handle_{${NS_SVG}}use`](elem) {
    for (const ns of [null, NS_XLINK]) {
      this[`_handle_{${NS_SVG}}use#href`].call(this, elem, 'href', ns);
    }
  }

  [`_handle_{${NS_SVG}}animate`](elem) {
    this[`_handle_{${NS_SVG}}use`].call(this, elem);
  }

  [`_handle_{${NS_SVG}}animateMotion`](elem) {
    this[`_handle_{${NS_SVG}}use`].call(this, elem);
  }

  [`_handle_{${NS_SVG}}animateTransform`](elem) {
    this[`_handle_{${NS_SVG}}use`].call(this, elem);
  }

  [`_handle_{${NS_SVG}}set`](elem) {
    this[`_handle_{${NS_SVG}}use`].call(this, elem);
  }

  [`_handle_{${NS_SVG}}textPath`](elem) {
    this[`_handle_{${NS_SVG}}use`].call(this, elem);
  }

  [`_handle_{${NS_SVG}}linearGradient`](elem) {
    this[`_handle_{${NS_SVG}}use`].call(this, elem);
  }

  [`_handle_{${NS_SVG}}radialGradient`](elem) {
    this[`_handle_{${NS_SVG}}use`].call(this, elem);
  }

  [`_handle_{${NS_SVG}}mpath`](elem) {
    this[`_handle_{${NS_SVG}}use`].call(this, elem);
  }

  [`_handle_{${NS_SVG}}pattern`](elem) {
    this[`_handle_{${NS_SVG}}use`].call(this, elem);
  }

  [`_handle_{${NS_SVG}}use#href`](elem, attr, ns) {
    if (!elem.hasAttributeNS(ns, attr)) { return; }
    const newUrl = this.resolveRelativeUrl(elem.getAttributeNS(ns, attr), this.baseUrl);
    this.captureRewriteAttr(elem, attr, newUrl, {ns});
  }

  [`_handle_{${NS_SVG}}image`](elem) {
    for (const ns of [null, NS_XLINK]) {
      this[`_handle_{${NS_SVG}}image#href`].call(this, elem, 'href', ns);
    }
  }

  [`_handle_{${NS_SVG}}feImage`](elem) {
    this[`_handle_{${NS_SVG}}image`].call(this, elem);
  }

  [`_handle_{${NS_SVG}}image#href`](elem, attr, ns) {
    if (!elem.hasAttributeNS(ns, attr)) { return; }

    const {baseUrl, refUrl, docRefPolicy: refPolicy, tasks, settings, options} = this;

    // check local link and rewrite url
    const url = this.resolveRelativeUrl(elem.getAttributeNS(ns, attr), baseUrl);
    this.captureRewriteAttr(elem, attr, url, {ns});

    switch (options["capture.image"]) {
      case "link":
        // do nothing
        break;
      case "blank":
      case "remove":
        this.captureRewriteAttr(elem, attr, null, {ns});
        break;
      case "save-current":
      case "save":
      default: {
        // skip further processing for non-absolute links
        if (!utils.isUrlAbsolute(url)) {
          break;
        }

        tasks.push(async () => {
          const response = await this.downloadFile({
            url,
            refUrl,
            refPolicy,
            settings,
            options,
          });
          this.captureRewriteAttr(elem, attr, response.url, {ns});
          return response;
        });
        break;
      }
    }
  }

  [`_handle_{${NS_SVG}}script`](elem) {
    const {refUrl, docRefPolicy: refPolicy, tasks, settings, options} = this;

    for (const ns of [null, NS_XLINK]) {
      if (!elem.hasAttributeNS(ns, 'href')) { continue; }
      const newUrl = this.resolveRelativeUrl(elem.getAttributeNS(ns, 'href'), this.baseUrl);
      this.captureRewriteAttr(elem, 'href', newUrl, {ns});
    }

    switch (options["capture.script"]) {
      case "link":
        // do nothing
        break;
      case "blank":
        for (const ns of [null, NS_XLINK]) {
          if (!elem.hasAttributeNS(ns, 'href')) { continue; }
          this.captureRewriteAttr(elem, 'href', null, {ns});
        }
        this.captureRewriteTextContent(elem, "");
        break;
      case "remove":
        this.captureRemoveNode(elem);
        throw new NodeDisconnect(elem);
      case "save":
      default: {
        for (const ns of [null, NS_XLINK]) {
          if (!elem.hasAttributeNS(ns, 'href')) { continue; }
          tasks.push(async () => {
            const response = await this.downloadFile({
              url: elem.getAttributeNS(ns, 'href'),
              refUrl,
              refPolicy,
              settings,
              options,
            });
            this.captureRewriteAttr(elem, 'href', response.url, {ns});
            return response;
          });
        }
        break;
      }
    }
  }

  [`_handle_{${NS_SVG}}style`](elem) {
    this[`_handle_style`].call(this, elem);
  }

  [`_handle_{${NS_MATHML}}`](elem) {
    this.rewriteAnchor(elem, "href");
  }

  /**
   * <style> elements in HTML/SVG namespaces behave similarly.
   */
  [`_handle_style`](elem) {
    const {baseUrl, refUrl, docRefPolicy: refPolicy, charset, cssHandler, cssResourcesHandler, cssTasks, tasks, settings, options} = this;

    let disableCss = false;
    const css = cssHandler.getElemCss(elem);
    if (css) {
      if (css.title) {
        if (!cssHandler.isBrowserPick) {
          this.captureRewriteAttr(elem, "title", null);
          if (css.disabled) {
            disableCss = true;
          }
        }
      } else {
        if (css.disabled) {
          disableCss = true;
        }
      }
      cssTasks.push(async () => {
        await cssResourcesHandler.inspectCss({
          css,
          baseUrl,
          refUrl,
          refPolicy,
          envCharset: charset,
          root: elem.getRootNode(),
        });
      });
    }

    switch (options["capture.style"]) {
      case "blank": {
        this.captureRewriteTextContent(elem, "");
        break;
      }
      case "remove": {
        this.captureRemoveNode(elem);
        throw new NodeDisconnect(elem);
      }
      case "save":
      case "link":
      default: {
        if (disableCss) {
          this.captureRewriteTextContent(elem, "");
          elem.setAttribute("data-scrapbook-css-disabled", "");
          break;
        }
        tasks.push(async () => {
          await cssHandler.rewriteCss({
            elem,
            baseUrl,
            refUrl,
            refPolicy,
            envCharset: charset,
            settings,
            callback: (elem, response) => {
              this.captureRewriteTextContent(elem, response.cssText);
              this.escapeRawTextTag(elem);
            },
          });
        });
        break;
      }
    }
  }

  [`_handle_{${NS_MATHML}}`](elem) {
    this.rewriteAnchor(elem, "href");
  }

  /**
   * Escape the text content of a <script>-like element to be safe to save.
   *
   * HTML documents do not support namespace, but <script> elements in
   * HTML/SVG namespaces still work.
   * - When serializing to text (e.g. outerHTML), the text content of <script>s
   *   in HTML namespace are not HTML-escaped, while those in other namespaces
   *   are.
   * - When loading, <script>s in <svg> (if not in <foreignObject>) or <math>
   *   will be interpreted as in SVG/MathML namespaces and their text contents
   *   are HTML-unescaped, while those in the main HTML document are not.
   */
  escapeRawTextTag(elem, {
    tagName = elem.localName,
    doc = this.doc,
  } = {}) {
    if (!elem.textContent) { return; }
    if (elem.namespaceURI !== NS_HTML) { return; }
    if (["application/xhtml+xml", "text/xml", "image/svg+xml"].includes(doc.contentType)) { return; }

    // escape </script> etc. as textContent can contain unescaped HTML
    this.captureRewriteTextContent(elem, elem.textContent.replace(new RegExp(`</(${tagName}>)`, 'gi'), "<\\/$1"));
  }

  /**
   * Add a recording attribute to mark the element as added, if requested.
   *
   * @param {Element} elem - The element to handle.
   * @param {Object} [context]
   *
   * @TODO: remove recording attributes with same timeId.
   */
  captureRecordAddedNode(elem, {
    record = this.options["capture.recordRewrites"],
    timeId = this.timeId,
  } = {}) {
    if (record) {
      const recordAttr = `data-scrapbook-orig-null-node-${timeId}`;
      if (!elem.hasAttribute(recordAttr)) {
        elem.setAttribute(recordAttr, '');
      }
    }
  }

  /**
   * Remove the specified node. Add a recording attribute if requested.
   *
   * @param {Element} elem - The element to remove.
   * @param {Object} [context]
   *
   * @TODO: restore recording attributes with same timeId before generating the
   * comment.
   * @TODO: also support non-Element node types?
   */
  captureRemoveNode(elem, {
    record = this.options["capture.recordRewrites"],
    timeId = this.timeId,
  } = {}) {
    if (!elem.parentNode) { return; }

    if (record) {
      const comment = elem.ownerDocument.createComment(`scrapbook-orig-node-${timeId}=${utils.escapeHtmlComment(elem.outerHTML)}`);
      elem.parentNode.replaceChild(comment, elem);
    } else {
      elem.parentNode.removeChild(elem);
    }
  }

  /**
   * Rewrite the specified attribute. Add a recording attribute if requested.
   *
   * When `ns` is specified, the prefix of the manipulated attribute will be
   * automatically looked up from the specified `ns`.  If the lookup result is
   * null, the prefix of `attr` will be taken.  If `attr` is not prefixed, a
   * unique prefix and `xmlns:*` will be automatically generated by the browser
   * when serializing with an API like `outerHTML`.
   *
   * For an HTML document, which is namespace agnostic, an appropriate prefix
   * will be selected when serializing with an API like `outerHTML` for certain
   * supported foreign namespaces (e.g. `attr` or `x:attr` becomes `xlink:attr`
   * when the attribute is in XLINK (http://www.w3.org/1999/xlink) namespace),
   * while no `xmlns:*` will be generated.
   * Otherwise, the prefix is kept as-is, but the attribute will become null
   * namespace when read from the serialized string.
   *
   * @param {Element} elem - The element to handle.
   * @param {string} [attr] - The attribute name to handle.
   *   - It's not allowed to contain more than one ":".
   *   - It's not allowed to contain a ":" prefix if `ns` is null.
   *   - In general an unprefixed name is preferred.
   * @param {?(string|boolean)} [value] - The value to assign.
   *   - If value is true, attr will be set to "" iff not exist.
   *   - If value is false/null/undefined, attr will be removed.
   * @param {Object} [context]
   * @param {?string} [context.ns] - The namespace for the attribute.
   */
  captureRewriteAttr(elem, attr, value, {
    ns = null,
    record = this.options["capture.recordRewrites"],
    timeId = this.timeId,
  } = {}) {
    const [defaultPrefix, local] = utils.splitXmlAttribute(attr);
    let prefix = elem.lookupPrefix(ns) ?? defaultPrefix;
    prefix = prefix ? prefix + ":" : "";
    attr = `${prefix}${local}`;

    if (elem.hasAttributeNS(ns, local)) {
      if (value === true) { return; }

      const oldValue = elem.getAttributeNS(ns, local);
      if (oldValue === value) { return; }

      if ([false, null, undefined].includes(value)) {
        elem.removeAttributeNS(ns, local);
      } else {
        elem.setAttributeNS(ns, attr, value);
      }

      if (record) {
        const recordAttr = `data-scrapbook-orig-attr-${local}-${timeId}`;
        const recordAttr2 = `data-scrapbook-orig-null-attr-${local}-${timeId}`;
        const recordAttr3 = `data-scrapbook-orig-null-node-${timeId}`;
        if (!elem.hasAttributeNS(ns, recordAttr) && !elem.hasAttributeNS(ns, recordAttr2) && !elem.hasAttribute(recordAttr3)) {
          elem.setAttributeNS(ns, `${prefix}${recordAttr}`, oldValue);
        }
      }
    } else {
      if ([false, null, undefined].includes(value)) { return; }

      if (value === true) { value = ''; }

      elem.setAttributeNS(ns, attr, value);

      if (record) {
        const recordAttr = `data-scrapbook-orig-null-attr-${local}-${timeId}`;
        const recordAttr2 = `data-scrapbook-orig-attr-${local}-${timeId}`;
        const recordAttr3 = `data-scrapbook-orig-null-node-${timeId}`;
        if (!elem.hasAttributeNS(ns, recordAttr) && !elem.hasAttributeNS(ns, recordAttr2) && !elem.hasAttribute(recordAttr3)) {
          elem.setAttributeNS(ns, `${prefix}${recordAttr}`, "");
        }
      }
    }
  }

  /**
   * Rewrite the textContent. Add a recording attribute if requested.
   *
   * @param {Element} elem - The element to handle.
   * @param {string} value - The text content value to assign.
   * @param {Object} [context]
   */
  captureRewriteTextContent(elem, value, {
    record = this.options["capture.recordRewrites"],
    timeId = this.timeId,
  } = {}) {
    const oldValue = elem.textContent;
    if (oldValue === value) { return; }

    elem.textContent = value;

    if (record) {
      const recordAttr = `data-scrapbook-orig-textcontent-${timeId}`;
      if (!elem.hasAttribute(recordAttr)) { elem.setAttribute(recordAttr, oldValue); }
    }
  }

  resolveRelativeUrl(relativeUrl, baseUrl, {
    checkJavascript = false,
    skipLocal,
    scriptMode = this.options["capture.script"],
  } = {}) {
    // scripts: script-like URLs
    if (checkJavascript && this.isJavascriptUrl(relativeUrl)) {
      switch (scriptMode) {
        case "save":
        case "link":
          // do nothing
          break;
        case "blank":
        case "remove":
        default:
          return "javascript:";
      }
    }

    return this.capturer.resolveRelativeUrl(relativeUrl, baseUrl, {skipLocal});
  }

  resolveLocalLink(relativeUrl, baseUrl, {checkJavascript = false} = {}) {
    const url = this.resolveRelativeUrl(relativeUrl, baseUrl, {checkJavascript, skipLocal: false});

    // This link targets the current page
    const [urlMain, urlHash] = utils.splitUrlByAnchor(url);
    if (urlMain === this.docUrl && !this.isAboutUrl(this.docUrl)) {
      // @TODO: for iframe whose URL is about:blank or about:srcdoc,
      // this link should point to the captured page
      if (urlHash === "" || urlHash === "#") {
        return urlHash;
      }

      // For fullPage capture, relink to the captured page.
      // For partial capture, the captured page could be incomplete,
      // relink to the captured page only when the target node is included in the selected fragment.
      let hasLocalTarget = !this.isPartial;
      if (!hasLocalTarget) {
        const targetId = CSS.escape(utils.decodeURIComponent(urlHash.slice(1)));
        if (this.doc.querySelector(`#${targetId}, a[name="${targetId}"]`)) {
          hasLocalTarget = true;
        }
      }
      if (hasLocalTarget) {
        return urlHash;
      }
    }

    return url;
  }

  rewriteAnchor(elem, attr, {ns} = {}) {
    if (!elem.hasAttributeNS(ns, attr)) { return; }

    const {baseUrlFinal, refUrl, docRefPolicy, downLinkTasks, settings, options} = this;

    // check local link and rewrite url
    const url = this.resolveLocalLink(elem.getAttributeNS(ns, attr), baseUrlFinal, {checkJavascript: true});
    this.captureRewriteAttr(elem, attr, url, {ns});

    // check downLink
    if (['http:', 'https:', 'file:', 'blob:'].some(p => url.startsWith(p))) {
      if (["header", "url"].includes(options["capture.downLink.file.mode"]) ||
          (parseInt(options["capture.downLink.doc.depth"], 10) > 0 && options['capture.saveAs'] !== 'singleHtml')) {
        const isHtml = elem.namespaceURI === NS_HTML;
        let refPolicy = docRefPolicy;
        if (isHtml) {
          refPolicy = (elem.matches('[rel~="noreferrer"]') ? 'no-referrer' : elem.referrerPolicy) || refPolicy;
        }
        downLinkTasks.push(async () => {
          const isAttachment = isHtml ? elem.hasAttribute('download') : false;
          const downLinkSettings = Object.assign({}, settings, {
            depth: settings.depth + 1,
            isMainPage: false,
            isMainFrame: true,
          });
          const response = await this.captureUrl({
            url,
            refUrl,
            refPolicy,
            isAttachment,
            downLink: true,
            settings: downLinkSettings,
            options,
          })
          .catch((ex) => {
            console.error(ex);
            this.warn(utils.lang("ErrorFileDownloadError", [url, ex.message]));
            return {url: this.getErrorUrl(url, options), error: {message: ex.message}};
          });

          if (response) {
            this.captureRewriteAttr(elem, attr, response.url, {ns});
          }
          return response;
        });
      }
    }
  }

  rewriteSvgHref(elem, attr) {
    if (!elem.hasAttribute(attr)) { return; }

    const {baseUrlFinal, refUrl, docRefPolicy: refPolicy, tasks, settings, options} = this;

    // check local link and rewrite url
    const url = this.resolveLocalLink(elem.getAttribute(attr), baseUrlFinal);
    this.captureRewriteAttr(elem, attr, url);

    switch (options["capture.image"]) {
      case "link":
        // do nothing
        break;
      case "blank":
      case "remove":
        this.captureRewriteAttr(elem, attr, null);
        break;
      case "save-current":
      case "save":
      default: {
        // skip further processing for non-absolute links
        if (!utils.isUrlAbsolute(url)) {
          break;
        }

        tasks.push(async () => {
          const response = await this.downloadFile({
            url,
            refUrl,
            refPolicy,
            settings,
            options,
          });
          this.captureRewriteAttr(elem, attr, response.url);
          return response;
        });
        break;
      }
    }
  }

  addAdoptedStyleSheets(docOrShadowRoot, root) {
    const {
      baseUrl, refUrl, docRefPolicy: refPolicy,
      charset,
      cssTasks,
      adoptedStyleSheetMap,
      cssResourcesHandler,
      options,
    } = this;

    if (['blank', 'remove'].includes(options["capture.style"]) || options["capture.adoptedStyleSheet"] !== "save") {
      return;
    }

    const infos = [];
    for (const css of utils.getAdoptedStyleSheets(docOrShadowRoot)) {
      let info = adoptedStyleSheetMap.get(css);
      if (info) {
        info.roots.push(root);
      } else {
        info = {
          id: adoptedStyleSheetMap.size,
          roots: [root],
        };
        adoptedStyleSheetMap.set(css, info);
      }
      infos.push(info);
      cssTasks.push(async () => {
        await cssResourcesHandler.inspectCss({
          css,
          baseUrl,
          refUrl,
          refPolicy,
          envCharset: charset,
          root,
        });
      });
    }
    if (infos.length) {
      const elem = root.host || root;
      elem.setAttribute("data-scrapbook-adoptedstylesheets", infos.map(x => x.id).join(','));
    }
  }

  async warn(...msg) {
    const {missionId} = this;
    return this.invoke("remoteMsg", [{
      msg,
      type: 'warn',
    }], {missionId});
  }

  /**
   * Download a URL with hash and error handling
   */
  async downloadFile(params) {
    const {url, options} = params;

    // return original URL for non-supported protocols
    if (!['http:', 'https:', 'file:', 'data:', 'blob:'].some(p => url.startsWith(p))) {
      return {url};
    }

    try {
      const response = await this.capturer.downloadFile(params);
      return Object.assign({}, response, {
        url: this.capturer.getRedirectedUrl(response.url, utils.splitUrlByAnchor(url)[1]),
      });
    } catch (ex) {
      console.error(ex);
      this.warn(utils.lang("ErrorFileDownloadError", [url, ex.message]));
      return {url: this.getErrorUrl(url, options), error: {message: ex.message}};
    }
  }

  async invoke(...args) {
    return this.capturer.invoke(...args);
  }

  async captureDocumentOrFile(...args) {
    return this.capturer.captureDocumentOrFile(...args);
  }

  async captureDocument(...args) {
    return this.capturer.captureDocument(...args);
  }

  async captureUrl(...args) {
    return this.capturer.captureUrl(...args);
  }

  getErrorUrl(...args) {
    return this.capturer.getErrorUrl(...args);
  }

  isJavascriptUrl(...args) {
    return this.capturer.isJavascriptUrl(...args);
  }

  isAboutUrl(...args) {
    return this.capturer.isAboutUrl(...args);
  }
}

export {
  META_REFERRER_POLICY,
  META_REFERRER_POLICY_LEGACY,
  BASIC_LOADER,
  ANNOTATION_LOADER_TEMPLATE,
  INFOBAR_LOADER_TEMPLATE,
  CUSTOM_ELEMENT_NAME_LOADER_TEMPLATE,
  NodeSkipIteration,
  NodeDisconnect,
  PresaveDocumentRewriter,
  RetrieveDocumentRewriter,
  RebuildLinksDocumentRewriter,
  CaptureDocumentRewriter,
};
