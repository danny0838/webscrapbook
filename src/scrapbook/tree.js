/******************************************************************************
 *
 * Scrapbook tree UI controller.
 *
 * @require {Object} scrapbook
 * @require {Object} server
 * @public {Class} Tree
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  root.Tree = factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    root.server,
    window,
    document,
    console,
  );
}(this, function (isDebug, browser, scrapbook, server, window, document, console) {

  'use strict';

  const ITEM_TYPE_ICON = {
    '': browser.runtime.getURL('resources/item.png'),
    'folder': browser.runtime.getURL('resources/fclose.png'),
    'file': browser.runtime.getURL('resources/file.png'),
    'image': browser.runtime.getURL('resources/file.png'),
    'note': browser.runtime.getURL('resources/note.png'),
    'postit': browser.runtime.getURL('resources/postit.png'),
  };

  const TOGGLER_ICON = {
    collapsed: browser.runtime.getURL('resources/collapse.png'),
    expanded: browser.runtime.getURL('resources/expand.png'),
  };

  class Tree {
    constructor({
      treeElem,
      cacheType = 'sessionStorage',
    }) {
      this.treeElem = treeElem;
      this.cacheType = cacheType;

      this.lastDraggedElems = null;
      this.lastHighlightElem = null;

      // bind on* event callbacks
      for (const funcName of Object.getOwnPropertyNames(Tree.prototype)) {
        if (funcName.startsWith('on')) {
          this[funcName] = this[funcName].bind(this);
        }
      }
    }

    init({
      book,
      rootId = 'root',
      allowSelect = true,
      allowMultiSelect = false,
      allowMultiSelectOnClick = false,
      allowAnchorClick = false,
      allowDrag = false,
      allowDrop = false,
      itemContextMenuCallback,
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
      this.allowDrag = allowDrag;
      this.allowDrop = allowDrop;
      this.itemContextMenuCallback = itemContextMenuCallback;
      this.itemAnchorClickCallback = itemAnchorClickCallback;
      this.itemDragOverCallback = itemDragOverCallback;
      this.itemDropCallback = itemDropCallback;
    }

    async rebuild() {
      this.treeElem.textContent = '';
      this.lastDraggedElems = null;
      this.lastHighlightElem = null;

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

    getLastSelectedItemElem() {
      return this.lastHighlightElem;
    }

    getSelectedItemElems() {
      return Array.prototype.map.call(
        this.treeElem.querySelectorAll('.highlight'),
        x => x.parentNode
      );
    }

    itemMakeContainer(elem) {
      if (elem.container) { return; }

      const div = elem.firstChild;

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

      // create element
      const elem = document.createElement('li');
      const div = elem.controller = elem.appendChild(document.createElement('div'));

      if (this.allowSelect) {
        div.addEventListener('click', this.onItemClick);
        div.addEventListener('mousedown', this.onItemMiddleClick);
      }

      div.addEventListener('contextmenu', this.onItemContextMenu);

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

      this.refreshItemElem(elem, meta);

      // set child container
      var childIdList = this.book.toc[meta.id];
      if (childIdList && childIdList.length) {
        this.itemMakeContainer(elem);
      }

      // append to parent element
      this.itemMakeContainer(parent);
      parent.container.insertBefore(elem, parent.container.children[index]);

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
      if (elem.toggle) { div.appendChild(elem.toggle); }

      if (meta.type !== 'separator') {
        var a = div.appendChild(document.createElement('a'));
        a.appendChild(document.createTextNode(meta.title || meta.id));
        a.title = (meta.title || meta.id) + (meta.source ? '\n' + meta.source : '') + (meta.comment ? '\n\n' + meta.comment : '');
        if (meta.type !== 'bookmark') {
          if (meta.index) { a.href = this.book.dataUrl + scrapbook.escapeFilename(meta.index); }
        } else {
          if (meta.source) {
            a.href = meta.source;
          } else {
            if (meta.index) { a.href = this.book.dataUrl + scrapbook.escapeFilename(meta.index); }
          }
        }
        if (meta.type === 'folder') {
          a.addEventListener('click', this.onItemFolderClick);
        } else {
          a.addEventListener('click', this.onItemAnchorClick);
        }

        var icon = a.insertBefore(document.createElement('img'), a.firstChild);
        if (meta.icon) {
          icon.src = /^(?:[a-z][a-z0-9+.-]*:|[/])/i.test(meta.icon || '') ? 
              meta.icon : 
              (this.book.dataUrl + scrapbook.escapeFilename(meta.index || '')).replace(/[/][^/]+$/, '/') + meta.icon;
        } else {
          icon.src = ITEM_TYPE_ICON[meta.type] || ITEM_TYPE_ICON[''];
        }
        icon.alt = '';
      } else {
        var line = div.appendChild(document.createElement('fieldset'));
        line.title = (meta.title || '') + (meta.source ? '\n' + meta.source : '') + (meta.comment ? '\n\n' + meta.comment : '');

        var legend = line.appendChild(document.createElement('legend'));
        if (meta.title) {
          legend.appendChild(document.createTextNode('\xA0' + meta.title + '\xA0'));
        }
      }
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

    highlightItem(itemElem,
      willHighlight = !itemElem.controller.classList.contains('highlight'),
      reselect = true,
      ranged = false,
    ) {
      if (!this.allowSelect) { return; }

      if (willHighlight) {
        if (reselect) {
          if (this.lastHighlightElem) {
            Array.prototype.forEach.call(this.treeElem.querySelectorAll('.highlight'), (elem) => {
              elem.classList.remove('highlight');
            });
          }
          itemElem.controller.classList.add('highlight');
          this.lastHighlightElem = itemElem;
        } else {
          if (!ranged) {
            itemElem.controller.classList.add('highlight');
            this.lastHighlightElem = itemElem;
          } else {
            const nodeIterator = document.createNodeIterator(
              this.treeElem,
              NodeFilter.SHOW_ELEMENT
            );
            let node, start = false, endItem;
            while (node = nodeIterator.nextNode()) {
              if (node.matches('li[data-id]')) {
                if (!start) {
                  if (node === itemElem) {
                    start = true;
                    endItem = this.treeElem.contains(this.lastHighlightElem) ? this.lastHighlightElem : itemElem;
                  } else if (node === this.lastHighlightElem) {
                    start = true;
                    endItem = itemElem;
                  }
                }
                if (start) {
                  node.controller.classList.add('highlight');
                  if (node === endItem) { break; }
                }
              }
            }
            this.lastHighlightElem = itemElem;
          }
        }
      } else {
        if (reselect) {
          if (this.lastHighlightElem) {
            Array.prototype.forEach.call(this.treeElem.querySelectorAll('.highlight'), (elem) => {
              elem.classList.remove('highlight');
            });
            this.lastHighlightElem = null;
          }
        } else {
          if (!ranged) {
            itemElem.controller.classList.remove('highlight');
            this.lastHighlightElem = itemElem;
          } else {
            const nodeIterator = document.createNodeIterator(
              this.treeElem,
              NodeFilter.SHOW_ELEMENT
            );
            let node, start = false, endItem;
            while (node = nodeIterator.nextNode()) {
              if (node.matches('li[data-id]')) {
                if (!start) {
                  if (node === itemElem) {
                    start = true;
                    endItem = this.treeElem.contains(this.lastHighlightElem) ? this.lastHighlightElem : itemElem;
                  } else if (node === this.lastHighlightElem) {
                    start = true;
                    endItem = itemElem;
                  }
                }
                if (start) {
                  node.controller.classList.remove('highlight');
                  if (node === endItem) { break; }
                }
              }
            }
            this.lastHighlightElem = itemElem;
          }
        }
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
          if (!this.treeElem.contains(parentElem)) { return; }
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

    moveUpItem(parentId, index) {
      Array.prototype.filter.call(
        this.treeElem.querySelectorAll(`[data-id="${CSS.escape(parentId)}"]`),
        (parentElem) => {
          if (!(this.treeElem.contains(parentElem) && parentElem.container && parentElem.container.hasAttribute('data-loaded'))) { return; }
          const itemElem = parentElem.container.children[index];
          itemElem.parentNode.insertBefore(itemElem, itemElem.previousSibling);
        });
    }

    moveDownItem(parentId, index) {
      Array.prototype.filter.call(
        this.treeElem.querySelectorAll(`[data-id="${CSS.escape(parentId)}"]`),
        (parentElem) => {
          if (!(this.treeElem.contains(parentElem) && parentElem.container && parentElem.container.hasAttribute('data-loaded'))) { return; }
          const itemElem = parentElem.container.children[index];
          itemElem.parentNode.insertBefore(itemElem, itemElem.nextSibling.nextSibling);
        });
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
        curElem = this.treeElem.querySelector(`[data-id="${scrapbook.escapeQuotes(paths[0][0].id)}"]`);
        for (let i = 1, I = paths[0].length; i < I; ++i) {
          const {pos} = paths[0][i];
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

    onItemDragStart(event) {
      const itemElem = event.currentTarget.parentNode;
      if (!itemElem.controller.classList.contains('highlight')) {
        this.highlightItem(event.currentTarget.parentNode, true, true);
      }

      const selectedItemElems = this.getSelectedItemElems();

      Array.prototype.forEach.call(selectedItemElems, (elem) => {
        elem.classList.add('dragged');
      });

      // Firefox requires at least one data to get dragging work
      event.dataTransfer.setData(
        'application/scrapbook.items+json',
        JSON.stringify({
          book: this.book.id,
          items: selectedItemElems.map(x => x.getAttribute('data-id')),
        })
      );
      event.dataTransfer.setData(
        'text/plain',
        selectedItemElems.map(x => x.getAttribute('data-id')).join('\r\n')
      );

      // prevent mis-intereprated as a regular link
      event.dataTransfer.clearData('text/uri-list');
      event.dataTransfer.clearData('text/html');

      event.dataTransfer.effectAllowed = 'all';
      this.lastDraggedElems = selectedItemElems;
    }

    onItemDragEnd(event) {
      if (!this.lastDraggedElems) { return; }

      Array.prototype.forEach.call(this.lastDraggedElems, (elem) => {
        elem.classList.remove('dragged');
      });
      this.lastDraggedElems = null;
    }

    onItemDragEnter(event) {
      const wrapper = event.currentTarget;
      if (!wrapper.classList.contains('dragover')) {
        wrapper.classList.add('dragover');
      }

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

        if (pos < 1/3) {
          if (!wrapper.classList.contains('above')) {
            wrapper.classList.add('above');
          }
          if (wrapper.classList.contains('below')) {
            wrapper.classList.remove('below');
          }
          if (wrapper.classList.contains('within')) {
            wrapper.classList.remove('within');
          }
        } else if (pos > 2/3) {
          if (wrapper.classList.contains('above')) {
            wrapper.classList.remove('above');
          }
          if (!wrapper.classList.contains('below')) {
            wrapper.classList.add('below');
          }
          if (wrapper.classList.contains('within')) {
            wrapper.classList.remove('within');
          }
        } else {
          if (wrapper.classList.contains('above')) {
            wrapper.classList.remove('above');
          }
          if (wrapper.classList.contains('below')) {
            wrapper.classList.remove('below');
          }
          if (!wrapper.classList.contains('within')) {
            wrapper.classList.add('within');
          }
        }
      }
    }

    onItemDragLeave(event) {
      event.stopPropagation();

      const wrapper = event.currentTarget;
      let enteredElem = event.relatedTarget;

      // In Firefox the relatedTarget could be a text node
      if (enteredElem && enteredElem.nodeType !== 1) {
        enteredElem = enteredElem.parentElement;
      }

      // skip when entering another descendant of the same dragover element
      if (enteredElem && enteredElem.closest('.dragover') === wrapper) {
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
      if (pos < 1/3) {
        // above
        const parentItemElem = itemElem.parentNode.parentNode;
        const siblingItems = parentItemElem.container.children;
        const index = Array.prototype.indexOf.call(siblingItems, itemElem);
        targetId = parentItemElem.getAttribute('data-id');
        targetIndex = index;
      } else if (pos > 2/3) {
        // below
        const parentItemElem = itemElem.parentNode.parentNode;
        const siblingItems = parentItemElem.container.children;
        const index = Array.prototype.indexOf.call(siblingItems, itemElem);
        targetId = parentItemElem.getAttribute('data-id');
        targetIndex = index + 1;
      } else {
        // within
        targetId = itemElem.getAttribute('data-id');
        targetIndex = Infinity;
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
    }

    onItemClick(event) {
      const itemElem = event.currentTarget.parentNode;
      const reselect = !this.allowMultiSelect || !this.allowMultiSelectOnClick && !event.ctrlKey && !event.shiftKey;
      const ranged = this.allowMultiSelect && event.shiftKey;
      this.highlightItem(itemElem, undefined, reselect, ranged);
    }

    onItemMiddleClick(event) {
      if (event.button !== 1) { return; }
      this.onItemClick(event);
    }

    onItemContextMenu(event) {
      const itemElem = event.currentTarget.parentNode;
      if (!itemElem.controller.classList.contains('highlight')) {
        this.highlightItem(event.currentTarget.parentNode, true, true);
      }

      // invoke callback
      if (this.itemContextMenuCallback) {
        this.itemContextMenuCallback.call(this, event, {
          tree: this,
        });
      }
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
      const target = event.currentTarget.previousSibling;
      target.focus();
      target.click();
    }

    onItemAnchorClick(event) {
      // return if not allowed
      if (!this.allowAnchorClick) {
        event.preventDefault();
        return;
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
