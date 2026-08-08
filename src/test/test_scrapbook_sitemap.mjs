import {
  MochaQuery as $, assert,
  createDocFixture, createIframeFixture,
} from "./unittest.mjs";
import sinon from "./lib/sinon-esm.js";
import {NS_HTML, NS_SVG, NS_XLINK, NS_MATHML} from "../utils/common.mjs";
import * as utils from "../utils/common.mjs";

import {DocumentLinksReader} from "../scrapbook/sitemap.mjs";

const $describe = $(describe);

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
});
