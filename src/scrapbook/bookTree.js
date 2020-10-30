/******************************************************************************
 *
 * BookTree UI controller class.
 *
 * This is bound to a scrapbook (a Book instance in server.js) and constructs
 * the DOM tree according to it.
 *
 * @require {Object} scrapbook
 * @require {Object} server
 * @require {Class} Tree
 * @public {Class} BookTree
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  root.BookTree = factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    root.server,
    root.Tree,
    window,
    document,
    console,
  );
}(this, function (isDebug, browser, scrapbook, server, Tree, window, document, console) {

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

      // add TREE_CLASS to treeElem
      if (!treeElem.classList.contains(TREE_CLASS)) {
        treeElem.classList.add(TREE_CLASS);
      }

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

    async rebuild() {
      super.rebuild();
      if (this.book.config.no_tree) { return; }

      const rootElem = this.treeElem.appendChild(document.createElement('div'));
      rootElem.setAttribute('data-id', this.rootId);
      rootElem.container = rootElem.appendChild(document.createElement('ul'));
      rootElem.container.classList.add('container');
      this.toggleItem(rootElem, true);
      await this.loadViewStatus();
    }

    getViewStatusKey() {
      return {table: 'scrapbookTreeView', serverRoot: server.serverRoot, bookId: this.book.id, rootId: this.rootId};
    }

    async saveViewStatus() {
      const getXpathPos = (elem) => {
        const id = elem.getAttribute('data-id');
        let cur = elem, i = 0;
        while (cur) {
          if (cur.getAttribute('data-id') === id) { i++; }
          cur = cur.previousElementSibling;
        }
        return i;
      };

      const getXpaths = (elem, map) => {
        const path = [];
        let cur = elem;
        while (this.treeElem.contains(cur)) {
          path.unshift(`*[@data-id=${scrapbook.quoteXPath(cur.getAttribute('data-id'))}][${getXpathPos(cur)}]`);
          cur = cur.parentElement.parentElement;
        }

        for (let i = 0, I = path.length; i < I; ++i) {
          const subpath = path.slice(0, i + 1);
          const sel = './' + subpath.join('/ul/');
          if (!map.has(sel)) {
            map.set(sel, i === I - 1);
          }
        }
      };

      const saveViewStatus = async () => {
        const selects = {};
        const map = new Map();
        Array.prototype.forEach.call(
          this.treeElem.querySelectorAll('ul.container:not([hidden])'),
          x => getXpaths(x.parentElement, map)
        );
        for (const [k, v] of map.entries()) {
          selects[k] = v;
        }

        const key = this.getViewStatusKey();
        const data = {
          time: Date.now(),
          selects,
        };

        await scrapbook.cache.set(key, data, this.cacheType);
      };
      this.saveViewStatus = saveViewStatus;
      return await saveViewStatus();
    }

    async loadViewStatus() {
      try {
        const key = this.getViewStatusKey();
        const data = await scrapbook.cache.get(key, this.cacheType);

        if (!data) { return; }

        for (const [xpath, willOpen] of Object.entries(data.selects)) {
          const elem = document.evaluate(xpath, this.treeElem).iterateNext();
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

      const toggle = elem.toggle = document.createElement('a');
      toggle.href = '#';
      toggle.className = 'toggle';
      toggle.addEventListener('click', this.onItemTogglerClick);
      div.insertBefore(toggle, div.firstChild);

      const toggleImg = document.createElement('img');
      toggleImg.src = TOGGLER_ICON.collapsed;
      toggleImg.alt = '';
      toggle.appendChild(toggleImg);

      const container = elem.container = document.createElement('ul');
      container.className = 'container';
      container.hidden = true;
      elem.appendChild(container);
    }

    itemReduceContainer(elem) {
      if (!elem.container) { return; }
      if (elem.container.hasAttribute('data-loaded') && !elem.container.hasChildNodes()) {
        // remove toggle
        if (elem.toggle && elem.toggle.parentNode) {
          elem.toggle.remove();
        }

        // remove container
        elem.container.remove();
        delete elem.container;
      }
    }

    /**
     * Add an item which is already in the scrapbook to the tree DOM
     */
    addItem(id, parent, index = Infinity) {
      const meta = this.book.meta[id];
      if (!meta) {
        return null;
      }

      // create element and append to parent
      this.itemMakeContainer(parent);
      const elem = this._addItem(meta, parent.container, index);

      // set child container
      var childIdList = this.book.toc[meta.id];
      if (childIdList && childIdList.length) {
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
      if (willOpen && !container.hasAttribute('data-loaded'))  {
        if (this.book.toc[elem.getAttribute('data-id')]) {
          for (const id of this.book.toc[elem.getAttribute('data-id')]) {
            this.addItem(id, elem);
          }
        }
        container.setAttribute('data-loaded', '');
      }

      container.hidden = !willOpen;

      // toggle the toggler (twisty)
      // root item container's previousSibling is undefined
      if (container.previousSibling) {
        container.previousSibling.firstChild.firstChild.src = willOpen ?
        TOGGLER_ICON.expanded :
        TOGGLER_ICON.collapsed;
      }
    }

    getParentAndIndex(itemElem) {
      const parentItemElem = itemElem.parentNode.parentNode;
      const parentItemId = parentItemElem.getAttribute('data-id');
      const siblingItems = parentItemElem.container.children;
      const index = Array.prototype.indexOf.call(siblingItems, itemElem);
      return {parentItemElem, parentItemId, siblingItems, index}
    }

    refreshItem(id) {
      Array.prototype.forEach.call(
        this.treeElem.querySelectorAll(`[data-id="${CSS.escape(id)}"]`),
        (itemElem) => {
          this.refreshItemElem(itemElem, this.book.meta[id]);
        });
    }

    insertItem(id, parentId, index) {
      Array.prototype.forEach.call(
        this.treeElem.querySelectorAll(`[data-id="${CSS.escape(parentId)}"]`),
        (parentElem) => {
          this.itemMakeContainer(parentElem);
          if (!parentElem.container.hasAttribute('data-loaded')) { return; }
          this.addItem(id, parentElem, index);
        });
    }

    removeItem(parentId, index) {
      Array.prototype.filter.call(
        this.treeElem.querySelectorAll(`[data-id="${CSS.escape(parentId)}"]`),
        (parentElem) => {
          if (!(this.treeElem.contains(parentElem) && parentElem.container && parentElem.container.hasAttribute('data-loaded'))) { return; }
          const itemElem = parentElem.container.children[index];
          itemElem.remove();
          this.itemReduceContainer(parentElem);
        });
    }

    moveItem(id, currentParentId, currentIndex, targetParentId, targetIndex) {
      if (currentParentId === targetParentId) {
        // Don't use removeItem and insertItem to prevent parent toggler be
        // closed.
        // When moving inside the same parent, we can simply re-insert each
        // item element to the new position since the number of parent elements
        // must match.
        Array.prototype.filter.call(
          this.treeElem.querySelectorAll(`[data-id="${CSS.escape(currentParentId)}"]`),
          (parentElem) => {
            if (!(this.treeElem.contains(parentElem) && parentElem.container && parentElem.container.hasAttribute('data-loaded'))) { return; }
            const container = parentElem.container;
            const itemElem = container.children[currentIndex];
            itemElem.remove();  // remove itemElem to get container.children recalculated
            container.insertBefore(itemElem, container.children[targetIndex]);
          });
      } else {
        // We can't simply insert elements to target parent since the number
        // of elements for currentParentId and targetParentId may not match.
        // A side effect is that the toggler of the moved item will be closed.
        this.removeItem(currentParentId, currentIndex);
        this.insertItem(id, targetParentId, targetIndex);
      }
    }

    async locate(id, paths) {
      // Attempt to find a match from currently visible items; othwise lookup in
      // the whole tree.
      let curElem;
      for (const elem of this.treeElem.querySelectorAll(`[data-id="${scrapbook.escapeQuotes(id)}"]`)) {
        if (elem.offsetParent) {
          curElem = elem;
          break;
        }
      }

      if (!curElem) {
        const path = paths[0];
        curElem = this.treeElem.querySelector(`[data-id="${scrapbook.escapeQuotes(path[0].id)}"]`);
        for (let i = 1, I = path.length; i < I; ++i) {
          const {pos} = path[i];
          this.toggleItem(curElem, true);
          curElem = curElem.container.children[pos];
        }
      }

      // locate the item element
      curElem.scrollIntoView();
      this.highlightItem(curElem, true, true);
      this.saveViewStatus();

      return true;
    }

    onItemTogglerClick(event) {
      event.preventDefault();
      const toggling = !event.ctrlKey && !event.shiftKey;
      if (!toggling) { return; }

      event.stopPropagation();
      const itemElem = event.currentTarget.parentNode.parentNode;
      this.toggleItem(itemElem);
      this.saveViewStatus();
    }

    onItemFolderClick(event) {
      event.preventDefault();
      const toggler = event.currentTarget.previousSibling;
      if (!toggler) { return; }
      toggler.focus();
      toggler.click();
    }
  }

  return BookTree;

}));
