/******************************************************************************
 * Script for postit.html.
 *
 * @requires scrapbook
 * @requires server
 * @module editor
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  global.editor = factory(
    global.isDebug,
    global.scrapbook,
    global.server,
  );
}(this, function (isDebug, scrapbook, server) {

'use strict';

const editor = {
  id: null,
  bookId: null,
  lastContent: null,

  enableUi(willEnable) {
    document.getElementById('wrapper').disabled = !willEnable;
  },

  async init() {
    try {
      const params = new URL(document.URL).searchParams;
      const id = this.id = params.get('id');
      let bookId = this.bookId = params.get('bookId');

      await scrapbook.loadOptionsAuto;
      await server.init();

      if (typeof bookId !== 'string') {
        bookId = server.bookId;
      }

      const book = server.books[bookId];
      if (!book) {
        throw new Error(`Book "${bookId}" does not exist.`);
      }

      const meta = await book.loadMeta();

      const item = meta[id];
      if (!item) {
        throw new Error(`Item "${id}" does not exist.`);
      }

      if (item.type !== 'postit') {
        throw new Error(`Item "${id}" is not a postit.`);
      }

      if (!item.index) {
        throw new Error(`Index of item "${id}" does not exist.`);
      }

      document.title = item.title || '';

      try {
        const content = await book.loadPostit(item);
        this.lastContent = document.getElementById('editor').value = content;
      } catch (ex) {
        console.error(ex);
        throw new Error(`Unable to load postit: ${ex.message}`);
      }

      this.enableUi(true);

      document.getElementById('editor').focus();
    } catch (ex) {
      console.error(ex);
      alert(`Error: ${ex.message}`);
    }
  },

  async save() {
    try {
      this.enableUi(false);

      const content = document.getElementById("editor").value;
      if (content === this.lastContent) {
        return;
      }

      const {id, bookId} = this;
      const book = server.books[bookId];

      const {title} = await book.savePostit(id, content);

      await scrapbook.invokeExtensionScript({
        cmd: "background.onServerTreeChange",
      });

      // update document title
      document.title = title || '';

      this.lastContent = content;
    } catch (ex) {
      console.error(ex);
      alert(`Unable to save postit: ${ex.message}`);
    } finally {
      this.enableUi(true);
    }
  },

  async locate() {
    try {
      this.enableUi(false);

      const {id, bookId} = this;
      const book = server.books[bookId];

      const target = book.dataUrl + scrapbook.escapeFilename(book.meta[id].index);
      const response = await scrapbook.invokeExtensionScript({
        cmd: "background.locateItem",
        args: {url: target},
      });

      if (response === false) {
        alert(scrapbook.lang("ErrorLocateSidebarNotOpened"));
      } else if (response === null) {
        alert(scrapbook.lang("ErrorLocateNotFound"));
      }
      return response;
    } finally {
      this.enableUi(true);
    }
  },

  async exit() {
    try {
      this.enableUi(false);
      const tab = await browser.tabs.getCurrent();
      return await browser.tabs.remove(tab.id);
    } finally {
      this.enableUi(true);
    }
  },
};

document.addEventListener('DOMContentLoaded', (event) => {
  scrapbook.loadLanguages(document);

  document.getElementById('btn-save').addEventListener('click', (event) => {
    editor.save();
  });
  document.getElementById('btn-locate').addEventListener('click', (event) => {
    editor.locate();
  });
  document.getElementById('btn-exit').addEventListener('click', (event) => {
    editor.exit();
  });

  editor.init();
});

return editor;

}));
