/******************************************************************************
 *
 * Script for postit-frame.html.
 *
 * @require {Object} scrapbook
 * @require {Object} server
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  root.editor = factory(
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

  const editor = {
    id: null,
    bookId: null,

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

        document.title = item.title || ' ';
        document.getElementById('header').textContent = item.title || '';

        try {
          const content = await book.loadPostit(item);
          document.getElementById('editor').value = content;
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
      const {id, bookId} = this;
      const book = server.books[bookId];
      return await book.savePostit(id, document.getElementById("editor").value);
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
