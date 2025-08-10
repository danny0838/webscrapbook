/******************************************************************************
 * Script for edit.html.
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
  target: null,

  enableUi(willEnable) {
    document.getElementById('wrapper').disabled = !willEnable;
  },

  async init() {
    try {
      const params = new URL(document.URL).searchParams;
      const id = this.id = params.get('id');
      let bookId = this.bookId = params.get('bookId');
      let file = params.get('file');
      let checkRedirect = !file;

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

      file = file || item.index;
      if (file === item.index) {
        document.title = scrapbook.lang('EditTitle', [item.id]);
      } else {
        document.title = scrapbook.lang('EditTitleWithFile', [item.id, file]);
      }

      try {
        let target = this.target = checkRedirect ?
          await book.getItemIndexUrl(item) :
          book.dataUrl + scrapbook.escapeFilename(file);

        const text = await server.request({
          url: target + '?a=source',
          method: "GET",
        }).then(r => r.text());
        document.getElementById('editor').value = text;
      } catch (ex) {
        console.error(ex);
        throw new Error(`Unable to load specified file "${file}": ${ex.message}`);
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

      await book.transaction({
        mode: 'refresh',
        callback: async (book, {updated}) => {
          const meta = await book.loadMeta(updated);
          if (!meta[id]) {
            throw new Error(`Specified item "${id}" does not exist.`);
          }

          // upload text content
          const content = document.getElementById("editor").value;
          await server.request({
            url: this.target + '?a=save',
            method: "POST",
            format: 'json',
            csrfToken: true,
            body: {
              text: scrapbook.unicodeToUtf8(content),
            },
          });

          // update book
          await server.request({
            query: {
              a: 'query',
              lock: '',
            },
            body: {
              q: JSON.stringify({
                book: book.id,
                cmd: 'update_item',
                kwargs: {
                  item: {id},
                },
              }),
              auto_cache: JSON.stringify(scrapbook.autoCacheOptions()),
            },
            method: 'POST',
            format: 'json',
            csrfToken: true,
          });
        },
      });

      await scrapbook.invokeExtensionScript({
        cmd: "background.onServerTreeChange",
      });
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
      const response = await scrapbook.invokeExtensionScript({
        cmd: "background.locateItem",
        args: {url: this.target},
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
