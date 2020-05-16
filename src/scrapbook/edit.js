/******************************************************************************
 *
 * Script for edit.html.
 *
 * @require {Object} scrapbook
 * @require {Object} server
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  root.tree = factory(
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
    target: null,

    async init() {
      try {
        const params = new URL(document.URL).searchParams;
        const id = this.id = params.get('id');
        const bookId = this.bookId = params.get('bookId');
        let file = params.get('file');
        let checkMetaRefresh = !file;

        await scrapbook.loadOptions();
        await server.init(true);

        const book = server.books[bookId];
        if (!book) {
          throw new Error(`Specified book "${bookId}" does not exist.`);
        }

        const meta = await book.loadMeta(true);

        const item = meta[id];
        if (!item) {
          throw new Error(`Specified item "${id}" does not exist.`);
        }

        file = file || item.index;
        if (file === item.index) {
          document.title = scrapbook.lang('EditTitle', [item.id]);
        } else {
          document.title = scrapbook.lang('EditTitleWithFile', [item.id, file]);
        }

        try {
          let target = this.target = book.dataUrl + scrapbook.escapeFilename(file);

          if (checkMetaRefresh && target.endsWith('.html')) {
            const redirectedTarget = await server.getMetaRefreshTarget(target);
            if (redirectedTarget) {
              target = this.target = scrapbook.splitUrlByAnchor(redirectedTarget)[0];
            }
          }

          const text = await server.request({
            url: target + '?a=source',
            method: "GET",
          }).then(r => r.text());
          document.getElementById('editor').value = text;
        } catch (ex) {
          console.error(ex);
          throw new Error(`Unable to load specified file "${file}": ${ex.message}`);
        }

        Array.prototype.forEach.call(
          document.getElementById('toolbar').querySelectorAll(':disabled'),
          (elem) => {
            elem.disabled = false;
          });
      } catch (ex) {
        console.error(ex);
        alert(`Error: ${ex.message}`);
      }
    },

    async save() {
      try {
        const {id, bookId} = this;

        // acquire a lock
        await server.lockTree();

        try {
          // reload and check whether context is still valid
          await server.init(true);

          const book = server.books[bookId];
          if (!book) {
            throw new Error(`Specified book "${bookId}" does not exist.`);
          }

          const meta = await book.loadMeta(true);

          const item = meta[id];
          if (!item) {
            throw new Error(`Specified item "${id}" does not exist.`);
          }

          // upload text content
          const content = document.getElementById("editor").value;
          const formData = new FormData();
          formData.append('token', await server.acquireToken());
          formData.append('text', scrapbook.unicodeToUtf8(content));
          await server.request({
            url: this.target + '?a=save&f=json',
            method: "POST",
            body: formData,
          });

          // update item
          item.modify = scrapbook.dateToId();
          await book.saveMeta();
        } catch (ex) {
          await server.unlockTree();
          throw ex;
        }

        // release the lock
        await server.unlockTree();
      } catch (ex) {
        console.error(ex);
        alert(`Unable to save document: ${ex.message}`);
      }
    },

    async exit() {
      if (this.target) {
        location.assign(this.target);
      } else {
        const tab = await browser.tabs.getCurrent();
        return browser.tabs.remove(tab.id);
      }
    },
  };

  document.addEventListener('DOMContentLoaded', (event) => {
    scrapbook.loadLanguages(document);

    document.getElementById('btn-save').addEventListener('click', (event) => {
       editor.save();
    });
    document.getElementById('btn-exit').addEventListener('click', (event) => {
       editor.exit();
    });

    editor.init();
  });

  return editor;

}));
