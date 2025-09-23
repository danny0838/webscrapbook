import * as utils from "../utils/common.mjs";

/**
 * A class that handles capture helpers.
 */
class CaptureHelperHandler {
  constructor({helpers, rootNode, docUrl, origNodeMap} = {}) {
    this.helpers = helpers;
    this.rootNode = rootNode;
    this.docUrl = docUrl;
    this.origNodeMap = origNodeMap;
    this.commandId = 0;
    this.debugging = false;
  }

  run() {
    const {helpers, rootNode, docUrl} = this;
    const errors = [];

    try {
      for (let i = 0, I = helpers.length; i < I; ++i) {
        const helper = helpers[i];

        if (helper.disabled) {
          continue;
        }

        if (helper.debug) {
          this.debugging = true;
        }

        if (helper.pattern) {
          helper.pattern.lastIndex = 0;
          if (!helper.pattern.test(docUrl)) {
            continue;
          }
        }

        if (Array.isArray(helper.commands)) {
          if (this.debugging) {
            const nameStr = helper.name ? ` (${helper.name})` : '';
            console.debug(`WebScrapBook: Running capture helper[${i}]${nameStr} for ${this.docUrl}`);
          }

          for (const command of helper.commands) {
            if (!this.isCommand(command)) {
              const msg = `Skipped running invalid capture helper command: ${JSON.stringify(command)}`;
              console.error(`WebScrapBook: ${msg}`);
              errors.push(msg);
              continue;
            }
            try {
              this.runCommand(command, rootNode);
            } catch (ex) {
              const msg = `Error running capture helper command: ${JSON.stringify(command)}`;
              console.error(`WebScrapBook: ${msg}`);
              console.error(ex);
              errors.push(`${msg}: ${ex.message}`);
            }
          }
        }
      }

      this.debugging = false;
    } catch (ex) {
      const msg = `Error running capture helper`;
      console.error(`WebScrapBook: ${msg}`);
      console.error(ex);
      errors.push(`${msg}: ${ex.message}`);
    }

    return {
      errors,
    };
  }

  static getOverwritingOptions(helpers, docUrl) {
    const rv = {};
    if (docUrl) {
      for (let i = 0, I = helpers.length; i < I; ++i) {
        const helper = helpers[i];

        if (helper.disabled) {
          continue;
        }

        if (helper.pattern) {
          helper.pattern.lastIndex = 0;
          if (!helper.pattern.test(docUrl)) {
            continue;
          }
        }

        if (typeof helper.options === 'object') {
          Object.assign(rv, helper.options);
        }
      }

      // forbid overwriting capture helper related options
      delete rv["capture.helpersEnabled"];
      delete rv["capture.helpers"];
    }
    return rv;
  }

  static parseRegexStr(str) {
    const REGEX_PATTERN = /^\/(.*)\/([a-z]*)$/i;
    const fn = (str) => {
      const m = REGEX_PATTERN.exec(str);
      if (m) {
        return new RegExp(m[1], m[2]);
      }
      return null;
    };
    Object.defineProperty(CaptureHelperHandler, 'parseRegexStr', {value: fn});
    return fn(str);
  }

  parseRegexStr(...args) {
    return this.constructor.parseRegexStr.apply(this, args);
  }

  static getOwnerDocument(node) {
    return node.nodeType === 9 ? node : node.ownerDocument;
  }

  getOwnerDocument(...args) {
    return this.constructor.getOwnerDocument.apply(this, args);
  }

