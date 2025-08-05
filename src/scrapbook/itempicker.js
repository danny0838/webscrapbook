/******************************************************************************
 * Script for itempicker.html.
 *
 * @requires scrapbook
 * @requires server
 * @module itempicker
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  global.itempicker = factory(
    global.isDebug,
    global.scrapbook,
    global.dialog,
    global.server,
    global.BookTree,
  );
}(this, function (isDebug, scrapbook, dialog, server, BookTree) {

'use strict';

const dialogOnLoad = dialog.onLoad;

Object.assign(dialog, {
  async init(args) {
    const {promise, resolve} = Promise.withResolvers();
    this.resolve = resolve;
    itempicker.init(args);
    return await promise;
  },

  onLoad(event) {
    dialogOnLoad.call(this);

    document.getElementById('recent').addEventListener('change', (event) => {
      const elem = event.target;
      itempicker.selectRecentItem(elem.value);
      elem.value = "";
    });
  },

  onSubmit(event) {
    itempicker.save();
  },
});

const itempicker = {
  bookId: null,
  tree: null,
  recentItemsKey: null,

  async init({bookId, recentItemsKey, withRelation = false}) {
    try {
      this.recentItemsKey = recentItemsKey;
      this.bookId = bookId;

      document.getElementById('relation').hidden = !withRelation;

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
      tree.treeElem.focus();
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
    if (!list?.length) { return; }

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
      let title;
      let index;

      const [itemElem] = this.tree.getSelectedItemElems();
      if (itemElem) {
        const pickedId = this.tree.getItemId(itemElem);

        // apply relation
        const relation = document.getElementById('relation').value;
        switch (relation) {
          case 'above': {
            id = this.tree.getItemId(this.tree.getParent(itemElem));
            index = this.tree.getIndex(itemElem);
            break;
          }
          case 'below': {
            id = this.tree.getItemId(this.tree.getParent(itemElem));
            index = this.tree.getIndex(itemElem) + 1;
            break;
          }
          case 'within':
          default: {
            id = pickedId;
            break;
          }
        }

        title = book.meta[id] && book.meta[id].title;

        await this.saveRecentItems(pickedId);
      }

      dialog.close({
        bookId,
        id,
        title,
        index,
      });
    } finally {
      this.enableUi(true);
    }
  },
};

return itempicker;

}));
