/******************************************************************************
 * Tree UI controller class.
 *
 * @requires scrapbook
 * @requires server
 * @module Tree
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  global.Tree = factory(
    global.isDebug,
    global.scrapbook,
    global.server,
  );
}(this, function (isDebug, scrapbook, server) {

'use strict';

const TREE_CLASS = 'tree';
const TREE_CLASS_SELECTABLE = 'selectable';
const TREE_CLASS_KEYNAV = 'keynav';

const ITEM_TYPE_ICON = {
  '': browser.runtime.getURL('resources/item.png'),
  'folder': browser.runtime.getURL('resources/fclose.png'),
  'file': browser.runtime.getURL('resources/file.png'),
  'image': browser.runtime.getURL('resources/file.png'),
  'note': browser.runtime.getURL('resources/note.png'),
  'postit': browser.runtime.getURL('resources/postit.png'),
};

class Tree {
  get rootElem() {
    const value = this.treeElem.firstChild;
    Object.defineProperty(this, 'rootElem', {
      value,
      writable: false,
      configurable: true,
    });
    return this.rootElem;
  }

  constructor({
    treeElem,
  }) {
    this.treeElem = treeElem;
    this.lastDraggedElems = null;
    this.anchorElem = null;
    this.lastHighlightElem = null;

    this.treeElem.setAttribute('tabindex', 0);
    treeElem.classList.add(TREE_CLASS);

    // bind on* event callbacks
    for (const funcName of Object.getOwnPropertyNames(Tree.prototype)) {
      if (funcName.startsWith('on')) {
        this[funcName] = this[funcName].bind(this);
      }
    }
  }

  /**
   * @param {Object} params
   * @param {Book} params.book
   */
  init({
    book,
    rootId = 'root',
    allowSelect = true,
    allowMultiSelect = false,
    allowMultiSelectOnClick = false,
    allowAnchorClick = false,
    allowContextMenu = false,
    allowKeyboardNavigation = false,
    allowDrag = false,
    allowDrop = false,
    allowCopy = false,
    allowPaste = false,
    contextMenuCallback,
    keyDownCallback,
    pasteCallback,
    itemAnchorClickCallback,
    itemDragOverCallback,
    itemDropCallback,
  }) {
    this.book = book;
    this.rootId = rootId;
    this.allowSelect = allowSelect;
    this.allowMultiSelect = allowMultiSelect;
    this.allowMultiSelectOnClick = allowMultiSelectOnClick;
    this.allowAnchorClick = allowAnchorClick;
    this.allowContextMenu = allowContextMenu;
    this.allowKeyboardNavigation = allowKeyboardNavigation;
    this.allowDrag = allowDrag;
    this.allowDrop = allowDrop;
    this.allowCopy = allowCopy;
    this.allowPaste = allowPaste;
    this.contextMenuCallback = contextMenuCallback;
    this.keyDownCallback = keyDownCallback;
    this.pasteCallback = pasteCallback;
    this.itemAnchorClickCallback = itemAnchorClickCallback;
    this.itemDragOverCallback = itemDragOverCallback;
    this.itemDropCallback = itemDropCallback;

    // In Chromium mobile (e.g. Kiwi browser 98), there is missing
    // event.dataTransfer causing DnD not functioning well.
    // Disallow DnD to prevent a confusion.
    // https://bugs.chromium.org/p/chromium/issues/detail?id=1266859
    if (scrapbook.userAgent.is('chromium') && scrapbook.userAgent.is('mobile')) {
      this.allowDrag = false;
    }

    if (this.allowSelect) {
      this.treeElem.classList.add(TREE_CLASS_SELECTABLE);
    } else {
      this.treeElem.classList.remove(TREE_CLASS_SELECTABLE);
    }

    if (this.allowContextMenu) {
      this.treeElem.addEventListener('contextmenu', this.onContextMenu);
    } else {
      this.treeElem.removeEventListener('contextmenu', this.onContextMenu);
    }

    if (this.allowKeyboardNavigation) {
      this.treeElem.classList.add(TREE_CLASS_KEYNAV);
      this.treeElem.addEventListener('keydown', this.onKeyDown);
    } else {
      this.treeElem.classList.remove(TREE_CLASS_KEYNAV);
      this.treeElem.removeEventListener('keydown', this.onKeyDown);
    }

    // Binding event on this.treeElem does not work.
    // Bind event on the document and check if the tree is active (focused) instead.
    if (this.allowCopy) {
      document.addEventListener('copy', this.onCopy);
    } else {
      document.removeEventListener('copy', this.onCopy);
    }

    // Binding event on this.treeElem does not work.
    // Bind event on the document and check if the tree is active (focused) instead.
    if (this.allowPaste) {
      document.addEventListener('paste', this.onPaste);
    } else {
      document.removeEventListener('paste', this.onPaste);
    }
  }

  rebuild() {
    this.treeElem.textContent = '';
    this.lastDraggedElems = null;
    this.anchorElem = null;
    this.lastHighlightElem = null;

    // remove overriden rootElem property to reset
    delete this.rootElem;
  }

  getSelectedItemElems() {
    return Array.prototype.map.call(
      this.treeElem.querySelectorAll('.highlight'),
      x => x.parentNode,
    );
  }

  getParent(itemElem) {
    const parentItemElem = itemElem.parentNode.parentNode;
    if (!this.rootElem.contains(parentItemElem)) {
      return null;
    }
    return parentItemElem;
  }

  /**
   * Get position index of an item element.
   *
   * According to a benchmark, counting previous elements (getIndex1) is
   * faster than calling Array.indexOf on siblings for both Firefox (v114)
   * and Google Chrome (v113).
   *
   *   function getIndex1(elem) {
   *     let i = 0, e = elem;
   *     while (e = e.previousElementSibling) { i++; }
   *     return i;
   *   }
   *
   *   function getIndex2(elem) {
   *     const parent = elem.parentNode;
   *     const siblings = parent.children;
   *     return Array.prototype.indexOf.call(siblings, elem);
   *   }
   *
   * @param {HTMLElement} itemElem
   * @param {Map<HTMLElement~itemElem, integer~index>} [cacheMap] - A cache Map
   *   for better performance when accessed many times at once.
   * @return {integer}
   */
  getIndex(itemElem, cacheMap) {
    let index = 0, elem = itemElem;
    while (elem = elem.previousElementSibling) {
      if (cacheMap) {
        const prevIndex = cacheMap.get(elem);
        if (typeof prevIndex !== 'undefined') {
          index += prevIndex + 1;
          break;
        }
      }
      index++;
    }
    if (cacheMap) {
      cacheMap.set(itemElem, index);
    }
    return index;
  }

  /**
   * @param {HTMLElement} itemElem
   * @param {Map<HTMLElement~itemElem, integer~index>} [cacheMap]
   */
  getParentAndIndex(itemElem, cacheMap) {
    const parentItemElem = this.getParent(itemElem);
    if (!parentItemElem) {
      return {
        parentItemElem: null,
        parentItemId: null,
        index: null,
      };
    }
    const parentItemId = this.getItemId(parentItemElem);
    const index = this.getIndex(itemElem, cacheMap);
    return {parentItemElem, parentItemId, index};
  }

  getItemId(itemElem) {
    return itemElem.getAttribute('data-id');
  }

  getItemUrl(itemElem) {
    const anchor = itemElem.anchor;
    if (!anchor) { return ''; }
    return anchor.href;
  }

  getXpathPos(elem) {
    const id = elem.getAttribute('data-id');
    let cur = elem, i = 0;
    while (cur) {
      if (cur.getAttribute('data-id') === id) { i++; }
      cur = cur.previousElementSibling;
    }
    return i;
  }

  getXpaths(elem, map, {includeParents = true} = {}) {
    const path = [];
    let cur = elem;
    while (this.treeElem.contains(cur)) {
      path.unshift(`*[@data-id=${scrapbook.quoteXPath(cur.getAttribute('data-id'))}][${this.getXpathPos(cur)}]`);
      cur = cur.parentElement.parentElement;
    }

    for (let i = includeParents ? 0 : path.length - 1, I = path.length; i < I; ++i) {
      const subpath = path.slice(0, i + 1);
      const sel = './' + subpath.join('/ul/');
      if (!map.has(sel)) {
        map.set(sel, i === I - 1);
      }
    }
  }

  /**
   * Add an item to DOM
   *
   * @param {Object} params
   * @param {Object} params.item - item to add
   * @param {HTMLElement} params.parent - parent to insert the item
   * @param {?integer} [params.index] - non-integer to insert to last
   * @return {HTMLLIElement}
   */
  addItem(item, parent = this.rootElem.container, index) {
    if (!Number.isInteger(index)) {
      index = Infinity;
    }

    // create element
    const elem = document.createElement('li');
    const div = elem.controller = elem.appendChild(document.createElement('div'));
    this.refreshItemElem(elem, item, this.book);

    // bind events
    if (this.allowSelect) {
      div.addEventListener('click', this.onItemClick);
      div.addEventListener('mousedown', this.onItemMiddleClick);
    }

    if (this.allowDrag) {
      div.setAttribute('draggable', true);
      div.addEventListener('dragstart', this.onItemDragStart);
      div.addEventListener('dragend', this.onItemDragEnd);
    }
    if (this.allowDrop) {
      div.addEventListener('dragenter', this.onItemDragEnter);
      div.addEventListener('dragover', this.onItemDragOver);
      div.addEventListener('dragleave', this.onItemDragLeave);
      div.addEventListener('drop', this.onItemDrop);
    }

    // append to parent element
    parent.insertBefore(elem, parent.children[index]);

    return elem;
  }

  refreshItemElem(elem, meta) {
    elem.setAttribute('data-id', meta.id);

    if (meta.type) {
      elem.setAttribute('data-type', meta.type);
    } else {
      elem.removeAttribute('data-type');
    }
    if (meta.marked) {
      elem.setAttribute('data-marked', '');
    } else {
      elem.removeAttribute('data-marked');
    }

    const div = elem.controller;
    div.textContent = '';
    if (elem.toggler) { div.appendChild(elem.toggler); }

    if (meta.type !== 'separator') {
      var a = elem.anchor = div.appendChild(document.createElement('a'));
      if (this.allowDrag) {
        a.draggable = false;
      }
      if (this.allowKeyboardNavigation) {
        a.setAttribute('tabindex', -1);
      }
      elem.label = a.appendChild(document.createTextNode(meta.title || meta.id));
      a.title = (meta.title || meta.id) + (meta.source ? '\n' + meta.source : '') + (meta.comment ? '\n\n' + meta.comment : '');
      switch (meta.type) {
        case 'folder': {
          const u = new URL(browser.runtime.getURL("scrapbook/folder.html"));
          u.searchParams.append('id', meta.id);
          u.searchParams.append('bookId', this.book.id);
          a.href = u.href;
          break;
        }
        case 'postit': {
          const u = new URL(browser.runtime.getURL("scrapbook/postit.html"));
          u.searchParams.append('id', meta.id);
          u.searchParams.append('bookId', this.book.id);
          a.href = u.href;
          break;
        }
        case 'bookmark': {
          if (meta.source) {
            a.href = meta.source;
          } else if (meta.index) {
            a.href = this.book.dataUrl + scrapbook.escapeFilename(meta.index);
          }
          break;
        }
        default: {
          if (meta.index) {
            a.href = this.book.dataUrl + scrapbook.escapeFilename(meta.index)
                + scrapbook.splitUrlByAnchor(meta.source || '')[1];
          }
          break;
        }
      }
      if (meta.type === 'folder') {
        a.addEventListener('click', this.onItemFolderClick);
      } else {
        a.addEventListener('click', this.onItemAnchorClick);
      }

      var icon = a.insertBefore(document.createElement('img'), a.firstChild);
      icon.draggable = false;
      if (meta.icon) {
        icon.src = /^(?:[a-z][a-z0-9+.-]*:|[/])/i.test(meta.icon || '') ?
            meta.icon :
            (this.book.dataUrl + scrapbook.escapeFilename(meta.index || '')).replace(/[/][^/]+$/, '/') + meta.icon;
      } else {
        icon.src = ITEM_TYPE_ICON[meta.type] || ITEM_TYPE_ICON[''];
      }
      icon.alt = '';
      icon.loading = 'lazy';
    } else {
      var line = div.appendChild(document.createElement('fieldset'));
      line.title = (meta.title || '') + (meta.source ? '\n' + meta.source : '') + (meta.comment ? '\n\n' + meta.comment : '');

      var legend = line.appendChild(document.createElement('legend'));
      if (meta.title) {
        legend.appendChild(document.createTextNode('\xA0'));
        elem.label = legend.appendChild(document.createTextNode(meta.title));
        legend.appendChild(document.createTextNode('\xA0'));
      } else {
        elem.label = legend.appendChild(document.createTextNode(''));
      }
    }
  }

  anchorItem(itemElem) {
    if (this.anchorElem) {
      if (itemElem === this.anchorElem) { return; }

      for (const elem of this.treeElem.querySelectorAll('.anchor')) {
        elem.classList.remove('anchor');
      }
    }
    if (!this.treeElem.contains(itemElem)) {
      return;
    }
    itemElem.controller.classList.add('anchor');
    this.anchorElem = itemElem;
  }

  highlightItem(itemElem,
    willHighlight = !itemElem.controller.classList.contains('highlight'),
    {reselect = true, ranged = false} = {},
  ) {
    if (!this.allowSelect) { return; }

    if (reselect) {
      for (const elem of this.treeElem.querySelectorAll('.highlight')) {
        elem.classList.remove('highlight');
      }
    }

    if (!this.treeElem.contains(itemElem)) {
      return;
    }

    if (ranged) {
      const itemElems = this.treeElem.querySelectorAll('li[data-id]');
      let startElem =
          this.treeElem.contains(this.lastHighlightElem) && !this.lastHighlightElem.closest('[hidden]') ? this.lastHighlightElem :
          this.treeElem.contains(this.anchorElem) && !this.anchorElem.closest('[hidden]') ? this.anchorElem :
          null;
      let start = Array.prototype.indexOf.call(itemElems, startElem);
      let end = Array.prototype.indexOf.call(itemElems, itemElem);
      if (start < 0) { start = 0; }
      if (start > end) { [start, end] = [end, start]; }
      for (let i = start; i <= end; i++) {
        const elem = itemElems[i];
        if (elem.closest('[hidden]')) { continue; }
        if (willHighlight) {
          elem.controller.classList.add('highlight');
        } else {
          elem.controller.classList.remove('highlight');
        }
      }

      this.anchorItem(itemElem);
      return;
    }

    if (willHighlight) {
      itemElem.controller.classList.add('highlight');
    } else {
      itemElem.controller.classList.remove('highlight');
    }

    this.lastHighlightElem = itemElem;
    this.anchorItem(itemElem);
  }

  scrollIntoView(itemElem) {
    try {
      itemElem.controller.scrollIntoView({block: "nearest", inline: "start"});
    } catch (ex) {
      // Firfox < 58: block: "nearest" is not supported
      itemElem.controller.scrollIntoView({block: "start", inline: "start"});
    }
  }

  keyboardNavigation(event) {
    if (event.code === "ArrowUp") {
      event.preventDefault();
      const itemElems = this.treeElem.querySelectorAll('li[data-id]');
      const anchorElem = this.anchorElem;
      if (!this.treeElem.contains(anchorElem) || anchorElem.closest('[hidden]')) {
        this.highlightItem(itemElems[0], true);
        return;
      }

      let target, index = Array.prototype.indexOf.call(itemElems, anchorElem) - 1;
      while (index >= 0) {
        if (itemElems[index] && !itemElems[index].closest('[hidden]')) {
          target = itemElems[index];
          break;
        }
        index--;
      }

      if (target) {
        if (this.allowMultiSelect && event.shiftKey) {
          this.highlightItem(target, true, {reselect: !event.ctrlKey, ranged: true});
        } else if (event.ctrlKey) {
          this.anchorItem(target);
        } else {
          this.highlightItem(target, true);
        }
        this.scrollIntoView(target);
      }

      return;
    }

    if (event.code === "ArrowDown") {
      event.preventDefault();
      const itemElems = this.treeElem.querySelectorAll('li[data-id]');
      const anchorElem = this.anchorElem;
      if (!this.treeElem.contains(anchorElem) || anchorElem.closest('[hidden]')) {
        this.highlightItem(itemElems[0], true);
        return;
      }

      let target, index = Array.prototype.indexOf.call(itemElems, anchorElem) + 1;
      while (index < itemElems.length) {
        if (itemElems[index] && !itemElems[index].closest('[hidden]')) {
          target = itemElems[index];
          break;
        }
        index++;
      }

      if (target) {
        if (this.allowMultiSelect && event.shiftKey) {
          this.highlightItem(target, true, {reselect: !event.ctrlKey, ranged: true});
        } else if (event.ctrlKey) {
          this.anchorItem(target);
        } else {
          this.highlightItem(target, true);
        }
        this.scrollIntoView(target);
      }

      return;
    }

    if (event.code === "Home") {
      event.preventDefault();
      const itemElems = this.treeElem.querySelectorAll('li[data-id]');
      const anchorElem = this.anchorElem;
      if (!this.treeElem.contains(anchorElem) || anchorElem.closest('[hidden]')) {
        this.highlightItem(itemElems[0], true);
        return;
      }

      let target, index = 0;
      while (index >= 0) {
        if (itemElems[index] && !itemElems[index].closest('[hidden]')) {
          target = itemElems[index];
          break;
        }
        index--;
      }

      if (target) {
        if (this.allowMultiSelect && event.shiftKey) {
          this.highlightItem(target, true, {reselect: !event.ctrlKey, ranged: true});
        } else if (event.ctrlKey) {
          this.anchorItem(target);
        } else {
          this.highlightItem(target, true);
        }
        this.scrollIntoView(target);
      }

      return;
    }

    if (event.code === "End") {
      event.preventDefault();
      const itemElems = this.treeElem.querySelectorAll('li[data-id]');
      const anchorElem = this.anchorElem;
      if (!this.treeElem.contains(anchorElem) || anchorElem.closest('[hidden]')) {
        this.highlightItem(itemElems[0], true);
        return;
      }

      let target, index = itemElems.length - 1;
      while (index >= 0) {
        if (itemElems[index] && !itemElems[index].closest('[hidden]')) {
          target = itemElems[index];
          break;
        }
        index--;
      }

      if (target) {
        if (this.allowMultiSelect && event.shiftKey) {
          this.highlightItem(target, true, {reselect: !event.ctrlKey, ranged: true});
        } else if (event.ctrlKey) {
          this.anchorItem(target);
        } else {
          this.highlightItem(target, true);
        }
        this.scrollIntoView(target);
      }

      return;
    }

    if (event.code === "Space") {
      event.preventDefault();
      const itemElems = this.treeElem.querySelectorAll('li[data-id]');
      const anchorElem = this.anchorElem;
      if (!this.treeElem.contains(anchorElem) || anchorElem.closest('[hidden]')) {
        this.highlightItem(itemElems[0], true);
        return;
      }

      let target, index = Array.prototype.indexOf.call(itemElems, anchorElem);
      while (index < itemElems.length) {
        if (itemElems[index] && !itemElems[index].closest('[hidden]')) {
          target = itemElems[index];
          break;
        }
        index++;
      }

      if (target) {
        const willHighlight = (this.allowMultiSelect && event.shiftKey) ? true : undefined;
        const reselect = !this.allowMultiSelect ? true :
            event.ctrlKey ? false :
            event.shiftKey ? true :
            !this.allowMultiSelectOnClick;
        const ranged = this.allowMultiSelect && event.shiftKey;
        this.highlightItem(target, willHighlight, {reselect, ranged});
        this.scrollIntoView(target);
      }

      return;
    }

    if (event.code === "Enter") {
      event.preventDefault();
      const anchorElem = this.anchorElem;
      if (!this.treeElem.contains(anchorElem) || anchorElem.closest('[hidden]')) {
        return;
      }

      let target;
      if (anchorElem.anchor?.hasAttribute('href')) {
        target = anchorElem.anchor;
      } else if (anchorElem.toggler?.hasAttribute('href')) {
        target = anchorElem.toggler;
      }

      if (target) {
        const evt = new MouseEvent('click', {
          // don't bubble up to trigger item selection
          bubbles: false,

          cancelable: true,
          composed: event.composed,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
        });
        target.dispatchEvent(evt);
      }

      return;
    }
  }

  onContextMenu(event) {
    const itemElem = event.target.closest('li[data-id]');
    if (itemElem && !itemElem.controller.classList.contains('highlight')) {
      this.highlightItem(itemElem, true, {reselect: true});
    }

    // invoke callback
    if (this.contextMenuCallback) {
      this.contextMenuCallback.call(this, event, {
        tree: this,
      });
    }
  }

  onKeyDown(event) {
    this.keyboardNavigation(event);

    // invoke callback
    if (this.keyDownCallback) {
      this.keyDownCallback.call(this, event, {
        tree: this,
      });
    }
  }

  onCopy(event) {
    // skip if the tree is not focused
    if (!this.treeElem.contains(document.activeElement)) {
      return;
    }

    event.preventDefault();

    const selectedItemElems = this.getSelectedItemElems();

    const cacheMap = new Map();
    event.clipboardData.setData(
      'application/scrapbook.items+json',
      JSON.stringify({
        src: this.book.server.serverRoot,

        bookId: this.book.id,

        // may be undefined if not implemented or initialized
        treeLastModified: this.book.treeLastModified,

        items: selectedItemElems.map(elem => {
          const {parentItemId: parentId, index} = this.getParentAndIndex(elem, cacheMap);
          return {id: this.getItemId(elem), parentId, index};
        }),
      }),
    );
    event.clipboardData.setData(
      'text/plain',
      selectedItemElems.map(x => this.getItemId(x)).join('\r\n'),
    );
  }

  onPaste(event) {
    // skip if the tree is not focused
    if (!this.treeElem.contains(document.activeElement)) {
      return;
    }

    event.preventDefault();

    // calculate position
    let targetId;
    let targetIndex;
    if (this.treeElem.contains(this.anchorElem) && !this.anchorElem.closest('[hidden]')) {
      const {parentItemId, index} = this.getParentAndIndex(this.anchorElem);
      targetId = parentItemId;
      targetIndex = index;
    } else {
      targetId = this.rootId;
      targetIndex = Infinity;
    }

    // invoke callback
    if (this.pasteCallback) {
      this.pasteCallback.call(this, event, {
        tree: this,
        targetId,
        targetIndex,
      });
    }
  }

  onItemDragStart(event) {
    const itemElem = event.currentTarget.parentNode;
    if (!itemElem.controller.classList.contains('highlight')) {
      this.highlightItem(itemElem, true, {reselect: true});
    }

    const selectedItemElems = this.getSelectedItemElems();

    for (const elem of selectedItemElems) {
      elem.classList.add('dragged');
    }

    // Firefox requires at least one data to get dragging work
    const cacheMap = new Map();
    event.dataTransfer.setData(
      'application/scrapbook.items+json',
      JSON.stringify({
        src: this.book.server.serverRoot,

        bookId: this.book.id,

        // may be undefined if not implemented or initialized
        treeLastModified: this.book.treeLastModified,

        items: selectedItemElems.map(elem => {
          const {parentItemId: parentId, index} = this.getParentAndIndex(elem, cacheMap);
          return {id: this.getItemId(elem), parentId, index};
        }),
      }),
    );
    event.dataTransfer.setData(
      'text/plain',
      selectedItemElems.map(x => this.getItemId(x)).join('\r\n'),
    );

    // prevent mis-intereprated as a regular link
    event.dataTransfer.clearData('text/uri-list');
    event.dataTransfer.clearData('text/html');

    event.dataTransfer.effectAllowed = 'all';
    this.lastDraggedElems = selectedItemElems;
  }

  onItemDragEnd(event) {
    if (!this.lastDraggedElems) { return; }

    for (const elem of this.lastDraggedElems) {
      elem.classList.remove('dragged');
    }
    this.lastDraggedElems = null;
  }

  onItemDragEnter(event) {
    const wrapper = event.currentTarget;
    wrapper.classList.add('dragover');
    this.onItemDragOver(event);
  }

  onItemDragOver(event) {
    event.stopPropagation();
    event.preventDefault();

    // invoke callback
    if (this.itemDragOverCallback) {
      this.itemDragOverCallback.call(this, event, {
        tree: this,
        lastDraggedElems: this.lastDraggedElems,
      });
    }

    // set class
    switch (event.dataTransfer.dropEffect) {
      case 'move':
        this.treeElem.classList.add('moving');
        break;
      default:
        this.treeElem.classList.remove('moving');
        break;
    }

    // show drop position
    if (event.dataTransfer.dropEffect !== 'none') {
      const wrapper = event.currentTarget;
      const wrapperRect = wrapper.getBoundingClientRect();
      const pos = (event.clientY - wrapperRect.top) / wrapperRect.height;

      if (pos < 1 / 3) {
        wrapper.classList.add('above');
        wrapper.classList.remove('below');
        wrapper.classList.remove('within');
      } else if (pos > 2 / 3) {
        wrapper.classList.remove('above');
        wrapper.classList.add('below');
        wrapper.classList.remove('within');
      } else {
        wrapper.classList.remove('above');
        wrapper.classList.remove('below');
        wrapper.classList.add('within');
      }
    }
  }

  onItemDragLeave(event) {
    event.stopPropagation();

    const wrapper = event.currentTarget;
    let enteredElem = event.relatedTarget;

    // In Firefox the relatedTarget could be a text node
    if (enteredElem?.nodeType !== 1) {
      enteredElem = enteredElem.parentElement;
    }

    // skip when entering another descendant of the same dragover element
    if (enteredElem?.closest('.dragover') === wrapper) {
      return;
    }

    wrapper.classList.remove('dragover');
    wrapper.classList.remove('above');
    wrapper.classList.remove('below');
    wrapper.classList.remove('within');
  }

  onItemDrop(event) {
    event.stopPropagation();
    event.preventDefault();

    // update GUI
    const wrapper = event.currentTarget;
    wrapper.classList.remove('dragover');
    wrapper.classList.remove('above');
    wrapper.classList.remove('below');
    wrapper.classList.remove('within');

    // calculate position
    const wrapperRect = wrapper.getBoundingClientRect();
    const pos = (event.clientY - wrapperRect.top) / wrapperRect.height;
    const itemElem = wrapper.parentNode;
    let targetId;
    let targetIndex;
    if (pos < 1 / 3) {
      // above
      targetId = this.getItemId(this.getParent(itemElem));
      targetIndex = this.getIndex(itemElem);
    } else if (pos > 2 / 3) {
      // below
      targetId = this.getItemId(this.getParent(itemElem));
      targetIndex = this.getIndex(itemElem) + 1;
    } else {
      // within
      targetId = this.getItemId(itemElem);
    }

    // invoke callback
    if (this.itemDropCallback) {
      this.itemDropCallback.call(this, event, {
        tree: this,
        lastDraggedElems: this.lastDraggedElems,
        targetId,
        targetIndex,
      });
    }

    // focus the tree for smooth keyboard nav
    if (this.allowKeyboardNavigation) {
      this.treeElem.focus();
    }
  }

  onItemClick(event) {
    const itemElem = event.currentTarget.parentNode;
    const willHighlight = event.shiftKey ? true : undefined;
    const reselect = event.ctrlKey ? !this.allowMultiSelect :
        event.shiftKey ? true :
        !(this.allowMultiSelect && this.allowMultiSelectOnClick);
    const ranged = this.allowMultiSelect && event.shiftKey;
    this.highlightItem(itemElem, willHighlight, {reselect, ranged});
  }

  onItemMiddleClick(event) {
    if (event.button !== 1) { return; }
    this.onItemClick(event);
  }

  onItemFolderClick(event) {
    // abstract method
  }

  onItemAnchorClick(event) {
    // return if not allowed
    if (!this.allowAnchorClick) {
      event.preventDefault();
      return;
    }

    // Suppress link effect if there's a modifier when select is allowed
    // so that the user can select without linking with a modifier.
    if (this.allowSelect) {
      if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) {
        event.preventDefault();
        return;
      }
    }

    // invoke callback
    if (this.itemAnchorClickCallback) {
      this.itemAnchorClickCallback.call(this, event, {
        tree: this,
      });
    }
  }
}

return Tree;

}));
