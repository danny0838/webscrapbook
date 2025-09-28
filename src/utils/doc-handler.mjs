import * as utils from "./common.mjs";
import {DocumentCloner} from "./doc-cloner.mjs";

/**
 * Base document rewriter with common features.
 */
class BaseDocumentRewriter {
  static run(...args) {
    const rewriter = new this();
    const result = rewriter.run(...args);
    if (utils.isPromise(result)) {
      return result.then(() => rewriter);
    }
    return rewriter;
  }

  run(doc) {
    this.doc = doc;
    this.processRootNode(doc);
  }

  processRootNode(rootNode) {
    throw new Error('Not implemented');
  }

  debug(...args) {
    console.debug(...args);
  }

  log(...args) {
    console.log(...args);
  }

  warn(...args) {
    console.warn(...args);
  }

  error(...args) {
    console.error(...args);
  }
}

/**
 * Add cloned document support.
 */
const MapperMixin = (base) => class extends base {
  /**
   * Clone the input document and run with a new instance.
   */
  static runWithClone(doc, {includeShadowDom, ...options} = {}) {
    const {newDoc, origNodeMap, clonedNodeMap} = this.clone(doc, {includeShadowDom});
    return super.run(newDoc, {...options, origNodeMap, clonedNodeMap});
  }

  /**
   * Set up mappings and clone a document.
   */
  static clone(doc, {includeShadowDom} = {}) {
    const origNodeMap = new WeakMap();
    const clonedNodeMap = new WeakMap();
    const newDoc = DocumentCloner.clone(doc, {origNodeMap, clonedNodeMap, includeShadowDom});
    return {newDoc, origNodeMap, clonedNodeMap};
  }

  /**
   * @return {Document} The original document when mapped, or the input
   *   document itself otherwise.
   */
  get origDoc() {
    const value = this.origNodeMap?.get(this.doc) || this.doc;
    Object.defineProperty(this, "origDoc", {value});
    return value;
  }

  /**
   * Should pass the cloned document for rewriting, with origNodeMap and
   * clonedNodeMap to access the corresponding nodes in the original document.
   *
   * @param {Document} doc - the document for rewriting.
   * @param {Object} [options]
   * @param {Map|WeakMap} [options.origNodeMap]
   * @param {Map|WeakMap} [options.clonedNodeMap]
   */
  run(doc, {origNodeMap, clonedNodeMap} = {}) {
    Object.assign(this, {doc, origNodeMap, clonedNodeMap});
    this.processRootNode(doc);
  }

  getOrigNode(node) {
    return this.origNodeMap?.get(node);
  }

  getClonedNode(node) {
    return this.clonedNodeMap?.get(node);
  }
};

class DocumentRewriter extends BaseDocumentRewriter {
  static eraseRange(...args) {
    return new this().eraseRange(...args);
  }

  static eraseNode(...args) {
    return new this().eraseNode(...args);
  }

  static uneraseNode(...args) {
    return new this().uneraseNode(...args);
  }

  /**
   * Replace nodes in the range with a serialized HTML comment.
   */
  eraseRange(range, {
    timeId = utils.dateToId(),
    mapWrapperToComment,
    mapCommentToWrapper,
  } = {}) {
    const doc = range.commonAncestorContainer.ownerDocument;
    const wrapper = doc.createElement('scrapbook-erased');
    range.surroundContents(wrapper);
    this.htmlify(wrapper);
    const comment = doc.createComment(`scrapbook-erased${timeId ? '-' + timeId : ''}=${utils.escapeHtmlComment(wrapper.innerHTML)}`);
    mapWrapperToComment?.set(wrapper, comment);
    mapCommentToWrapper?.set(comment, wrapper);
    wrapper.replaceWith(comment);
  }

  /**
   * Replace node with a serialized HTML comment.
   */
  eraseNode(node, options) {
    const range = node.ownerDocument.createRange();
    range.selectNode(node);
    return this.eraseRange(range, options);
  }

