/******************************************************************************
 * Script for sitemap.html.
 *****************************************************************************/

import {SitemapBuilder} from "./sitemap.mjs";
import * as utils from "../utils/extension.mjs";
import {server} from "./server.mjs";

utils.loadOptionsAuto(); // async

const sitemap = {
  async init() {
    try {
      const params = new URL(document.URL).searchParams;
      let url = params.get('url');
      let id = this.id = params.get('id');
      let bookId = this.bookId = params.get('bookId');

      await utils.loadOptions();
      await server.init();

      if (typeof bookId !== 'string') {
        if (url) {
          bookId = this.bookId = await server.findBookIdFromUrl(url);
          if (typeof bookId !== 'string') {
            throw new Error(`Unable to find a valid book.`);
          }
        } else {
          bookId = server.bookId;
        }
      }

      const book = server.books[bookId];
      if (!book) {
        throw new Error(`Book "${bookId}" does not exist.`);
      }

      const meta = await book.loadMeta();

      if (typeof id !== 'string' && url) {
        const item = await book.findItemFromUrl(url);
        if (!item) {
          throw new Error(`Unable to find a valid item.`);
        }
        id = this.id = item.id;
      }

      const item = meta[id];
      if (!item) {
        throw new Error(`Item "${id}" does not exist.`);
      }

      document.title = utils.lang('SiteMapTitle', [item.id]);

      const indexUrl = await book.getItemIndexUrl(item, {checkMetaRefresh: false});
      const indexPages = new Set(['']);
      if (item.type === 'site') {
        try {
          let json;
          try {
            const target = new URL('index.json', indexUrl).href;
            json = await server.request({
              url: target,
              method: "GET",
            }).then(r => r.json());
          } catch (ex) {
            console.error(ex);
            throw new Error(`Unable to load index.json file: ${ex.message}`);
          }

          switch (json.version) {
            case 2:
            case 3: {
              if (json.indexPages) {
                for (const indexPage of json.indexPages) {
                  indexPages.add(indexPage);
                }
              }
              break;
            }
            default: {
              throw new Error(`Sitemap version ${json.version} not supported.`);
            }
          }
        } catch (ex) {
          console.error(`Failed to load indexes: ${ex.message}`);
        }
      }

      await SitemapBuilder.run(
        indexPages,
        indexUrl,
        document.querySelector('main'),
      );
    } catch (ex) {
      console.error(ex);
      alert(`Error: ${ex.message}`);
    }
  },
};

document.addEventListener('DOMContentLoaded', (event) => {
  utils.loadLanguages(document);

  sitemap.init();
});

/** @global */
globalThis.sitemap = sitemap;
