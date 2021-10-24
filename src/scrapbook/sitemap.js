/******************************************************************************
 *
 * Script for sitemap.html.
 *
 * @require {Object} scrapbook
 * @require {Object} server
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  root.sitemap = factory(
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

  const SHADOW_ROOT_SUPPORTED = !!document.documentElement.attachShadow;
  const SITEMAP_DOCTYPE = new Set(["text/html", "application/xhtml+xml"]);

  const sitemap = {
    async init() {
      try {
        const params = new URL(document.URL).searchParams;
        let url = params.get('url');
        let id = this.id = params.get('id');
        let bookId = this.bookId = params.get('bookId');

        await scrapbook.loadOptions();
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

        document.title = scrapbook.lang('SiteMapTitle', [item.id]);

        const indexUrl = await book.getItemIndexUrl(item, {checkMetaRefresh: false});
        const indexPages = new Set(['index.html']);
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
              case 2: {
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
            console.error(`Failed to load sitemap: ${ex.message}\nHeuristically construct a sitemap from the index file instead...`);
          }
        }

        await this.loadSitemap(
          indexPages,
          indexUrl,
          document.querySelector('main'),
        );
      } catch (ex) {
        console.error(ex);
        alert(`Error: ${ex.message}`);
      }
    },

    async loadSitemap(indexPages, indexUrl, wrapper) {
      wrapper = wrapper.appendChild(document.createElement('ul'));

      const pages = new Set();
      const queue = [];

      const checkInterlinkingUrl = (url) => {
        if (scrapbook.isUrlAbsolute(url)) {
          return false;
        }
        if (url.startsWith('/') || url.startsWith('./') || url.startsWith('../') || url.startsWith('?') || url.startsWith('#')) {
          return false;
        }
        return true;
      };

      const addPage = (url, {
        type = 'anchor',
        label = null,
        title = null,
        parent = wrapper,
      } = {}) => {
        const [urlMain] = scrapbook.splitUrlByAnchor(url);
        if (pages.has(urlMain)) { return; }
        pages.add(urlMain);

        if (!label) {
          label = scrapbook.urlToFilename(url);
        }

        const li = parent.appendChild(document.createElement('li'));
        li.hidden = true;
        const anchor = li.appendChild(document.createElement('a'));
        anchor.href = url;
        anchor.className = type;
        anchor.textContent = label;
        if (title) { anchor.title = title; }
        anchor.target = 'sitemapitem';
        return anchor;
      };

      const loadPageMap = async (elem) => {
        const doc = await scrapbook.xhr({
          url: elem.href,
          responseType: 'document',
        }).then(xhr => xhr.response).catch(ex => null);

        // remove the element if not (X)HTML document
        if (!(doc && SITEMAP_DOCTYPE.has(doc.contentType))) {
          elem.parentNode.remove();
          return;
        }

        if (doc.title) {
          elem.textContent = doc.title;
        }

        elem.parentNode.hidden = false;

        const subqueue = [];
        const ul = elem.insertAdjacentElement('afterend', document.createElement('ul'));

        const items = loadLinks(doc, []);
        for (const {url, type, label, title} of items) {
          const anchor = addPage(url, {
            type,
            label,
            title,
            parent: ul,
          });
          if (anchor) {
            subqueue.push(anchor);
          }
        }
        while (subqueue.length) {
          queue.push(subqueue.pop());
        }
      };

      const loadLinks = (doc, items) => {
        // meta refresh doesn't work in a shadowroot
        for (const elem of doc.querySelectorAll('meta[http-equiv="refresh" i][content]')) {
          const {time, url} = scrapbook.parseHeaderRefresh(elem.getAttribute("content"));
          if (!checkInterlinkingUrl(url)) { continue; }
          items.push({
            url: new URL(url, doc.URL).href,
            type: 'refresh',
          });
        }

        const frameItems = [];
        const anchorItems = [];
        loadLinksRecursively(doc, frameItems, anchorItems);
        for (const item of frameItems) {
          items.push(item);
        }
        for (const item of anchorItems) {
          items.push(item);
        }

        return items;
      };

      const loadLinksRecursively = (rootNode, frameItems, anchorItems) => {
        for (const elem of rootNode.querySelectorAll('frame[src], iframe[src], object[data]')) {
          const type = elem.nodeName.toLowerCase() === 'object' ? 'object' : 'frame';
          const urlProp = type === 'object' ? 'data' : 'src';
          const url = elem.getAttribute(urlProp);
          if (!checkInterlinkingUrl(url)) { continue; }
          frameItems.push({
            url: elem[urlProp],
            type,
          });
        }

        for (const elem of rootNode.querySelectorAll('a[href], area[href]')) {
          const url = elem.getAttribute('href');
          if (!checkInterlinkingUrl(url)) { continue; }
          anchorItems.push({
            url: elem.href,
            type: 'anchor',
            title: elem.textContent,
          });
        }

        // recurse into shadow roots
        if (SHADOW_ROOT_SUPPORTED) {
          for (const elem of rootNode.querySelectorAll('[data-scrapbook-shadowdom]')) {
            const shadowRoot = elem.attachShadow({mode: 'open'});
            shadowRoot.innerHTML = elem.getAttribute('data-scrapbook-shadowdom');
            loadLinksRecursively(shadowRoot, frameItems, anchorItems);
          }
        }
      };

      for (const indexPage of indexPages) {
        const url = new URL(scrapbook.quote(indexPage), indexUrl).href;
        const anchor = addPage(url, {
          label: indexPage,
          parent: wrapper,
        });
        if (anchor) {
          await loadPageMap(anchor);
        }

        while (queue.length) {
          const anchor = queue.pop();
          await loadPageMap(anchor);
        }
      }

      for (const elem of wrapper.querySelectorAll('ul')) {
        if (!elem.firstChild) {
          elem.remove();
        }
      }
    },
  };

  document.addEventListener('DOMContentLoaded', (event) => {
    scrapbook.loadLanguages(document);

    sitemap.init();
  });

  return sitemap;

}));