  /**
   * Replace a serialized HTML comment with the original nodes.
   *
   * @return {boolean} Whether the unerase is successful.
   */
  uneraseNode(node, {
    mapCommentToWrapper,
    normalize = true,
  } = {}) {
    const parent = node.parentNode;
    if (!parent) { return false; }

    // if the associated source nodes exist, use them
    let wrapper = mapCommentToWrapper.get(node);
    if (wrapper) {
      const frag = node.ownerDocument.createDocumentFragment();
      let child;
      while (child = wrapper.firstChild) {
        frag.appendChild(child);
      }
      this.unhtmlify(frag, {apply: false});
      node.replaceWith(frag);
      if (normalize) {
        parent.normalize();
      }
      return true;
    }

    // otherwise, recover from recorded HTML
    const m = node.nodeValue.match(/^.+?=([\s\S]*)$/);
    if (m) {
      const doc = node.ownerDocument;
      const t = doc.createElement('template');
      t.innerHTML = utils.unescapeHtmlComment(m[1]);
      const frag = doc.importNode(t.content, true);
      this.unhtmlify(frag);
      node.replaceWith(frag);
      if (normalize) {
        parent.normalize();
      }
      return true;
    }

    return false;
  }

  /**
   * Convert dynamic information into representable HTML attributes recursively.
   */
  htmlify(node, options = {}) {
    this._htmlify(node, options);
    for (const elem of node.querySelectorAll('*')) {
      this._htmlify(elem, options);
    }
  }

