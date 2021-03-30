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

  const REGEX_ITEM_POSTIT = new RegExp('^[\\S\\s]*?<pre>\\n?([^<]*(?:<(?!/pre>)[^<]*)*)\\n</pre>[\\S\\s]*$');
  const ITEM_POSTIT_FORMATTER = `\
<!DOCTYPE html><html><head>\
<meta charset="UTF-8">\
<meta name="viewport" content="width=device-width">\
<style>pre { white-space: pre-wrap; overflow-wrap: break-word; }</style>\
</head><body><pre>
%POSTIT_CONTENT%
</pre></body></html>`;

  const editor = {
    id: null,
    bookId: null,
    target: null,

    async init() {
      try {
        const params = new URL(document.URL).searchParams;
        const id = this.id = params.get('id');
        const bookId = this.bookId = params.get('bookId');

        await scrapbook.loadOptions();
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

        document.title = item.title || ' ';

        try {
          let target = this.target = book.dataUrl + scrapbook.escapeFilename(item.index);

          const text = await server.request({
            url: target + '?a=source',
            method: "GET",
          }).then(r => r.text());

          const content = this.getPostitContent(text);

          if (content === null) {
            throw new Error('malformatted note file');
          }

          document.getElementById('editor').value = scrapbook.unescapeHtml(content);
        } catch (ex) {
          console.error(ex);
          throw new Error(`Unable to load postit: ${ex.message}`);
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
        const book = server.books[bookId];

        await book.transaction({
          mode: 'refresh',
          callback: async (book, updated) => {
            const meta = await book.loadMeta(updated);

            const item = meta[id];
            if (!item) {
              throw new Error(`Specified item "${id}" does not exist.`);
            }

            // upload text content
            const text = document.getElementById("editor").value;
            const title = text.replace(/\n[\s\S]*$/, '');
            const content = ITEM_POSTIT_FORMATTER.replace(/%(\w*)%/gu, (_, key) => {
              let value;
              switch (key) {
                case '':
                  value = '%';
                  break;
                case 'POSTIT_CONTENT':
                  value = text;
                  break;
              }
              return value ? scrapbook.escapeHtml(value) : '';
            });

            await server.request({
              url: this.target + '?a=save',
              method: "POST",
              format: 'json',
              csrfToken: true,
              body: {
                text: scrapbook.unicodeToUtf8(content),
              },
            });

            // update item
            item.title = title;
            item.modify = scrapbook.dateToId();
            await book.saveMeta();

            if (scrapbook.getOption("indexer.fulltextCache")) {
              await server.requestSse({
                query: {
                  "a": "cache",
                  "book": book.id,
                  "item": item.id,
                  "fulltext": 1,
                  "inclusive_frames": scrapbook.getOption("indexer.fulltextCacheFrameAsPageContent"),
                  "no_lock": 1,
                  "no_backup": 1,
                },
                onMessage(info) {
                  if (['error', 'critical'].includes(info.type)) {
                    alert(`Error when updating fulltext cache: ${info.msg}`);
                  }
                },
              });
            }

            await book.loadTreeFiles(true);  // update treeLastModified

            // update document title
            document.title = title;
          },
        });
      } catch (ex) {
        console.error(ex);
        alert(`Unable to save document: ${ex.message}`);
      }
    },

    getPostitContent(text) {
      text = text.replace(/\r\n?/g, '\n');
      return text.replace(REGEX_ITEM_POSTIT, '$1');
    },
  };

  document.addEventListener('DOMContentLoaded', (event) => {
    scrapbook.loadLanguages(document);

    document.getElementById('btn-save').addEventListener('click', (event) => {
       editor.save();
    });

    editor.init();
  });

  return editor;

}));