  static selectNodes(rootNode, selector) {
    if (!selector) {
      return [rootNode];
    }

    const isStringSelector = (typeof selector === 'string');
    if (isStringSelector) {
      selector = {base: selector};
    }

    // modify rootNode according to selector.base
    if (typeof selector.base === 'string') {
      modifyRootNode: {
        let newRootNode = rootNode;
        for (const part of selector.base.split('.')) {
          switch (utils.trim(part)) {
            case 'root':
              newRootNode = newRootNode.getRootNode();
              break;
            case 'parent':
              newRootNode = newRootNode.parentNode;
              break;
            case 'firstChild':
              newRootNode = newRootNode.firstChild;
              break;
            case 'lastChild':
              newRootNode = newRootNode.lastChild;
              break;
            case 'firstElementChild':
              newRootNode = newRootNode.firstElementChild;
              break;
            case 'lastElementChild':
              newRootNode = newRootNode.lastElementChild;
              break;
            case 'previousSibling':
              newRootNode = newRootNode.previousSibling;
              break;
            case 'nextSibling':
              newRootNode = newRootNode.nextSibling;
              break;
            case 'previousElementSibling':
              newRootNode = newRootNode.previousElementSibling;
              break;
            case 'nextElementSibling':
              newRootNode = newRootNode.nextElementSibling;
              break;
            case 'self':
              // do nothing
              break;
            default:
              // invalid base
              // treat string selector with invalid base as a css selector
              if (isStringSelector) {
                selector = {css: selector.base};
              }
              break modifyRootNode;
          }
        }
        rootNode = newRootNode;
      }
    }

    // apply the selector
    if (typeof selector.css === 'string') {
      return rootNode.querySelectorAll(selector.css);
    }
    if (typeof selector.xpath === 'string') {
      const doc = this.getOwnerDocument(rootNode);
      const iter = doc.evaluate(selector.xpath, rootNode, null, 0, null);
      let elems = [], elem;
      while (elem = iter.iterateNext()) {
        elems.push(elem);
      }
      return elems;
    }
    return [rootNode];
  }

  selectNodes(...args) {
    return this.constructor.selectNodes.apply(this, args);
  }

  static isCommand(obj) {
    if (Array.isArray(obj) && typeof obj[0] === 'string') {
      return true;
    }
    return false;
  }

  isCommand(...args) {
    return this.constructor.isCommand.apply(this, args);
  }

  runCommand(command, rootNode) {
    let debug = false;
    let cmd = this.resolve(command[0], rootNode);
    if (cmd.startsWith('*')) {
      if (this.debugging) { debug = true; }
      cmd = cmd.slice(1);
    }
    if (!this['cmd_' + cmd]) {
      throw new Error(`Unknown helper command: ${cmd}`);
    }
    const id = this.commandId++;
    if (debug) {
      console.debug(`WebScrapBook: Running helper (${id}) ${JSON.stringify(command)} at`, this.origNodeMap.get(rootNode) || rootNode);
    }
    const rv = this['cmd_' + cmd].apply(this, [rootNode, ...command.slice(1)]);
    if (debug) {
      console.debug(`WebScrapBook: Running helper (${id}) returns`, rv);
    }
    return rv;
  }

  resolve(obj, rootNode) {
    if (this.isCommand(obj)) {
      return this.runCommand(obj, rootNode);
    }
    return obj;
  }

  resolveNodeData(nodeData, rootNode) {
    const doc = this.getOwnerDocument(rootNode);

    if (typeof nodeData === 'string') {
      nodeData = {
        name: "#text",
        value: nodeData,
      };
    }

    let {name, value = null, attrs, children} = nodeData;
    name = this.resolve(name, rootNode);
    value = this.resolve(value, rootNode);

    const tag = name || "#text";
    switch (tag) {
      case "#text": {
        return doc.createTextNode(value || "");
      }
      case "#comment": {
        return doc.createComment(utils.escapeHtmlComment(value || ""));
      }
      default: {
        const newElem = doc.createElement(tag);

        if (!attrs) {
          // do nothing
        } else if (Array.isArray(attrs)) {
          for (const [key, value] of attrs) {
            newElem.setAttribute(this.resolve(key, rootNode), this.resolve(value, rootNode));
          }
        } else if (typeof attrs === 'object') {
          for (const key in attrs) {
            newElem.setAttribute(key, this.resolve(attrs[key], rootNode));
          }
        }

        if (value !== null) {
          newElem.textContent = value;
        } else if (children) {
          for (let childNodeData of children) {
            childNodeData = this.resolve(childNodeData, rootNode);
            newElem.appendChild(this.resolveNodeData(childNodeData, rootNode));
          }
        }

        return newElem;
      }
    }
  }

