/******************************************************************************
 * Script for postit-frame.html.
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
      const bookId = this.bookId = params.get('bookId') || '';

      await scrapbook.loadOptionsAuto;
      await server.init();

      const book = server.books[bookId];
      if (!book) {
        throw new Error(`Specified book "${bookId}" does not exist.`);
      }

      const meta = await book.loadMeta();

      const item = meta[id];
      if (!item) {
        throw new Error(`Specified item "${id}" does not exist.`);
      }

      if (!item.index) {
        throw new Error(`Index of the specified item "${id}" does not exist.`);
      }

      document.title = item.title || '';
      if (item.title) {
        const headerElem = document.getElementById('header');
        headerElem.textContent = headerElem.title = item.title;
      }

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
    }
  },

  async save() {
    const content = document.getElementById("editor").value;
    if (content === this.lastContent) {
      return;
    }

    const {id, bookId} = this;
    const book = server.books[bookId];
    const {title} = await book.savePostit(id, content);
    document.title = title || '';
    this.lastContent = content;
  },

  async expand() {
    try {
      this.enableUi(false);

      await this.save();

      const u = new URL(browser.runtime.getURL("scrapbook/postit.html"));
      u.searchParams.append('id', this.id);
      u.searchParams.append('bookId', this.bookId);

      if (window.self === window.top) {
        location.assign(u.href);
        return;
      }

      const sidebar = window.parent.sidebar;
      await sidebar.openLink(u.href, true);
      await sidebar.uneditPostit(true);
    } finally {
      this.enableUi(true);
    }
  },

  async exit() {
    try {
      this.enableUi(false);

      await this.save();

      if (window.self === window.top) {
        const tab = await browser.tabs.getCurrent();
        return await browser.tabs.remove(tab.id);
      }

      const sidebar = window.parent.sidebar;
      await sidebar.uneditPostit(true);
    } finally {
      this.enableUi(true);
    }
  },
};

document.addEventListener('DOMContentLoaded', (event) => {
  scrapbook.loadLanguages(document);

  document.getElementById('btn-expand').addEventListener('click', (event) => {
    editor.expand();
  });

  document.getElementById('btn-exit').addEventListener('click', (event) => {
    editor.exit();
  });

  editor.init();
});

return editor;

}));
