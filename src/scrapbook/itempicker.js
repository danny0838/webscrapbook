/******************************************************************************
 *
 * Script for itempicker.html.
 *
 * @require {Object} scrapbook
 * @require {Object} server
 * @public {Object} itempicker
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  root.itempicker = factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    root.server,
    root.BookTree,
    window,
    document,
    console,
  );
}(this, function (isDebug, browser, scrapbook, server, BookTree, window, document, console) {

  'use strict';

  const itempicker = {
    targetTabId: null,
    targetCallback: null,
    bookId: null,
    tree: null,
    recentItemsKey: null,

    async init() {
      try {
        const params = new URL(document.URL).searchParams;
        this.targetTabId = parseInt(params.get('tid'), 10);
        this.targetCallback = params.get('cb');
        this.recentItemsKey = params.get('rkey');
        let bookId = this.bookId = params.get('bookId');

        if (!Number.isInteger(this.targetTabId)) {
          throw new Error(`Missing target tab ID.`);
        }

        if (!this.targetCallback) {
          throw new Error(`Missing callback.`);
        }

        await scrapbook.loadOptionsAuto;
        await server.init();

        if (typeof bookId !== 'string') {
          bookId = this.bookId = server.bookId;
        }

        const book = server.books[bookId];
        if (!book) {
          throw new Error(`Book "${bookId}" does not exist.`);
        }

        await book.loadTreeFiles();
        await book.loadToc();
        await book.loadMeta();

        const tree = this.tree = new BookTree({
          treeElem: document.getElementById('items'),
          cacheType: 'sessionStorage',
        });

        tree.init({
          book,
          rootId: 'root',
          allowSelect: true,
          allowMultiSelect: false,
          allowMultiSelectOnClick: false,
          allowAnchorClick: false,
          allowContextMenu: false,
          allowKeyboardNavigation: true,
          allowDrag: false,
          allowDrop: false,
          allowCopy: false,
          allowPaste: false,
        });
        await tree.rebuild();

        await this.loadRecentItems();

        this.enableUi(true);
        document.body.hidden = false;
      } catch (ex) {
        console.error(ex);
        alert(`Error: ${ex.message}`);
      }
    },

    async loadRecentItems() {
      if (!this.recentItemsKey) { return; }

      const bookId = this.bookId;
      const book = server.books[bookId];
      const key = {
        table: this.recentItemsKey,
        serverRoot: server.serverRoot,
        bookId,
      };
      const list = await scrapbook.cache.get(key);
      if (!(list && list.length)) { return; }

      const selector = document.getElementById('recent');
      const reachable = book.getReachableItems('root');
      for (const id of list.reverse()) {
        if (!reachable.has(id)) { continue; }
        const meta = book.meta[id];
        if (!meta) { continue; }

        const opt = selector.appendChild(document.createElement('option'));
        opt.value = id;
        opt.textContent = meta.title || id;
      }
      if (selector.children.length > 1) {
        selector.hidden = false;
      }
    },

    async saveRecentItems(id) {
      if (!this.recentItemsKey) { return; }

      const bookId = this.bookId;
      const book = server.books[bookId];

      const key = {
        table: this.recentItemsKey,
        serverRoot: server.serverRoot,
        bookId,
      };

      let list = await scrapbook.cache.get(key);
      list = new Set(list);
      list.delete(id);  // move to last if id already exists
      list.add(id);

      // remove bad items
      const reachable = book.getReachableItems('root');
      for (const id of list) {
        if (!reachable.has(id) || !book.meta[id]) {
          list.delete(id);
        }
      }

      list = [...list];

      // truncate the list to last n items
      const slicePos = list.length - scrapbook.getOption("scrapbook.itemPicker.recentItemsMax");
      if (slicePos > 0) {
        list = list.slice(slicePos);
      }

      await scrapbook.cache.set(key, list);
    },

    selectRecentItem(id) {
      const book = server.books[this.bookId];
      const rootId = this.tree.rootId;
      const path = book.findItemPaths(id, rootId).next().value;
      if (!path) {
        return;
      }
      this.tree.locate(id, path);
    },

    enableUi(willEnable) {
      document.getElementById('wrapper').disabled = !willEnable;
    },

    filterItems({types = null} = {}) {
      const cssElem = document.getElementById('item-filter');
      let cssRules = [];
      if (types) {
        cssRules.push(`#tree li[data-id] { display: none; }`);
        for (const type of types) {
          if (type === '') {
            cssRules.push(`#tree li[data-id]:not([data-type]) { display: block; }`);
          }
          cssRules.push(`#tree li[data-id][data-type="${CSS.escape(type)}"] { display: block; }`);
        }
      }
      cssElem.textContent = cssRules.join('\n');
    },

    async save() {
      try {
        this.enableUi(false);

        const bookId = this.bookId;
        const book = server.books[bookId];
        let id = 'root';
        let title = id;

        const elems = this.tree.getSelectedItemElems();
        if (elems.length) {
          id = elems[0].getAttribute('data-id');
          title = book.meta[id].title;
        }

        await this.saveRecentItems(id);

        await scrapbook.invokeContentScript({
          tabId: this.targetTabId,
          frameId: 0,
          cmd: this.targetCallback,
          args: {
            bookId,
            id,
            title,
          },
        });

        await this.exit();
      } finally {
        this.enableUi(true);
      }
    },

    async exit() {
      try {
        this.enableUi(false);

        if (this.target) {
          location.assign(this.target);
        } else {
          const tab = await browser.tabs.getCurrent();
          return browser.tabs.remove(tab.id);
        }
      } finally {
        this.enableUi(true);
      }
    },
  };

  document.addEventListener('DOMContentLoaded', (event) => {
    scrapbook.loadLanguages(document);
    itempicker.init();

    document.getElementById('btn-save').addEventListener('click', (event) => {
       itempicker.save();
    });
    document.getElementById('btn-exit').addEventListener('click', (event) => {
       itempicker.exit();
    });
    document.getElementById('recent').addEventListener('change', (event) => {
      const elem = event.target;
      itempicker.selectRecentItem(elem.value);
      elem.value = "";
    });
  });

  return itempicker;

}));