  cmd_if(rootNode, condition, thenValue, elseValue) {
    if (this.resolve(condition, rootNode)) {
      return this.resolve(thenValue, rootNode);
    }
    return this.resolve(elseValue, rootNode);
  }

  cmd_equal(rootNode, value1, value2, strict) {
    value1 = this.resolve(value1, rootNode);
    value2 = this.resolve(value2, rootNode);
    strict = this.resolve(strict, rootNode);
    if (strict) {
      return value1 === value2;
    }
    return value1 == value2;
  }

  cmd_and(rootNode, ...args) {
    let value;
    for (const arg of args) {
      value = this.resolve(arg, rootNode);
      if (!value) {
        return value;
      }
    }
    return value;
  }

  cmd_or(rootNode, ...args) {
    let value;
    for (const arg of args) {
      value = this.resolve(arg, rootNode);
      if (value) {
        return value;
      }
    }
    return value;
  }

  cmd_concat(rootNode, baseArg, ...args) {
    let rv = String(this.resolve(baseArg, rootNode) || "");
    for (const arg of args) {
      const value = this.resolve(arg, rootNode);
      rv += String(value || "");
    }
    return rv;
  }

  cmd_slice(rootNode, text, beginIndex, endIndex) {
    text = String(this.resolve(text, rootNode) || "");
    beginIndex = this.resolve(beginIndex, rootNode);
    endIndex = this.resolve(endIndex, rootNode);
    return text.slice(beginIndex, endIndex);
  }

  cmd_upper(rootNode, text) {
    text = String(this.resolve(text, rootNode) || "");
    return text.toUpperCase();
  }

  cmd_lower(rootNode, text) {
    text = String(this.resolve(text, rootNode) || "");
    return text.toLowerCase();
  }

  cmd_encode_uri(rootNode, text, safe) {
    text = String(this.resolve(text, rootNode) || "");
    safe = String(this.resolve(safe, rootNode) || "");
    if (safe) {
      return text.replace(new RegExp(`[^${utils.escapeRegExp(safe)}]+`, 'ug'), x => encodeURIComponent(x));
    }
    return encodeURIComponent(text);
  }

  cmd_decode_uri(rootNode, text) {
    text = String(this.resolve(text, rootNode) || "");
    try {
      return decodeURIComponent(text);
    } catch (ex) {
      return text;
    }
  }

  cmd_add(rootNode, baseArg, ...args) {
    let rv = Number(this.resolve(baseArg, rootNode));
    for (const arg of args) {
      const value = this.resolve(arg, rootNode);
      rv += Number(value);
    }
    return rv;
  }

  cmd_subtract(rootNode, baseArg, ...args) {
    let rv = Number(this.resolve(baseArg, rootNode));
    for (const arg of args) {
      const value = this.resolve(arg, rootNode);
      rv -= Number(value);
    }
    return rv;
  }

  cmd_multiply(rootNode, baseArg, ...args) {
    let rv = Number(this.resolve(baseArg, rootNode));
    for (const arg of args) {
      const value = this.resolve(arg, rootNode);
      rv *= Number(value);
    }
    return rv;
  }

  cmd_divide(rootNode, baseArg, ...args) {
    let rv = Number(this.resolve(baseArg, rootNode));
    for (const arg of args) {
      const value = this.resolve(arg, rootNode);
      rv /= Number(value);
    }
    return rv;
  }

  cmd_mod(rootNode, baseArg, ...args) {
    let rv = Number(this.resolve(baseArg, rootNode));
    for (const arg of args) {
      const value = this.resolve(arg, rootNode);
      rv %= Number(value);
    }
    return rv;
  }

