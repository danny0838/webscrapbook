import {
  MochaQuery as $, assert,
  htmlRegex,
  createDocFixture, createIframeFixture,
} from "./unittest.mjs";
import sinon from "./lib/sinon-esm.js";
import {NS_HTML, NS_SVG, NS_XLINK, NS_MATHML} from "../utils/common.mjs";
import * as utils from "../utils/common.mjs";

import {DocumentLinksReader, SitemapBuilder} from "../scrapbook/sitemap.mjs";

const $describe = $(describe);

class TestSitemapBuilder extends SitemapBuilder {
  constructor(pageMap, ...args) {
    super(...args);
    this.__pageMap = pageMap;
  }

  async loadPage(url) {
    return this.__pageMap[url] ?? null;
  }
}

describe('scrapbook/sitemap.mjs', function () {
  afterEach(function () {
    sinon.restore();

    for (const elem of document.querySelectorAll('iframe')) {
      elem.remove();
    }
  });

  $describe.skipIf($.noBrowser)('DocumentLinksReader', function () {
    const docUrl = 'http://localhost:8000/';

    describe('.read()', function () {
      function testLinksReader(options) {
        var doc = createDocFixture(options);
        sinon.stub(doc, 'URL').value(docUrl);
        return DocumentLinksReader.read(doc);
      }

      context('for <a>', function () {
        it('should include a[href]', async function () {
          var items = testLinksReader({name: 'a', attrs: {href: 'index_1.html'}, value: 'foo'});
          assert.deepEqual(items, [{
            url: 'http://localhost:8000/index_1.html',
            type: 'anchor',
            title: 'foo',
          }]);
        });

        it('should ignore a[href][download]', async function () {
          var items = testLinksReader({name: 'a', attrs: {href: 'file.html', download: ''}, value: 'foo'});
          assert.deepEqual(items, []);
        });
      });

      context('for <area>', function () {
        it('should include area[href]', async function () {
          var items = testLinksReader({name: 'area', attrs: {href: 'index_1.html'}, value: 'foo'});
          assert.deepEqual(items, [{
            url: 'http://localhost:8000/index_1.html',
            type: 'anchor',
          }]);
        });

        it('should ignore area[href][download]', async function () {
          var items = testLinksReader({name: 'area', attrs: {href: 'file.html', download: ''}, value: 'foo'});
          assert.deepEqual(items, []);
        });
      });

      context('for <meta>', function () {
        it('should include meta refresh', async function () {
          var items = testLinksReader({name: 'meta', attrs: {
            'http-equiv': 'refresh',
            'content': '1; url=page.html',
          }});
          assert.deepEqual(items, [{
            url: 'http://localhost:8000/page.html',
            type: 'refresh',
          }]);
        });
      });

      context('for <iframe>', function () {
        it('should include iframe[src]', async function () {
          var items = testLinksReader({name: 'iframe', attrs: {src: 'index_1.html'}});
          assert.deepEqual(items, [{
            url: 'http://localhost:8000/index_1.html',
            type: 'iframe',
          }]);
        });

        it('should ignore iframe[srcdoc]', async function () {
          var items = testLinksReader({name: 'iframe', attrs: {src: 'index_1.html', srcdoc: 'foo'}});
          assert.deepEqual(items, []);
        });
      });

      context('for <frame>', function () {
        it('should include frame[src]', async function () {
          var items = testLinksReader({
            name: 'html',
            children: [
              {name: 'frameset', attrs: {cols: '100%'}, children: [
                {name: 'frame', attrs: {src: 'index_1.html'}},
              ]},
            ],
          });
          assert.deepEqual(items, [{
            url: 'http://localhost:8000/index_1.html',
            type: 'frame',
          }]);
        });
      });

      context('for <embed>', function () {
        it('should include embed[src]', async function () {
          var items = testLinksReader({name: 'embed', attrs: {src: 'index_1.html'}});
          assert.deepEqual(items, [{
            url: 'http://localhost:8000/index_1.html',
            type: 'embed',
          }]);
        });
      });

      context('for <object>', function () {
        it('should include object[data]', async function () {
          var items = testLinksReader({name: 'object', attrs: {data: 'index_1.html'}});
          assert.deepEqual(items, [{
            url: 'http://localhost:8000/index_1.html',
            type: 'object',
          }]);
        });
      });

      context('for <svg:a>', function () {
        it('should include a[href]', async function () {
          var items = testLinksReader({ns: NS_SVG, name: 'svg', children: [
            {ns: NS_SVG, name: 'a', attrs: {href: 'index_1.html'}},
          ]});
          assert.deepEqual(items, [{
            url: 'http://localhost:8000/index_1.html',
            type: 'anchor',
          }]);
        });

        it('should include a[xlink:href]', async function () {
          var items = testLinksReader({ns: NS_SVG, name: 'svg', children: [
            {ns: NS_SVG, name: 'a', attrs: [['xlink:href', 'index_1.html', NS_XLINK]]},
          ]});
          assert.deepEqual(items, [{
            url: 'http://localhost:8000/index_1.html',
            type: 'anchor',
          }]);
        });
      });

      context('for <math>', function () {
        it('should include *[href]', async function () {
          var items = testLinksReader({ns: NS_MATHML, name: 'math', children: [
            {ns: NS_MATHML, name: 'mrow', attrs: {href: 'index_1.html'}},
          ]});
          assert.deepEqual(items, [{
            url: 'http://localhost:8000/index_1.html',
            type: 'anchor',
          }]);
        });
      });

      context('shadow DOMs handling', function () {
        it('should include links in a shadow DOM', async function () {
          var items = testLinksReader({name: 'div', shadow: {
            virtual: true,
            children: [
              {name: 'a', attrs: {href: 'index_1.html'}, value: 'foo'},
            ],
          }});
          assert.deepEqual(items, [{
            url: 'http://localhost:8000/index_1.html',
            type: 'anchor',
            title: 'foo',
          }]);
        });

        it('should include links in a deep shadow DOM', async function () {
          var items = testLinksReader({name: 'div', shadow: {
            virtual: true,
            children: [
              {name: 'div', shadow: {
                virtual: true,
                children: [
                  {name: 'a', attrs: {href: 'index_1.html'}, value: 'foo'},
                ],
              }},
            ],
          }});
          assert.deepEqual(items, [{
            url: 'http://localhost:8000/index_1.html',
            type: 'anchor',
            title: 'foo',
          }]);
        });
      });
    });

    describe('#checkInterlinkingUrl()', function () {
      let reader;

      beforeEach(function () {
        reader = new DocumentLinksReader();
      });

      it('should return true for scrapbook interlinking URLs', async function () {
        assert.isTrue(reader.checkInterlinkingUrl('index_1.html'));
        assert.isTrue(reader.checkInterlinkingUrl('page.html'));
        assert.isTrue(reader.checkInterlinkingUrl('page-1.html'));
      });

      it('should return false for falsy values', async function () {
        assert.isFalse(reader.checkInterlinkingUrl(''));
        assert.isFalse(reader.checkInterlinkingUrl(null));
        assert.isFalse(reader.checkInterlinkingUrl());
      });

      it('should return false for absolute links', async function () {
        assert.isFalse(reader.checkInterlinkingUrl('http://example.com/page.html'));
        assert.isFalse(reader.checkInterlinkingUrl('https://example.com/page.html'));
        assert.isFalse(reader.checkInterlinkingUrl('file:///www/page.html'));
        assert.isFalse(reader.checkInterlinkingUrl('mailto:foo@gmail.com'));
        assert.isFalse(reader.checkInterlinkingUrl('data:test/plain,foo'));
        assert.isFalse(reader.checkInterlinkingUrl('urn:scrapbook:download:error:http://example.com/page.html'));
      });

      it('should return false for other relative links', async function () {
        assert.isFalse(reader.checkInterlinkingUrl('//example.com/page.html'));
        assert.isFalse(reader.checkInterlinkingUrl('/page.html'));
        assert.isFalse(reader.checkInterlinkingUrl('./page.html'));
        assert.isFalse(reader.checkInterlinkingUrl('../page.html'));
        assert.isFalse(reader.checkInterlinkingUrl('page.html?id=5'));
        assert.isFalse(reader.checkInterlinkingUrl('?foo'));
        assert.isFalse(reader.checkInterlinkingUrl('#foo'));
      });
    });
  });

  $describe.skipIf($.noBrowser)('SitemapBuilder', function () {
    async function testBuilder({
      pageMap = {},
      indexPages = new Set(['', 'index.html']),
      indexUrl = `${docUrl}index.html`,
      expected,
    } = {}) {
      var doc = createDocFixture({name: 'main'});
      var main = doc.querySelector('main');
      await TestSitemapBuilder.run(
        createResMap(pageMap),
        indexPages,
        indexUrl,
        main,
      );
      assert.match(main.innerHTML, expected);
    }

    function createResMap(map) {
      const rv = {};
      for (const [url, docData] of Object.entries(map)) {
        var doc = createDocFixture(docData);
        sinon.stub(doc, 'URL').value(url);
        rv[url] = doc;
      }
      return rv;
    }

    const docUrl = 'http://localhost:8000/book/2020/';

    it('should list index pages with their titles', async function () {
      await testBuilder({
        pageMap: {
          [`${docUrl}index.html`]: {name: 'title', value: 'IndexPage'},
          [`${docUrl}page1.html`]: {name: 'title', value: 'Page1'},
          [`${docUrl}page2.html`]: {name: 'title', value: 'Page2'},
          [`${docUrl}page3.html`]: {name: 'title', value: 'Page3'},
        },
        indexPages: new Set(['', 'index.html', 'page1.html', 'page2.html', 'page3.html']),
        expected: htmlRegex`
          <ul>
            <li><a href="http://localhost:8000/book/2020/index.html" class="anchor">IndexPage</a></li>
            <li><a href="http://localhost:8000/book/2020/page1.html" class="anchor">Page1</a></li>
            <li><a href="http://localhost:8000/book/2020/page2.html" class="anchor">Page2</a></li>
            <li><a href="http://localhost:8000/book/2020/page3.html" class="anchor">Page3</a></li>
          </ul>
        `,
      });
    });

    it('should show last URL part as title if no title', async function () {
      await testBuilder({
        pageMap: {
          [`${docUrl}index.html`]: {name: 'div'},
          [`${docUrl}page1.html`]: {name: 'div'},
        },
        indexPages: new Set(['', 'index.html', 'page1.html']),
        expected: htmlRegex`
          <ul>
            <li><a href="http://localhost:8000/book/2020/index.html" class="anchor">index.html</a></li>
            <li><a href="http://localhost:8000/book/2020/page1.html" class="anchor">page1.html</a></li>
          </ul>
        `,
      });
    });

    it('should add links as descendant lists', async function () {
      await testBuilder({
        pageMap: {
          [`${docUrl}index.html`]: {
            name: 'html',
            children: [
              {name: 'head', children: [
                {name: 'title', value: 'IndexPage'},
              ]},
              {name: 'body', children: [
                {name: 'a', attrs: {href: 'page1.html'}},
                {name: 'a', attrs: {href: 'page2.html'}},
              ]},
            ],
          },
          [`${docUrl}page1.html`]: {
            name: 'html',
            children: [
              {name: 'head', children: [
                {name: 'title', value: 'Page1'},
              ]},
              {name: 'body', children: [
                {name: 'a', attrs: {href: 'page1-1.html'}},
                {name: 'a', attrs: {href: 'page1-2.html'}},
              ]},
            ],
          },
          [`${docUrl}page1-1.html`]: {name: 'title', value: 'Page1-1'},
          [`${docUrl}page1-2.html`]: {name: 'title', value: 'Page1-2'},
          [`${docUrl}page2.html`]: {name: 'title', value: 'Page2'},
        },
        expected: htmlRegex`
          <ul>
            <li><a href="http://localhost:8000/book/2020/index.html" class="anchor">IndexPage</a><ul>
              <li><a href="http://localhost:8000/book/2020/page1.html" class="anchor">Page1</a><ul>
                <li><a href="http://localhost:8000/book/2020/page1-1.html" class="anchor">Page1-1</a></li>
                <li><a href="http://localhost:8000/book/2020/page1-2.html" class="anchor">Page1-2</a></li>
              </ul></li>
              <li><a href="http://localhost:8000/book/2020/page2.html" class="anchor">Page2</a></li>
            </ul></li>
          </ul>
        `,
      });
    });

    it('should add links in order of refreshes > frames > links', async function () {
      await testBuilder({
        pageMap: {
          [`${docUrl}index.html`]: {
            name: 'html',
            children: [
              {name: 'head', children: [
                {name: 'meta', attrs: {
                  'http-equiv': 'refresh',
                  'content': '1; url=refresh1.html',
                }},
                {name: 'title', value: 'IndexPage'},
              ]},
              {name: 'body', children: [
                {name: 'a', attrs: {href: 'page1.html'}},
                {name: 'iframe', attrs: {src: 'frame1.html'}},
              ]},
            ],
          },
          [`${docUrl}page1.html`]: {name: 'title', value: 'Page1'},
          [`${docUrl}frame1.html`]: {name: 'title', value: 'Frame1'},
          [`${docUrl}refresh1.html`]: {name: 'title', value: 'Refresh1'},
        },
        expected: htmlRegex`
          <ul>
            <li><a href="http://localhost:8000/book/2020/index.html" class="anchor">IndexPage</a><ul>
              <li><a href="http://localhost:8000/book/2020/refresh1.html" class="refresh">Refresh1</a></li>
              <li><a href="http://localhost:8000/book/2020/frame1.html" class="iframe">Frame1</a></li>
              <li><a href="http://localhost:8000/book/2020/page1.html" class="anchor">Page1</a></li>
            </ul></li>
          </ul>
        `,
      });
    });

    it('should ignore duplicate links', async function () {
      await testBuilder({
        pageMap: {
          [`${docUrl}index.html`]: {
            name: 'html',
            children: [
              {name: 'head', children: [
                {name: 'title', value: 'IndexPage'},
              ]},
              {name: 'body', children: [
                {name: 'a', attrs: {href: 'page1.html'}},
                {name: 'a', attrs: {href: 'page2.html'}},
              ]},
            ],
          },
          [`${docUrl}page1.html`]: {
            name: 'html',
            children: [
              {name: 'head', children: [
                {name: 'title', value: 'Page1'},
              ]},
              {name: 'body', children: [
                {name: 'a', attrs: {href: 'page2.html'}},
                {name: 'a', attrs: {href: 'page3.html'}},
              ]},
            ],
          },
          [`${docUrl}page2.html`]: {name: 'title', value: 'Page2'},
          [`${docUrl}page3.html`]: {name: 'title', value: 'Page3'},
        },
        expected: htmlRegex`
          <ul>
            <li><a href="http://localhost:8000/book/2020/index.html" class="anchor">IndexPage</a><ul>
              <li><a href="http://localhost:8000/book/2020/page1.html" class="anchor">Page1</a><ul>
                <li><a href="http://localhost:8000/book/2020/page3.html" class="anchor">Page3</a></li>
              </ul></li>
              <li><a href="http://localhost:8000/book/2020/page2.html" class="anchor">Page2</a></li>
            </ul></li>
          </ul>
        `,
      });
    });

    it('should ignore duplicate links with different hash', async function () {
      await testBuilder({
        pageMap: {
          [`${docUrl}index.html`]: {
            name: 'html',
            children: [
              {name: 'head', children: [
                {name: 'title', value: 'IndexPage'},
              ]},
              {name: 'body', children: [
                {name: 'a', attrs: {href: 'page1.html'}},
                {name: 'a', attrs: {href: 'page1.html#foo'}},
                {name: 'a', attrs: {href: 'page1.html#bar'}},
              ]},
            ],
          },
          [`${docUrl}page1.html`]: {name: 'title', value: 'Page1'},
        },
        expected: htmlRegex`
          <ul>
            <li><a href="http://localhost:8000/book/2020/index.html" class="anchor">IndexPage</a><ul>
              <li><a href="http://localhost:8000/book/2020/page1.html" class="anchor">Page1</a></li>
            </ul></li>
          </ul>
        `,
      });
    });

    it('should ignore circular links', async function () {
      await testBuilder({
        pageMap: {
          [`${docUrl}index.html`]: {
            name: 'html',
            children: [
              {name: 'head', children: [
                {name: 'title', value: 'IndexPage'},
              ]},
              {name: 'body', children: [
                {name: 'a', attrs: {href: 'page1.html'}},
              ]},
            ],
          },
          [`${docUrl}page1.html`]: {
            name: 'html',
            children: [
              {name: 'head', children: [
                {name: 'title', value: 'Page1'},
              ]},
              {name: 'body', children: [
                {name: 'a', attrs: {href: 'index.html'}},
              ]},
            ],
          },
        },
        expected: htmlRegex`
          <ul>
            <li><a href="http://localhost:8000/book/2020/index.html" class="anchor">IndexPage</a><ul>
              <li><a href="http://localhost:8000/book/2020/page1.html" class="anchor">Page1</a></li>
            </ul></li>
          </ul>
        `,
      });
    });

    it('should ignore invalid or non-document links', async function () {
      await testBuilder({
        pageMap: {
          [`${docUrl}index.html`]: {
            name: 'html',
            children: [
              {name: 'head', children: [
                {name: 'title', value: 'IndexPage'},
              ]},
              {name: 'body', children: [
                {name: 'a', attrs: {href: 'page1.html'}},
                {name: 'a', attrs: {href: 'page2.html'}},
                {name: 'a', attrs: {href: 'page3.html'}},
              ]},
            ],
          },
        },
        expected: htmlRegex`
          <ul>
            <li><a href="http://localhost:8000/book/2020/index.html" class="anchor">IndexPage</a></li>
          </ul>
        `,
      });
    });
  });
});
