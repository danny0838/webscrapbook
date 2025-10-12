import {
  MochaQuery as $, assert,
  rawRegex,
  createFragFixture, createNodeFixture, createDocFixture, createIframeFixture,
} from "./unittest.mjs";
import {TestCapturerOffline} from "./extension.mjs";
import sinon from "./lib/sinon-esm.js";
import {DEFAULT_OPTIONS, NS_XMLNS, NS_HTML, NS_SVG, NS_XLINK, NS_MATHML} from "../utils/common.mjs";
import * as utils from "../utils/common.mjs";

import {PresaveDocumentRewriter, RebuildLinksDocumentRewriter} from "../capturer/doc-handler.mjs";

const $describe = $(describe);
const $context = $(context);
const $it = $(it);

const BASIC_LOADER_PATTERN = rawRegex`${'^'}(function${'\\s*'}()${'\\s*'}{${'.+'}})()${'$'}`;
const ANNOTATION_LOADER_PATTERN = rawRegex`${'^'}(function${'\\s*'}()${'\\s*'}{${'.+'}})()${'$'}`;
const INFOBAR_LOADER_PATTERN = rawRegex`${'^'}(function${'\\s*'}()${'\\s*'}{${'.+'}})()${'$'}`;

class TestCapturer extends TestCapturerOffline {
  /**
   * Merge default options for easier testing.
   */
  async retrieveDocumentContent(params) {
    const {options: _options} = params;
    const options = {...DEFAULT_OPTIONS, ..._options};
    return await super.retrieveDocumentContent({...params, options});
  }
}