  cmd_power(rootNode, baseArg, ...args) {
    let rv = Number(this.resolve(baseArg, rootNode));
    for (const arg of args) {
      const value = this.resolve(arg, rootNode);
      rv **= Number(value);
    }
    return rv;
  }

  cmd_for(rootNode, selector, ...commands) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    for (const elem of elems) {
      for (const command of commands) {
        this.resolve(command, elem);
      }
    }
  }

  cmd_match(rootNode, str, pattern, group) {
    str = String(this.resolve(str, rootNode) || "");
    pattern = this.parseRegexStr(this.resolve(pattern, rootNode));
    group = this.resolve(group, rootNode);
    if (Number.isInteger(group)) {
      // subgroup index
      if (!pattern) { return null; }
      const m = str.match(pattern);
      if (!m) { return null; }
      return m[group];
    } else if (typeof group === 'string') {
      // subgroup name
      if (!pattern) { return null; }
      const m = str.match(pattern);
      if (!m) { return null; }
      return m.groups[group];
    } else {
      // boolean mode
      if (!pattern) { return false; }
      return pattern.test(str);
    }
  }

  cmd_replace(rootNode, str, pattern, replacement) {
    str = String(this.resolve(str, rootNode) || "");
    pattern = this.parseRegexStr(this.resolve(pattern, rootNode));
    replacement = this.resolve(replacement, rootNode) || "";
    return pattern ? str.replace(pattern, replacement) : str;
  }

  cmd_has_node(rootNode, selector) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    return elems.length > 0;
  }

  cmd_has_attr(rootNode, selector, attr) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    try {
      return elems[0].hasAttribute(this.resolve(attr, rootNode));
    } catch (ex) {
      return false;
    }
  }

  cmd_get_html(rootNode, selector, isOuter) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    try {
      const elem = elems[0];
      if (this.resolve(isOuter, elem)) {
        return elem.outerHTML;
      } else {
        return elem.innerHTML;
      }
    } catch (ex) {
      return null;
    }
  }

  cmd_get_text(rootNode, selector) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    try {
      return elems[0].textContent;
    } catch (ex) {
      return null;
    }
  }

  cmd_get_attr(rootNode, selector, attr) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    try {
      return elems[0].getAttribute(this.resolve(attr, rootNode));
    } catch (ex) {
      return null;
    }
  }

  cmd_get_css(rootNode, selector, style, getPriority) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    try {
      if (this.resolve(getPriority, rootNode)) {
        return elems[0].style.getPropertyPriority(this.resolve(style, rootNode));
      } else {
        return elems[0].style.getPropertyValue(this.resolve(style, rootNode));
      }
    } catch (ex) {
      return null;
    }
  }

  cmd_remove(rootNode, selector) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    for (const elem of elems) {
      elem.remove();
    }
  }

  cmd_unwrap(rootNode, selector) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    for (const elem of elems) {
      utils.unwrapNode(elem);
    }
  }

  cmd_isolate(rootNode, selector) {
    const doc = this.getOwnerDocument(rootNode);

    // get a set of nodes to preserve
    const toPreserve = new Set();
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    for (const elem of elems) {
      const xResult = doc.evaluate('ancestor-or-self::node() | descendant::node()', elem, null, XPathResult.ANY_TYPE);
      let node;
      while (node = xResult.iterateNext()) {
        toPreserve.add(node);
      }
    }

    // filter nodes to remove
    // isolate nodes under body (preserve head) for HTML document
    const root = doc.body || doc.documentElement;
    const toRemove = [];
    const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ALL, {
      acceptNode: (node) => {
        return toPreserve.has(node) ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_ACCEPT;
      },
    });
    let node;
    while (node = walker.nextNode()) {
      toRemove.push(node);
    }

    // remove the nodes
    for (const node of toRemove.reverse()) {
      node.parentNode.removeChild(node);
    }
  }

  cmd_html(rootNode, selector, value, isOuter) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    for (const elem of elems) {
      if (this.resolve(isOuter, elem)) {
        elem.outerHTML = this.resolve(value, elem);
      } else {
        elem.innerHTML = this.resolve(value, elem);
      }
    }
  }

  cmd_text(rootNode, selector, value) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    for (const elem of elems) {
      elem.textContent = this.resolve(value, elem);
    }
  }

  cmd_attr(rootNode, selector, attrs, attrValue) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    for (const elem of elems) {
      if (!elem.setAttribute) { continue; }

      const _attrs = this.resolve(attrs, elem);
      if (!_attrs) { continue; }

      // key, value
      if (typeof _attrs === 'string') {
        const key = _attrs;
        const value = this.resolve(attrValue, elem);
        if (value !== null) {
          elem.setAttribute(key, value);
        } else {
          elem.removeAttribute(key);
        }
        continue;
      }

      // [[key1, value1], ...]
      if (Array.isArray(_attrs)) {
        for (let [key, value] of _attrs) {
          key = this.resolve(key, elem);
          value = this.resolve(value, elem);
          if (value !== null) {
            elem.setAttribute(key, value);
          } else {
            elem.removeAttribute(key);
          }
        }
        continue;
      }

      // {key1: value1, ...}
      if (typeof _attrs === 'object') {
        for (const key in _attrs) {
          const value = this.resolve(_attrs[key], elem);
          if (value !== null) {
            elem.setAttribute(key, value);
          } else {
            elem.removeAttribute(key);
          }
        }
        continue;
      }
    }
  }

  cmd_css(rootNode, selector, styles, styleValue, stylePriority) {
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    for (const elem of elems) {
      if (!elem.style) { continue; }

      const _styles = this.resolve(styles, elem);
      if (!_styles) { continue; }

      // key, value, priority
      if (typeof _styles === 'string') {
        const key = _styles;
        const value = this.resolve(styleValue, elem);
        const priority = this.resolve(stylePriority, elem);
        if (value !== null) {
          elem.style.setProperty(key, value, priority);
        } else {
          elem.style.removeProperty(key);
        }
      }

      // [[key1, value1, priority1], ...]
      if (Array.isArray(_styles)) {
        for (let [key, value, priority] of _styles) {
          key = this.resolve(key, elem);
          value = this.resolve(value, elem);
          priority = this.resolve(priority, elem);
          if (value !== null) {
            elem.style.setProperty(key, value, priority);
          } else {
            elem.style.removeProperty(key);
          }
        }
        continue;
      }

      // {key1: value1, ...}
      if (typeof _styles === 'object') {
        for (const key in _styles) {
          const value = this.resolve(_styles[key], elem);
          if (value !== null) {
            elem.style.setProperty(key, value);
          } else {
            elem.style.removeProperty(key);
          }
        }
        continue;
      }
    }
  }

  cmd_insert(rootNode, selector, nodeData, mode, index) {
    const doc = this.getOwnerDocument(rootNode);
    const elems = this.selectNodes(rootNode, this.resolve(selector, rootNode));
    for (const elem of elems) {
      const _nodeData = this.resolve(nodeData, rootNode);
      let newNode;
      if (!_nodeData) {
        continue;
      } else if (typeof _nodeData === 'string' || _nodeData.name) {
        newNode = this.resolveNodeData(_nodeData, elem);
      } else {
        newNode = doc.createDocumentFragment();
        for (const child of this.selectNodes(elem, _nodeData)) {
          newNode.appendChild(child);
        }
      }

      switch (this.resolve(mode, elem)) {
        case 'before': {
          elem.parentNode.insertBefore(newNode, elem);
          break;
        }
        case 'after': {
          elem.parentNode.insertBefore(newNode, elem.nextSibling);
          break;
        }
        case 'replace': {
          elem.parentNode.replaceChild(newNode, elem);
          break;
        }
        case 'insert': {
          elem.insertBefore(newNode, elem.childNodes[this.resolve(index, elem)]);
          break;
        }
        case 'append':
        default: {
          elem.appendChild(newNode);
          break;
        }
      }
    }
  }
}

export {
  CaptureHelperHandler,
};
