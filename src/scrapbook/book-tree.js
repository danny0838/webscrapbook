/******************************************************************************
 * BookTree UI controller class.
 *
 * This is bound to a scrapbook (a Book instance in server.js) and constructs
 * the DOM tree according to it.
 *
 * @requires scrapbook
 * @requires server
 * @requires Tree
 * @module BookTree
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  global.BookTree = factory(
    global.isDebug,
    global.scrapbook,
    global.server,
    global.Tree,
  );
}(this, function (isDebug, scrapbook, server, Tree) {

'use strict';

const TREE_CLASS = 'tree-book';

const TOGGLER_ICON = {
  collapsed: browser.runtime.getURL('resources/collapse.png'),
  expanded: browser.runtime.getURL('resources/expand.png'),
};

class BookTree extends Tree {
  constructor({
    treeElem,
    cacheType = 'sessionStorage',
  }) {
    super({treeElem});
    this.cacheType = cacheType;
    treeElem.classList.add(TREE_CLASS);

    // bind on* event callbacks
    for (const funcName of Object.getOwnPropertyNames(BookTree.prototype)) {
      if (funcName.startsWith('on')) {
        this[funcName] = this[funcName].bind(this);
      }
    }
  }

  /**
   * @param {Object} params
   * @param {Book} params.book
   */
  init(params) {
    super.init(params);
  }

  async rebuild({keepHighlights = true} = {}) {
    const wrapper = this.treeElem.parentNode;

    // save scrolling
    const {scrollLeft, scrollTop} = wrapper;

    // save current highlights
    let anchorElem = this.anchorElem;
    if (anchorElem) {
      if (this.treeElem.contains(anchorElem) && keepHighlights) {
        const map = new Map();
        this.getXpaths(anchorElem, map, {includeParents: false});
        for (const xpath of map.keys()) {
          anchorElem = xpath;
        }
      } else {
        anchorElem = null;
      }
    }

    let lastHighlightElem = this.lastHighlightElem;
    if (lastHighlightElem) {
      if (this.treeElem.contains(lastHighlightElem) && keepHighlights) {
        const map = new Map();
        this.getXpaths(lastHighlightElem, map, {includeParents: false});
        for (const xpath of map.keys()) {
          lastHighlightElem = xpath;
        }
      } else {
        lastHighlightElem = null;
      }
    }

    const highlights = new Map();
    if (keepHighlights) {
      for (const elem of this.treeElem.querySelectorAll('.highlight')) {
        this.getXpaths(elem.parentElement, highlights, {includeParents: false});
      }
    }

    // rebuild
    super.rebuild();
    if (this.book.config.no_tree) { return; }

    const rootElem = this.treeElem.appendChild(document.createElement('div'));
    rootElem.setAttribute('data-id', this.rootId);
    rootElem.container = rootElem.appendChild(document.createElement('ul'));
    rootElem.container.classList.add('container');
    this.toggleItem(rootElem, true);
    await this.loadViewStatus();

    // restore highlights
    for (const xpath of highlights.keys()) {
      const elem = document.evaluate(xpath, this.treeElem, null, 0, null).iterateNext();
      if (!elem) { continue; }
      elem.controller.classList.add('highlight');
    }

    if (anchorElem) {
      const elem = document.evaluate(anchorElem, this.treeElem, null, 0, null).iterateNext();
      if (elem) {
        this.anchorElem = elem;
        elem.controller.classList.add('anchor');
      }
    }

    if (lastHighlightElem) {
      const elem = document.evaluate(lastHighlightElem, this.treeElem, null, 0, null).iterateNext();
      if (elem) { this.lastHighlightElem = elem; }
    }

    // restore scrolling
    wrapper.scrollLeft = scrollLeft;
    wrapper.scrollTop = scrollTop;
  }

  /**
   * @return {Object[]} item info from top to elem parent
   */
  getParents(itemElem, {includeIndex = false, cacheMap} = {}) {
    let parents = [];
    let specialRoot = false;
    let elem = itemElem;
    while (true) {
      const parentItemElem = this.getParent(elem);
      if (!parentItemElem) {
        break;
      }
      const parentItemId = this.getItemId(parentItemElem);
      const parent = {elem: parentItemElem, id: parentItemId};
      if (includeIndex) {
        parent.index = this.getIndex(elem, cacheMap);
      }
      parents.push(parent);
      if (this.book.isSpecialItem(parentItemId)) {
        specialRoot = true;
        break;
      }
      elem = parentItemElem;
    }
    parents.reverse();
    if (!specialRoot) {
      // find and fill items from root to tree root
      for (const root of this.book.specialItems) {
        const path = this.book.findItemPaths(this.rootId, root).next().value;
        if (path) {
          parents = path.reduce((parents, {id, pos}, index, path) => {
            // skip last
            if (path[index + 1]) {
              const parent = {elem: null, id};
              if (includeIndex) {
                parent.index = path[index + 1].pos;
              }
              parents.push(parent);
            }
            return parents;
          }, []).concat(parents);
          break;
        }
      }
    }
    return parents;
  }

  getViewStatusKey() {
    return {table: 'scrapbookTreeView', serverRoot: server.serverRoot, bookId: this.book.id, rootId: this.rootId};
  }

  async saveViewStatus() {
    const selects = {};
    const map = new Map();
    for (const elem of this.treeElem.querySelectorAll('ul.container:not([hidden])')) {
      this.getXpaths(elem.parentElement, map);
    }
    for (const [k, v] of map.entries()) {
      selects[k] = v;
    }

    const key = this.getViewStatusKey();
    const data = {
      time: Date.now(),
      selects,
    };

    try {
      await scrapbook.cache.set(key, data, this.cacheType);
    } catch (ex) {
      if (ex.name === 'QuotaExceededError') {
        // In case the view status is too large (mostly for sessionStorage),
        // clear the data to prevent loading the old value.
        await scrapbook.cache.remove(key, this.cacheType);
        console.warn('Cleared stored view status as the latest value is too large to store.');
      } else {
        throw ex;
      }
    }
  }

  async loadViewStatus() {
    try {
      const key = this.getViewStatusKey();
      const data = await scrapbook.cache.get(key, this.cacheType);

      if (!data) { return; }

      for (const [xpath, willOpen] of Object.entries(data.selects)) {
        const elem = document.evaluate(xpath, this.treeElem, null, 0, null).iterateNext();
        if (!elem) { continue; }
        if (willOpen) { this.toggleItem(elem, true); }
      }
    } catch (ex) {
      console.error(ex);
    }
  }

  itemMakeContainer(elem) {
    if (elem.container) { return; }

    const div = elem.controller;

    const toggler = elem.toggler = document.createElement('a');
    if (this.allowDrag) {
      toggler.draggable = false;
    }
    if (this.allowKeyboardNavigation) {
      toggler.setAttribute('tabindex', -1);
    }
    toggler.href = 'javascript:void(0)';
    toggler.className = 'toggle';
    toggler.addEventListener('click', this.onItemTogglerClick);
    div.insertBefore(toggler, div.firstChild);

    const togglerImg = document.createElement('img');
    togglerImg.draggable = false;
    togglerImg.src = TOGGLER_ICON.collapsed;
    togglerImg.alt = '';
    toggler.appendChild(togglerImg);

    const container = elem.container = document.createElement('ul');
    container.className = 'container';
    container.hidden = true;
    elem.appendChild(container);
  }

  itemReduceContainer(elem) {
    if (elem === this.rootElem) { return; }
    if (!elem.container) { return; }
    if (elem.container.hasChildNodes()) { return; }

    if (!elem.container.hasAttribute('data-loaded')) {
      const toc = this.book.toc[elem.getAttribute('data-id')];
      if (toc?.length) {
        return;
      }
    }

    // remove toggler
    elem.toggler.remove();
    delete elem.toggler;

    // remove container
    elem.container.remove();
    delete elem.container;
  }

  /**
   * Add an item which is already in the scrapbook to the tree DOM
   */
  addItem(id, parent, index) {
    const meta = this.book.meta[id];
    if (!meta) {
      return null;
    }

    // create element and append to parent
    this.itemMakeContainer(parent);
    const elem = super.addItem(meta, parent.container, index);

    // set child container
    var childIdList = this.book.toc[meta.id];
    if (childIdList?.length) {
      this.itemMakeContainer(elem);
    }

    return elem;
  }

  toggleItem(elem, willOpen) {
    const container = elem.container;
    if (!container) { return; }

    if (typeof willOpen === 'undefined') {
      willOpen = !!container.hidden;
    }

    // load child nodes if not loaded yet
    if (willOpen) {
      this.loadChildren(elem);
    }

    container.hidden = !willOpen;

    // toggle the toggler (twisty)
    // note that root item does not have a toggler
    const toggler = elem.toggler;
    if (toggler) {
      toggler.firstChild.src = willOpen ?
        TOGGLER_ICON.expanded :
        TOGGLER_ICON.collapsed;
    }

    // deselect descendants to avoid a suprise due to unexpected selection
    if (!willOpen) {
      for (const elem of container.querySelectorAll('.highlight')) {
        elem.classList.remove('highlight');
      }
    }
  }

  loadChildren(elem) {
    const container = elem.container;
    if (!container) { return; }
    if (container.hasAttribute('data-loaded')) { return; }

    const toc = this.book.toc[elem.getAttribute('data-id')];
    if (toc) {
      for (const id of toc) {
        this.addItem(id, elem);
      }
    }
    container.setAttribute('data-loaded', '');
  }

  /**
   * Recursively load non-circular descendant elements
   */
  loadDescendants(elem) {
    const container = elem.container;
    if (!container) { return; }

    const idPath = [];
    let cur = elem;
    while (this.treeElem.contains(cur)) {
      idPath.unshift(cur.getAttribute('data-id'));
      cur = this.getParent(cur);
    }
    const idPathSet = new Set(idPath);
    if (idPathSet.size < idPath.length) {
      // circular
      return;
    }

    const loadChildren = (elem) => {
      const id = elem.getAttribute('data-id');
      if (idPathSet.has(id)) { return; }

      this.loadChildren(elem);
      const container = elem.container;
      if (!container) { return; }

      idPathSet.add(id);
      for (const child of container.children) {
        loadChildren(child);
      }
      idPathSet.delete(id);
    };

    idPathSet.delete(elem.getAttribute('data-id'));
    loadChildren(elem);
  }

  refreshItem(id) {
    for (const itemElem of this.treeElem.querySelectorAll(`[data-id="${CSS.escape(id)}"]`)) {
      this.refreshItemElem(itemElem, this.book.meta[id]);
    }
  }

  insertItem(id, parentId, index) {
    for (const parentElem of this.treeElem.querySelectorAll(`[data-id="${CSS.escape(parentId)}"]`)) {
      this.itemMakeContainer(parentElem);
      if (!parentElem.container.hasAttribute('data-loaded')) { continue; }
      this.addItem(id, parentElem, index);
    }
  }

  /**
   * Remove an from the tree DOM
   *
   * @param {HTMLElement[]} [itemElems] - Cached item elements in the tree for faster access.
   */
  removeItem(parentId, index, itemElems) {
    for (const parentElem of this.treeElem.querySelectorAll(`[data-id="${CSS.escape(parentId)}"]`)) {
      if (!(this.treeElem.contains(parentElem) && parentElem.container)) {
        continue;
      }

      if (!parentElem.container.hasAttribute('data-loaded')) {
        this.itemReduceContainer(parentElem);
        continue;
      }

      const itemElem = parentElem.container.children[index];

      // prepare for updating anchor elem if needed
      const updateAnchor = itemElem === this.anchorElem;
      let anchorIndex;
      if (updateAnchor) {
        if (!itemElems) {
          itemElems = this.treeElem.querySelectorAll('li[data-id]');
        }
        anchorIndex = Array.prototype.indexOf.call(itemElems, itemElem);
      }

      itemElem.remove();
      this.itemReduceContainer(parentElem);

      // update anchorElem
      if (updateAnchor && anchorIndex >= 0) {
        let anchorElem;

        // look forward for a suitable element
        for (let i = anchorIndex, I = itemElems.length; i < I; i++) {
          if (this.treeElem.contains(itemElems[i]) && !itemElems[i].closest('[hidden]')) {
            anchorElem = itemElems[i];
            break;
          }
        }

        if (!anchorElem) {
          // look backward for a suitable element if not found
          for (let i = anchorIndex - 1; i >= 0; i--) {
            if (this.treeElem.contains(itemElems[i]) && !itemElems[i].closest('[hidden]')) {
              anchorElem = itemElems[i];
              break;
            }
          }
        }

        if (anchorElem) {
          this.anchorItem(anchorElem);
        }
      }
    }
  }

  moveItem(id, currentParentId, currentIndex, targetParentId, targetIndex) {
    if (currentParentId === targetParentId) {
      // Don't use removeItem and insertItem to prevent parent toggler be
      // closed.
      // When moving inside the same parent, we can simply re-insert each
      // item element to the new position since the number of parent elements
      // must match.
      for (const parentElem of this.treeElem.querySelectorAll(`[data-id="${CSS.escape(currentParentId)}"]`)) {
        if (!(this.treeElem.contains(parentElem) && parentElem.container?.hasAttribute('data-loaded'))) { continue; }
        const container = parentElem.container;
        const itemElem = container.children[currentIndex];
        itemElem.remove();  // remove itemElem to get container.children recalculated
        container.insertBefore(itemElem, container.children[targetIndex]);
      }
    } else {
      // We can't simply insert elements to target parent since the number
      // of elements for currentParentId and targetParentId may not match.
      // A side effect is that the toggler of the moved item will be closed.
      this.removeItem(currentParentId, currentIndex);
      this.insertItem(id, targetParentId, targetIndex);
    }
  }

  keyboardNavigation(event) {
    super.keyboardNavigation(event);

    if (event.defaultPrevented) {
      return;
    }

    if (event.code === "ArrowLeft") {
      event.preventDefault();
      const anchorElem = this.anchorElem;
      if (!this.treeElem.contains(anchorElem) || anchorElem.closest('[hidden]')) {
        const itemElems = this.treeElem.querySelectorAll('li[data-id]');
        this.highlightItem(itemElems[0], true);
        return;
      }

      // toogle collapse if expanded
      if (anchorElem.container && !anchorElem.container.hidden) {
        this.toggleItem(anchorElem, false);
        this.saveViewStatus();
        this.scrollIntoView(anchorElem);
        return;
      }

      // move to closest parent
      let parent = this.getParent(anchorElem);
      if (parent === this.rootElem) {
        parent = null;
      }
      if (parent) {
        if (this.allowMultiSelect && event.shiftKey) {
          this.highlightItem(parent, true, {reselect: !event.ctrlKey, ranged: true});
        } else if (event.ctrlKey) {
          this.anchorItem(parent);
        } else {
          this.highlightItem(parent, true);
        }
        this.scrollIntoView(parent);
        return;
      }

      return;
    }

    if (event.code === "ArrowRight") {
      event.preventDefault();
      const anchorElem = this.anchorElem;
      if (!this.treeElem.contains(anchorElem) || anchorElem.closest('[hidden]')) {
        const itemElems = this.treeElem.querySelectorAll('li[data-id]');
        this.highlightItem(itemElems[0], true);
        return;
      }

      // toogle expand if collapsed
      if (anchorElem.container?.hidden) {
        this.toggleItem(anchorElem, true);
        this.saveViewStatus();
        this.scrollIntoView(anchorElem);
        return;
      }

      // move to first child
      const child = anchorElem.querySelector('li[data-id]');
      if (child) {
        if (this.allowMultiSelect && event.shiftKey) {
          this.highlightItem(child, true, {reselect: !event.ctrlKey, ranged: true});
        } else if (event.ctrlKey) {
          this.anchorItem(child);
        } else {
          this.highlightItem(child, true);
        }
        this.scrollIntoView(child);
      }

      return;
    }
  }

  async locate(id, path) {
    // Attempt to find a match from currently visible items; othwise lookup in
    // the whole tree.
    let curElem;
    for (const elem of this.treeElem.querySelectorAll(`[data-id="${CSS.escape(id)}"]`)) {
      if (elem.offsetParent) {
        curElem = elem;
        break;
      }
    }

    if (!curElem) {
      curElem = this.treeElem.querySelector(`[data-id="${CSS.escape(path[0].id)}"]`);
      for (let i = 1, I = path.length; i < I; ++i) {
        const {pos} = path[i];
        this.toggleItem(curElem, true);
        curElem = curElem.container.children[pos];
      }
    }

    // locate the item element
    this.scrollIntoView(curElem);
    this.highlightItem(curElem, true, {reselect: true});
    this.saveViewStatus();
  }

  onItemTogglerClick(event) {
    event.preventDefault();

    // Suppress default effect if there's a modifier when select is allowed.
    if (this.allowSelect) {
      if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) {
        return;
      }
    }

    // Do not bubble up to toggle the item.
    event.stopPropagation();

    const itemElem = event.currentTarget.parentNode.parentNode;
    this.toggleItem(itemElem);
    this.saveViewStatus();
  }

  onItemFolderClick(event) {
    event.preventDefault();

    // Suppress default effect if there's a modifier when select is allowed.
    if (this.allowSelect) {
      if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) {
        return;
      }
    }

    const toggler = event.currentTarget.previousSibling;
    if (!toggler) { return; }
    toggler.focus();
    toggler.click();
  }
}

return BookTree;

}));
