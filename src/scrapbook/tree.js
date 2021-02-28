/******************************************************************************
 *
 * Tree UI controller class.
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

  const TREE_CLASS = 'tree';
  const TREE_CLASS_SELECTABLE = 'selectable';

  const ITEM_TYPE_ICON = {
    '': browser.runtime.getURL('resources/item.png'),
    'folder': browser.runtime.getURL('resources/fclose.png'),
    'file': browser.runtime.getURL('resources/file.png'),
    'image': browser.runtime.getURL('resources/file.png'),
    'note': browser.runtime.getURL('resources/note.png'),
    'postit': browser.runtime.getURL('resources/postit.png'),
  };

  class Tree {
    constructor({
      treeElem,
    }) {
      this.treeElem = treeElem;
      this.lastDraggedElems = null;
      this.lastHighlightElem = null;

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
     * @param {Object} params.book
     * @param {string} params.book.id
     * @param {string} params.book.dataUrl
     */
    init({
      book,
      rootId = 'root',
      allowSelect = true,
      allowMultiSelect = false,
      allowMultiSelectOnClick = false,
      allowAnchorClick = false,
      allowContextMenu = false,
      allowDrag = false,
      allowDrop = false,
      contextMenuCallback,
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
      this.allowDrag = allowDrag;
      this.allowDrop = allowDrop;
      this.contextMenuCallback = contextMenuCallback;
      this.itemAnchorClickCallback = itemAnchorClickCallback;
      this.itemDragOverCallback = itemDragOverCallback;
      this.itemDropCallback = itemDropCallback;

      if (this.allowSelect) {
        this.treeElem.classList.add(TREE_CLASS_SELECTABLE);
      } else {
        this.treeElem.classList.remove(TREE_CLASS_SELECTABLE);
      }

      if (this.allowContextMenu) {
        this.treeElem.addEventListener('contextmenu', this.onContextMenu);
      }
    }

    rebuild() {
      this.treeElem.textContent = '';
      this.lastDraggedElems = null;
      this.lastHighlightElem = null;
    }

    getRootElem() {
      return this.treeElem.firstChild;
    }

    getSelectedItemElems() {
      return Array.prototype.map.call(
        this.treeElem.querySelectorAll('.highlight'),
        x => x.parentNode
      );
    }

    getParentAndIndex(itemElem) {
      const parentItemElem = itemElem.parentNode.parentNode;
      const parentItemId = parentItemElem.getAttribute('data-id');
      const siblingItems = parentItemElem.container.children;
      const index = Array.prototype.indexOf.call(siblingItems, itemElem);
      return {parentItemElem, parentItemId, siblingItems, index};
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
     * An internal method to add an item to DOM
     */
    _addItem(item, parent = this.getRootElem().container, index = Infinity) {
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
        a.appendChild(document.createTextNode(meta.title || meta.id));
        a.title = (meta.title || meta.id) + (meta.source ? '\n' + meta.source : '') + (meta.comment ? '\n\n' + meta.comment : '');
        if (meta.type === 'bookmark') {
          if (meta.source) {
            a.href = meta.source;
          } else {
            if (meta.index) { a.href = this.book.dataUrl + scrapbook.escapeFilename(meta.index); }
          }
        } else if (meta.type === 'postit') {
          if (meta.index) {
            const u = new URL(browser.runtime.getURL("scrapbook/postit.html"));
            u.searchParams.append('id', meta.id);
            u.searchParams.append('bookId', this.book.id);
            a.href = u.href;
          }
        } else {
          if (meta.index) { a.href = this.book.dataUrl + scrapbook.escapeFilename(meta.index); }
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

    highlightItem(itemElem,
      willHighlight = !itemElem.controller.classList.contains('highlight'),
      {reselect = true, ranged = false} = {},
    ) {
      if (!this.allowSelect) { return; }

      if (reselect) {
        Array.prototype.forEach.call(this.treeElem.querySelectorAll('.highlight'), (elem) => {
          elem.classList.remove('highlight');
        });
      }

      if (ranged) {
        const itemElems = this.treeElem.querySelectorAll('li[data-id]');
        let start = Array.prototype.indexOf.call(itemElems, this.lastHighlightElem);
        let end = Array.prototype.indexOf.call(itemElems, itemElem);
        if (start < 0) { start = end; }
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
        this.lastHighlightElem = itemElem;
        return;
      }

      if (willHighlight) {
        itemElem.controller.classList.add('highlight');
        this.lastHighlightElem = itemElem;
      } else {
        itemElem.controller.classList.remove('highlight');
        this.lastHighlightElem = null;
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

    onItemDragStart(event) {
      const itemElem = event.currentTarget.parentNode;
      if (!itemElem.controller.classList.contains('highlight')) {
        this.highlightItem(itemElem, true, {reselect: true});
      }

      const selectedItemElems = this.getSelectedItemElems();

      Array.prototype.forEach.call(selectedItemElems, (elem) => {
        elem.classList.add('dragged');
      });

      // Firefox requires at least one data to get dragging work
      event.dataTransfer.setData(
        'application/scrapbook.items+json',
        JSON.stringify({
          bookId: this.book.id,

          // may be undefined if not implemented or initialized
          treeLastModified: this.book.treeLastModified,

          items: selectedItemElems.map(elem => {
            const {parentItemId, index} = this.getParentAndIndex(elem);
            return {
              id: elem.getAttribute('data-id'),
              parentId: parentItemId,
              index,
            };
          }),
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

        if (pos < 1/3) {
          wrapper.classList.add('above');
          wrapper.classList.remove('below');
          wrapper.classList.remove('within');
        } else if (pos > 2/3) {
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
      this.highlightItem(itemElem, undefined, {reselect, ranged});
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