describe('capturer/doc-handler.mjs', function () {
  afterEach(function () {
    sinon.restore();

    for (const elem of document.querySelectorAll('iframe')) {
      elem.remove();
    }
  });

  $describe.skipIf($.noBrowser)('PresaveDocumentRewriter', function () {
    describe('#run()', function () {
      context('erased content handling', function () {
        function docFactory() {
          var doc = createDocFixture({tagName: 'body', innerHTML: `<!--foo-->\
<!--scrapbook-erased-20250101000000000=<div attr="value1">foo</div>bar<div>baz</div>-->\
<div attr="value2">foo</div>\
<!--scrapbook-erased-20250101000000000=<div attr="value3">foo</div>bar<div>baz</div>-->`});
          return doc;
        }

        context('when `deleteErased` is truthy', function () {
          it('should remove erased contents', function () {
            var doc = docFactory();

            new PresaveDocumentRewriter().run(doc, {deleteErased: true});

            assert.strictEqual(doc.body.innerHTML, '<!--foo--><div attr="value2">foo</div>');
          });
        });

        context('when `deleteErased` is falsy', function () {
          it('should remove erased contents', function () {
            var doc = docFactory();

            new PresaveDocumentRewriter().run(doc, {deleteErased: false});

            assert.strictEqual(doc.body.innerHTML, `<!--foo-->\
<!--scrapbook-erased-20250101000000000=<div attr="value1">foo</div>bar<div>baz</div>-->\
<div attr="value2">foo</div>\
<!--scrapbook-erased-20250101000000000=<div attr="value3">foo</div>bar<div>baz</div>-->`);
          });
        });
      });

      context('remove loaders handling', function () {
        it('should remove existing loaders', function () {
          var doc = createDocFixture({tagName: 'body', children: [
            {tagName: 'style', attrs: {'data-scrapbook-elem': 'annotation-css'}},
            {tagName: 'script', attrs: {'data-scrapbook-elem': 'basic-loader'}},
            {tagName: 'script', attrs: {'data-scrapbook-elem': 'annotation-loader'}},
            {tagName: 'script', attrs: {'data-scrapbook-elem': 'canvas-loader'}}, // WebScrapBook < 0.69
            {tagName: 'script', attrs: {'data-scrapbook-elem': 'shadowroot-loader'}}, // WebScrapBook < 0.69
            {tagName: 'script', attrs: {'data-scrapbook-elem': 'infobar-loader'}},
            {tagName: 'scrapbook-infobar', attrs: {'data-scrapbook-elem': 'infobar', 'style': 'display: block;'}},
          ]});

          new PresaveDocumentRewriter().run(doc, {});

          assert.strictEqual(doc.body.innerHTML, '');
        });
      });

      context('basic loader handling', function () {
        function docFactory() {
          return createDocFixture({tagName: 'body', children: [
            {tagName: 'div'},
          ]});
        }

        context('when `requireBasicLoader` is truthy', function () {
          it('should insert basic loader to body', function () {
            var doc = docFactory();

            new PresaveDocumentRewriter().run(doc, {requireBasicLoader: true});

            var script = doc.querySelector('script');
            assert.strictEqual(script, doc.body.lastChild);
            assert.match(script.textContent, BASIC_LOADER_PATTERN);
          });
        });

        context('when `requireBasicLoader` is falsy', function () {
          it('should not insert basic loader', function () {
            var doc = docFactory();

            new PresaveDocumentRewriter().run(doc, {requireBasicLoader: false});

            assert.isNull(doc.querySelector('script'));
          });
        });
      });

      context('annotation loader handling', function () {
        it('should insert annotation loader when a titled linemarker exists', function () {
          var doc = createDocFixture({
            tagName: 'span',
            attrs: {
              'data-scrapbook-elem': 'linemarker',
              'title': 'foo',
            },
          });

          new PresaveDocumentRewriter().run(doc, {});

          var script = doc.querySelector('script');
          assert.strictEqual(script, doc.body.lastChild);
          assert.match(script.textContent, ANNOTATION_LOADER_PATTERN);
        });

        it('should not insert annotation loader when a non-titled linemarker exists', function () {
          var doc = createDocFixture({
            tagName: 'span',
            attrs: {
              'data-scrapbook-elem': 'linemarker',
            },
          });

          new PresaveDocumentRewriter().run(doc, {});

          assert.isNull(doc.querySelector('script'));
        });

        it('should insert annotation loader when a sticky exists', function () {
          var doc = createDocFixture({
            tagName: 'div',
            attrs: {
              'data-scrapbook-elem': 'sticky',
            },
          });

          new PresaveDocumentRewriter().run(doc, {});

          var script = doc.querySelector('script');
          assert.strictEqual(script, doc.body.lastChild);
          assert.match(script.textContent, ANNOTATION_LOADER_PATTERN);
        });
      });

      context('infobar loader handling', function () {
        function docFactory(missing = []) {
          const attrs = {
            'data-scrapbook-source': 'https://example.com/',
            'data-scrapbook-create': '20250101000000000',
          };
          for (const attr of missing) {
            delete attrs[attr];
          }
          return createDocFixture({
            tagName: 'html',
            attrs,
            children: [
              {tagName: 'head'},
              {tagName: 'body'},
            ],
          });
        }

        context('when `insertInfoBar` is truthy', function () {
          context('when `isMainDocument` is truthy', function () {
            it('should insert infobar loader to body', function () {
              var doc = docFactory();

              new PresaveDocumentRewriter().run(doc, {isMainDocument: true, insertInfoBar: true});

              var script = doc.querySelector('script');
              assert.strictEqual(script, doc.body.lastChild);
              assert.match(script.textContent, INFOBAR_LOADER_PATTERN);
            });

            it('should safely skip if missing "sourc" metadata', function () {
              sinon.stub(console, 'error');

              var doc = docFactory(['data-scrapbook-source']);

              new PresaveDocumentRewriter().run(doc, {isMainDocument: true, insertInfoBar: true});

              assert.isNull(doc.querySelector('script'));
            });

            it('should safely skip if missing "create" metadata', function () {
              sinon.stub(console, 'error');

              var doc = docFactory(['data-scrapbook-create']);

              new PresaveDocumentRewriter().run(doc, {isMainDocument: true, insertInfoBar: true});

              assert.isNull(doc.querySelector('script'));
            });
          });

          context('when `isMainDocument` is falsy', function () {
            it('should not insert infobar loader', function () {
              var doc = docFactory();

              new PresaveDocumentRewriter().run(doc, {isMainDocument: false, insertInfoBar: true});

              assert.isNull(doc.querySelector('script'));
            });
          });
        });

        context('when `insertInfoBar` is falsy', function () {
          it('should not insert infobar loader', function () {
            var doc = docFactory();

            new PresaveDocumentRewriter().run(doc, {isMainDocument: true, insertInfoBar: false});

            assert.isNull(doc.querySelector('script'));
          });
        });
      });
    });
  });

  $describe.skipIf($.noBrowser)('RetrieveDocumentRewriter', function () {
    describe('#run()', function () {
      const docUrl = 'https://example.idv/';
      const options = {
        "capture.prettyPrint": false,
      };
      const item = {
        id: '20200101000000000',
        create: '20210101000000000',
        modify: '20220101000000000',
        title: 'My Title',
        source: 'https://example.com/mypage.html',
      };

      context('info title handling', function () {
        it('should take item title for main document', async function () {
          var doc = createDocFixture({name: 'title', value: 'Main Page Title'});
          sinon.stub(doc, 'URL').value(docUrl);

          var response = await new TestCapturer().retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          sinon.assert.match(response, {
            [docUrl]: {
              blob: {
                type: 'text/html;charset=utf-8',
              },
              info: {
                isMainFrame: true,
                title: 'My Title',
              },
              resources: {},
            },
          });
        });

        it('should take document title for non-main document', async function () {
          var doc = createDocFixture({name: 'title', value: 'Subpage Title'});
          sinon.stub(doc, 'URL').value(docUrl);

          var response = await new TestCapturer().retrieveDocumentContent({
            doc,
            isMainPage: false,
            item,
            options,
          });
          sinon.assert.match(response, {
            [docUrl]: {
              blob: {
                type: 'text/html;charset=utf-8',
              },
              info: {
                isMainFrame: true,
                title: 'Subpage Title',
              },
              resources: {},
            },
          });
        });

        it('should take last non-empty title from `title-src` element', async function () {
          var doc = createDocFixture({name: 'body', children: [
            {name: 'div', attrs: {'data-scrapbook-elem': 'title-src'}, value: 'Custom Title1'},
            {name: 'div', attrs: {'data-scrapbook-elem': 'title-src'}, value: 'Custom Title2'},
            {name: 'div', attrs: {'data-scrapbook-elem': 'title-src'}, value: ''},
          ]});
          sinon.stub(doc, 'URL').value(docUrl);

          var response = await new TestCapturer().retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          sinon.assert.match(response, {
            [docUrl]: {
              blob: {
                type: 'text/html;charset=utf-8',
              },
              info: {
                isMainFrame: true,
                title: 'Custom Title2',
              },
              resources: {},
            },
          });
        });

        it('should set content to new info title for all `title` elements', async function () {
          var doc = createDocFixture({name: 'html', children: [
            {name: 'head', children: [
              {name: 'title', value: 'Page Title'},
              {name: 'title', attrs: {'data-scrapbook-elem': 'title'}, value: 'Page Title'},
            ]},
            {name: 'body', children: [
              {name: 'h1', attrs: {'data-scrapbook-elem': 'title'}, value: 'header'},
              {name: 'div', attrs: {'data-scrapbook-elem': 'title'}, value: 'div content'},
              {name: 'span', attrs: {'data-scrapbook-elem': 'title'}, value: 'span content'},
            ]},
          ]});
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          sinon.assert.match(response, {
            [docUrl]: {
              blob: {
                type: 'text/html;charset=utf-8',
              },
              info: {
                isMainFrame: true,
                title: 'My Title',
              },
              resources: {},
            },
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));
          assert.strictEqual(doc.querySelector('title:first-of-type').textContent, 'Page Title');
          assert.strictEqual(doc.querySelector('title:last-of-type').textContent, 'My Title');
          assert.strictEqual(doc.querySelector('h1').textContent, 'My Title');
          assert.strictEqual(doc.querySelector('div').textContent, 'My Title');
          assert.strictEqual(doc.querySelector('span').textContent, 'My Title');
        });
      });
    });
  });

  $describe.skipIf($.noBrowser)('RebuildLinksDocumentRewriter', function () {
    const docUrl = 'https://example.com/';

    describe('#run()', function () {
      const options = {
        "capture.frame": "link",
        "capture.downLink.doc.depth": 1,
      };

      let rewriter;
      let capturer;
      let filenameMap;
      let redirects;

      beforeEach(function () {
        rewriter = new RebuildLinksDocumentRewriter();
        capturer = rewriter.capturer = new TestCapturer();
        filenameMap = new Map([
          [rewriter.getRegisterToken(docUrl, 'document'), {url: "index.html"}],
          [rewriter.getRegisterToken(`${docUrl}page.html`, 'document'), {url: "page.html"}],
        ]);
        redirects = new Map();
      });

      context('for <a>', function () {
        const tagName = 'a';

        it('should rewrite `href` attribute', async function () {
          var doc = createDocFixture({tagName, attrs: {href: `${docUrl}page.html`}, value: 'text'});
          rewriter.run(doc, {capturer, filenameMap, redirects});

          assert.strictEqual(doc.querySelector(tagName).getAttribute('href'), 'page.html');
        });

        it('should not rewrite `href` attribute when having `download` attribute', async function () {
          var doc = createDocFixture({tagName, attrs: {href: `${docUrl}page.html`, download: 'page'}, value: 'text'});
          rewriter.run(doc, {capturer, filenameMap, redirects});

          assert.strictEqual(doc.querySelector(tagName).getAttribute('href'), 'https://example.com/page.html');
        });
      });

      context('for <area>', function () {
        const tagName = 'area';

        it('should rewrite `href` attribute', async function () {
          var doc = createDocFixture({tagName, attrs: {href: `${docUrl}page.html`}});
          rewriter.run(doc, {capturer, filenameMap, redirects});

          assert.strictEqual(doc.querySelector(tagName).getAttribute('href'), 'page.html');
        });

        it('should not rewrite `href` attribute when having `download` attribute', async function () {
          var doc = createDocFixture({tagName, attrs: {href: `${docUrl}page.html`, download: 'page'}});
          rewriter.run(doc, {capturer, filenameMap, redirects});

          assert.strictEqual(doc.querySelector(tagName).getAttribute('href'), 'https://example.com/page.html');
        });

        it('should not work when in SVG in HTML', async function () {
          var doc = createDocFixture({tagName: 'svg', ns: NS_SVG, children: [
            {tagName, ns: NS_SVG, attrs: {href: `${docUrl}page.html`}},
          ]});
          rewriter.run(doc, {capturer, filenameMap, redirects});

          assert.strictEqual(doc.querySelector(tagName).getAttribute('href'), 'https://example.com/page.html');
        });
      });

      context('for <meta>', function () {
        const tagName = 'meta';

        it('should rewrite `content` attribute for `[http-equiv="refresh"]`', async function () {
          var doc = createDocFixture({tagName, attrs: {'http-equiv': "refresh", 'content': `0; url=${docUrl}page.html`}});
          rewriter.run(doc, {capturer, filenameMap, redirects});

          assert.strictEqual(doc.querySelector(tagName).getAttribute('content'), '0; url=page.html');
        });

        it('should work when `http-equiv` is in altered case', async function () {
          var doc = createDocFixture({tagName, attrs: {'http-equiv': "REFRESH", 'content': `0; url=${docUrl}page.html`}});
          rewriter.run(doc, {capturer, filenameMap, redirects});

          assert.strictEqual(doc.querySelector(tagName).getAttribute('content'), '0; url=page.html');
        });
      });

      context('for <iframe>', function () {
        const tagName = 'iframe';

        it('should rewrite `srcdoc` attribute content', async function () {
          var doc = createDocFixture({tagName: 'body', children: [
            {tagName: 'meta', attrs: {'http-equiv': "refresh", 'content': `0; url=${docUrl}page.html`}},
            {tagName: 'a', attrs: {href: `${docUrl}page.html`}},
          ]});
          var doc = createDocFixture({
            tagName,
            attrs: {srcdoc: utils.documentToString(doc)},
          });
          rewriter.run(doc, {capturer, filenameMap, redirects});

          var html = doc.querySelector(tagName).getAttribute('srcdoc');
          var frameDoc = createDocFixture({code: html});
          assert.strictEqual(frameDoc.querySelector('meta').getAttribute('content'), '0; url=page.html');
          assert.strictEqual(frameDoc.querySelector('a').getAttribute('href'), 'page.html');
        });
      });

      context('for <svg:a>', function () {
        const tagName = 'a';

        it('should rewrite `href` and `xlink:href` attributes', async function () {
          var doc = createDocFixture({type: 'svg', tagName: '#document-fragment', children: [
            {tagName: 'a', ns: NS_SVG, attrs: [['href', `${docUrl}page.html`]]},
            {tagName: 'a', ns: NS_SVG, attrs: [['xlink:href', `${docUrl}page.html`, NS_XLINK]]},
          ]});
          rewriter.run(doc, {capturer, filenameMap, redirects});

          var elems = doc.querySelectorAll(tagName);
          assert.strictEqual(elems[0].getAttribute('href'), 'page.html');
          assert.strictEqual(elems[1].getAttribute('xlink:href'), 'page.html');
        });

        it('should rewrite `href` and `xlink:href` attributes in SVG in HTML', async function () {
          var doc = createDocFixture({tagName: 'svg', ns: NS_SVG, children: [
            {tagName: 'a', ns: NS_SVG, attrs: [['href', `${docUrl}page.html`]]},
            {tagName: 'a', ns: NS_SVG, attrs: [['xlink:href', `${docUrl}page.html`, NS_XLINK]]},
          ]});
          rewriter.run(doc, {capturer, filenameMap, redirects});

          var elems = doc.querySelectorAll(tagName);
          assert.strictEqual(elems[0].getAttribute('href'), 'page.html');
          assert.strictEqual(elems[1].getAttribute('xlink:href'), 'page.html');
        });

        it('should ignore `download` attribute in SVG in HTML', async function () {
          var doc = createDocFixture({tagName: 'svg', ns: NS_SVG, children: [
            {tagName: 'a', ns: NS_SVG, attrs: [['href', `${docUrl}page.html`], ['download', 'page']]},
            {tagName: 'a', ns: NS_SVG, attrs: [['xlink:href', `${docUrl}page.html`, NS_XLINK], ['download', 'page']]},
          ]});
          rewriter.run(doc, {capturer, filenameMap, redirects});

          var elems = doc.querySelectorAll(tagName);
          assert.strictEqual(elems[0].getAttribute('href'), 'page.html');
          assert.strictEqual(elems[1].getAttribute('xlink:href'), 'page.html');
        });
      });

      context('for <math:*>', function () {
        it('should rewrite `href` attribute in MathML in HTML', async function () {
          var doc = createDocFixture({tagName: 'math', ns: NS_MATHML, children: [
            {tagName: 'mrow', ns: NS_MATHML, attrs: {href: `${docUrl}page.html`}, children: [
              {tagName: 'mo', ns: NS_MATHML, attrs: {href: `${docUrl}page.html`}, value: '123'},
            ]},
          ]});
          rewriter.run(doc, {capturer, filenameMap, redirects});

          assert.strictEqual(doc.querySelector('mrow').getAttribute('href'), 'page.html');
          assert.strictEqual(doc.querySelector('mo').getAttribute('href'), 'page.html');
        });
      });

      context('shadow DOM handling', function () {
        it('should rewrite shadow DOM content', async function () {
          var doc = createDocFixture({tagName: 'div', shadow: {
            virtual: true,
            children: [
              {tagName: 'a', attrs: {href: `${docUrl}page.html`}},
            ],
          }});
          rewriter.run(doc, {capturer, filenameMap, redirects});

          var html = doc.querySelector('div').getAttribute('data-scrapbook-shadowdom');
          var shadow = createFragFixture(html);
          assert.strictEqual(shadow.querySelector('a').getAttribute('href'), 'page.html');
        });
      });
    });
  });
});
