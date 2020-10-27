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

      // add TREE_CLASS to treeElem
      if (!treeElem.classList.contains(TREE_CLASS)) {
        treeElem.classList.add(TREE_CLASS);
      }

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

      if (this.allowSelect) {
        if (!this.treeElem.classList.contains(TREE_CLASS_SELECTABLE)) {
          this.treeElem.classList.add(TREE_CLASS_SELECTABLE);
        }
      } else {
        this.treeElem.classList.remove(TREE_CLASS_SELECTABLE);
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

    getLastSelectedItemElem() {
      return this.lastHighlightElem;
    }

    getSelectedItemElems() {
      return Array.prototype.map.call(
        this.treeElem.querySelectorAll('.highlight'),
        x => x.parentNode
      );
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
      if (elem.toggle) { div.appendChild(elem.toggle); }

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