  /**
   * Convert dynamic information into representable HTML attributes for an
   * element.
   */
  _htmlify(elem, options = {}) {
    // handle adoptedStyleSheet if supported by the browser
    // @TODO: merge shared constructed stylesheets among shadow roots
    if ('adoptedStyleSheets' in document && elem instanceof ShadowRoot) {
      const adoptedStyleSheetMap = new Map();

      const host = elem.host;
      host.removeAttribute("data-scrapbook-adoptedstylesheets");

      const ids = [];
      for (const css of utils.getAdoptedStyleSheets(elem)) {
        let id = adoptedStyleSheetMap.get(css);
        if (typeof id === 'undefined') {
          id = adoptedStyleSheetMap.size;
          adoptedStyleSheetMap.set(css, id);
        }
        ids.push(id);
      }
      if (ids.length) {
        host.setAttribute("data-scrapbook-adoptedstylesheets", ids.join(','));
      }

      const regex = /^data-scrapbook-adoptedstylesheet-(\d+)$/;
      for (const {nodeName: attr} of host.attributes) {
        if (regex.test(attr)) {
          host.removeAttribute(attr);
        }
      }
      if (adoptedStyleSheetMap.size) {
        for (const [css, id] of adoptedStyleSheetMap) {
          const cssTexts = Array.prototype.map.call(
            css.cssRules,
            cssRule => cssRule.cssText,
          );
          host.setAttribute(`data-scrapbook-adoptedstylesheet-${id}`, cssTexts.join('\n\n'));
        }
      }
    }

    // handle manual slots if supported by the browser
    if (elem instanceof ShadowRoot && elem.slotAssignment === 'manual') {
      const slotMap = new Map();
      const root = elem;
      for (const elem of root.querySelectorAll('slot')) {
        const ids = [];
        for (const targetNode of elem.assignedNodes()) {
          let id = slotMap.get(targetNode);
          if (typeof id === 'undefined') {
            id = slotMap.size;
            slotMap.set(targetNode, id);
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

    if (elem.nodeType !== 1) { return; }

    switch (elem.nodeName.toLowerCase()) {
      case "canvas": {
        try {
          const data = elem.toDataURL();
          if (data !== utils.getBlankCanvasData(elem)) {
            elem.setAttribute("data-scrapbook-canvas", data);
          }
        } catch (ex) {
          console.error(ex);
        }
        break;
      }

      case "input": {
        const type = elem.type;
        if (typeof type === 'undefined') { break; }
        switch (type.toLowerCase()) {
          case "image":
          case "password":
          case "file": {
            break;
          }
          case "checkbox": {
            const indeterminate = elem.indeterminate;
            if (indeterminate) {
              elem.setAttribute('data-scrapbook-input-indeterminate', '');
            }
          }
          // eslint-disable-next-line no-fallthrough
          case "radio": {
            const checked = elem.checked;
            if (checked !== elem.hasAttribute('checked')) {
              elem.setAttribute('data-scrapbook-input-checked', checked);
            }
            break;
          }
          default: {
            const value = elem.value;
            if (value !== elem.getAttribute('value')) {
              elem.setAttribute('data-scrapbook-input-value', value);
            }
            break;
          }
        }
        break;
      }

      case "textarea": {
        const value = elem.value;
        if (value !== elem.textContent) {
          elem.setAttribute('data-scrapbook-textarea-value', value);
        }
        break;
      }

      case "option": {
        const selected = elem.selected;
        if (selected !== elem.hasAttribute('selected')) {
          elem.setAttribute('data-scrapbook-option-selected', selected);
        }
        break;
      }
    }

    const shadowRoot = utils.getShadowRoot(elem);
    if (shadowRoot) {
      this.htmlify(shadowRoot, options);
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
    }
  }

  /**
   * Reverse htmlify recursively.
   */
  unhtmlify(node, options = {}) {
    this._unhtmlify(node, options);
    for (const elem of node.querySelectorAll('*')) {
      this._unhtmlify(elem, options);
    }
  }

  /**
   * Reverse htmlify for an element.
   *
   * @param {boolean} [options.apply] - true to apply the recorded value to
   *   the element; otherwise remove the record only.
   * @param {boolean} [options.canvas] - true to handle canvas.
   * @param {boolean} [options.form] - true to handle form elements.
   * @param {boolean} [options.shadowDom] - true to handle shadowDom.
   */
  _unhtmlify(elem, options = {}) {
    const {
      apply = true,
      canvas = true,
      form = true,
      shadowDom = true,
    } = options;

    // handle adoptedStyleSheet
    if (shadowDom && elem instanceof ShadowRoot) {
      const regex = /^data-scrapbook-adoptedstylesheet-(\d+)$/;
      const host = elem.host;

      const cssIndexes = host.getAttribute('data-scrapbook-adoptedstylesheets');
      if (cssIndexes !== null && apply && 'adoptedStyleSheets' in document) {
        for (const idx of cssIndexes.split(',')) {
          const attr = `data-scrapbook-adoptedstylesheet-${parseInt(idx, 10)}`;
          const sel = `[${attr}]`;
          const refElem = host.getRootNode().querySelector(sel);
          if (!refElem) { continue; }
          const cssText = refElem.getAttribute(attr);
          if (cssText === null) { continue; }
          const css = new CSSStyleSheet();
          const cssTexts = cssText.split('\n\n');
          for (let i = cssTexts.length - 1; i >= 0; i--) {
            try {
              cssTexts[i] && css.insertRule(cssTexts[i]);
            } catch (ex) {
              console.error(ex);
            }
          }
          elem.adoptedStyleSheets.push(css);
        }
      }
      host.removeAttribute('data-scrapbook-adoptedstylesheets');
      for (const attr of Array.prototype.map.call(host.attributes, n => n.nodeName)) {
        if (regex.test(attr)) {
          host.removeAttribute(attr);
        }
      }
    }

    // handle manual slots
    if (shadowDom && elem instanceof ShadowRoot && elem.slotAssignment === 'manual') {
      const regex = /^scrapbook-slot-index=(\d+)$/;
      const host = elem.host;

      const slotSources = [];
      const children = host.childNodes;
      for (let i = children.length - 1; i >= 0; i--) {
        const node = children[i];
        switch (node.nodeType) {
          case Node.ELEMENT_NODE: {
            const slotIdx = node.getAttribute("data-scrapbook-slot-index");
            if (slotIdx !== null) {
              slotSources[parseInt(slotIdx, 10)] = node;
              node.removeAttribute("data-scrapbook-slot-index");
            }
            break;
          }
          case Node.COMMENT_NODE: {
            const value = node.nodeValue;
            const m = value.match(regex);
            if (m) {
              const next = node.nextSibling;
              if (next.nodeType === 3) {
                slotSources[parseInt(m[1], 10)] = next;
              }
              node.remove();
              break;
            } else if (value === '/scrapbook-slot-index') {
              node.remove();
              break;
            }
            break;
          }
        }
      }

      const rootNode = elem;
      for (const elem of rootNode.querySelectorAll("slot")) {
        const slotIdxes = elem.getAttribute("data-scrapbook-slot-assigned");
        if (slotIdxes !== null && apply) {
          const srcs = slotIdxes.split(',').map(i => slotSources[parseInt(i, 10)]);
          try {
            elem.assign.apply(elem, srcs);
          } catch (ex) {
            console.error(ex);
          }
        }
        elem.removeAttribute("data-scrapbook-slot-assigned");
      }
    }

    if (elem.nodeType !== 1) { return; }

    if (canvas && elem.matches('canvas')) {
      const canvasData = elem.getAttribute('data-scrapbook-canvas');
      if (canvasData) {
        if (apply) {
          const img = new Image();
          img.onload = () => { elem.getContext('2d').drawImage(img, 0, 0); };
          img.src = elem.getAttribute('data-scrapbook-canvas');
        }
        elem.removeAttribute('data-scrapbook-canvas');
      }
    }

    if (form && elem.matches('input[type="radio"], input[type="checkbox"]')) {
      const checked = elem.getAttribute('data-scrapbook-input-checked');
      if (checked !== null) {
        if (apply) {
          elem.checked = checked === 'true';
        }
        elem.removeAttribute('data-scrapbook-input-checked');
      }
    }

    if (form && elem.matches('input[type="checkbox"]')) {
      const indeterminate = elem.getAttribute('data-scrapbook-input-indeterminate');
      if (indeterminate !== null) {
        if (apply) {
          elem.indeterminate = true;
        }
        elem.removeAttribute('data-scrapbook-input-indeterminate');
      }
    }

    if (form && elem.matches('input')) {
      const value = elem.getAttribute('data-scrapbook-input-value');
      if (value !== null) {
        if (apply) {
          elem.value = value;
        }
        elem.removeAttribute('data-scrapbook-input-value');
      }
    }

    if (form && elem.matches('textarea')) {
      const value = elem.getAttribute('data-scrapbook-textarea-value');
      if (value !== null) {
        if (apply) {
          elem.value = value;
        }
        elem.removeAttribute('data-scrapbook-textarea-value');
      }
    }

    if (form && elem.matches('option')) {
      const selected = elem.getAttribute('data-scrapbook-option-selected');
      if (selected !== null) {
        if (apply) {
          elem.selected = selected === 'true';
        }
        elem.removeAttribute('data-scrapbook-option-selected');
      }
    }

    let shadowRoot = utils.getShadowRoot(elem);
    if (shadowDom) {
      const html = elem.getAttribute('data-scrapbook-shadowdom');
      if (html !== null && apply && !shadowRoot) {
        try {
          let m;
          shadowRoot = elem.attachShadow({
            mode: (m = elem.getAttribute('data-scrapbook-shadowdom-mode')) !== null ? m : 'open',
            clonable: elem.hasAttribute('data-scrapbook-shadowdom-clonable'),
            delegatesFocus: elem.hasAttribute('data-scrapbook-shadowdom-delegates-focus'),
            serializable: elem.hasAttribute('data-scrapbook-shadowdom-serializable'),
            slotAssignment: (m = elem.getAttribute('data-scrapbook-shadowdom-slot-assignment')) !== null ? m : undefined,
          });
          shadowRoot.innerHTML = html;
        } catch (ex) {
          console.error(ex);
        }
      }
      elem.removeAttribute('data-scrapbook-shadowdom');
      elem.removeAttribute('data-scrapbook-shadowdom-mode');
      elem.removeAttribute('data-scrapbook-shadowdom-clonable');
      elem.removeAttribute('data-scrapbook-shadowdom-delegates-focus');
      elem.removeAttribute('data-scrapbook-shadowdom-serializable');
      elem.removeAttribute('data-scrapbook-shadowdom-slot-assignment');
    }
    if (shadowRoot) {
      this.unhtmlify(shadowRoot, options);
    }
  }
}

export {
  BaseDocumentRewriter,
  DocumentRewriter,
  MapperMixin,
};
