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
        x => x.parentNode
      );
    }

    getParent(itemElem) {
      return itemElem.parentNode.parentNode;
    }

    getParentAndIndex(itemElem) {
      const parentItemElem = itemElem.parentNode.parentNode;
      const parentItemId = parentItemElem.getAttribute('data-id');
      const siblingItems = parentItemElem.container.children;
      const index = Array.prototype.indexOf.call(siblingItems, itemElem);
      return {parentItemElem, parentItemId, siblingItems, index};
    }

    getItemUrl(elem) {
      const anchor = elem.anchor;
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
     */
    addItem(item, parent = this.rootElem.container, index = Infinity) {
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
          if (event.shiftKey && event.ctrlKey) {
            this.highlightItem(target, true, {reselect: false, ranged: true});
          } else if (event.shiftKey) {
            this.highlightItem(target, true, {reselect: true, ranged: true});
          } else if (event.ctrlKey) {
            this.anchorItem(target);
          } else {
            this.highlightItem(target, true);
          }
          target.scrollIntoView();
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
          if (event.shiftKey && event.ctrlKey) {
            this.highlightItem(target, true, {reselect: false, ranged: true});
          } else if (event.shiftKey) {
            this.highlightItem(target, true, {reselect: true, ranged: true});
          } else if (event.ctrlKey) {
            this.anchorItem(target);
          } else {
            this.highlightItem(target, true);
          }
          target.scrollIntoView();
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
          if (event.shiftKey && event.ctrlKey) {
            this.highlightItem(target, true, {reselect: false, ranged: true});
          } else if (event.shiftKey) {
            this.highlightItem(target, true, {reselect: true, ranged: true});
          } else if (event.ctrlKey) {
            this.anchorItem(target);
          } else {
            this.highlightItem(target, true);
          }
          target.scrollIntoView();
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
          if (event.shiftKey && event.ctrlKey) {
            this.highlightItem(target, true, {reselect: false, ranged: true});
          } else if (event.shiftKey) {
            this.highlightItem(target, true, {reselect: true, ranged: true});
          } else if (event.ctrlKey) {
            this.anchorItem(target);
          } else {
            this.highlightItem(target, true);
          }
          target.scrollIntoView();
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
          const willHighlight = event.shiftKey ? true : undefined;
          const reselect = event.ctrlKey ? !this.allowMultiSelect :
              event.shiftKey ? true :
              !(this.allowMultiSelect && this.allowMultiSelectOnClick);
          const ranged = this.allowMultiSelect && event.shiftKey;
          this.highlightItem(target, willHighlight, {reselect, ranged});
          target.scrollIntoView();
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
        if (anchorElem.anchor && anchorElem.anchor.hasAttribute('href')) {
          target = anchorElem.anchor;
        } else if (anchorElem.toggler && anchorElem.toggler.hasAttribute('href')) {
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

      event.clipboardData.setData(
        'application/scrapbook.items+json',
        JSON.stringify({
          src: this.book.server.serverRoot,

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
      event.clipboardData.setData(
        'text/plain',
        selectedItemElems.map(x => x.getAttribute('data-id')).join('\r\n')
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
        targetIndex = index + 1;
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
      event.dataTransfer.setData(
        'application/scrapbook.items+json',
        JSON.stringify({
          src: this.book.server.serverRoot,

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
