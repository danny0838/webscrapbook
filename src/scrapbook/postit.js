/******************************************************************************
 *
 * Script for postit.html.
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
        alert(`Error: ${ex.message}`);
      }
    },

    async save() {
      try {
        this.enableUi(false);

        const {id, bookId} = this;
        const book = server.books[bookId];

        const {title, errors} = await book.savePostit(id, document.getElementById("editor").value);

        // alert errors
        for (const error of errors) {
          alert(error);
        }

        // update document title
        document.title = title;
      } catch (ex) {
        console.error(ex);
        alert(`Unable to save document: ${ex.message}`);
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
