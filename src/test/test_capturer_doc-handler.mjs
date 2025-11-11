import {
  MochaQuery as $, assert,
  RED_BMP_B64, GREEN_BMP_B64, BLUE_BMP_B64,
  RED_BMP_BYTES, GREEN_BMP_BYTES, BLUE_BMP_BYTES,
  rawRegex, getAttributes,
  createFragFixture, createDomFixture, createNodeFixture, createDocFixture, createIframeFixture,
  runControlledTest,
} from "./unittest.mjs";
import {TestCapturerOffline, stubXhr} from "./extension.mjs";
import sinon from "./lib/sinon-esm.js";
import {DEFAULT_OPTIONS, NS_XMLNS, NS_HTML, NS_SVG, NS_XLINK, NS_MATHML} from "../utils/common.mjs";
import * as utils from "../utils/common.mjs";
import {Capturer} from "../capturer/capturer.mjs";
import {DocumentCssHandler} from "../capturer/css-handler.mjs";
import {CaptureHelperHandler} from "../capturer/helper-handler.mjs";

import {
  META_REFERRER_POLICY, META_REFERRER_POLICY_LEGACY,
  NodeSkipIteration,
  PresaveDocumentRewriter, RebuildLinksDocumentRewriter, CaptureDocumentRewriter,
} from "../capturer/doc-handler.mjs";

const $describe = $(describe);
const $context = $(context);
const $it = $(it);

const CONTEXT_BASE_URL = 'base URL handling';
const CONTEXT_CROSS_ORIGIN = 'cross-origin handling';
const CONTEXT_REFERRER_POLICY = 'referrer policy handling';
const CONTEXT_FAVICON = 'favicon handling';
const CONTEXT_DOWN_LINK = 'downLink handling';
const CONTEXT_RAW_TEXT_ESCAPING = 'raw text escaping';

const BASIC_LOADER_PATTERN = rawRegex`${'^'}(function${'\\s*'}()${'\\s*'}{${'.+'}})()${'$'}`;
const ANNOTATION_LOADER_PATTERN = rawRegex`${'^'}(function${'\\s*'}()${'\\s*'}{${'.+'}})()${'$'}`;
const INFOBAR_LOADER_PATTERN = rawRegex`${'^'}(function${'\\s*'}()${'\\s*'}{${'.+'}})()${'$'}`;

class TestCapturer extends TestCapturerOffline {
  /**
   * Mock captureDocument to return the document rewriter after rewriting the
   * main document.
   *
   * Note that this does not save the main document and complete the capture,
   * and things like links rebuilding of an in-depth are not done.
   */
  async captureDocument(params) {
    const {settings: _settings, options: _options} = params;

    // normal deep capture, pass to native method
    if (_settings?.missionId) {
      return await super.captureDocument(params);
    }

    const settings = {
      missionId: this.missionId,
      timeId: utils.dateToId(),
      documentName: 'index',
      recurseChain: [],
      depth: 0,
      isMainPage: true,
      isMainFrame: true,
      ..._settings,
    };
    const options = {
      ...DEFAULT_OPTIONS,
      ..._options,
    };

    const {rewriter} = await this._captureDocument({...params, settings, options});
    return rewriter;
  }

  /**
   * Merge default options for easier testing.
   */
  async retrieveDocumentContent(params) {
    const {options: _options} = params;
    const options = {...DEFAULT_OPTIONS, ..._options};
    return await super.retrieveDocumentContent({...params, options});
  }
}

async function waitFrameLoading(frame) {
  await new Promise((resolve) => {
    const iDoc = frame.contentDocument;
    if (iDoc?.readyState !== 'complete') {
      frame.onload = resolve;
    } else if (
      frame.matches('iframe[srcdoc]') ||
      (utils.userAgent.is('chromium') && frame.matches('frame[srcdoc]'))
    ) {
      // An onload event will be triggered for srcdoc althouth iDoc has
      // "complete" readyState now.
      frame.onload = resolve;
    } else {
      resolve();
    }
  });
}

describe('capturer/doc-handler.mjs', function () {
  beforeEach(function () {
    // stub out messaging to prevent delay from `background.onCaptureEnd`
    sinon.stub(browser.runtime, 'sendMessage').value(() => {});
  });

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

        it('should not work when in shadow DOM', async function () {
          var doc = createDocFixture({tagName: 'div', shadow: {
            virtual: true,
            children: [
              {tagName, attrs: {'http-equiv': "refresh", 'content': `0; url=${docUrl}page.html`}},
            ],
          }});
          rewriter.run(doc, {capturer, filenameMap, redirects});

          var html = doc.querySelector('div').getAttribute('data-scrapbook-shadowdom');
          var shadow = createFragFixture(html);
          assert.strictEqual(shadow.querySelector('meta').getAttribute('content'), '0; url=https://example.com/page.html');
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
          assert.strictEqual(elems[0].getAttributeNS(null, 'href'), 'page.html');
          assert.strictEqual(elems[1].getAttributeNS(NS_XLINK, 'href'), 'page.html');
        });

        it('should rewrite `xlink:href` in SVG document with altered prefix', async function () {
          var doc = createDocFixture({type: 'svg', nsmap: {'x': NS_XLINK}, tagName: '#document-fragment', children: [
            {tagName: 'a', ns: NS_SVG, attrs: [['x:href', `${docUrl}page.html`, NS_XLINK]]},
          ]});
          rewriter.run(doc, {capturer, filenameMap, redirects});

          assert.strictEqual(doc.querySelector(tagName).getAttributeNS(NS_XLINK, 'href'), 'page.html');
        });

        it('should rewrite `href` and `xlink:href` attributes in SVG in HTML', async function () {
          var doc = createDocFixture({tagName: 'svg', ns: NS_SVG, children: [
            {tagName: 'a', ns: NS_SVG, attrs: [['href', `${docUrl}page.html`]]},
            {tagName: 'a', ns: NS_SVG, attrs: [['xlink:href', `${docUrl}page.html`, NS_XLINK]]},
          ]});
          rewriter.run(doc, {capturer, filenameMap, redirects});

          var elems = doc.querySelectorAll(tagName);
          assert.strictEqual(elems[0].getAttributeNS(null, 'href'), 'page.html');
          assert.strictEqual(elems[1].getAttributeNS(NS_XLINK, 'href'), 'page.html');
        });

        it('should ignore `download` attribute in SVG in HTML', async function () {
          var doc = createDocFixture({tagName: 'svg', ns: NS_SVG, children: [
            {tagName: 'a', ns: NS_SVG, attrs: [['href', `${docUrl}page.html`], ['download', 'page']]},
            {tagName: 'a', ns: NS_SVG, attrs: [['xlink:href', `${docUrl}page.html`, NS_XLINK], ['download', 'page']]},
          ]});
          rewriter.run(doc, {capturer, filenameMap, redirects});

          var elems = doc.querySelectorAll(tagName);
          assert.strictEqual(elems[0].getAttributeNS(null, 'href'), 'page.html');
          assert.strictEqual(elems[1].getAttributeNS(NS_XLINK, 'href'), 'page.html');
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

  $describe.skipIf($.noBrowser)('CaptureDocumentRewriter', function () {
    async function rewriteNodeControlledTest({doc, docUrl, options, resMap, tester}) {
      let rewriter;
      const fn = async function () {
        rewriter = await new TestCapturer(resMap).captureDocument({doc, docUrl, options});
      };
      const stub = await runControlledTest(CaptureDocumentRewriter.prototype, "rewriteNode", fn, tester);
      return {stub, rewriter};
    }

    function baseUrlHandlingTesterFactory({tagName, selector, docUrl, interrupt = true}) {
      return function baseUrlHandlingTest([elem], {func, doneSignal}) {
        if (!selector) {
          if (tagName) {
            selector = CSS.escape(tagName);
          } else {
            throw new Error('Must specify either tagName or selector.');
          }
        }
        if (elem.matches(selector)) {
          const sandbox = sinon.createSandbox();
          sandbox.replace(this, 'baseUrlFallback', `${docUrl}baseUrlFallback/`);
          sandbox.replace(this, 'baseUrl', `${docUrl}baseUrl/`);
          sandbox.replace(this, 'baseUrlFinal', `${docUrl}baseUrlFinal/`);
          try {
            const result = func.call(this, elem);
            if (interrupt) {
              throw doneSignal;
            } else {
              return result;
            }
          } finally {
            sandbox.restore();
          }
        }
        return func.call(this, elem);
      };
    }

    const docUrl = 'https://example.com/';

    describe('#run()', function () {
      it('should call methods in order', async function () {
        sinon.spy(CaptureDocumentRewriter.prototype, 'handlePrettyPrint');
        sinon.spy(CaptureDocumentRewriter.prototype, 'removeToolbar');
        sinon.spy(CaptureDocumentRewriter.prototype, 'processCaptureHelpers');

        sinon.spy(CaptureDocumentRewriter.prototype, 'handleDownLinkExtras');
        sinon.spy(CaptureDocumentRewriter.prototype, 'addAdoptedStyleSheets');
        sinon.spy(CaptureDocumentRewriter.prototype, 'rewriteRecursively');

        sinon.spy(CaptureDocumentRewriter.prototype, 'recordMetadata');
        sinon.spy(CaptureDocumentRewriter.prototype, 'ensureMetaCharset');
        sinon.spy(CaptureDocumentRewriter.prototype, 'fetchSiteFavIcon');
        sinon.spy(CaptureDocumentRewriter.prototype, 'recordAdoptedStyleSheets');

        sinon.spy(CaptureDocumentRewriter.prototype, 'collectUsedCssResources');
        sinon.spy(CaptureDocumentRewriter.prototype, 'fetchResources');
        sinon.spy(CaptureDocumentRewriter.prototype, 'fetchDownLinkResources');

        sinon.spy(CaptureDocumentRewriter.prototype, 'recordShadowRoots');
        sinon.spy(CaptureDocumentRewriter.prototype, 'recordCssResourceMap');
        sinon.spy(CaptureDocumentRewriter.prototype, 'recordCustomElements');

        var doc = createDocFixture();
        await new TestCapturer().captureDocument({doc, docUrl});

        sinon.assert.callOrder(
          CaptureDocumentRewriter.prototype.handlePrettyPrint,
          CaptureDocumentRewriter.prototype.removeToolbar,
          CaptureDocumentRewriter.prototype.processCaptureHelpers,

          CaptureDocumentRewriter.prototype.handleDownLinkExtras,
          CaptureDocumentRewriter.prototype.addAdoptedStyleSheets,
          CaptureDocumentRewriter.prototype.rewriteRecursively,

          CaptureDocumentRewriter.prototype.recordMetadata,
          CaptureDocumentRewriter.prototype.ensureMetaCharset,
          CaptureDocumentRewriter.prototype.fetchSiteFavIcon,
          CaptureDocumentRewriter.prototype.recordAdoptedStyleSheets,

          CaptureDocumentRewriter.prototype.collectUsedCssResources,
          CaptureDocumentRewriter.prototype.fetchResources,
          CaptureDocumentRewriter.prototype.fetchDownLinkResources,

          CaptureDocumentRewriter.prototype.recordShadowRoots,
          CaptureDocumentRewriter.prototype.recordCssResourceMap,
          CaptureDocumentRewriter.prototype.recordCustomElements,
        );
      });
    });

    describe('#processCaptureHelpers()', function () {
      function docFactory() {
        return createDocFixture({name: 'img', attrs: {'data-src': './green.bmp'}});
      }

      context('when options["capture.helpersEnabled"] = true', function () {
        it('should rewrite the document with `CaptureHelperHandler`', async function () {
          var spy = sinon.spy(CaptureHelperHandler.prototype, 'run');

          var options = {
            "capture.helpersEnabled": true,
            "capture.helpers": JSON.stringify([
              {
                commands: [
                  ["attr", {css: "img"}, "src", ["get_attr", null, "data-src"]],
                ],
              },
            ]),
          };
          var doc = docFactory();
          var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
          assert.deepEqual(getAttributes(doc.querySelector('img')), {
            'data-src': './green.bmp',
            'src': 'green.bmp',
          });

          sinon.assert.calledOnce(spy);
        });
      });

      context('when options["capture.helpersEnabled"] = false', function () {
        it('should do nothing', async function () {
          var spy = sinon.spy(CaptureHelperHandler.prototype, 'run');

          var options = {
            "capture.helpersEnabled": false,
            "capture.helpers": JSON.stringify([
              {
                commands: [
                  ["attr", {css: "img"}, "src", ["get_attr", null, "data-src"]],
                ],
              },
            ]),
          };
          var doc = docFactory();
          var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
          assert.deepEqual(getAttributes(doc.querySelector('img')), {
            'data-src': './green.bmp',
          });

          sinon.assert.notCalled(spy);
        });
      });
    });

    describe('#rewriteRecursively()', function () {
      function docFactory() {
        return createNodeFixture({name: 'main', id: 'e', children: [
          {name: 'section', id: 'e1', children: [
            {name: 'div', id: 'e1-1'},
            {name: 'div', id: 'e1-2'},
          ]},
          {name: 'section', id: 'e2', children: [
            {name: 'div', id: 'e2-1'},
            {name: 'div', id: 'e2-2'},
          ]},
          {name: 'section', id: 'e3', children: [
            {name: 'div', id: 'e3-1'},
            {name: 'div', id: 'e3-2'},
          ]},
        ]});
      }

      it('should call callback for every element in DOM order', function () {
        var root = docFactory();
        var callback = sinon.stub();
        var rewriter = new CaptureDocumentRewriter();
        rewriter.rewriteRecursively(root, callback);

        sinon.assert.calledWithExactly(callback.getCall(0), root);
        sinon.assert.calledWithExactly(callback.getCall(1), root.querySelector('#e1'));
        sinon.assert.calledWithExactly(callback.getCall(2), root.querySelector('#e1-1'));
        sinon.assert.calledWithExactly(callback.getCall(3), root.querySelector('#e1-2'));
        sinon.assert.calledWithExactly(callback.getCall(4), root.querySelector('#e2'));
        sinon.assert.calledWithExactly(callback.getCall(5), root.querySelector('#e2-1'));
        sinon.assert.calledWithExactly(callback.getCall(6), root.querySelector('#e2-2'));
        sinon.assert.calledWithExactly(callback.getCall(7), root.querySelector('#e3'));
        sinon.assert.calledWithExactly(callback.getCall(8), root.querySelector('#e3-1'));
        sinon.assert.calledWithExactly(callback.getCall(9), root.querySelector('#e3-2'));
        assert.isNull(callback.getCall(10));
      });

      it('should keep iteration if an element is removed from DOM', function () {
        var root = docFactory();
        var removed = root.querySelector('#e2');
        var callback = sinon.stub().callsFake((elem) => {
          if (elem === removed) {
            elem.remove();
          }
        });
        var rewriter = new CaptureDocumentRewriter();
        rewriter.rewriteRecursively(root, callback);

        sinon.assert.calledWithExactly(callback.getCall(0), root);
        sinon.assert.calledWithExactly(callback.getCall(1), root.querySelector('#e1'));
        sinon.assert.calledWithExactly(callback.getCall(2), root.querySelector('#e1-1'));
        sinon.assert.calledWithExactly(callback.getCall(3), root.querySelector('#e1-2'));
        sinon.assert.calledWithExactly(callback.getCall(4), removed);
        sinon.assert.calledWithExactly(callback.getCall(5), removed.querySelector('#e2-1'));
        sinon.assert.calledWithExactly(callback.getCall(6), removed.querySelector('#e2-2'));
        sinon.assert.calledWithExactly(callback.getCall(7), root.querySelector('#e3'));
        sinon.assert.calledWithExactly(callback.getCall(8), root.querySelector('#e3-1'));
        sinon.assert.calledWithExactly(callback.getCall(9), root.querySelector('#e3-2'));
        assert.isNull(callback.getCall(10));
      });

      it('should not iterate into descendants if a NodeSkipIteration is thrown', function () {
        var root = docFactory();
        var callback = sinon.stub().callsFake((elem) => {
          if (elem === root.querySelector('#e2')) {
            throw new NodeSkipIteration(elem);
          }
        });
        var rewriter = new CaptureDocumentRewriter();
        rewriter.rewriteRecursively(root, callback);

        sinon.assert.calledWithExactly(callback.getCall(0), root);
        sinon.assert.calledWithExactly(callback.getCall(1), root.querySelector('#e1'));
        sinon.assert.calledWithExactly(callback.getCall(2), root.querySelector('#e1-1'));
        sinon.assert.calledWithExactly(callback.getCall(3), root.querySelector('#e1-2'));
        sinon.assert.calledWithExactly(callback.getCall(4), root.querySelector('#e2'));
        sinon.assert.calledWithExactly(callback.getCall(5), root.querySelector('#e3'));
        sinon.assert.calledWithExactly(callback.getCall(6), root.querySelector('#e3-1'));
        sinon.assert.calledWithExactly(callback.getCall(7), root.querySelector('#e3-2'));
        assert.isNull(callback.getCall(8));
      });

      it('should iterate to next sibling if the element is removed and a NodeSkipIteration is thrown', function () {
        var root = docFactory();
        var removed = root.querySelector('#e2');
        var callback = sinon.stub().callsFake((elem) => {
          if (elem === removed) {
            elem.remove();
            throw new NodeSkipIteration(elem);
          }
        });
        var rewriter = new CaptureDocumentRewriter();
        rewriter.rewriteRecursively(root, callback);

        sinon.assert.calledWithExactly(callback.getCall(0), root);
        sinon.assert.calledWithExactly(callback.getCall(1), root.querySelector('#e1'));
        sinon.assert.calledWithExactly(callback.getCall(2), root.querySelector('#e1-1'));
        sinon.assert.calledWithExactly(callback.getCall(3), root.querySelector('#e1-2'));
        sinon.assert.calledWithExactly(callback.getCall(4), removed);
        sinon.assert.calledWithExactly(callback.getCall(5), root.querySelector('#e3'));
        sinon.assert.calledWithExactly(callback.getCall(6), root.querySelector('#e3-1'));
        sinon.assert.calledWithExactly(callback.getCall(7), root.querySelector('#e3-2'));
        assert.isNull(callback.getCall(8));
      });

      it('should work when passing a Document', function () {
        var root = createDocFixture({name: 'html', children: [
          {name: 'head', children: [
            {name: 'meta', attrs: {charset: 'utf-8'}},
          ]},
          {name: 'body', children: [
            {name: 'div'},
          ]},
        ]});
        var callback = sinon.stub();
        var rewriter = new CaptureDocumentRewriter();
        rewriter.rewriteRecursively(root, callback);

        sinon.assert.calledWithExactly(callback.getCall(0), root);
        sinon.assert.calledWithExactly(callback.getCall(1), root.querySelector('html'));
        sinon.assert.calledWithExactly(callback.getCall(2), root.querySelector('head'));
        sinon.assert.calledWithExactly(callback.getCall(3), root.querySelector('meta'));
        sinon.assert.calledWithExactly(callback.getCall(4), root.querySelector('body'));
        sinon.assert.calledWithExactly(callback.getCall(5), root.querySelector('div'));
        assert.isNull(callback.getCall(6));
      });

      it('should work when passing a DocumentFragment', function () {
        var root = createNodeFixture({name: '#document-fragment', children: [
          {name: 'section', id: 'e1', children: [
            {name: 'div', id: 'e1-1'},
            {name: 'div', id: 'e1-2'},
          ]},
          {name: 'section', id: 'e2', children: [
            {name: 'div', id: 'e2-1'},
            {name: 'div', id: 'e2-2'},
          ]},
        ]});
        var callback = sinon.stub();
        var rewriter = new CaptureDocumentRewriter();
        rewriter.rewriteRecursively(root, callback);

        sinon.assert.calledWithExactly(callback.getCall(0), root);
        sinon.assert.calledWithExactly(callback.getCall(1), root.querySelector('#e1'));
        sinon.assert.calledWithExactly(callback.getCall(2), root.querySelector('#e1-1'));
        sinon.assert.calledWithExactly(callback.getCall(3), root.querySelector('#e1-2'));
        sinon.assert.calledWithExactly(callback.getCall(4), root.querySelector('#e2'));
        sinon.assert.calledWithExactly(callback.getCall(5), root.querySelector('#e2-1'));
        sinon.assert.calledWithExactly(callback.getCall(6), root.querySelector('#e2-2'));
        assert.isNull(callback.getCall(7));
      });
    });

    describe('#rewriteNode()', function () {
      let timeId;

      let stubMetadata;
      let stubCharset;
      let stubFavIcon;

      let spyResolve;
      let spyResolveLink;

      let spyDownload;
      let spyRewritCss;
      let spyRewritCssText;
      let spyCaptureUrl;
      let spyCaptureDocumentOrFile;
      let spyCaptureDocument;

      let spyAdd;
      let spyRemove;
      let spyRewrite;
      let spyRewriteText;
      let spyRewriteAnchor;

      beforeEach(function () {
        // set up a unique timeId for each test
        timeId = utils.dateToId();

        // stub out unwanted changes for easier testing
        stubMetadata = sinon.stub(CaptureDocumentRewriter.prototype, 'recordMetadata');
        stubCharset = sinon.stub(CaptureDocumentRewriter.prototype, 'ensureMetaCharset');
        stubFavIcon = sinon.stub(CaptureDocumentRewriter.prototype, 'fetchSiteFavIcon');

        // set up common spies
        spyResolve = sinon.spy(CaptureDocumentRewriter.prototype, 'resolveRelativeUrl');
        spyResolveLink = sinon.spy(CaptureDocumentRewriter.prototype, 'resolveLocalLink');

        spyDownload = sinon.spy(CaptureDocumentRewriter.prototype, 'downloadFile');
        spyRewritCss = sinon.spy(DocumentCssHandler.prototype, 'rewriteCss');
        spyRewritCssText = sinon.spy(DocumentCssHandler.prototype, 'rewriteCssText');
        spyCaptureUrl = sinon.spy(CaptureDocumentRewriter.prototype, 'captureUrl');
        spyCaptureDocumentOrFile = sinon.spy(CaptureDocumentRewriter.prototype, 'captureDocumentOrFile');
        spyCaptureDocument = sinon.spy(CaptureDocumentRewriter.prototype, 'captureDocument');

        spyAdd = sinon.spy(CaptureDocumentRewriter.prototype, 'captureRecordAddedNode');
        spyRemove = sinon.spy(CaptureDocumentRewriter.prototype, 'captureRemoveNode');
        spyRewrite = sinon.spy(CaptureDocumentRewriter.prototype, 'captureRewriteAttr');
        spyRewriteText = sinon.spy(CaptureDocumentRewriter.prototype, 'captureRewriteTextContent');
        spyRewriteAnchor = sinon.spy(CaptureDocumentRewriter.prototype, 'rewriteAnchor');
      });

      context('for <base>', function () {
        function docFactory(href, target) {
          return createDocFixture({tagName, attrs: {
            ...(href && {href}),
            ...(target && {target}),
          }});
        }

        const tagName = "base";

        for (const mode of ["save", "blank", "remove", "<other>"]) {
          context(`when options["capture.base"] = "${mode}"`, function () {
            const options = {
              "capture.base": mode,
            };

            switch (mode) {
              case "save":
              default: {
                it('should rewrite `href` attribute', async function () {
                  var doc = docFactory("./resources/");

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('href'), 'https://example.com/resources/');

                  sinon.assert.calledOnceWithExactly(spyResolve, "./resources/", "https://example.com/", {skipLocal: false});
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'href', 'https://example.com/resources/');
                });

                break;
              }
              case "blank": {
                it('should remove `href` attribute', async function () {
                  var doc = docFactory("./resources/");

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('href'), null);

                  sinon.assert.calledOnceWithExactly(spyResolve, "./resources/", "https://example.com/", {skipLocal: false});
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'href', null);
                });

                break;
              }
              case "remove": {
                it('should remove the element', async function () {
                  var doc = docFactory("./resources/");
                  var elemOrig = doc.querySelector(tagName);

                  var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isNull(rewriter.doc.querySelector(tagName));

                  sinon.assert.calledOnceWithExactly(spyResolve, "./resources/", "https://example.com/", {skipLocal: false});
                  sinon.assert.calledOnceWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                });

                break;
              }
            }

            if (["save", "blank"].includes(mode)) {
              it('should keep `target` attribute', async function () {
                var doc = docFactory("./resources/", "_blank");

                var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                var elem = doc.querySelector(tagName);
                assert.strictEqual(elem.getAttribute("target"), "_blank");

                sinon.assert.neverCalledWith(spyRewrite, elem, "target");
              });
            }
          });
        }

        context(CONTEXT_BASE_URL, function () {
          it('should resolve the URL with `baseUrlFallback`', async function () {
            var doc = docFactory('./resources/');
            var tester = baseUrlHandlingTesterFactory({tagName, docUrl, interrupt: false});

            var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester});
            sinon.assert.called(stub);

            sinon.assert.calledOnceWithExactly(spyResolve, './resources/', 'https://example.com/baseUrlFallback/', {skipLocal: false});
          });

          it('should update base URL dynamically', async function () {
            var doc = docFactory('./resources/');

            var tester = function ([elem], {func, doneSignal}) {
              switch (elem) {
                // before base
                case this.doc.querySelector('meta'): {
                  assert.strictEqual(this.baseElem, undefined);
                  assert.strictEqual(this.baseUrlFallback, 'https://example.com/');
                  assert.strictEqual(this.baseUrl, 'https://example.com/');
                  assert.strictEqual(this.baseUrlFinal, 'https://example.com/resources/');
                  break;
                }

                // at base
                case this.doc.querySelector('base'): {
                  assert.strictEqual(this.baseElem, undefined);
                  assert.strictEqual(this.baseUrlFallback, 'https://example.com/');
                  assert.strictEqual(this.baseUrl, 'https://example.com/');
                  assert.strictEqual(this.baseUrlFinal, 'https://example.com/resources/');
                  break;
                }

                // after base
                case this.doc.querySelector('body'): {
                  assert.strictEqual(this.baseElem, this.doc.querySelector('base'));
                  assert.strictEqual(this.baseUrlFallback, 'https://example.com/');
                  assert.strictEqual(this.baseUrl, 'https://example.com/resources/');
                  assert.strictEqual(this.baseUrlFinal, 'https://example.com/resources/');
                  throw doneSignal;
                }
              }
              return func.call(this, elem);
            };

            var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester});
            sinon.assert.called(stub);
          });

          it('should honor only the first `base[href]` element', async function () {
            var doc = createDocFixture({tagName: 'head', children: [
              {tagName, attrs: {target: "_blank"}},
              {tagName, attrs: {href: './resources/'}},
              {tagName, attrs: {href: './resources2/'}},
            ]});

            var tester = function ([elem], {func, doneSignal}) {
              switch (elem) {
                // ignore
                case this.doc.querySelectorAll('base')[0]: {
                  assert.strictEqual(this.baseElem, undefined);
                  assert.strictEqual(this.baseUrlFallback, 'https://example.com/');
                  assert.strictEqual(this.baseUrl, 'https://example.com/');
                  assert.strictEqual(this.baseUrlFinal, 'https://example.com/resources/');
                  break;
                }

                // honor
                case this.doc.querySelectorAll('base')[1]: {
                  assert.strictEqual(this.baseElem, undefined);
                  assert.strictEqual(this.baseUrlFallback, 'https://example.com/');
                  assert.strictEqual(this.baseUrl, 'https://example.com/');
                  assert.strictEqual(this.baseUrlFinal, 'https://example.com/resources/');
                  break;
                }

                // ignore
                case this.doc.querySelectorAll('base')[2]: {
                  assert.strictEqual(this.baseElem, this.doc.querySelectorAll('base')[1]);
                  assert.strictEqual(this.baseUrlFallback, 'https://example.com/');
                  assert.strictEqual(this.baseUrl, 'https://example.com/resources/');
                  assert.strictEqual(this.baseUrlFinal, 'https://example.com/resources/');
                  break;
                }

                // after bases
                case this.doc.querySelector('body'): {
                  assert.strictEqual(this.baseElem, this.doc.querySelectorAll('base')[1]);
                  assert.strictEqual(this.baseUrlFallback, 'https://example.com/');
                  assert.strictEqual(this.baseUrl, 'https://example.com/resources/');
                  assert.strictEqual(this.baseUrlFinal, 'https://example.com/resources/');
                  throw doneSignal;
                }
              }
              return func.call(this, elem);
            };

            var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester});
            sinon.assert.called(stub);
          });

          it('should not alter base URL if the first `base[href]` has an invalid URL', async function () {
            var doc = createDocFixture({tagName: 'head', children: [
              {tagName, attrs: {href: 'https://exa[mple.org/'}},
              {tagName, attrs: {href: './resources/'}},
            ]});

            var tester = function ([elem], {func, doneSignal}) {
              switch (elem) {
                // honor but ignore due to invalid URL
                case this.doc.querySelectorAll('base')[0]: {
                  assert.strictEqual(this.baseElem, undefined);
                  assert.strictEqual(this.baseUrlFallback, 'https://example.com/');
                  assert.strictEqual(this.baseUrl, 'https://example.com/');
                  assert.strictEqual(this.baseUrlFinal, 'https://example.com/');
                  break;
                }

                // ignore
                case this.doc.querySelectorAll('base')[1]: {
                  assert.strictEqual(this.baseElem, this.doc.querySelectorAll('base')[0]);
                  assert.strictEqual(this.baseUrlFallback, 'https://example.com/');
                  assert.strictEqual(this.baseUrl, 'https://example.com/');
                  assert.strictEqual(this.baseUrlFinal, 'https://example.com/');
                  break;
                }

                // after bases
                case this.doc.querySelector('body'): {
                  assert.strictEqual(this.baseElem, this.doc.querySelectorAll('base')[0]);
                  assert.strictEqual(this.baseUrlFallback, 'https://example.com/');
                  assert.strictEqual(this.baseUrl, 'https://example.com/');
                  assert.strictEqual(this.baseUrlFinal, 'https://example.com/');
                  throw doneSignal;
                }
              }
              return func.call(this, elem);
            };

            var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester});
            sinon.assert.called(stub);
          });

          it('should honor `base[href=""]` and ignore other base elements', async function () {
            var doc = createDocFixture({tagName: 'head', children: [
              {tagName, attrs: {href: ''}},
              {tagName, attrs: {href: './resources/'}},
            ]});

            var tester = function ([elem], {func, doneSignal}) {
              switch (elem) {
                // honor
                case this.doc.querySelectorAll('base')[0]: {
                  assert.strictEqual(this.baseElem, undefined);
                  assert.strictEqual(this.baseUrlFallback, 'https://example.com/');
                  assert.strictEqual(this.baseUrl, 'https://example.com/');
                  assert.strictEqual(this.baseUrlFinal, 'https://example.com/');
                  break;
                }

                // ignore
                case this.doc.querySelectorAll('base')[1]: {
                  assert.strictEqual(this.baseElem, this.doc.querySelectorAll('base')[0]);
                  assert.strictEqual(this.baseUrlFallback, 'https://example.com/');
                  assert.strictEqual(this.baseUrl, 'https://example.com/');
                  assert.strictEqual(this.baseUrlFinal, 'https://example.com/');
                  break;
                }

                // after bases
                case this.doc.querySelector('body'): {
                  assert.strictEqual(this.baseElem, this.doc.querySelectorAll('base')[0]);
                  assert.strictEqual(this.baseUrlFallback, 'https://example.com/');
                  assert.strictEqual(this.baseUrl, 'https://example.com/');
                  assert.strictEqual(this.baseUrlFinal, 'https://example.com/');
                  throw doneSignal;
                }
              }
              return func.call(this, elem);
            };

            var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester});
            sinon.assert.called(stub);
          });

          it('should not honor `svg:base`', async function () {
            var doc = createDocFixture({tagName: 'head', children: [
              {tagName, ns: NS_SVG, attrs: {href: './resources/'}},
            ]});

            var tester = function ([elem], {func, doneSignal}) {
              switch (elem) {
                // ignore
                case this.doc.querySelector('base'): {
                  assert.strictEqual(this.baseElem, undefined);
                  assert.strictEqual(this.baseUrlFallback, 'https://example.com/');
                  assert.strictEqual(this.baseUrl, 'https://example.com/');
                  assert.strictEqual(this.baseUrlFinal, 'https://example.com/');
                  break;
                }

                // after base
                case this.doc.querySelector('body'): {
                  assert.strictEqual(this.baseElem, undefined);
                  assert.strictEqual(this.baseUrlFallback, 'https://example.com/');
                  assert.strictEqual(this.baseUrl, 'https://example.com/');
                  assert.strictEqual(this.baseUrlFinal, 'https://example.com/');
                  throw doneSignal;
                }
              }
              return func.call(this, elem);
            };

            var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester});
            sinon.assert.called(stub);
          });

          it('should honor `html:base` under `svg`', async function () {
            var doc = createDocFixture({tagName: 'svg', ns: NS_SVG, children: [
              {tagName, attrs: {href: './resources/'}},
            ]});

            var tester = function ([elem], {func, doneSignal}) {
              switch (elem) {
                // ignore
                case this.doc.querySelector('base'): {
                  assert.strictEqual(this.baseElem, undefined);
                  assert.strictEqual(this.baseUrlFallback, 'https://example.com/');
                  assert.strictEqual(this.baseUrl, 'https://example.com/');
                  assert.strictEqual(this.baseUrlFinal, 'https://example.com/resources/');
                  break;
                }

                // after base
                case this.doc.querySelector('img'): {
                  assert.strictEqual(this.baseElem, this.doc.querySelector('base'));
                  assert.strictEqual(this.baseUrlFallback, 'https://example.com/');
                  assert.strictEqual(this.baseUrl, 'https://example.com/resources/');
                  assert.strictEqual(this.baseUrlFinal, 'https://example.com/resources/');
                  throw doneSignal;
                }
              }
              return func.call(this, elem);
            };

            var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester});
            sinon.assert.called(stub);
          });

          it('should not honor `base` in a shadow DOM', async function () {
            var doc = createDocFixture({tagName: 'div', shadow: {
              children: [
                {tagName, attrs: {href: './resources/'}},
              ],
            }});

            var tester = function ([elem], {func, doneSignal}) {
              switch (elem) {
                // ignore
                case this.doc.querySelector('div').shadowRoot.querySelector('base'): {
                  assert.strictEqual(this.baseElem, undefined);
                  assert.strictEqual(this.baseUrlFallback, 'https://example.com/');
                  assert.strictEqual(this.baseUrl, 'https://example.com/');
                  assert.strictEqual(this.baseUrlFinal, 'https://example.com/');
                  break;
                }

                // after base
                case this.doc.querySelector('img'): {
                  assert.strictEqual(this.baseElem, undefined);
                  assert.strictEqual(this.baseUrlFallback, 'https://example.com/');
                  assert.strictEqual(this.baseUrl, 'https://example.com/');
                  assert.strictEqual(this.baseUrlFinal, 'https://example.com/');
                  throw doneSignal;
                }
              }
              return func.call(this, elem);
            };

            var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester});
            sinon.assert.called(stub);
          });
        });
      });

      context('for <meta>', function () {
        const tagName = 'meta';

        context('for [charset]', function () {
          it('should rewrite the first meta[charset] to `UTF-8`', async function () {
            var doc = createDocFixture({tagName, attrs: {charset: 'Big5'}});

            var {doc, metaCharsetNode} = await new TestCapturer().captureDocument({doc, docUrl});
            var elem = doc.querySelector(tagName);
            assert.strictEqual(elem.getAttribute('charset'), 'UTF-8');
            assert.strictEqual(metaCharsetNode, elem);

            sinon.assert.calledWithExactly(spyRewrite, elem, 'charset', 'UTF-8');
          });

          it('should not rewrite charset for other meta[charset] or meta[http-equiv="content-type"]', async function () {
            var doc = createDocFixture({
              tagName: 'head',
              children: [
                {tagName, attrs: {charset: 'Big5'}},
                {tagName, attrs: {charset: 'GBK'}},
                {tagName, attrs: {charset: 'Shift_JIS'}},
                {tagName, attrs: {'http-equiv': 'content-type', 'content': 'text/html; charset=Big5'}},
              ],
            });

            var {doc, metaCharsetNode} = await new TestCapturer().captureDocument({doc, docUrl});
            var elems = doc.querySelectorAll(tagName);
            assert.strictEqual(elems[0].getAttribute('charset'), 'UTF-8');
            assert.strictEqual(elems[1].getAttribute('charset'), 'GBK');
            assert.strictEqual(elems[2].getAttribute('charset'), 'Shift_JIS');
            assert.strictEqual(elems[3].getAttribute('content'), 'text/html; charset=Big5');
            assert.strictEqual(metaCharsetNode, elems[0]);

            sinon.assert.calledWithExactly(spyRewrite, elems[0], 'charset', 'UTF-8');
            sinon.assert.neverCalledWith(spyRewrite, elems[1], 'charset');
            sinon.assert.neverCalledWith(spyRewrite, elems[2], 'charset');
            sinon.assert.neverCalledWith(spyRewrite, elems[3], 'content');
          });

          it('should not rewrite charset for [http-equiv="content-type"] for self', async function () {
            var doc = createDocFixture({tagName, attrs: {'charset': 'Big5', 'http-equiv': 'content-type', 'content': 'text/html; charset=Big5'}});

            var {doc, metaCharsetNode} = await new TestCapturer().captureDocument({doc, docUrl});
            var elem = doc.querySelector(tagName);
            assert.strictEqual(elem.getAttribute('charset'), 'UTF-8');
            assert.strictEqual(elem.getAttribute('content'), 'text/html; charset=Big5');
            assert.strictEqual(metaCharsetNode, elem);

            sinon.assert.calledWithExactly(spyRewrite, elem, 'charset', 'UTF-8');
            sinon.assert.neverCalledWith(spyRewrite, elem, 'content');
          });

          it('should skip when in a shadow DOM', async function () {
            var doc = createDocFixture({tagName: 'div', shadow: {
              children: [{tagName, attrs: {charset: 'Big5'}}],
            }});

            var {doc, metaCharsetNode} = await new TestCapturer().captureDocument({doc, docUrl});
            var elem = doc.querySelector('div').shadowRoot.querySelector(tagName);
            assert.strictEqual(metaCharsetNode, undefined);
            for (const elem of doc.querySelector('div').shadowRoot.querySelectorAll(tagName)) {
              sinon.assert.neverCalledWith(spyRewrite, elem, 'charset');
            }
          });
        });

        context('for [http-equiv="content-type"]', function () {
          it('should rewrite the first meta[http-equiv="content-type"] with `charset` to `UTF-8`', async function () {
            var doc = createDocFixture({tagName, attrs: {'http-equiv': 'content-type', 'content': 'text/html; charset=Big5'}});

            var {doc, metaCharsetNode} = await new TestCapturer().captureDocument({doc, docUrl});
            var elem = doc.querySelector(tagName);
            assert.strictEqual(elem.getAttribute('content'), 'text/html; charset=UTF-8');
            assert.strictEqual(metaCharsetNode, elem);

            sinon.assert.calledWithExactly(spyRewrite, elem, 'content', 'text/html; charset=UTF-8');
          });

          it('should not rewrite charset for other meta[http-equiv="content-type"] or meta[charset]', async function () {
            var doc = createDocFixture({
              tagName: 'head',
              children: [
                {tagName, attrs: {'http-equiv': 'content-type', 'content': 'text/html; charset=Big5'}},
                {tagName, attrs: {'http-equiv': 'content-type', 'content': 'text/html; charset=GBK'}},
                {tagName, attrs: {'http-equiv': 'content-type', 'content': 'text/html; charset=Shift_JIS'}},
                {tagName, attrs: {charset: 'Big5'}},
              ],
            });

            var {doc, metaCharsetNode} = await new TestCapturer().captureDocument({doc, docUrl});
            var elems = doc.querySelectorAll(tagName);
            assert.strictEqual(elems[0].getAttribute('content'), 'text/html; charset=UTF-8');
            assert.strictEqual(elems[1].getAttribute('content'), 'text/html; charset=GBK');
            assert.strictEqual(elems[2].getAttribute('content'), 'text/html; charset=Shift_JIS');
            assert.strictEqual(elems[3].getAttribute('charset'), 'Big5');
            assert.strictEqual(metaCharsetNode, elems[0]);

            sinon.assert.calledWithExactly(spyRewrite, elems[0], 'content', 'text/html; charset=UTF-8');
            sinon.assert.neverCalledWith(spyRewrite, elems[1], 'content');
            sinon.assert.neverCalledWith(spyRewrite, elems[2], 'content');
            sinon.assert.neverCalledWith(spyRewrite, elems[3], 'charset');
          });

          it('should rewrite when `http-equiv` is in altered case', async function () {
            var doc = createDocFixture({tagName, attrs: {'http-equiv': 'CONTENT-TYPE', 'content': 'text/html; charset=Big5'}});

            var {doc, metaCharsetNode} = await new TestCapturer().captureDocument({doc, docUrl});
            var elem = doc.querySelector(tagName);
            assert.strictEqual(elem.getAttribute('http-equiv'), 'CONTENT-TYPE');
            assert.strictEqual(elem.getAttribute('content'), 'text/html; charset=UTF-8');
            assert.strictEqual(metaCharsetNode, elem);

            sinon.assert.calledWithExactly(spyRewrite, elem, 'content', 'text/html; charset=UTF-8');
          });

          it('should skip when `http-equiv` has spaced value', async function () {
            var doc = createDocFixture({
              tagName: 'head',
              children: [
                {tagName, attrs: {'http-equiv': ' content-type', 'content': 'text/html; charset=Big5'}},
                {tagName, attrs: {'http-equiv': 'content-type ', 'content': 'text/html; charset=Big5'}},
                {tagName, attrs: {'http-equiv': '\tcontent-type', 'content': 'text/html; charset=Big5'}},
                {tagName, attrs: {'http-equiv': 'content-type', 'content': 'text/html; charset=Big5'}},
              ],
            });

            var {doc, metaCharsetNode} = await new TestCapturer().captureDocument({doc, docUrl});
            var elems = doc.querySelectorAll(tagName);
            assert.strictEqual(metaCharsetNode, elems[3]);

            sinon.assert.neverCalledWith(spyRewrite, elems[0], 'content');
            sinon.assert.neverCalledWith(spyRewrite, elems[1], 'content');
            sinon.assert.neverCalledWith(spyRewrite, elems[2], 'content');
            sinon.assert.calledWithExactly(spyRewrite, elems[3], 'content', 'text/html; charset=UTF-8');
          });

          it('should skip when `content` has no `charset` parameter', async function () {
            var doc = createDocFixture({
              tagName: 'head',
              children: [
                {tagName, attrs: {'http-equiv': 'content-type', 'content': 'text/html; mykey=myvalue'}},
                {tagName, attrs: {'http-equiv': 'content-type', 'content': 'text/html; charset=GBK'}},
              ],
            });

            var {doc, metaCharsetNode} = await new TestCapturer().captureDocument({doc, docUrl});
            var elems = doc.querySelectorAll(tagName);
            assert.strictEqual(elems[0].getAttribute('content'), 'text/html; mykey=myvalue');
            assert.strictEqual(elems[1].getAttribute('content'), 'text/html; charset=UTF-8');
            assert.strictEqual(metaCharsetNode, elems[1]);

            sinon.assert.neverCalledWith(spyRewrite, elems[0], 'content');
            sinon.assert.calledWithExactly(spyRewrite, elems[1], 'content', 'text/html; charset=UTF-8');
          });

          it('should rewrite when `content` has `charset` parameter in altered case', async function () {
            var doc = createDocFixture({tagName, attrs: {'http-equiv': 'content-type', 'content': 'text/html; CHARSET=BIG5'}});

            var {doc, metaCharsetNode} = await new TestCapturer().captureDocument({doc, docUrl});
            var elem = doc.querySelector(tagName);
            assert.strictEqual(elem.getAttribute('content'), 'text/html; charset=UTF-8');
            assert.strictEqual(metaCharsetNode, elem);

            sinon.assert.calledWithExactly(spyRewrite, elem, 'content', 'text/html; charset=UTF-8');
          });

          it('should skip when in a shadow DOM', async function () {
            var doc = createDocFixture({tagName: 'div', shadow: {
              children: [{tagName, attrs: {'http-equiv': 'content-type', 'content': 'text/html; charset=Big5'}}],
            }});

            var {doc, metaCharsetNode} = await new TestCapturer().captureDocument({doc, docUrl});
            assert.strictEqual(metaCharsetNode, undefined);
            for (const elem of doc.querySelector('div').shadowRoot.querySelectorAll(tagName)) {
              sinon.assert.neverCalledWith(spyRewrite, elem, 'content');
            }
          });
        });

        context('for [http-equiv="refresh"]', function () {
          it('should rewrite the URL to the resolved value', async function () {
            var doc = createDocFixture({
              tagName: 'head',
              children: [
                {tagName, attrs: {'http-equiv': 'refresh', 'content': '0; url=page.html?id=123#foo'}},
                {tagName, attrs: {'http-equiv': 'refresh', 'content': '1; url=page2.html?id=456#bar'}},
                {tagName, attrs: {'http-equiv': 'refresh', 'content': '2; url=?id=789'}},
              ],
            });

            var {doc} = await new TestCapturer().captureDocument({doc, docUrl});
            var elems = doc.querySelectorAll(tagName);
            assert.strictEqual(elems[0].getAttribute('content'), '0; url=https://example.com/page.html?id=123#foo');
            assert.strictEqual(elems[1].getAttribute('content'), '1; url=https://example.com/page2.html?id=456#bar');
            assert.strictEqual(elems[2].getAttribute('content'), '2; url=https://example.com/?id=789');

            sinon.assert.calledWithExactly(spyRewrite, elems[0], 'content', '0; url=https://example.com/page.html?id=123#foo');
            sinon.assert.calledWithExactly(spyRewrite, elems[1], 'content', '1; url=https://example.com/page2.html?id=456#bar');
            sinon.assert.calledWithExactly(spyRewrite, elems[2], 'content', '2; url=https://example.com/?id=789');
          });

          it('should skip when `http-equiv` has spaced value', async function () {
            var doc = createDocFixture({
              tagName: 'head',
              children: [
                {tagName, attrs: {'http-equiv': ' refresh', 'content': '0; url=page.html'}},
                {tagName, attrs: {'http-equiv': 'refresh ', 'content': '0; url=page.html'}},
                {tagName, attrs: {'http-equiv': '\trefresh ', 'content': '0; url=page.html'}},
              ],
            });

            var {doc} = await new TestCapturer().captureDocument({doc, docUrl});
            for (const elem of doc.querySelectorAll(tagName)) {
              sinon.assert.neverCalledWith(spyRewrite, elem, 'content');
            }
          });

          it('should skip when in a shadow DOM', async function () {
            var doc = createDocFixture({tagName: 'div', shadow: {
              children: [
                {tagName, attrs: {'http-equiv': 'refresh', 'content': '0; url=page.html?id=123#foo'}},
                {tagName, attrs: {'http-equiv': 'refresh', 'content': '1; url=page2.html?id=456#bar'}},
                {tagName, attrs: {'http-equiv': 'refresh', 'content': '2; url=?id=789'}},
              ],
            }});

            var {doc} = await new TestCapturer().captureDocument({doc, docUrl});
            for (const elem of doc.querySelector('div').shadowRoot.querySelectorAll(tagName)) {
              sinon.assert.neverCalledWith(spyRewrite, elem, 'content');
            }
          });

          context(CONTEXT_BASE_URL, function () {
            it('should resolve the URLs with `baseUrl`', async function () {
              var doc = createDocFixture({tagName, attrs: {'http-equiv': 'refresh', 'content': '0; url=page.html'}});
              var tester = baseUrlHandlingTesterFactory({tagName, docUrl});

              var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester});
              sinon.assert.called(stub);

              sinon.assert.calledOnceWithExactly(spyResolveLink, "page.html", "https://example.com/baseUrl/");
            });
          });

          context(CONTEXT_DOWN_LINK, function () {
            const options = {
              "capture.downLink.file.mode": "none",
              "capture.downLink.doc.depth": 1,
            };

            it('should call `captureUrl` when downLink is set', async function () {
              var doc = createDocFixture({tagName, attrs: {'http-equiv': 'refresh', 'content': '0; url=page.html?id=123#foo'}});

              var {doc} = await new TestCapturer().captureDocument({doc, docUrl, settings: {timeId}, options});

              sinon.assert.calledWithMatch(spyCaptureUrl, {
                url: 'https://example.com/page.html?id=123#foo',
                refUrl: docUrl,
                downLink: true,
                settings: {
                  timeId,
                  depth: 1,
                  isMainPage: false,
                  isMainFrame: true,
                  recurseChain: [],
                },
              });
            });
          });
        });

        context('for [http-equiv="content-security-policy"]', function () {
          for (const mode of ["save", "remove", "<other>"]) {
            context(`when options["capture.contentSecurityPolicy"] = "${mode}"`, function () {
              var options = {
                "capture.contentSecurityPolicy": mode,
              };

              switch (mode) {
                case "save": {
                  it('should keep the original value', async function () {
                    var doc = createDocFixture({
                      tagName: 'head',
                      children: [
                        {tagName, attrs: {'http-equiv': 'content-security-policy', 'content': "default-src 'self'; img-src 'self'"}},
                        {tagName, attrs: {'http-equiv': 'content-security-policy', 'content': "default-src 'self'; script-src 'self'"}},
                        {tagName, attrs: {'http-equiv': 'content-security-policy', 'content': "default-src 'self'; object-src 'self'"}},
                      ],
                    });

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elems = doc.querySelectorAll(tagName);
                    assert.strictEqual(elems[0].getAttribute('content'), "default-src 'self'; img-src 'self'");
                    assert.strictEqual(elems[1].getAttribute('content'), "default-src 'self'; script-src 'self'");
                    assert.strictEqual(elems[2].getAttribute('content'), "default-src 'self'; object-src 'self'");

                    sinon.assert.neverCalledWith(spyRewrite, elems[0], 'content');
                    sinon.assert.neverCalledWith(spyRewrite, elems[1], 'content');
                    sinon.assert.neverCalledWith(spyRewrite, elems[2], 'content');
                  });

                  break;
                }
                case "remove":
                default: {
                  it('should remove the element', async function () {
                    var doc = createDocFixture({
                      tagName: 'head',
                      children: [
                        {tagName, attrs: {'http-equiv': 'content-security-policy', 'content': "default-src 'self'; img-src 'self'"}},
                        {tagName, attrs: {'http-equiv': 'content-security-policy', 'content': "default-src 'self'; script-src 'self'"}},
                        {tagName, attrs: {'http-equiv': 'content-security-policy', 'content': "default-src 'self'; object-src 'self'"}},
                      ],
                    });
                    var elems = doc.querySelectorAll(tagName);

                    var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                    assert.isNull(rewriter.doc.querySelector(tagName));

                    sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(elems[0]));
                    sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(elems[1]));
                    sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(elems[2]));
                  });

                  break;
                }
              }

              it('should skip when `http-equiv` has spaced value', async function () {
                var doc = createDocFixture({
                  tagName: 'head',
                  children: [
                    {tagName, attrs: {'http-equiv': ' content-security-policy', 'content': "default-src 'self'; img-src 'self'"}},
                    {tagName, attrs: {'http-equiv': 'content-security-policy ', 'content': "default-src 'self'; script-src 'self'"}},
                    {tagName, attrs: {'http-equiv': '\tcontent-security-policy', 'content': "default-src 'self'; object-src 'self'"}},
                  ],
                });

                var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                for (const elem of doc.querySelectorAll(tagName)) {
                  sinon.assert.neverCalledWith(spyRewrite, elem, 'content');
                }
              });

              it('should skip when in a shadow DOM', async function () {
                var doc = createDocFixture({tagName: 'div', shadow: {
                  children: [
                    {tagName, attrs: {'http-equiv': 'content-security-policy', 'content': "default-src 'self'; img-src 'self'"}},
                  ],
                }});

                var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                var elem = doc.querySelector('div').shadowRoot.querySelector(tagName);
                sinon.assert.neverCalledWith(spyRewrite, elem, 'content');
              });
            });
          }
        });

        context('for [name="referrer"]', function () {
          it('should work when `name` is in altered case', async function () {
            var doc = createDocFixture({tagName, attrs: {name: 'REFERRER', content: "no-referrer-when-downgrade"}});

            var rewriter = await new TestCapturer().captureDocument({doc, docUrl});
            assert.strictEqual(rewriter.docRefPolicy, "no-referrer-when-downgrade");
          });

          it('should skip when `name` has spaced value', async function () {
            var doc = createDocFixture({
              tagName: 'head',
              children: [
                {tagName, attrs: {name: ' referrer', content: "no-referrer-when-downgrade"}},
                {tagName, attrs: {name: 'referrer ', content: "same-origin"}},
                {tagName, attrs: {name: 'referrer\t', content: "origin"}},
              ],
            });

            var rewriter = await new TestCapturer().captureDocument({doc, docUrl});
            assert.strictEqual(rewriter.docRefPolicy, '');
          });

          it('should skip when in a shadow DOM', async function () {
            var doc = createDocFixture({tagName: 'div', shadow: {
              children: [
                {tagName, attrs: {name: 'referrer', content: "no-referrer-when-downgrade"}},
              ],
            }});

            var rewriter = await new TestCapturer().captureDocument({doc, docUrl});
            assert.strictEqual(rewriter.docRefPolicy, '');
          });

          context(CONTEXT_REFERRER_POLICY, function () {
            it('should update document referrer policy when the value is valid', async function () {
              for (const value of META_REFERRER_POLICY) {
                var doc = createDocFixture({tagName, attrs: {name: 'referrer', content: value}});

                var tester = function ([elem], {func, doneSignal}) {
                  if (elem === this.doc.querySelector(tagName)) {
                    assert.strictEqual(this.docRefPolicy, '', `when content value is "${value}"`);
                    func.call(this, elem);
                    assert.strictEqual(this.docRefPolicy, value, `when content value is "${value}"`);
                    throw doneSignal;
                  }
                  return func.call(this, elem);
                };

                var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester});
                sinon.assert.called(stub);
              }
            });

            $it.xfail()('should update document referrer policy to a canonical value when the value is legacy', async function () {
              for (const [value, newValue] of META_REFERRER_POLICY_LEGACY) {
                var doc = createDocFixture({tagName, attrs: {name: 'referrer', content: value}});

                var tester = function ([elem], {func, doneSignal}) {
                  if (elem === this.doc.querySelector(tagName)) {
                    assert.strictEqual(this.docRefPolicy, '', `when content value is "${value}"`);
                    func.call(this, elem);
                    assert.strictEqual(this.docRefPolicy, newValue, `when content value is "${value}" ("${newValue}")`);
                    throw doneSignal;
                  }
                  return func.call(this, elem);
                };

                var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester});
                sinon.assert.called(stub);
              }
            });

            it('should not change document referrer policy when the value is invalid', async function () {
              var doc = createDocFixture({
                tagName: 'head',
                children: [
                  {tagName, attrs: {name: 'referrer', content: 'origin-when-cross-origin'}},
                  {tagName, attrs: {name: 'referrer', content: 'unknown'}},
                ],
              });

              var tester = function ([elem], {func, doneSignal}) {
                if (elem === this.doc.querySelectorAll(tagName)[1]) {
                  assert.strictEqual(this.docRefPolicy, 'origin-when-cross-origin');
                  func.call(this, elem);
                  assert.strictEqual(this.docRefPolicy, 'origin-when-cross-origin');
                  throw doneSignal;
                }
                return func.call(this, elem);
              };

              var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester});
              sinon.assert.called(stub);
            });
          });
        });
      });

      context('for <link>', function () {
        const tagName = 'link';

        context('for [rel~="stylesheet"]', function () {
          const rel = ["stylesheet"];

          for (const mode of ["save", "link", "blank", "remove", "<other>"]) {
            context(`when options["capture.style"] = "${mode}"`, function () {
              const options = {
                "capture.style": mode,
              };

              switch (mode) {
                case "save":
                default: {
                  it('should save the rewritten CSS and rewrite `href` attribute', async function () {
                    var doc = createDocFixture({tagName, rel, attrs: {href: "./style.css"}});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('href'), 'style.css');

                    sinon.assert.calledOnceWithMatch(spyRewritCss, {
                      elem,
                      baseUrl: 'https://example.com/',
                      refUrl: 'https://example.com/',
                      refPolicy: '',
                      envCharset: 'UTF-8',
                    });
                    sinon.assert.calledWithExactly(spyRewrite, elem, 'href', 'style.css');
                  });

                  it('should take the value and remove `charset` attribute', async function () {
                    var doc = createDocFixture({tagName, rel, attrs: {href: "./style.css", charset: "Big5"}});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('charset'), null);

                    sinon.assert.calledOnceWithMatch(spyRewritCss, {
                      elem,
                      baseUrl: 'https://example.com/',
                      refUrl: 'https://example.com/',
                      refPolicy: '',
                      envCharset: 'Big5',
                    });
                    sinon.assert.calledWithExactly(spyRewrite, elem, 'charset', null);
                  });

                  context(CONTEXT_CROSS_ORIGIN, function () {
                    it('should remove `crossorigin` attribute', async function () {
                      var doc = createDocFixture({tagName, rel, attrs: {href: "./style.css", crossorigin: ""}});

                      var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.getAttribute('crossorigin'), null);

                      sinon.assert.calledWithExactly(spyRewrite, elem, 'crossorigin', null);
                    });
                  });

                  break;
                }
                case "link": {
                  it('should rewrite `href` attribute to the resolved URL', async function () {
                    var doc = createDocFixture({tagName, rel, attrs: {href: "./style.css"}});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('href'), 'https://example.com/style.css');

                    sinon.assert.calledWithExactly(spyRewrite, elem, 'href', 'https://example.com/style.css');
                  });

                  break;
                }
                case "blank": {
                  it('should blank `href` attribute', async function () {
                    var doc = createDocFixture({tagName, rel, attrs: {href: "./style.css"}});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('href'), null);

                    sinon.assert.calledWithExactly(spyRewrite, elem, 'href', null);
                  });

                  break;
                }
                case "remove": {
                  it('should remove the element', async function () {
                    var doc = createDocFixture({tagName, rel, attrs: {href: "./style.css"}});
                    var elem = doc.querySelector(tagName);

                    var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                    assert.strictEqual(rewriter.doc.querySelector('link[rel="stylesheet"]'), null);

                    sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(elem));
                  });

                  break;
                }
              }

              context(CONTEXT_BASE_URL, function () {
                it('should resolve the URL with `baseUrl`', async function () {
                  var doc = createDocFixture({tagName, rel, attrs: {href: "./style.css"}});
                  var tester = baseUrlHandlingTesterFactory({tagName, docUrl});

                  var {stub} = await rewriteNodeControlledTest({doc, docUrl, options, tester});
                  sinon.assert.called(stub);

                  sinon.assert.calledOnceWithExactly(spyResolve, "./style.css", 'https://example.com/baseUrl/');
                });

                if (mode === "save") {
                  it('should resolve URLs in the CSS with `baseUrl`', async function () {
                    var doc = createDocFixture({tagName, rel, attrs: {href: "./style.css"}});

                    var tester = baseUrlHandlingTesterFactory({tagName, docUrl, interrupt: false});

                    var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester, options});
                    sinon.assert.called(stub);

                    sinon.assert.calledOnceWithMatch(spyRewritCss, {
                      baseUrl: "https://example.com/baseUrl/",
                    });
                  });
                }
              });
            });
          }
        });

        context('for [rel~="icon"]', function () {
          const rel = ["shortcut", "icon"];

          for (const mode of ["save", "link", "blank", "remove", "<other>"]) {
            context(`when options["capture.favicon"] = "${mode}"`, function () {
              const options = {
                "capture.favicon": mode,
              };

              switch (mode) {
                case "save":
                default: {
                  it('should save the resource and rewrite `href` attribute', async function () {
                    var doc = createDocFixture({tagName, rel, attrs: {href: "./green.ico"}});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('href'), 'green.ico');

                    sinon.assert.calledWithExactly(spyRewrite, elem, 'href', 'green.ico');
                  });

                  context(CONTEXT_CROSS_ORIGIN, function () {
                    it('should remove `crossorigin` attribute', async function () {
                      var doc = createDocFixture({tagName, rel, attrs: {href: "./green.ico", crossorigin: ""}});

                      var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.getAttribute('crossorigin'), null);

                      sinon.assert.calledWithExactly(spyRewrite, elem, 'crossorigin', null);
                    });
                  });

                  break;
                }
                case "link": {
                  it('should rewrite `href` attribute to the resolved URL', async function () {
                    var doc = createDocFixture({tagName, rel, attrs: {href: "./green.ico"}});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('href'), 'https://example.com/green.ico');

                    sinon.assert.calledWithExactly(spyRewrite, elem, 'href', 'https://example.com/green.ico');
                  });

                  break;
                }
                case "blank": {
                  it('should blank `href` attribute', async function () {
                    var doc = createDocFixture({tagName, rel, attrs: {href: "./green.ico"}});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('href'), null);

                    sinon.assert.calledWithExactly(spyRewrite, elem, 'href', null);
                  });

                  break;
                }
                case "remove": {
                  it('should remove the element', async function () {
                    var doc = createDocFixture({tagName, rel, attrs: {href: "./green.ico"}});
                    var elem = doc.querySelector(tagName);

                    var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                    assert.strictEqual(rewriter.doc.querySelector('link[rel~="icon"]'), null);

                    sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(elem));
                  });

                  break;
                }
              }

              context(CONTEXT_FAVICON, function () {
                switch (mode) {
                  case "save":
                  default: {
                    it('should update `favIconUrl` to the rewritten URL when undefined', async function () {
                      var doc = createDocFixture({tagName, rel, attrs: {href: "./green.ico"}});

                      var tester = function ([elem], {func, doneSignal}) {
                        if (elem === this.doc.querySelector(tagName)) {
                          this.favIconUrl = undefined;
                        }
                        return func.call(this, elem);
                      };

                      var {stub, rewriter} = await rewriteNodeControlledTest({doc, docUrl, tester, options});
                      sinon.assert.called(stub);

                      assert.strictEqual(rewriter.favIconUrl, 'green.ico');
                    });

                    break;
                  }
                  case "link": {
                    it('should update `favIconUrl` to the resolved URL when undefined', async function () {
                      var doc = createDocFixture({tagName, rel, attrs: {href: "./green.ico"}});

                      var tester = function ([elem], {func, doneSignal}) {
                        if (elem === this.doc.querySelector(tagName)) {
                          this.favIconUrl = undefined;
                        }
                        return func.call(this, elem);
                      };

                      var {stub, rewriter} = await rewriteNodeControlledTest({doc, docUrl, tester, options});
                      sinon.assert.called(stub);

                      assert.strictEqual(rewriter.favIconUrl, 'https://example.com/green.ico');
                    });

                    break;
                  }
                  case "blank":
                  case "remove": {
                    it('should update `favIconUrl` to "" when undefined', async function () {
                      var doc = createDocFixture({tagName, rel, attrs: {href: "./green.ico"}});

                      var tester = function ([elem], {func, doneSignal}) {
                        if (elem === this.doc.querySelector(tagName)) {
                          this.favIconUrl = undefined;
                        }
                        return func.call(this, elem);
                      };

                      var {stub, rewriter} = await rewriteNodeControlledTest({doc, docUrl, tester, options});
                      sinon.assert.called(stub);

                      assert.strictEqual(rewriter.favIconUrl, '');
                    });

                    break;
                  }
                }

                it('should not update `favIconUrl` when in shadow DOM', async function () {
                  var doc = createDocFixture({tagName: 'div', shadow: {
                    children: [{tagName, rel, attrs: {href: "./green.ico"}}],
                  }});

                  var tester = function ([elem], {func, doneSignal}) {
                    if (elem === this.doc.querySelector(tagName)) {
                      this.favIconUrl = undefined;
                    }
                    return func.call(this, elem);
                  };

                  var {stub, rewriter} = await rewriteNodeControlledTest({doc, docUrl, tester, options});
                  sinon.assert.called(stub);

                  assert.strictEqual(rewriter.favIconUrl, undefined);
                });

                it('should not alter `favIconUrl` when defined', async function () {
                  var doc = createDocFixture({tagName, rel, attrs: {href: "./green.ico"}});

                  var tester = function ([elem], {func, doneSignal}) {
                    if (elem === this.doc.querySelector(tagName)) {
                      this.favIconUrl = 'https://example.com/myicon.ico';
                    }
                    return func.call(this, elem);
                  };

                  var {stub, rewriter} = await rewriteNodeControlledTest({doc, docUrl, tester, options});
                  sinon.assert.called(stub);

                  assert.strictEqual(rewriter.favIconUrl, 'https://example.com/myicon.ico');
                });
              });

              context(CONTEXT_BASE_URL, function () {
                it('should resolve the URL with `baseUrl`', async function () {
                  var doc = createDocFixture({tagName, rel, attrs: {href: "./green.ico"}});
                  var tester = baseUrlHandlingTesterFactory({tagName, docUrl});

                  var {stub} = await rewriteNodeControlledTest({doc, docUrl, options, tester});
                  sinon.assert.called(stub);

                  sinon.assert.calledOnceWithExactly(spyResolve, './green.ico', 'https://example.com/baseUrl/');
                });
              });
            });
          }
        });

        context('for icon-like [rel]', function () {
          const rels = ["apple-touch-icon", "apple-touch-icon-precomposed"];
          const rel = ["apple-touch-icon"];

          for (const mode of ["save", "link", "blank", "remove", "<other>"]) {
            context(`when options["capture.favicon"] = "${mode}"`, function () {
              const options = {
                "capture.favicon": mode,
                "capture.faviconAttrs": rels.join(" "),
              };

              switch (mode) {
                case "save":
                default: {
                  it('should save the resource and rewrite `href` attribute', async function () {
                    var doc = createDocFixture({tagName, rel, attrs: {href: "./green.png"}});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('href'), 'green.png');

                    sinon.assert.calledWithExactly(spyRewrite, elem, 'href', 'green.png');
                  });

                  context(CONTEXT_CROSS_ORIGIN, function () {
                    it('should remove `crossorigin` attribute', async function () {
                      var doc = createDocFixture({tagName, rel, attrs: {href: "./green.png", crossorigin: ""}});

                      var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.getAttribute('crossorigin'), null);

                      sinon.assert.calledWithExactly(spyRewrite, elem, 'crossorigin', null);
                    });
                  });

                  break;
                }
                case "link": {
                  it('should rewrite `href` attribute to the resolved URL', async function () {
                    var doc = createDocFixture({tagName, rel, attrs: {href: "./green.png"}});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('href'), 'https://example.com/green.png');

                    sinon.assert.calledWithExactly(spyRewrite, elem, 'href', 'https://example.com/green.png');
                  });

                  break;
                }
                case "blank": {
                  it('should blank `href` attribute', async function () {
                    var doc = createDocFixture({tagName, rel, attrs: {href: "./green.png"}});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('href'), null);

                    sinon.assert.calledWithExactly(spyRewrite, elem, 'href', null);
                  });

                  break;
                }
                case "remove": {
                  it('should remove the element', async function () {
                    var doc = createDocFixture({tagName, rel, attrs: {href: "./green.png"}});
                    var elem = doc.querySelector(tagName);

                    var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                    assert.strictEqual(rewriter.doc.querySelector(`link[rel~="${rel}"]`), null);

                    sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(elem));
                  });

                  break;
                }
              }

              it('should never update `favIconUrl`', async function () {
                var doc = createDocFixture({tagName, rel, attrs: {href: "./green.png"}});

                var tester = function ([elem], {func, doneSignal}) {
                  if (elem === this.doc.querySelector(tagName)) {
                    this.favIconUrl = undefined;
                  }
                  return func.call(this, elem);
                };

                var {stub, rewriter} = await rewriteNodeControlledTest({doc, docUrl, tester, options});
                sinon.assert.called(stub);

                assert.strictEqual(rewriter.favIconUrl, undefined);
              });

              context(CONTEXT_BASE_URL, function () {
                it('should resolve the URL with `baseUrl`', async function () {
                  var doc = createDocFixture({tagName, rel, attrs: {href: "./green.png"}});
                  var tester = baseUrlHandlingTesterFactory({tagName, docUrl});

                  var {stub} = await rewriteNodeControlledTest({doc, docUrl, options, tester});
                  sinon.assert.called(stub);

                  sinon.assert.calledOnceWithExactly(spyResolve, './green.png', 'https://example.com/baseUrl/');
                });
              });
            });
          }
        });

        for (const _rel of ["preload", "modulepreload", "dns-prefetch"]) {
          context(`for [rel~="${_rel}"]`, function () {
            const rel = [_rel];

            for (const mode of ["blank", "remove", "<other>"]) {
              context(`when options["capture.preload"] = "${mode}"`, function () {
                const options = {
                  "capture.preload": mode,
                };

                switch (mode) {
                  case "blank": {
                    it('should blank `href` attribute', async function () {
                      var doc = createDocFixture({tagName, rel, attrs: {href: "./green.bmp"}});

                      var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.getAttribute('href'), null);

                      sinon.assert.calledWithExactly(spyRewrite, elem, 'href', null);
                    });

                    if (_rel === "preload") {
                      it('should blank `imagesrcset` attribute', async function () {
                        var doc = createDocFixture({tagName, rel, attrs: {imagesrcset: "./green.bmp, ./yellow.bmp 2x"}});

                        var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                        var elem = doc.querySelector(tagName);
                        assert.strictEqual(elem.getAttribute('imagesrcset'), null);

                        sinon.assert.calledWithExactly(spyRewrite, elem, 'imagesrcset', null);
                      });
                    }

                    break;
                  }
                  case "remove":
                  default: {
                    it('should remove the element', async function () {
                      var doc = createDocFixture({tagName, rel, attrs: {href: "./green.bmp"}});
                      var elemOrig = doc.querySelector(tagName);

                      var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                      assert.strictEqual(rewriter.doc.querySelector(`link[rel="${rel}"]`), null);

                      sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                    });

                    break;
                  }
                }
              });
            }
          });
        }

        for (const _rel of ["prefetch", "prerender"]) {
          context(`for [rel~="${_rel}"]`, function () {
            const rel = [_rel];

            for (const mode of ["blank", "remove", "<other>"]) {
              context(`when options["capture.prefetch"] = "${mode}"`, function () {
                const options = {
                  "capture.prefetch": mode,
                };

                switch (mode) {
                  case "blank": {
                    it('should blank `href` attribute', async function () {
                      var doc = createDocFixture({tagName, rel, attrs: {href: "./green.bmp"}});

                      var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.getAttribute('href'), null);

                      sinon.assert.calledWithExactly(spyRewrite, elem, 'href', null);
                    });

                    break;
                  }
                  case "remove":
                  default: {
                    it('should remove the element', async function () {
                      var doc = createDocFixture({tagName, rel, attrs: {href: "./green.bmp"}});
                      var elemOrig = doc.querySelector(tagName);

                      var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                      assert.strictEqual(rewriter.doc.querySelector(`link[rel="${rel}"]`), null);

                      sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                    });

                    break;
                  }
                }
              });
            }
          });
        }
      });

      context('for <style>', function () {
        const tagName = 'style';

        for (const mode of ["save", "link", "blank", "remove", "<other>"]) {
          context(`when options["capture.style"] = "${mode}"`, function () {
            const options = {
              "capture.style": mode,
            };

            switch (mode) {
              case "save":
              case "link":
              default: {
                it('should rewrite the text content with `DocumentCssHandler.rewriteCss`', async function () {
                  var doc = createDocFixture({tagName, value: 'body { background-image: url("./green.bmp"); }'});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.textContent, 'body { background-image: url("green.bmp"); }');

                  sinon.assert.calledOnceWithMatch(spyRewritCss, {
                    elem,
                    baseUrl: 'https://example.com/',
                    refUrl: 'https://example.com/',
                    refPolicy: '',
                    envCharset: 'UTF-8',
                  });
                  sinon.assert.calledWithExactly(spyRewriteText, elem, 'body { background-image: url("green.bmp"); }');
                });

                context(CONTEXT_BASE_URL, function () {
                  it('should resolve the URLs with `baseUrl`', async function () {
                    var doc = createDocFixture({tagName, value: 'body { background-image: url("./green.bmp"); }'});
                    var tester = baseUrlHandlingTesterFactory({tagName, docUrl, interrupt: false});

                    var {stub} = await rewriteNodeControlledTest({doc, docUrl, options, tester});
                    sinon.assert.called(stub);

                    sinon.assert.calledOnceWithMatch(spyRewritCss, {
                      baseUrl: 'https://example.com/baseUrl/',
                    });
                  });
                });

                context(CONTEXT_RAW_TEXT_ESCAPING, function () {
                  it('should escape tag-ending text in HTML document', async function () {
                    var doc = createDocFixture({tagName, value: 'body { content: "</style>"; background-image: url("./green.bmp"); }'});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.textContent, 'body { content: "<\\/style>"; background-image: url("green.bmp"); }');
                  });

                  it('should not escape tag-ending text in non-HTML document', async function () {
                    var doc = createDocFixture({type: 'xhtml', tagName, value: 'body { content: "</style>"; background-image: url("./green.bmp"); }'});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.textContent, 'body { content: "</style>"; background-image: url("green.bmp"); }');
                  });
                });

                break;
              }
              case "blank": {
                it('should blank the text content', async function () {
                  var doc = createDocFixture({tagName, value: 'body { background-image: url("./green.bmp"); }'});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.textContent, '');

                  sinon.assert.notCalled(spyRewritCss);
                  sinon.assert.calledOnceWithExactly(spyRewriteText, elem, '');
                });

                break;
              }
              case "remove": {
                it('should remove the element', async function () {
                  var doc = createDocFixture({tagName, value: 'body { background-image: url("./green.bmp"); }'});
                  var elemOrig = doc.querySelector(tagName);

                  var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isNull(rewriter.doc.querySelector(tagName));

                  sinon.assert.notCalled(spyRewritCss);
                  sinon.assert.calledOnceWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                });

                break;
              }
            }
          });
        }
      });

      context('for <script>', function () {
        const tagName = 'script';

        for (const mode of ["save", "link", "blank", "remove", "<other>"]) {
          context(`when options["capture.script"] = "${mode}"`, function () {
            const options = {
              "capture.script": mode,
            };

            switch (mode) {
              case "save":
              default: {
                it('should save resource and rewrite `src` attribute', async function () {
                  var doc = createDocFixture({tagName, attrs: {src: './script.js'}});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('src'), 'script.js');

                  sinon.assert.calledWithExactly(spyRewrite, elem, "src", "script.js");
                });

                it('should keep the text content', async function () {
                  var doc = createDocFixture({tagName, value: 'console.debug("test")'});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.textContent, 'console.debug("test")');

                  sinon.assert.calledWithExactly(spyRewriteText, elem, 'console.debug("test")');
                });

                context(CONTEXT_CROSS_ORIGIN, function () {
                  it('should remove `crossorigin` attribute', async function () {
                    var doc = createDocFixture({tagName, attrs: {href: "./style.css", crossorigin: ""}});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('crossorigin'), null);

                    sinon.assert.calledWithExactly(spyRewrite, elem, "crossorigin", null);
                  });
                });

                break;
              }
              case "link": {
                it('should rewrite `src` attribute to the resolved URL', async function () {
                  var doc = createDocFixture({tagName, attrs: {src: './script.js'}});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('src'), 'https://example.com/script.js');

                  sinon.assert.calledWithExactly(spyRewrite, elem, "src", 'https://example.com/script.js');
                });

                it('should keep the text content', async function () {
                  var doc = createDocFixture({tagName, value: 'console.debug("test")'});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.textContent, 'console.debug("test")');

                  sinon.assert.calledWithExactly(spyRewriteText, elem, 'console.debug("test")');
                });

                break;
              }
              case "blank": {
                it('should blank `src` attribute', async function () {
                  var doc = createDocFixture({tagName, attrs: {src: './script.js'}});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('src'), null);

                  sinon.assert.calledWithExactly(spyRewrite, elem, "src", null);
                });

                it('should blank the text content', async function () {
                  var doc = createDocFixture({tagName, value: 'console.debug("test")'});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.textContent, '');

                  sinon.assert.calledWithExactly(spyRewriteText, elem, "");
                });

                break;
              }
              case "remove": {
                it('should remove the element', async function () {
                  var doc = createDocFixture({tagName, attrs: {src: './script.js'}, value: 'console.debug("test")'});
                  var elemOrig = doc.querySelector(tagName);

                  var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isNull(rewriter.doc.querySelector(tagName));

                  sinon.assert.calledOnceWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                });

                it('should remove the element when having no `href` and text content', async function () {
                  var doc = createDocFixture({tagName});
                  var elemOrig = doc.querySelector(tagName);

                  var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isNull(rewriter.doc.querySelector(tagName));

                  sinon.assert.calledOnceWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                });

                break;
              }
            }

            context(CONTEXT_BASE_URL, function () {
              it('should resolve the URL with `baseUrl`', async function () {
                var doc = createDocFixture({tagName, attrs: {src: './script.js'}});
                var tester = baseUrlHandlingTesterFactory({tagName, docUrl});

                var {stub} = await rewriteNodeControlledTest({doc, docUrl, options, tester});
                sinon.assert.called(stub);

                sinon.assert.calledOnceWithExactly(spyResolve, './script.js', 'https://example.com/baseUrl/');
              });
            });

            context(CONTEXT_RAW_TEXT_ESCAPING, function () {
              switch (mode) {
                case "save":
                case "link": {
                  it('should escape tag-ending text in HTML document', async function () {
                    var doc = createDocFixture({tagName, value: 'console.debug("</script>")'});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.textContent, 'console.debug("<\\/script>")');
                  });

                  it('should not escape tag-ending text in non-HTML document', async function () {
                    var doc = createDocFixture({type: 'xhtml', tagName, value: 'console.debug("</script>")'});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.textContent, 'console.debug("</script>")');
                  });

                  break;
                }
              }
            });
          });
        }
      });

      context('for <noscript>', function () {
        function docFactoryData() {
          return {tagName, children: [
            'foo',
            {tagName: '#comment', value: 'bar'},
            {tagName: 'img', attrs: {src: './green.bmp'}},
          ]};
        }

        async function docFactoryHeaded() {
          const _doc = createDocFixture(docFactoryData());
          const blob = new Blob([utils.documentToString(_doc)], {type: _doc.contentType});
          const src = URL.createObjectURL(blob);
          const {contentDocument: doc} = await createIframeFixture({src});
          URL.revokeObjectURL(src);

          // When JavaScript is enabled (which is always the case in an extension page),
          // noscript content is loaded as text by the browser.
          assert.lengthOf(doc.querySelector('noscript').childNodes, 1);

          return doc;
        }

        function docFactoryHeadless() {
          const doc = createDocFixture(docFactoryData());

          // Verify that noscript content is normal DOM.
          assert.lengthOf(doc.querySelector('noscript').childNodes, 3);

          return doc;
        }

        const tagName = 'noscript';

        for (const mode of ["save", "blank", "remove", "<other>"]) {
          context(`when options["capture.noscript"] = "${mode}"`, function () {
            const options = {
              "capture.noscript": mode,
              "capture.image": "save",
            };

            switch (mode) {
              case "save":
              default: {
                for (const [desc, factory] of [
                  ['should keep and rewrite content elements for a headed document', docFactoryHeaded],
                  ['should keep and rewrite content elements for a headless document', docFactoryHeadless],
                ]) {
                  it(desc, async function () {
                    var doc = await factory();

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.innerHTML, 'foo<!--bar--><img src="green.bmp">');

                    sinon.assert.calledWith(spyRewrite, doc.querySelector('noscript img'), 'src');
                  });
                }

                break;
              }
              case "blank": {
                for (const [desc, factory] of [
                  ['should clear the content for a headed document', docFactoryHeaded],
                  ['should clear the content for a headless document', docFactoryHeadless],
                ]) {
                  it(desc, async function () {
                    var doc = await factory();

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.innerHTML, '');

                    sinon.assert.calledOnceWithExactly(spyRewriteText, elem, '');
                  });
                }

                break;
              }
              case "remove": {
                for (const [desc, factory] of [
                  ['should remove the element for a headed document', docFactoryHeaded],
                  ['should remove the element for a headless document', docFactoryHeadless],
                ]) {
                  it(desc, async function () {
                    var doc = await factory();
                    var elemOrig = doc.querySelector(tagName);

                    var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                    assert.isNull(rewriter.doc.querySelector(tagName));

                    sinon.assert.calledOnceWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                  });
                }

                break;
              }
            }
          });
        }
      });

      for (const tagName of ["body", "table", "tr", "th", "td"]) {
        context(`for <${tagName}>`, function () {
          for (const mode of ["save", "save-used", "link", "blank", "remove", "<other>"]) {
            context(`when options["capture.imageBackground"] = "${mode}"`, function () {
              const options = {
                "capture.imageBackground": mode,
              };

              switch (mode) {
                case "save":
                case "save-used":
                default: {
                  it('should save resource and rewrite `background` attribute', async function () {
                    var doc = createDocFixture({tagName, attrs: {background: "./green.bmp"}});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('background'), 'green.bmp');

                    sinon.assert.calledOnceWithExactly(spyResolve, './green.bmp', 'https://example.com/');
                    sinon.assert.calledWithExactly(spyRewrite, elem, 'background', 'green.bmp');
                  });

                  break;
                }
                case "link": {
                  it('should rewrite `background` attribute to the resolved URL', async function () {
                    var doc = createDocFixture({tagName, attrs: {background: "./green.bmp"}});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('background'), 'https://example.com/green.bmp');

                    sinon.assert.calledOnceWithExactly(spyResolve, './green.bmp', 'https://example.com/');
                    sinon.assert.calledWithExactly(spyRewrite, elem, 'background', 'https://example.com/green.bmp');
                  });

                  break;
                }
                case "blank":
                case "remove": {
                  it('should remove `background` attribute', async function () {
                    var doc = createDocFixture({tagName, attrs: {background: "./green.bmp"}});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('background'), null);

                    sinon.assert.calledOnceWithExactly(spyResolve, './green.bmp', 'https://example.com/');
                    sinon.assert.calledWithExactly(spyRewrite, elem, 'background', null);
                  });

                  break;
                }
              }

              context(CONTEXT_BASE_URL, function () {
                it('should resolve the URL with `baseUrl`', async function () {
                  var doc = createDocFixture({tagName, attrs: {background: "./green.bmp"}});
                  var tester = baseUrlHandlingTesterFactory({tagName, docUrl});

                  var {stub} = await rewriteNodeControlledTest({doc, docUrl, options, tester});
                  sinon.assert.called(stub);

                  sinon.assert.calledOnceWithExactly(spyResolve, './green.bmp', 'https://example.com/baseUrl/');
                });
              });
            });
          }
        });
      }

      for (const tagName of ["frame", "iframe"]) {
        context(`for <${tagName}>`, function () {
          async function docFactory({attrs, text}) {
            let doc;
            if (tagName === 'iframe') {
              ({contentDocument: doc} = await createIframeFixture({hidden: false, docData: {
                tagName, attrs, value: text,
              }}));
            } else {
              ({contentDocument: doc} = await createIframeFixture({hidden: false, docData: {
                tagName: 'html',
                children: [
                  {tagName: 'frameset', attrs: {cols: '100%'}, children: [
                    {tagName, attrs, value: text},
                  ]},
                ],
              }}));
            }

            await waitFrameLoading(doc.querySelector(tagName));

            return doc;
          }

          function docFactoryHeadless({attrs, text}) {
            if (tagName === 'iframe') {
              return createDocFixture({tagName, attrs, value: text});
            } else {
              return createDocFixture({
                tagName: 'html',
                children: [
                  {tagName: 'frameset', attrs: {cols: '100%'}, children: [
                    {tagName, attrs, value: text},
                  ]},
                ],
              });
            }
          }

          const resMap = {
            [`${docUrl}page.html`]: {
              blob: new Blob(['<img src="./blue.bmp">'], {type: 'text/html'}),
            },
            [`${docUrl}red.bmp`]: {
              blob: new Blob([utils.byteStringToArrayBuffer(RED_BMP_BYTES)], {type: 'image/bmp'}),
            },
            [`${docUrl}green.bmp`]: {
              blob: new Blob([utils.byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'}),
            },
            [`${docUrl}blue.bmp`]: {
              blob: new Blob([utils.byteStringToArrayBuffer(BLUE_BMP_BYTES)], {type: 'image/bmp'}),
            },
          };

          for (const mode of ["save", "link", "blank", "remove", "<other>"]) {
            context(`when options["capture.frame"] = "${mode}"`, function () {
              const options = {
                "capture.frame": mode,
              };

              switch (mode) {
                case "save":
                default: {
                  context('when having `src`', function () {
                    it('should capture the content document and rewrite `src` for a headed document', async function () {
                      var doc = await docFactory({attrs: {src: './page.html'}});
                      var iDoc = doc.querySelector(tagName).contentDocument;

                      var {doc} = await new TestCapturer(resMap).captureDocument({doc, docUrl, settings: {timeId}, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.getAttribute('src'), 'index_1.html');

                      sinon.assert.calledWithExactly(spyResolve, './page.html', 'https://example.com/', {checkJavascript: true});
                      sinon.assert.calledWithMatch(spyCaptureDocumentOrFile, {
                        doc: iDoc,
                        envDocUrl: 'https://example.com/',
                        baseUrl: 'https://example.com/',
                        refUrl: 'https://example.com/',
                        refPolicy: '',
                        settings: {
                          timeId,
                          documentName: 'index',
                          recurseChain: [],
                          depth: 0,
                          isMainPage: true,
                          isMainFrame: false,
                          type: '',
                          indexFilename: timeId,
                          fullPage: true,
                          usedCssFontUrl: {},
                          usedCssImageUrl: {},
                        },
                      });
                      sinon.assert.notCalled(spyCaptureUrl);
                      sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'index_1.html');
                    });

                    it('should capture the content document headlessly and rewrite `src` for a headless document', async function () {
                      var doc = docFactoryHeadless({attrs: {src: './page.html'}});

                      var {doc} = await new TestCapturer(resMap).captureDocument({doc, docUrl, settings: {timeId}, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.getAttribute('src'), 'index_1.html');

                      sinon.assert.calledWithExactly(spyResolve, './page.html', 'https://example.com/', {checkJavascript: true});
                      sinon.assert.notCalled(spyCaptureDocumentOrFile);
                      sinon.assert.calledWithMatch(spyCaptureUrl, {
                        url: 'https://example.com/page.html',
                        refUrl: 'https://example.com/',
                        refPolicy: '',
                        settings: {
                          timeId,
                          documentName: 'index',
                          recurseChain: ['https://example.com/'],
                          depth: 0,
                          isMainPage: true,
                          isMainFrame: false,
                          type: '',
                          indexFilename: timeId,
                          fullPage: true,
                        },
                      });
                      sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'index_1.html');
                    });
                  });

                  context('when having `srcdoc`', function () {
                    if (tagName === 'iframe') {
                      it('should capture the content document and rewrite `src` and `srcdoc` for a headed document', async function () {
                        var doc = await docFactory({attrs: {src: './page.html', srcdoc: '<img src="./green.bmp">'}});
                        var iDoc = doc.querySelector(tagName).contentDocument;

                        var {doc} = await new TestCapturer(resMap).captureDocument({doc, docUrl, settings: {timeId}, options});
                        var elem = doc.querySelector(tagName);
                        assert.strictEqual(elem.getAttribute('src'), 'index_1.html');
                        assert.strictEqual(elem.getAttribute('srcdoc'), null);

                        sinon.assert.calledWithExactly(spyResolve, './page.html', 'https://example.com/', {checkJavascript: true});
                        sinon.assert.calledWithMatch(spyCaptureDocumentOrFile, {
                          doc: iDoc,
                          envDocUrl: 'https://example.com/',
                          baseUrl: 'https://example.com/',
                          refUrl: 'https://example.com/',
                          refPolicy: '',
                          settings: {
                            timeId,
                            documentName: 'index',
                            recurseChain: [],
                            depth: 0,
                            isMainPage: true,
                            isMainFrame: false,
                            type: '',
                            indexFilename: timeId,
                            fullPage: true,
                            usedCssFontUrl: {},
                            usedCssImageUrl: {},
                          },
                        });
                        sinon.assert.notCalled(spyCaptureUrl);
                        sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'index_1.html');
                        sinon.assert.calledWithExactly(spyRewrite, elem, 'srcdoc', null);
                      });

                      it('should capture from `srcdoc` and rewrite `src` and `srcdoc` for a headless document', async function () {
                        var doc = docFactoryHeadless({attrs: {src: './page.html', srcdoc: '<img src="./green.bmp">'}});

                        var {doc} = await new TestCapturer(resMap).captureDocument({doc, docUrl, settings: {timeId}, options});
                        var elem = doc.querySelector(tagName);
                        assert.strictEqual(elem.getAttribute('src'), 'index_1.html');
                        assert.strictEqual(elem.getAttribute('srcdoc'), null);

                        sinon.assert.calledWithExactly(spyResolve, './page.html', 'https://example.com/', {checkJavascript: true});
                        sinon.assert.calledWithMatch(spyCaptureDocument, {
                          docUrl: 'about:srcdoc',
                          envDocUrl: 'https://example.com/',
                          baseUrl: 'https://example.com/',
                          refPolicy: '',
                          settings: {
                            timeId,
                            documentName: 'index',
                            recurseChain: [],
                            depth: 0,
                            isMainPage: true,
                            isMainFrame: false,
                            type: '',
                            indexFilename: timeId,
                            fullPage: true,
                            usedCssFontUrl: undefined,
                            usedCssImageUrl: undefined,
                          },
                        });
                        sinon.assert.notCalled(spyCaptureUrl);
                        sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'index_1.html');
                        sinon.assert.calledWithExactly(spyRewrite, elem, 'srcdoc', null);
                      });
                    } else {
                      it('should capture the content document and rewrite `src` for a headed document', async function () {
                        var doc = await docFactory({attrs: {src: './page.html', srcdoc: '<img src="./green.bmp">'}});
                        var iDoc = doc.querySelector(tagName).contentDocument;

                        var {doc} = await new TestCapturer(resMap).captureDocument({doc, docUrl, settings: {timeId}, options});
                        var elem = doc.querySelector(tagName);
                        assert.strictEqual(elem.getAttribute('src'), 'index_1.html');
                        assert.strictEqual(elem.getAttribute('srcdoc'), '<img src="./green.bmp">');

                        sinon.assert.calledWithExactly(spyResolve, './page.html', 'https://example.com/', {checkJavascript: true});
                        sinon.assert.calledWithMatch(spyCaptureDocumentOrFile, {
                          doc: iDoc,
                          envDocUrl: 'https://example.com/',
                          baseUrl: 'https://example.com/',
                          refUrl: 'https://example.com/',
                          refPolicy: '',
                          settings: {
                            timeId,
                            documentName: 'index',
                            recurseChain: [],
                            depth: 0,
                            isMainPage: true,
                            isMainFrame: false,
                            type: '',
                            indexFilename: timeId,
                            fullPage: true,
                            usedCssFontUrl: {},
                            usedCssImageUrl: {},
                          },
                        });
                        sinon.assert.notCalled(spyCaptureUrl);
                        sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'index_1.html');
                        sinon.assert.neverCalledWith(spyRewrite, elem, 'srcdoc');
                      });

                      it('should capture the content document headlessly and rewrite `src` for a headless document', async function () {
                        var doc = docFactoryHeadless({attrs: {src: './page.html', srcdoc: '<img src="./green.bmp">'}});

                        var {doc} = await new TestCapturer(resMap).captureDocument({doc, docUrl, settings: {timeId}, options});
                        var elem = doc.querySelector(tagName);
                        assert.strictEqual(elem.getAttribute('src'), 'index_1.html');
                        assert.strictEqual(elem.getAttribute('srcdoc'), '<img src="./green.bmp">');

                        sinon.assert.calledWithExactly(spyResolve, './page.html', 'https://example.com/', {checkJavascript: true});
                        sinon.assert.notCalled(spyCaptureDocumentOrFile);
                        sinon.assert.calledWithMatch(spyCaptureUrl, {
                          url: 'https://example.com/page.html',
                          refUrl: 'https://example.com/',
                          refPolicy: '',
                          settings: {
                            timeId,
                            documentName: 'index',
                            recurseChain: ['https://example.com/'],
                            depth: 0,
                            isMainPage: true,
                            isMainFrame: false,
                            type: '',
                            indexFilename: timeId,
                            fullPage: true,
                          },
                        });
                        sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'index_1.html');
                        sinon.assert.neverCalledWith(spyRewrite, elem, 'srcdoc');
                      });
                    }
                  });

                  break;
                }
                case "link": {
                  context('when having `src`', function () {
                    it('should rewrite `src` to the resolved URL', async function () {
                      var doc = await docFactory({attrs: {src: './page.html'}});

                      var {doc} = await new TestCapturer(resMap).captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.getAttribute('src'), 'https://example.com/page.html');

                      sinon.assert.calledWithExactly(spyResolve, './page.html', 'https://example.com/', {checkJavascript: true});
                      sinon.assert.notCalled(spyCaptureDocumentOrFile);
                      sinon.assert.notCalled(spyCaptureDocument);
                      sinon.assert.notCalled(spyCaptureUrl);
                      sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'https://example.com/page.html');
                    });
                  });

                  context('when having `srcdoc`', function () {
                    if (tagName === 'iframe') {
                      it('should save `srcdoc` as single HTML document for a headed document', async function () {
                        var doc = await docFactory({attrs: {src: './page.html', srcdoc: '<img src="./green.bmp">'}});
                        var iDoc = doc.querySelector(tagName).contentDocument;
                        iDoc.querySelector('img').setAttribute('src', './red.bmp');

                        var {doc} = await new TestCapturer(resMap).captureDocument({doc, docUrl, settings: {timeId}, options});
                        var elem = doc.querySelector(tagName);
                        var srcdoc = `<html><head></head><body><img src="data:image/bmp;filename=red.bmp;base64,${RED_BMP_B64}"></body></html>`;
                        assert.strictEqual(elem.getAttribute('src'), 'https://example.com/page.html');
                        assert.strictEqual(elem.getAttribute('srcdoc'), srcdoc);

                        sinon.assert.calledWithMatch(spyCaptureDocumentOrFile, {
                          doc: iDoc,
                          docUrl: 'about:srcdoc',
                          envDocUrl: 'https://example.com/',
                          baseUrl: 'https://example.com/',
                          refUrl: 'https://example.com/',
                          refPolicy: '',
                          settings: {
                            timeId,
                            documentName: 'index',
                            recurseChain: [],
                            depth: 0,
                            isMainPage: true,
                            isMainFrame: false,
                            type: '',
                            indexFilename: timeId,
                            fullPage: true,
                            usedCssFontUrl: {},
                            usedCssImageUrl: {},
                          },
                        });
                        sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'https://example.com/page.html');
                        sinon.assert.calledWithExactly(spyRewrite, elem, 'srcdoc', srcdoc);
                      });

                      it('should save `srcdoc` from source as single HTML document for a headless document', async function () {
                        var doc = docFactoryHeadless({attrs: {src: './page.html', srcdoc: '<img src="./green.bmp">'}});

                        var {doc} = await new TestCapturer(resMap).captureDocument({doc, docUrl, settings: {timeId}, options});
                        var elem = doc.querySelector(tagName);
                        var srcdoc = `<html><head></head><body><img src="data:image/bmp;filename=green.bmp;base64,${GREEN_BMP_B64}"></body></html>`;
                        assert.strictEqual(elem.getAttribute('src'), 'https://example.com/page.html');
                        assert.strictEqual(elem.getAttribute('srcdoc'), srcdoc);

                        sinon.assert.calledWithMatch(spyCaptureDocument, {
                          docUrl: 'about:srcdoc',
                          envDocUrl: 'https://example.com/',
                          baseUrl: 'https://example.com/',
                          refPolicy: '',
                          settings: {
                            timeId,
                            documentName: 'index',
                            recurseChain: [],
                            depth: 0,
                            isMainPage: true,
                            isMainFrame: false,
                            type: '',
                            indexFilename: timeId,
                            fullPage: true,
                            usedCssFontUrl: undefined,
                            usedCssImageUrl: undefined,
                          },
                        });
                        sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'https://example.com/page.html');
                        sinon.assert.calledWithExactly(spyRewrite, elem, 'srcdoc', srcdoc);
                      });
                    } else {
                      it('should ignore `srcdoc`', async function () {
                        var doc = await docFactory({attrs: {src: './page.html', srcdoc: '<img src="./green.bmp">'}});

                        var {doc} = await new TestCapturer(resMap).captureDocument({doc, docUrl, options});
                        var elem = doc.querySelector(tagName);
                        assert.strictEqual(elem.getAttribute('src'), 'https://example.com/page.html');
                        assert.strictEqual(elem.getAttribute('srcdoc'), '<img src="./green.bmp">');

                        sinon.assert.notCalled(spyCaptureDocumentOrFile);
                        sinon.assert.notCalled(spyCaptureDocument);
                        sinon.assert.notCalled(spyCaptureUrl);
                        sinon.assert.calledWithExactly(spyResolve, './page.html', 'https://example.com/', {checkJavascript: true});
                        sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'https://example.com/page.html');
                        sinon.assert.neverCalledWith(spyRewrite, elem, 'srcdoc');
                      });
                    }
                  });

                  break;
                }
                case "blank": {
                  context('when having `src`', function () {
                    it('should blank `src`', async function () {
                      var doc = await docFactory({attrs: {src: './page.html'}});

                      var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.getAttribute('src'), null);
                      assert.strictEqual(elem.getAttribute('srcdoc'), null);

                      sinon.assert.notCalled(spyCaptureDocumentOrFile);
                      sinon.assert.notCalled(spyCaptureDocument);
                      sinon.assert.notCalled(spyCaptureUrl);
                      sinon.assert.calledWithExactly(spyRewrite, elem, 'src', null);
                    });
                  });

                  context('when having `srcdoc`', function () {
                    if (tagName === 'iframe') {
                      it('should blank `srcdoc`', async function () {
                        var doc = await docFactory({attrs: {src: './page.html', srcdoc: '<img src="./green.bmp">'}});

                        var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                        var elem = doc.querySelector(tagName);
                        assert.strictEqual(elem.getAttribute('src'), null);
                        assert.strictEqual(elem.getAttribute('srcdoc'), null);

                        sinon.assert.notCalled(spyCaptureDocumentOrFile);
                        sinon.assert.notCalled(spyCaptureDocument);
                        sinon.assert.notCalled(spyCaptureUrl);
                        sinon.assert.calledWithExactly(spyRewrite, elem, 'src', null);
                        sinon.assert.calledWithExactly(spyRewrite, elem, 'srcdoc', null);
                      });
                    } else {
                      it('should ignore `srcdoc`', async function () {
                        var doc = await docFactory({attrs: {src: './page.html', srcdoc: '<img src="./green.bmp">'}});

                        var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                        var elem = doc.querySelector(tagName);
                        assert.strictEqual(elem.getAttribute('src'), null);
                        assert.strictEqual(elem.getAttribute('srcdoc'), '<img src="./green.bmp">');

                        sinon.assert.notCalled(spyCaptureDocumentOrFile);
                        sinon.assert.notCalled(spyCaptureDocument);
                        sinon.assert.notCalled(spyCaptureUrl);
                        sinon.assert.calledWithExactly(spyRewrite, elem, 'src', null);
                        sinon.assert.neverCalledWith(spyRewrite, elem, 'srcdoc');
                      });
                    }
                  });

                  break;
                }
                case "remove": {
                  context('when having `src`', function () {
                    it('should remove the element', async function () {
                      var doc = await docFactory({attrs: {src: './page.html'}});
                      var elemOrig = doc.querySelector(tagName);

                      var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                      assert.isNull(rewriter.doc.querySelector(tagName));

                      sinon.assert.notCalled(spyCaptureDocumentOrFile);
                      sinon.assert.notCalled(spyCaptureDocument);
                      sinon.assert.notCalled(spyCaptureUrl);
                      sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                    });
                  });

                  context('when having `srcdoc`', function () {
                    it('should remove the element', async function () {
                      var doc = await docFactory({attrs: {src: './page.html', srcdoc: '<img src="./green.bmp">'}});
                      var elemOrig = doc.querySelector(tagName);

                      var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                      assert.isNull(rewriter.doc.querySelector(tagName));

                      sinon.assert.notCalled(spyCaptureDocumentOrFile);
                      sinon.assert.notCalled(spyCaptureDocument);
                      sinon.assert.notCalled(spyCaptureUrl);
                      sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                    });
                  });

                  break;
                }
              }

              context(CONTEXT_BASE_URL, function () {
                it('should resolve the URLs with `baseUrl`', async function () {
                  var doc = await docFactory({attrs: {src: './page.html'}});
                  var tester = baseUrlHandlingTesterFactory({tagName, docUrl});

                  var {stub} = await rewriteNodeControlledTest({doc, docUrl, options, tester});
                  sinon.assert.called(stub);

                  sinon.assert.calledOnceWithExactly(spyResolve, "./page.html", "https://example.com/baseUrl/", {checkJavascript: true});
                });
              });
            });
          }
        });
      }

      for (const tagName of ["a", "area"]) {
        context(`for <${tagName}>`, function () {
          function docFactory(href = './page.html', attrs, value = 'text') {
            return createDocFixture({tagName, attrs: {href, ...attrs}, value});
          }

          const options = {
            "capture.frame": "save",
            "capture.ping": "link",
            "capture.downLink.file.mode": "none",
            "capture.downLink.doc.depth": null,
          };

          it('should rewrite the attribute to the resolved URL', async function () {
            var doc = docFactory();

            var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
            var elem = doc.querySelector(tagName);
            assert.strictEqual(elem.getAttribute('href'), 'https://example.com/page.html');

            sinon.assert.calledOnceWithExactly(spyResolveLink, './page.html', 'https://example.com/', {checkJavascript: true});
            sinon.assert.calledOnceWithExactly(spyRewriteAnchor, elem, 'href');
            sinon.assert.calledWithExactly(spyRewrite, elem, 'href', 'https://example.com/page.html', {ns: undefined});
            sinon.assert.notCalled(spyCaptureUrl);
          });

          it('should rewrite links correctly', async function () {
            var doc = createDocFixture({tagName: 'body', children: [
              {tagName, attrs: {href: ''}},
              {tagName, attrs: {href: '#'}},
              {tagName, attrs: {href: '#123'}},
              {tagName, attrs: {href: '?'}},
              {tagName, attrs: {href: '?id=123'}},
              {tagName, attrs: {href: '?id=123#456'}},

              {tagName, attrs: {href: './'}},
              {tagName, attrs: {href: './#'}},
              {tagName, attrs: {href: './#123'}},
              {tagName, attrs: {href: './?'}},
              {tagName, attrs: {href: './?id=123'}},
              {tagName, attrs: {href: './?id=123#456'}},

              {tagName, attrs: {href: 'linked.html'}},
              {tagName, attrs: {href: 'linked.html#'}},
              {tagName, attrs: {href: 'linked.html#123'}},
              {tagName, attrs: {href: 'linked.html?'}},
              {tagName, attrs: {href: 'linked.html?id=123'}},
              {tagName, attrs: {href: 'linked.html?id=123#456'}},

              {tagName, attrs: {href: 'subdir/linked.html'}},
              {tagName, attrs: {href: 'subdir/linked.html#'}},
              {tagName, attrs: {href: 'subdir/linked.html#123'}},
              {tagName, attrs: {href: 'subdir/linked.html?'}},
              {tagName, attrs: {href: 'subdir/linked.html?id=123'}},
              {tagName, attrs: {href: 'subdir/linked.html?id=123#456'}},

              {tagName, attrs: {href: 'http://example.com'}},
              {tagName, attrs: {href: 'http://example.com#'}},
              {tagName, attrs: {href: 'http://example.com#123'}},
              {tagName, attrs: {href: 'http://example.com?'}},
              {tagName, attrs: {href: 'http://example.com?id=123'}},
              {tagName, attrs: {href: 'http://example.com?id=123#456'}},

              {tagName, attrs: {href: 'about:blank'}},
              {tagName, attrs: {href: 'about:blank#'}},
              {tagName, attrs: {href: 'about:blank#123'}},
              {tagName, attrs: {href: 'about:blank?'}},
              {tagName, attrs: {href: 'about:blank?id=123'}},
              {tagName, attrs: {href: 'about:blank?id=123#456'}},

              {tagName, attrs: {href: 'urn:scrapbook:download:error:http://example.com'}},
              {tagName, attrs: {href: 'urn:scrapbook:download:error:http://example.com#'}},
              {tagName, attrs: {href: 'urn:scrapbook:download:error:http://example.com#123'}},
              {tagName, attrs: {href: 'urn:scrapbook:download:error:http://example.com?'}},
              {tagName, attrs: {href: 'urn:scrapbook:download:error:http://example.com?id=123'}},
              {tagName, attrs: {href: 'urn:scrapbook:download:error:http://example.com?id=123#456'}},

              {tagName, attrs: {href: 'mailto:noresponse@example.com'}},
            ]});

            var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
            var anchors = doc.querySelectorAll(tagName);

            assert.strictEqual(anchors[0].getAttribute('href'), '');
            assert.strictEqual(anchors[1].getAttribute('href'), '#');
            assert.strictEqual(anchors[2].getAttribute('href'), '#123');
            assert.strictEqual(anchors[3].getAttribute('href'), 'https://example.com/?');
            assert.strictEqual(anchors[4].getAttribute('href'), 'https://example.com/?id=123');
            assert.strictEqual(anchors[5].getAttribute('href'), 'https://example.com/?id=123#456');

            assert.strictEqual(anchors[6].getAttribute('href'), '');
            assert.strictEqual(anchors[7].getAttribute('href'), '#');
            assert.strictEqual(anchors[8].getAttribute('href'), '#123');
            assert.strictEqual(anchors[9].getAttribute('href'), 'https://example.com/?');
            assert.strictEqual(anchors[10].getAttribute('href'), 'https://example.com/?id=123');
            assert.strictEqual(anchors[11].getAttribute('href'), 'https://example.com/?id=123#456');

            assert.strictEqual(anchors[12].getAttribute('href'), 'https://example.com/linked.html');
            assert.strictEqual(anchors[13].getAttribute('href'), 'https://example.com/linked.html#');
            assert.strictEqual(anchors[14].getAttribute('href'), 'https://example.com/linked.html#123');
            assert.strictEqual(anchors[15].getAttribute('href'), 'https://example.com/linked.html?');
            assert.strictEqual(anchors[16].getAttribute('href'), 'https://example.com/linked.html?id=123');
            assert.strictEqual(anchors[17].getAttribute('href'), 'https://example.com/linked.html?id=123#456');

            assert.strictEqual(anchors[18].getAttribute('href'), 'https://example.com/subdir/linked.html');
            assert.strictEqual(anchors[19].getAttribute('href'), 'https://example.com/subdir/linked.html#');
            assert.strictEqual(anchors[20].getAttribute('href'), 'https://example.com/subdir/linked.html#123');
            assert.strictEqual(anchors[21].getAttribute('href'), 'https://example.com/subdir/linked.html?');
            assert.strictEqual(anchors[22].getAttribute('href'), 'https://example.com/subdir/linked.html?id=123');
            assert.strictEqual(anchors[23].getAttribute('href'), 'https://example.com/subdir/linked.html?id=123#456');

            assert.strictEqual(anchors[24].getAttribute('href'), 'http://example.com/');
            assert.strictEqual(anchors[25].getAttribute('href'), 'http://example.com/#');
            assert.strictEqual(anchors[26].getAttribute('href'), 'http://example.com/#123');
            assert.strictEqual(anchors[27].getAttribute('href'), 'http://example.com/?');
            assert.strictEqual(anchors[28].getAttribute('href'), 'http://example.com/?id=123');
            assert.strictEqual(anchors[29].getAttribute('href'), 'http://example.com/?id=123#456');

            assert.strictEqual(anchors[30].getAttribute('href'), 'about:blank');
            assert.strictEqual(anchors[31].getAttribute('href'), 'about:blank#');
            assert.strictEqual(anchors[32].getAttribute('href'), 'about:blank#123');
            assert.strictEqual(anchors[33].getAttribute('href'), 'about:blank?');
            assert.strictEqual(anchors[34].getAttribute('href'), 'about:blank?id=123');
            assert.strictEqual(anchors[35].getAttribute('href'), 'about:blank?id=123#456');

            assert.strictEqual(anchors[36].getAttribute('href'), 'urn:scrapbook:download:error:http://example.com');
            assert.strictEqual(anchors[37].getAttribute('href'), 'urn:scrapbook:download:error:http://example.com#');
            assert.strictEqual(anchors[38].getAttribute('href'), 'urn:scrapbook:download:error:http://example.com#123');
            assert.strictEqual(anchors[39].getAttribute('href'), 'urn:scrapbook:download:error:http://example.com?');
            assert.strictEqual(anchors[40].getAttribute('href'), 'urn:scrapbook:download:error:http://example.com?id=123');
            assert.strictEqual(anchors[41].getAttribute('href'), 'urn:scrapbook:download:error:http://example.com?id=123#456');

            assert.strictEqual(anchors[42].getAttribute('href'), 'mailto:noresponse@example.com');
          });

          it('should rewrite links to the page in iframe[srcdoc] to the source URL', async function () {
            // Links to the source page should be rewritten to the captured one,
            // but it's over-complicated to do so for a non-indepth capture.
            // Link to the source URL instead.
            var doc = createDocFixture({tagName: 'body', children: [
              {tagName, attrs: {href: ''}},
              {tagName, attrs: {href: '#'}},
              {tagName, attrs: {href: '#123'}},
              {tagName, attrs: {href: '?'}},
              {tagName, attrs: {href: '?id=123'}},
              {tagName, attrs: {href: '?id=123#456'}},

              {tagName, attrs: {href: './'}},
              {tagName, attrs: {href: './#'}},
              {tagName, attrs: {href: './#123'}},
              {tagName, attrs: {href: './?'}},
              {tagName, attrs: {href: './?id=123'}},
              {tagName, attrs: {href: './?id=123#456'}},
            ]});

            var {contentDocument: doc} = await createIframeFixture({hidden: false, docData: {
              tagName: 'iframe',
              attrs: {
                'srcdoc': doc.body.innerHTML,
              },
            }});
            await waitFrameLoading(doc.querySelector('iframe'));

            var {data} = await new TestCapturer().captureGeneral({doc, docUrl, options});
            var doc = await utils.readFileAsDocument(data.get('index_1.html'));
            var anchors = doc.querySelectorAll(tagName);

            assert.strictEqual(anchors[0].getAttribute('href'), 'https://example.com/');
            assert.strictEqual(anchors[1].getAttribute('href'), 'https://example.com/#');
            assert.strictEqual(anchors[2].getAttribute('href'), 'https://example.com/#123');
            assert.strictEqual(anchors[3].getAttribute('href'), 'https://example.com/?');
            assert.strictEqual(anchors[4].getAttribute('href'), 'https://example.com/?id=123');
            assert.strictEqual(anchors[5].getAttribute('href'), 'https://example.com/?id=123#456');

            assert.strictEqual(anchors[6].getAttribute('href'), 'https://example.com/');
            assert.strictEqual(anchors[7].getAttribute('href'), 'https://example.com/#');
            assert.strictEqual(anchors[8].getAttribute('href'), 'https://example.com/#123');
            assert.strictEqual(anchors[9].getAttribute('href'), 'https://example.com/?');
            assert.strictEqual(anchors[10].getAttribute('href'), 'https://example.com/?id=123');
            assert.strictEqual(anchors[11].getAttribute('href'), 'https://example.com/?id=123#456');
          });

          it('should rewrite links to the page in iframe[srcdoc] to the source URL when downLink is set', async function () {
            sinon.stub(options, "capture.downLink.doc.depth").value(0);

            var doc = createDocFixture({tagName: 'body', children: [
              {tagName, attrs: {href: ''}},
              {tagName, attrs: {href: '#'}},
              {tagName, attrs: {href: '#123'}},
              {tagName, attrs: {href: '?'}},
              {tagName, attrs: {href: '?id=123'}},
              {tagName, attrs: {href: '?id=123#456'}},

              {tagName, attrs: {href: './'}},
              {tagName, attrs: {href: './#'}},
              {tagName, attrs: {href: './#123'}},
              {tagName, attrs: {href: './?'}},
              {tagName, attrs: {href: './?id=123'}},
              {tagName, attrs: {href: './?id=123#456'}},
            ]});

            var {contentDocument: doc} = await createIframeFixture({hidden: false, docData: {
              tagName: 'iframe',
              attrs: {
                'srcdoc': doc.body.innerHTML,
              },
            }});
            await waitFrameLoading(doc.querySelector('iframe'));

            var {data} = await new TestCapturer().captureGeneral({doc, docUrl, options});
            var doc = await utils.readFileAsDocument(data.get('index_1.html'));
            var anchors = doc.querySelectorAll(tagName);

            assert.strictEqual(anchors[0].getAttribute('href'), 'index.html');
            assert.strictEqual(anchors[1].getAttribute('href'), 'index.html#');
            assert.strictEqual(anchors[2].getAttribute('href'), 'index.html#123');
            assert.strictEqual(anchors[3].getAttribute('href'), 'index.html');
            assert.strictEqual(anchors[4].getAttribute('href'), 'https://example.com/?id=123');
            assert.strictEqual(anchors[5].getAttribute('href'), 'https://example.com/?id=123#456');

            assert.strictEqual(anchors[6].getAttribute('href'), 'index.html');
            assert.strictEqual(anchors[7].getAttribute('href'), 'index.html#');
            assert.strictEqual(anchors[8].getAttribute('href'), 'index.html#123');
            assert.strictEqual(anchors[9].getAttribute('href'), 'index.html');
            assert.strictEqual(anchors[10].getAttribute('href'), 'https://example.com/?id=123');
            assert.strictEqual(anchors[11].getAttribute('href'), 'https://example.com/?id=123#456');
          });

          context('ping handling', function () {
            for (const mode of ["link", "blank", "<other>"]) {
              context(`when options["capture.ping"] = "${mode}"`, function () {
                const options = {
                  "capture.ping": mode,
                  "capture.downLink.file.mode": "none",
                  "capture.downLink.doc.depth": null,
                };

                switch (mode) {
                  case "link": {
                    it('should rewrite `ping` attribute to the resolved URLs', async function () {
                      var doc = createDocFixture({tagName, attrs: {ping: './ping.py ./ping.php'}, value: 'anchor'});

                      var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.getAttribute('ping'), 'https://example.com/ping.py https://example.com/ping.php');

                      sinon.assert.calledWithExactly(spyResolve.getCall(0), './ping.py', 'https://example.com/');
                      sinon.assert.calledWithExactly(spyResolve.getCall(1), './ping.php', 'https://example.com/');
                      sinon.assert.calledWithExactly(spyRewrite, elem, 'ping', 'https://example.com/ping.py https://example.com/ping.php');
                    });

                    break;
                  }
                  case "blank":
                  default: {
                    it('should remove `ping` attribute', async function () {
                      var doc = createDocFixture({tagName, attrs: {ping: './ping.py ./ping.php'}, value: 'anchor'});

                      var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.getAttribute('ping'), null);

                      sinon.assert.calledWithExactly(spyRewrite, elem, 'ping', null);
                    });

                    break;
                  }
                }
              });
            }
          });

          context(CONTEXT_BASE_URL, function () {
            it('should resolve the URLs with `baseUrlFinal`', async function () {
              var doc = createDocFixture({tagName, attrs: {href: './page.html', ping: './ping.py ./ping.php'}, value: 'anchor'});
              var tester = baseUrlHandlingTesterFactory({tagName, docUrl});

              var {stub} = await rewriteNodeControlledTest({doc, docUrl, options, tester});
              sinon.assert.called(stub);

              sinon.assert.calledOnceWithExactly(spyResolveLink, "./page.html", "https://example.com/baseUrlFinal/", {checkJavascript: true});
              sinon.assert.calledWithExactly(spyResolve.getCall(0), './ping.py', 'https://example.com/baseUrlFinal/');
              sinon.assert.calledWithExactly(spyResolve.getCall(1), './ping.php', 'https://example.com/baseUrlFinal/');
            });
          });

          context(CONTEXT_DOWN_LINK, function () {
            const options = {
              "capture.downLink.file.mode": "none",
              "capture.downLink.doc.depth": 1,
            };

            it('should call `captureUrl` when downLink is set', async function () {
              var doc = docFactory("./page.html?id=123#foo");
              await new TestCapturer().captureDocument({doc, docUrl, settings: {timeId}, options});
              sinon.assert.calledWithMatch(spyCaptureUrl, {
                url: 'https://example.com/page.html?id=123#foo',
                refUrl: docUrl,
                refPolicy: '',
                isAttachment: false,
                downLink: true,
                settings: {
                  timeId,
                  depth: 1,
                  isMainPage: false,
                  isMainFrame: true,
                  recurseChain: [],
                },
              });
            });

            it('should pass `isAttachment = true` when `download` attribute exists', async function () {
              var doc = docFactory("./page.html?id=123#foo", {download: 'page.html'});
              await new TestCapturer().captureDocument({doc, docUrl, settings: {timeId}, options});
              sinon.assert.calledWithMatch(spyCaptureUrl, {
                url: 'https://example.com/page.html?id=123#foo',
                refUrl: docUrl,
                refPolicy: '',
                isAttachment: true,
                downLink: true,
                settings: {
                  timeId,
                  depth: 1,
                  isMainPage: false,
                  isMainFrame: true,
                  recurseChain: [],
                },
              });
            });

            it('should not call `captureUrl` for data URLs', async function () {
              var doc = docFactory('data:text/html,<a href="./green.bmp">foo</a>');
              await new TestCapturer().captureDocument({doc, docUrl, settings: {timeId}, options});
              sinon.assert.notCalled(spyCaptureUrl);
            });

            it('should not call `captureUrl` for about: URLs', async function () {
              var doc = createDocFixture({tagName: 'body', children: [
                {tagName, attrs: {href: 'about:blank'}},
                {tagName, attrs: {href: 'about:srcdoc'}},
                {tagName, attrs: {href: 'about:invalid'}},
              ]});
              await new TestCapturer().captureDocument({doc, docUrl, settings: {timeId}, options});
              sinon.assert.notCalled(spyCaptureUrl);
            });
          });
        });
      }

      context('for <img>', function () {
        const tagName = 'img';

        for (const mode of ["save", "save-current", "link", "blank", "remove", "<other>"]) {
          context(`when options["capture.image"] = "${mode}"`, function () {
            const options = {
              "capture.image": mode,
            };

            async function testSaveCrossOrigin() {
              var doc = createDocFixture({tagName, attrs: {src: './green.bmp', crossorigin: ''}});

              var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
              var elem = doc.querySelector(tagName);
              assert.strictEqual(elem.getAttribute('crossorigin'), null);

              sinon.assert.calledWithExactly(spyRewrite, elem, 'crossorigin', null);
            }

            async function testSaveCrossOriginHeaded() {
              var {contentDocument: doc} = await createIframeFixture({docData: {
                tagName, attrs: {src: './green.bmp', srcset: './yellow.bmp 2x, ./red.bmp 3x', crossorigin: ''},
              }});
              sinon.stub(doc.querySelector('img'), 'currentSrc').value(`${docUrl}yellow.bmp`);

              var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
              var elem = doc.querySelector(tagName);
              assert.strictEqual(elem.getAttribute('crossorigin'), null);

              sinon.assert.calledWithExactly(spyRewrite, elem, 'crossorigin', null);
            }

            switch (mode) {
              case "save":
              default: {
                it('should save resources and rewrite `src` and `srcset`', async function () {
                  var doc = createDocFixture({tagName, attrs: {src: './green.bmp', srcset: './yellow.bmp 2x, ./red.bmp 3x'}});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('src'), 'green.bmp');
                  assert.strictEqual(elem.getAttribute('srcset'), 'yellow.bmp 2x, red.bmp 3x');

                  sinon.assert.calledWithMatch(spyDownload, {
                    url: `${docUrl}green.bmp`,
                  });
                  sinon.assert.calledWithMatch(spyDownload, {
                    url: `${docUrl}yellow.bmp`,
                  });
                  sinon.assert.calledWithMatch(spyDownload, {
                    url: `${docUrl}red.bmp`,
                  });
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'green.bmp');
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'srcset', 'yellow.bmp 2x, red.bmp 3x');
                });

                context(CONTEXT_CROSS_ORIGIN, function () {
                  it('should remove `crossorigin` attribute', testSaveCrossOrigin);
                });

                break;
              }
              case "save-current": {
                it('should save only currentSrc for a headed document', async function () {
                  var {contentDocument: doc} = await createIframeFixture({docData: {
                    tagName, attrs: {src: './green.bmp', srcset: './yellow.bmp 2x, ./red.bmp 3x'},
                  }});
                  sinon.stub(doc.querySelector('img'), 'currentSrc').value(`${docUrl}yellow.bmp`);

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('src'), 'yellow.bmp');
                  assert.strictEqual(elem.getAttribute('srcset'), null);

                  sinon.assert.calledWithMatch(spyDownload, {
                    url: `${docUrl}yellow.bmp`,
                  });
                  sinon.assert.neverCalledWithMatch(spyDownload, {
                    url: `${docUrl}green.bmp`,
                  });
                  sinon.assert.neverCalledWithMatch(spyDownload, {
                    url: `${docUrl}red.bmp`,
                  });
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'yellow.bmp');
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'srcset', null);
                });

                it('should save resources and rewrite `src` and `srcset` for a headless document', async function () {
                  var doc = createDocFixture({tagName, attrs: {src: './green.bmp', srcset: './yellow.bmp 2x, ./red.bmp 3x'}});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('src'), 'green.bmp');
                  assert.strictEqual(elem.getAttribute('srcset'), 'yellow.bmp 2x, red.bmp 3x');

                  sinon.assert.calledWithMatch(spyDownload, {
                    url: `${docUrl}green.bmp`,
                  });
                  sinon.assert.calledWithMatch(spyDownload, {
                    url: `${docUrl}yellow.bmp`,
                  });
                  sinon.assert.calledWithMatch(spyDownload, {
                    url: `${docUrl}red.bmp`,
                  });
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'green.bmp');
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'srcset', 'yellow.bmp 2x, red.bmp 3x');
                });

                context(CONTEXT_CROSS_ORIGIN, function () {
                  $it.xfail()('should remove `crossorigin` attribute for a headed document', testSaveCrossOriginHeaded);

                  it('should remove `crossorigin` attribute for a headless document', testSaveCrossOrigin);
                });

                break;
              }
              case "link": {
                it('should rewrite `src` and `srcset` to the resolved URLs', async function () {
                  var doc = createDocFixture({tagName, attrs: {src: './green.bmp', srcset: './yellow.bmp 2x, ./red.bmp 3x'}});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('src'), 'https://example.com/green.bmp');
                  assert.strictEqual(elem.getAttribute('srcset'), 'https://example.com/yellow.bmp 2x, https://example.com/red.bmp 3x');

                  sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'https://example.com/green.bmp');
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'srcset', 'https://example.com/yellow.bmp 2x, https://example.com/red.bmp 3x');
                });

                break;
              }
              case "blank": {
                it('should blank `src` and `srcset`', async function () {
                  var doc = createDocFixture({tagName, attrs: {src: './green.bmp', srcset: './yellow.bmp 2x, ./red.bmp 3x'}});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('src'), 'about:blank');
                  assert.strictEqual(elem.getAttribute('srcset'), null);

                  sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'about:blank');
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'srcset', null);
                });

                break;
              }
              case "remove": {
                it('should remove the element', async function () {
                  var doc = createDocFixture({tagName, attrs: {src: './green.bmp', srcset: './yellow.bmp 2x, ./red.bmp 3x'}});
                  var elemOrig = doc.querySelector(tagName);

                  var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isNull(rewriter.doc.querySelector(tagName));

                  sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                });

                break;
              }
            }

            context(CONTEXT_BASE_URL, function () {
              it('should resolve the URLs with `baseUrl`', async function () {
                var doc = createDocFixture({tagName, attrs: {src: './green.bmp', srcset: './yellow.bmp 2x, ./red.bmp 3x'}});
                var tester = baseUrlHandlingTesterFactory({tagName, docUrl, interrupt: false});

                var {stub} = await rewriteNodeControlledTest({doc, docUrl, options, tester});
                sinon.assert.called(stub);

                sinon.assert.calledWithExactly(spyResolve.getCall(0), './green.bmp', 'https://example.com/baseUrl/');
                sinon.assert.calledWithExactly(spyResolve.getCall(1), './yellow.bmp', 'https://example.com/baseUrl/');
                sinon.assert.calledWithExactly(spyResolve.getCall(2), './red.bmp', 'https://example.com/baseUrl/');
              });
            });
          });
        }
      });

      context('for <picture>', function () {
        function docFactoryData({ns} = {}) {
          return {tagName, children: [
            {tagName: 'source', ns, attrs: {media: 'min-width: 300px', srcset: './img1-1.bmp 2x, ./img1-2.bmp 3x'}},
            {tagName: 'source', ns, attrs: {media: 'min-width: 600px', srcset: './img2.bmp'}},
            {tagName: 'img', ns, attrs: {src: './img3.bmp', srcset: './img4-1.bmp 2x, ./img4-2.bmp 3x'}},
          ]};
        }

        function docFactory({ns} = {}) {
          return createDocFixture(docFactoryData({ns}));
        }

        async function docFactoryIframe({ns} = {}) {
          return await createIframeFixture({docData: docFactoryData({ns})});
        }

        const tagName = 'picture';

        for (const mode of ["save", "save-current", "link", "blank", "remove", "<other>"]) {
          context(`when options["capture.image"] = "${mode}"`, function () {
            const options = {
              "capture.image": mode,
            };

            async function testSave() {
              var doc = docFactory();

              var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
              var elems = doc.querySelectorAll('source, img');
              assert.strictEqual(elems[0].getAttribute('srcset'), 'img1-1.bmp 2x, img1-2.bmp 3x');
              assert.strictEqual(elems[1].getAttribute('srcset'), 'img2.bmp');
              assert.strictEqual(elems[2].getAttribute('src'), 'img3.bmp');
              assert.strictEqual(elems[2].getAttribute('srcset'), 'img4-1.bmp 2x, img4-2.bmp 3x');

              sinon.assert.calledWithMatch(spyDownload, {
                url: 'https://example.com/img1-1.bmp',
              });
              sinon.assert.calledWithMatch(spyDownload, {
                url: 'https://example.com/img1-2.bmp',
              });
              sinon.assert.calledWithMatch(spyDownload, {
                url: 'https://example.com/img2.bmp',
              });
              sinon.assert.calledWithMatch(spyDownload, {
                url: 'https://example.com/img3.bmp',
              });
              sinon.assert.calledWithMatch(spyDownload, {
                url: 'https://example.com/img4-1.bmp',
              });
              sinon.assert.calledWithMatch(spyDownload, {
                url: 'https://example.com/img4-2.bmp',
              });

              sinon.assert.calledWithExactly(spyRewrite, elems[0], 'srcset', 'img1-1.bmp 2x, img1-2.bmp 3x');
              sinon.assert.calledWithExactly(spyRewrite, elems[1], 'srcset', 'img2.bmp');
              sinon.assert.calledWithExactly(spyRewrite, elems[2], 'src', 'img3.bmp');
              sinon.assert.calledWithExactly(spyRewrite, elems[2], 'srcset', 'img4-1.bmp 2x, img4-2.bmp 3x');
            }

            switch (mode) {
              case "save":
              default: {
                it('should save resources and rewrite `src` and `srcset`', testSave);

                break;
              }
              case "save-current": {
                it('should save only currentSrc for a headed document', async function () {
                  var {contentDocument: doc} = await docFactoryIframe();
                  sinon.stub(doc.querySelector('img'), 'currentSrc').value('https://example.com/img1-1.bmp');

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isNull(doc.querySelector('source'));
                  var elem = doc.querySelector('img');
                  assert.strictEqual(elem.getAttribute('src'), 'img1-1.bmp');
                  assert.strictEqual(elem.getAttribute('srcset'), null);

                  sinon.assert.calledWithMatch(spyDownload, {
                    url: 'https://example.com/img1-1.bmp',
                  });
                  sinon.assert.neverCalledWithMatch(spyDownload, {
                    url: 'https://example.com/img1-2.bmp',
                  });
                  sinon.assert.neverCalledWithMatch(spyDownload, {
                    url: 'https://example.com/img2.bmp',
                  });
                  sinon.assert.neverCalledWithMatch(spyDownload, {
                    url: 'https://example.com/img3.bmp',
                  });
                  sinon.assert.neverCalledWithMatch(spyDownload, {
                    url: 'https://example.com/img4-1.bmp',
                  });
                  sinon.assert.neverCalledWithMatch(spyDownload, {
                    url: 'https://example.com/img4-2.bmp',
                  });

                  sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'img1-1.bmp');
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'srcset', null);
                });

                it('should save resources and rewrite `src` and `srcset` for a headless document', testSave);

                break;
              }
              case "link": {
                it('should rewrite `src` and `srcset` with resolved URLs', async function () {
                  var doc = docFactory();

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elems = doc.querySelectorAll('source, img');
                  assert.strictEqual(elems[0].getAttribute('srcset'), 'https://example.com/img1-1.bmp 2x, https://example.com/img1-2.bmp 3x');
                  assert.strictEqual(elems[1].getAttribute('srcset'), 'https://example.com/img2.bmp');
                  assert.strictEqual(elems[2].getAttribute('src'), 'https://example.com/img3.bmp');
                  assert.strictEqual(elems[2].getAttribute('srcset'), 'https://example.com/img4-1.bmp 2x, https://example.com/img4-2.bmp 3x');

                  sinon.assert.notCalled(spyDownload);

                  sinon.assert.calledWithExactly(spyRewrite, elems[0], 'srcset', 'https://example.com/img1-1.bmp 2x, https://example.com/img1-2.bmp 3x');
                  sinon.assert.calledWithExactly(spyRewrite, elems[1], 'srcset', 'https://example.com/img2.bmp');
                  sinon.assert.calledWithExactly(spyRewrite, elems[2], 'src', 'https://example.com/img3.bmp');
                  sinon.assert.calledWithExactly(spyRewrite, elems[2], 'srcset', 'https://example.com/img4-1.bmp 2x, https://example.com/img4-2.bmp 3x');
                });

                break;
              }
              case "blank": {
                it('should remove `srcset` for source elements', async function () {
                  var doc = docFactory();

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elems = doc.querySelectorAll('source, img');
                  assert.strictEqual(elems[0].getAttribute('srcset'), null);
                  assert.strictEqual(elems[1].getAttribute('srcset'), null);
                  assert.strictEqual(elems[2].getAttribute('src'), 'about:blank');
                  assert.strictEqual(elems[2].getAttribute('srcset'), null);

                  sinon.assert.notCalled(spyDownload);

                  sinon.assert.calledWithExactly(spyRewrite, elems[0], 'srcset', null);
                  sinon.assert.calledWithExactly(spyRewrite, elems[1], 'srcset', null);
                  sinon.assert.calledWithExactly(spyRewrite, elems[2], 'src', 'about:blank');
                  sinon.assert.calledWithExactly(spyRewrite, elems[2], 'srcset', null);
                });

                break;
              }
              case "remove": {
                it('should remove the element', async function () {
                  var doc = docFactory();
                  var elemOrig = doc.querySelector(tagName);

                  var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isNull(rewriter.doc.querySelector('picture, source, img'));

                  sinon.assert.notCalled(spyDownload);

                  sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                });

                break;
              }
            }

            if (mode !== "remove") {
              it('should ignore source[src]', async function () {
                var doc = createDocFixture({tagName, children: [
                  {tagName: 'source', attrs: {media: 'min-width: 300px', src: './img1-0.bmp'}},
                  {tagName: 'source', attrs: {media: 'min-width: 600px', src: './img2-0.bmp'}},
                  {tagName: 'img', attrs: {src: './img3.bmp'}},
                ]});

                var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                var elems = doc.querySelectorAll('source, img');
                assert.strictEqual(elems[0].getAttribute('src'), './img1-0.bmp');
                assert.strictEqual(elems[1].getAttribute('src'), './img2-0.bmp');

                sinon.assert.neverCalledWithMatch(spyDownload, {
                  url: 'https://example.com/img1-0.bmp',
                });
                sinon.assert.neverCalledWithMatch(spyDownload, {
                  url: 'https://example.com/img2-0.bmp',
                });
              });

              it('should ignore non-HTML descendants', async function () {
                var doc = docFactory({ns: NS_SVG});

                var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                var elems = doc.querySelectorAll('source, img');
                assert.strictEqual(elems[0].getAttribute('srcset'), './img1-1.bmp 2x, ./img1-2.bmp 3x');
                assert.strictEqual(elems[1].getAttribute('srcset'), './img2.bmp');
                assert.strictEqual(elems[2].getAttribute('src'), './img3.bmp');
                assert.strictEqual(elems[2].getAttribute('srcset'), './img4-1.bmp 2x, ./img4-2.bmp 3x');

                sinon.assert.notCalled(spyDownload);

                sinon.assert.neverCalledWith(spyRewrite, elems[0], 'srcset');
                sinon.assert.neverCalledWith(spyRewrite, elems[1], 'srcset');
                sinon.assert.neverCalledWith(spyRewrite, elems[2], 'src');
                sinon.assert.neverCalledWith(spyRewrite, elems[2], 'srcset');
              });

              context(CONTEXT_BASE_URL, function () {
                it('should resolve the URLs with `baseUrl`', async function () {
                  var doc = docFactory();
                  var tester = baseUrlHandlingTesterFactory({selector: 'picture, picture source, picture img', docUrl, interrupt: false});

                  var {stub} = await rewriteNodeControlledTest({doc, docUrl, options, tester});
                  sinon.assert.called(stub);

                  // only source[srcset] are processed during handling <picture>
                  sinon.assert.calledWithExactly(spyResolve.getCall(0), './img1-1.bmp', 'https://example.com/baseUrl/');
                  sinon.assert.calledWithExactly(spyResolve.getCall(1), './img1-2.bmp', 'https://example.com/baseUrl/');
                  sinon.assert.calledWithExactly(spyResolve.getCall(2), './img2.bmp', 'https://example.com/baseUrl/');
                  sinon.assert.calledWithExactly(spyResolve.getCall(3), './img3.bmp', 'https://example.com/baseUrl/');
                  sinon.assert.calledWithExactly(spyResolve.getCall(4), './img4-1.bmp', 'https://example.com/baseUrl/');
                  sinon.assert.calledWithExactly(spyResolve.getCall(5), './img4-2.bmp', 'https://example.com/baseUrl/');
                });
              });
            }
          });
        }
      });

      context('for <audio>', function () {
        function docFactorySimple() {
          return createDocFixture({tagName, attrs: {src: './horse.mp3', controls: ''}});
        }

        function docFactoryComplexData({ns, attrs} = {}) {
          return {tagName, attrs: {controls: '', ...attrs}, children: [
            {tagName: 'source', ns, attrs: {src: './horse.ogg', type: 'audio/ogg'}},
            {tagName: 'source', ns, attrs: {src: './horse.mp3', type: 'audio/mpeg'}},
            {tagName: 'track', ns, attrs: {kind: 'captions', label: 'English caption', src: './horse_en.vtt', srclang: 'en', default: ''}},
            {tagName: 'track', ns, attrs: {kind: 'captions', label: '中文標題', src: './horse_zh.vtt', srclang: 'zh'}},
          ]};
        }

        function docFactoryComplex({ns, attrs} = {}) {
          return createDocFixture(docFactoryComplexData({ns, attrs}));
        }

        async function docFactoryComplexIframe({ns, attrs} = {}) {
          return await createIframeFixture({docData: docFactoryComplexData({ns, attrs})});
        }

        const tagName = 'audio';

        for (const mode of ["save", "save-current", "link", "blank", "remove", "<other>"]) {
          context(`when options["capture.audio"] = "${mode}"`, function () {
            const options = {
              "capture.audio": mode,
            };

            async function testSaveSimple() {
              var doc = docFactorySimple();

              var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
              var elem = doc.querySelector(tagName);
              assert.strictEqual(elem.getAttribute('src'), 'horse.mp3');

              sinon.assert.calledWithMatch(spyDownload, {
                url: 'https://example.com/horse.mp3',
              });

              sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'horse.mp3');
            }

            async function testSaveComplex() {
              var doc = docFactoryComplex();

              var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
              var audio = doc.querySelector('audio');
              var sources = doc.querySelectorAll('source');
              var tracks = doc.querySelectorAll('track');
              assert.strictEqual(audio.getAttribute('src'), null);
              assert.strictEqual(sources[0].getAttribute('src'), 'horse.ogg');
              assert.strictEqual(sources[1].getAttribute('src'), 'horse.mp3');
              assert.strictEqual(tracks[0].getAttribute('src'), 'horse_en.vtt');
              assert.strictEqual(tracks[1].getAttribute('src'), 'horse_zh.vtt');

              sinon.assert.calledWithMatch(spyDownload, {
                url: 'https://example.com/horse.ogg',
              });
              sinon.assert.calledWithMatch(spyDownload, {
                url: 'https://example.com/horse.mp3',
              });
              sinon.assert.calledWithMatch(spyDownload, {
                url: 'https://example.com/horse_en.vtt',
              });
              sinon.assert.calledWithMatch(spyDownload, {
                url: 'https://example.com/horse_zh.vtt',
              });

              sinon.assert.calledWithExactly(spyRewrite, sources[0], 'src', 'horse.ogg');
              sinon.assert.calledWithExactly(spyRewrite, sources[1], 'src', 'horse.mp3');
              sinon.assert.calledWithExactly(spyRewrite, tracks[0], 'src', 'horse_en.vtt');
              sinon.assert.calledWithExactly(spyRewrite, tracks[1], 'src', 'horse_zh.vtt');
            }

            async function testSaveCrossOrigin() {
              var doc = docFactoryComplex({attrs: {crossorigin: ''}});

              var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
              var elem = doc.querySelector(tagName);
              assert.strictEqual(elem.getAttribute('crossorigin'), null);

              sinon.assert.calledWithExactly(spyRewrite, elem, 'crossorigin', null);
            }

            async function testSaveCrossOriginHeaded() {
              var {contentDocument: doc} = await docFactoryComplexIframe({attrs: {crossorigin: ''}});
              sinon.stub(doc.querySelector(tagName), 'currentSrc').value(`${docUrl}horse.ogg`);

              var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
              var elem = doc.querySelector(tagName);
              assert.strictEqual(elem.getAttribute('crossorigin'), null);

              sinon.assert.calledWithExactly(spyRewrite, elem, 'crossorigin', null);
            }

            switch (mode) {
              case "save":
              default: {
                it('should save resources and rewrite `src` for simple audio', testSaveSimple);

                it('should save resources and rewrite `src` for complex audio', testSaveComplex);

                context(CONTEXT_CROSS_ORIGIN, function () {
                  it('should remove `crossorigin` attribute', testSaveCrossOrigin);
                });

                break;
              }
              case "save-current": {
                it('should save currentSrc and remove sources for a headed document', async function () {
                  var {contentDocument: doc} = await docFactoryComplexIframe();
                  sinon.stub(doc.querySelector(tagName), 'currentSrc').value(`${docUrl}horse.ogg`);
                  var sourceOrigs = doc.querySelectorAll('source');

                  var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var {doc} = rewriter;
                  assert.isNull(doc.querySelector('source'));
                  var audio = doc.querySelector('audio');
                  var tracks = doc.querySelectorAll('track');
                  assert.strictEqual(audio.getAttribute('src'), 'horse.ogg');
                  assert.strictEqual(tracks[0].getAttribute('src'), 'horse_en.vtt');
                  assert.strictEqual(tracks[1].getAttribute('src'), 'horse_zh.vtt');

                  sinon.assert.calledWithMatch(spyDownload, {
                    url: 'https://example.com/horse.ogg',
                  });
                  sinon.assert.neverCalledWithMatch(spyDownload, {
                    url: 'https://example.com/horse.mp3',
                  });
                  sinon.assert.calledWithMatch(spyDownload, {
                    url: 'https://example.com/horse_en.vtt',
                  });
                  sinon.assert.calledWithMatch(spyDownload, {
                    url: 'https://example.com/horse_zh.vtt',
                  });

                  sinon.assert.calledWithExactly(spyRewrite, audio, 'src', 'horse.ogg');
                  sinon.assert.calledWithExactly(spyRewrite, tracks[0], 'src', 'horse_en.vtt');
                  sinon.assert.calledWithExactly(spyRewrite, tracks[1], 'src', 'horse_zh.vtt');
                  sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(sourceOrigs[0]));
                  sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(sourceOrigs[1]));
                });

                it('should save resources and rewrite `src` for simple audio for a headless document', testSaveSimple);

                it('should save resources and rewrite `src` for complex audio for a headless document', testSaveComplex);

                context(CONTEXT_CROSS_ORIGIN, function () {
                  $it.xfail()('should remove `crossorigin` attribute for a headed document', testSaveCrossOriginHeaded);

                  it('should remove `crossorigin` attribute for a headless document', testSaveCrossOrigin);
                });

                break;
              }
              case "link": {
                it('should rewrite `src` to the resolved URL for simple audio', async function () {
                  var doc = docFactorySimple();

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('src'), 'https://example.com/horse.mp3');

                  sinon.assert.notCalled(spyDownload);

                  sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'https://example.com/horse.mp3');
                });

                it('should rewrite `src` to the resolved URL for complex audio', async function () {
                  var doc = docFactoryComplex();

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var audio = doc.querySelector('audio');
                  var sources = doc.querySelectorAll('source');
                  var tracks = doc.querySelectorAll('track');
                  assert.strictEqual(audio.getAttribute('src'), null);
                  assert.strictEqual(sources[0].getAttribute('src'), 'https://example.com/horse.ogg');
                  assert.strictEqual(sources[1].getAttribute('src'), 'https://example.com/horse.mp3');
                  assert.strictEqual(tracks[0].getAttribute('src'), 'https://example.com/horse_en.vtt');
                  assert.strictEqual(tracks[1].getAttribute('src'), 'https://example.com/horse_zh.vtt');

                  sinon.assert.notCalled(spyDownload);

                  sinon.assert.calledWithExactly(spyRewrite, sources[0], 'src', 'https://example.com/horse.ogg');
                  sinon.assert.calledWithExactly(spyRewrite, sources[1], 'src', 'https://example.com/horse.mp3');
                  sinon.assert.calledWithExactly(spyRewrite, tracks[0], 'src', 'https://example.com/horse_en.vtt');
                  sinon.assert.calledWithExactly(spyRewrite, tracks[1], 'src', 'https://example.com/horse_zh.vtt');
                });

                break;
              }
              case "blank": {
                it('should blank `src` for simple audio', async function () {
                  var doc = docFactorySimple();

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('src'), 'about:blank');

                  sinon.assert.notCalled(spyDownload);

                  sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'about:blank');
                });

                it('should blank `src` for complex audio', async function () {
                  var doc = docFactoryComplex();

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var audio = doc.querySelector('audio');
                  var sources = doc.querySelectorAll('source');
                  var tracks = doc.querySelectorAll('track');
                  assert.strictEqual(audio.getAttribute('src'), null);
                  assert.strictEqual(sources[0].getAttribute('src'), 'about:blank');
                  assert.strictEqual(sources[1].getAttribute('src'), 'about:blank');
                  assert.strictEqual(tracks[0].getAttribute('src'), 'about:blank');
                  assert.strictEqual(tracks[1].getAttribute('src'), 'about:blank');

                  sinon.assert.notCalled(spyDownload);

                  sinon.assert.calledWithExactly(spyRewrite, sources[0], 'src', 'about:blank');
                  sinon.assert.calledWithExactly(spyRewrite, sources[1], 'src', 'about:blank');
                  sinon.assert.calledWithExactly(spyRewrite, tracks[0], 'src', 'about:blank');
                  sinon.assert.calledWithExactly(spyRewrite, tracks[1], 'src', 'about:blank');
                });

                break;
              }
              case "remove": {
                it('should remove the element for simple audio', async function () {
                  var doc = docFactorySimple();
                  var elemOrig = doc.querySelector(tagName);

                  var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isNull(rewriter.doc.querySelector('audio, source, track'));

                  sinon.assert.notCalled(spyDownload);

                  sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                });

                it('should remove the element for complex audio', async function () {
                  var doc = docFactoryComplex();
                  var elemOrig = doc.querySelector(tagName);

                  var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isNull(rewriter.doc.querySelector('audio, source, track'));

                  sinon.assert.notCalled(spyDownload);

                  sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                });

                break;
              }
            }

            if (mode !== "remove") {
              it('should ignore `srcset` attribute', async function () {
                var doc = createDocFixture({tagName, attrs: {srcset: './horse.flac'}, children: [
                  {tagName: 'source', attrs: {srcset: './horse.ogg', type: 'audio/ogg'}},
                  {tagName: 'source', attrs: {srcset: './horse.mp3', type: 'audio/mpeg'}},
                  {tagName: 'track', attrs: {kind: 'captions', label: 'English caption', srcset: './horse_en.vtt', srclang: 'en', default: ''}},
                  {tagName: 'track', attrs: {kind: 'captions', label: '中文標題', srcset: './horse_zh.vtt', srclang: 'zh'}},
                ]});

                var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                var audio = doc.querySelector('audio');
                var sources = doc.querySelectorAll('source');
                var tracks = doc.querySelectorAll('track');
                assert.strictEqual(audio.getAttribute('srcset'), './horse.flac');
                assert.strictEqual(sources[0].getAttribute('srcset'), './horse.ogg');
                assert.strictEqual(sources[1].getAttribute('srcset'), './horse.mp3');
                assert.strictEqual(tracks[0].getAttribute('srcset'), './horse_en.vtt');
                assert.strictEqual(tracks[1].getAttribute('srcset'), './horse_zh.vtt');

                sinon.assert.notCalled(spyDownload);
              });

              it('should ignore non-HTML descendants', async function () {
                var doc = docFactoryComplex({ns: NS_SVG});

                var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                var audio = doc.querySelector('audio');
                var sources = doc.querySelectorAll('source');
                var tracks = doc.querySelectorAll('track');
                assert.strictEqual(audio.getAttribute('src'), null);
                assert.strictEqual(sources[0].getAttribute('src'), './horse.ogg');
                assert.strictEqual(sources[1].getAttribute('src'), './horse.mp3');
                assert.strictEqual(tracks[0].getAttribute('src'), './horse_en.vtt');
                assert.strictEqual(tracks[1].getAttribute('src'), './horse_zh.vtt');

                sinon.assert.notCalled(spyDownload);

                sinon.assert.neverCalledWith(spyRewrite, sources[0], 'src');
                sinon.assert.neverCalledWith(spyRewrite, sources[1], 'src');
                sinon.assert.neverCalledWith(spyRewrite, tracks[0], 'src');
                sinon.assert.neverCalledWith(spyRewrite, tracks[1], 'src');
              });

              context(CONTEXT_BASE_URL, function () {
                it('should resolve the URLs with `baseUrl` (simple)', async function () {
                  var doc = docFactorySimple();
                  var tester = baseUrlHandlingTesterFactory({tagName, docUrl});

                  var {stub} = await rewriteNodeControlledTest({doc, docUrl, options, tester});
                  sinon.assert.called(stub);

                  sinon.assert.calledOnceWithExactly(spyResolve, './horse.mp3', 'https://example.com/baseUrl/');
                });

                it('should resolve the URLs with `baseUrl` (complex)', async function () {
                  var doc = docFactoryComplex();
                  var tester = baseUrlHandlingTesterFactory({selector: 'audio, audio source, audio track', docUrl, interrupt: false});

                  var {stub} = await rewriteNodeControlledTest({doc, docUrl, options, tester});
                  sinon.assert.called(stub);

                  sinon.assert.calledWithExactly(spyResolve.getCall(0), './horse.ogg', 'https://example.com/baseUrl/');
                  sinon.assert.calledWithExactly(spyResolve.getCall(1), './horse.mp3', 'https://example.com/baseUrl/');
                  sinon.assert.calledWithExactly(spyResolve.getCall(2), './horse_en.vtt', 'https://example.com/baseUrl/');
                  sinon.assert.calledWithExactly(spyResolve.getCall(3), './horse_zh.vtt', 'https://example.com/baseUrl/');
                });
              });
            }
          });
        }
      });

      context('for <video>', function () {
        function docFactorySimple() {
          return createDocFixture({tagName, attrs: {width: '400', src: './small.ogg', poster: './myposter.bmp', controls: ''}});
        }

        function docFactoryComplexData({ns, attrs} = {}) {
          return {tagName, attrs: {width: '400', controls: '', crossorigin: '', ...attrs}, children: [
            {tagName: 'source', ns, attrs: {src: './small.ogg', type: 'video/ogg'}},
            {tagName: 'source', ns, attrs: {src: './small.mp4', type: 'video/mp4'}},
            {tagName: 'track', ns, attrs: {kind: 'subtitles', label: 'English subtitle', src: './small_en.vtt', srclang: 'en', default: ''}},
            {tagName: 'track', ns, attrs: {kind: 'subtitles', label: '中文字幕', src: './small_zh.vtt', srclang: 'zh'}},
          ]};
        }

        function docFactoryComplex({ns, attrs} = {}) {
          return createDocFixture(docFactoryComplexData({ns, attrs}));
        }

        async function docFactoryComplexIframe({ns, attrs} = {}) {
          return await createIframeFixture({docData: docFactoryComplexData({ns, attrs})});
        }

        const tagName = 'video';

        for (const mode of ["save", "save-current", "link", "blank", "remove", "<other>"]) {
          context(`when options["capture.video"] = "${mode}"`, function () {
            const options = {
              "capture.video": mode,
            };

            async function testSaveSimple() {
              var doc = docFactorySimple();

              var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
              var elem = doc.querySelector(tagName);
              assert.strictEqual(elem.getAttribute('src'), 'small.ogg');
              assert.strictEqual(elem.getAttribute('poster'), 'myposter.bmp');

              sinon.assert.calledWithMatch(spyDownload, {
                url: 'https://example.com/small.ogg',
              });
              sinon.assert.calledWithMatch(spyDownload, {
                url: 'https://example.com/myposter.bmp',
              });

              sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'small.ogg');
              sinon.assert.calledWithExactly(spyRewrite, elem, 'poster', 'myposter.bmp');
            }

            async function testSaveComplex() {
              var doc = docFactoryComplex();

              var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
              var video = doc.querySelector('video');
              var sources = doc.querySelectorAll('source');
              var tracks = doc.querySelectorAll('track');
              assert.strictEqual(video.getAttribute('src'), null);
              assert.strictEqual(video.getAttribute('poster'), null);
              assert.strictEqual(sources[0].getAttribute('src'), 'small.ogg');
              assert.strictEqual(sources[1].getAttribute('src'), 'small.mp4');
              assert.strictEqual(tracks[0].getAttribute('src'), 'small_en.vtt');
              assert.strictEqual(tracks[1].getAttribute('src'), 'small_zh.vtt');

              sinon.assert.calledWithMatch(spyDownload, {
                url: 'https://example.com/small.ogg',
              });
              sinon.assert.calledWithMatch(spyDownload, {
                url: 'https://example.com/small.mp4',
              });
              sinon.assert.calledWithMatch(spyDownload, {
                url: 'https://example.com/small_en.vtt',
              });
              sinon.assert.calledWithMatch(spyDownload, {
                url: 'https://example.com/small_zh.vtt',
              });

              sinon.assert.calledWithExactly(spyRewrite, sources[0], 'src', 'small.ogg');
              sinon.assert.calledWithExactly(spyRewrite, sources[1], 'src', 'small.mp4');
              sinon.assert.calledWithExactly(spyRewrite, tracks[0], 'src', 'small_en.vtt');
              sinon.assert.calledWithExactly(spyRewrite, tracks[1], 'src', 'small_zh.vtt');
            }

            async function testSaveCrossOrigin() {
              var doc = docFactoryComplex({attrs: {crossorigin: ''}});

              var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
              var elem = doc.querySelector(tagName);
              assert.strictEqual(elem.getAttribute('crossorigin'), null);

              sinon.assert.calledWithExactly(spyRewrite, elem, 'crossorigin', null);
            }

            async function testSaveCrossOriginHeaded() {
              var {contentDocument: doc} = await docFactoryComplexIframe({attrs: {crossorigin: ''}});
              sinon.stub(doc.querySelector(tagName), 'currentSrc').value(`${docUrl}small.ogg`);

              var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
              var elem = doc.querySelector(tagName);
              assert.strictEqual(elem.getAttribute('crossorigin'), null);

              sinon.assert.calledWithExactly(spyRewrite, elem, 'crossorigin', null);
            }

            switch (mode) {
              case "save":
              default: {
                it('should save resources and rewrite `src` and `poster` for simple video', testSaveSimple);

                it('should save resources and rewrite `src` for complex video', testSaveComplex);

                context(CONTEXT_CROSS_ORIGIN, function () {
                  it('should remove `crossorigin` attribute', testSaveCrossOrigin);
                });

                break;
              }
              case "save-current": {
                it('should save currentSrc and remove sources for a headed document', async function () {
                  var {contentDocument: doc} = await docFactoryComplexIframe();
                  sinon.stub(doc.querySelector(tagName), 'currentSrc').value(`${docUrl}small.ogg`);
                  var sourceOrigs = doc.querySelectorAll('source');

                  var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var {doc} = rewriter;
                  assert.isNull(doc.querySelector('source'));
                  var video = doc.querySelector('video');
                  var tracks = doc.querySelectorAll('track');
                  assert.strictEqual(video.getAttribute('src'), 'small.ogg');
                  assert.strictEqual(video.getAttribute('poster'), null);
                  assert.strictEqual(tracks[0].getAttribute('src'), 'small_en.vtt');
                  assert.strictEqual(tracks[1].getAttribute('src'), 'small_zh.vtt');

                  sinon.assert.calledWithMatch(spyDownload, {
                    url: 'https://example.com/small.ogg',
                  });
                  sinon.assert.neverCalledWithMatch(spyDownload, {
                    url: 'https://example.com/small.mp4',
                  });
                  sinon.assert.calledWithMatch(spyDownload, {
                    url: 'https://example.com/small_en.vtt',
                  });
                  sinon.assert.calledWithMatch(spyDownload, {
                    url: 'https://example.com/small_zh.vtt',
                  });

                  sinon.assert.calledWithExactly(spyRewrite, video, 'src', 'small.ogg');
                  sinon.assert.calledWithExactly(spyRewrite, tracks[0], 'src', 'small_en.vtt');
                  sinon.assert.calledWithExactly(spyRewrite, tracks[1], 'src', 'small_zh.vtt');
                  sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(sourceOrigs[0]));
                  sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(sourceOrigs[1]));
                });

                it('should save resources and rewrite `src` for simple video for a headless document', testSaveSimple);

                it('should save resources and rewrite `src` for complex video for a headless document', testSaveComplex);

                context(CONTEXT_CROSS_ORIGIN, function () {
                  $it.xfail()('should remove `crossorigin` attribute for a headed document', testSaveCrossOriginHeaded);

                  it('should remove `crossorigin` attribute for a headless document', testSaveCrossOrigin);
                });

                break;
              }
              case "link": {
                it('should rewrite `src` to the resolved URL for simple video', async function () {
                  var doc = docFactorySimple();

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('src'), 'https://example.com/small.ogg');
                  assert.strictEqual(elem.getAttribute('poster'), 'https://example.com/myposter.bmp');

                  sinon.assert.notCalled(spyDownload);

                  sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'https://example.com/small.ogg');
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'poster', 'https://example.com/myposter.bmp');
                });

                it('should rewrite `src` to the resolved URL for complex video', async function () {
                  var doc = docFactoryComplex();

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var video = doc.querySelector('video');
                  var sources = doc.querySelectorAll('source');
                  var tracks = doc.querySelectorAll('track');
                  assert.strictEqual(video.getAttribute('src'), null);
                  assert.strictEqual(sources[0].getAttribute('src'), 'https://example.com/small.ogg');
                  assert.strictEqual(sources[1].getAttribute('src'), 'https://example.com/small.mp4');
                  assert.strictEqual(tracks[0].getAttribute('src'), 'https://example.com/small_en.vtt');
                  assert.strictEqual(tracks[1].getAttribute('src'), 'https://example.com/small_zh.vtt');

                  sinon.assert.notCalled(spyDownload);

                  sinon.assert.calledWithExactly(spyRewrite, sources[0], 'src', 'https://example.com/small.ogg');
                  sinon.assert.calledWithExactly(spyRewrite, sources[1], 'src', 'https://example.com/small.mp4');
                  sinon.assert.calledWithExactly(spyRewrite, tracks[0], 'src', 'https://example.com/small_en.vtt');
                  sinon.assert.calledWithExactly(spyRewrite, tracks[1], 'src', 'https://example.com/small_zh.vtt');
                });

                break;
              }
              case "blank": {
                it('should blank `src` for simple video', async function () {
                  var doc = docFactorySimple();

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('src'), 'about:blank');
                  assert.strictEqual(elem.getAttribute('poster'), null);

                  sinon.assert.notCalled(spyDownload);

                  sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'about:blank');
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'poster', null);
                });

                it('should blank `src` for complex video', async function () {
                  var doc = docFactoryComplex();

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var video = doc.querySelector('video');
                  var sources = doc.querySelectorAll('source');
                  var tracks = doc.querySelectorAll('track');
                  assert.strictEqual(video.getAttribute('src'), null);
                  assert.strictEqual(video.getAttribute('poster'), null);
                  assert.strictEqual(sources[0].getAttribute('src'), 'about:blank');
                  assert.strictEqual(sources[1].getAttribute('src'), 'about:blank');
                  assert.strictEqual(tracks[0].getAttribute('src'), 'about:blank');
                  assert.strictEqual(tracks[1].getAttribute('src'), 'about:blank');

                  sinon.assert.notCalled(spyDownload);

                  sinon.assert.calledWithExactly(spyRewrite, sources[0], 'src', 'about:blank');
                  sinon.assert.calledWithExactly(spyRewrite, sources[1], 'src', 'about:blank');
                  sinon.assert.calledWithExactly(spyRewrite, tracks[0], 'src', 'about:blank');
                  sinon.assert.calledWithExactly(spyRewrite, tracks[1], 'src', 'about:blank');
                });

                break;
              }
              case "remove": {
                it('should remove the element for simple video', async function () {
                  var doc = docFactorySimple();
                  var elemOrig = doc.querySelector(tagName);

                  var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isNull(rewriter.doc.querySelector('video, source, track'));

                  sinon.assert.notCalled(spyDownload);

                  sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                });

                it('should remove the element for complex video', async function () {
                  var doc = docFactoryComplex();
                  var elemOrig = doc.querySelector(tagName);

                  var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isNull(rewriter.doc.querySelector('video, source, track'));

                  sinon.assert.notCalled(spyDownload);

                  sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                });

                break;
              }
            }

            if (mode !== "remove") {
              it('should ignore `srcset` attribute', async function () {
                var doc = createDocFixture({tagName, attrs: {width: '400', srcset: './small.webm', controls: ''}, children: [
                  {tagName: 'source', attrs: {srcset: './small.ogg', type: 'video/ogg'}},
                  {tagName: 'source', attrs: {srcset: './small.mp4', type: 'video/mp4'}},
                  {tagName: 'track', attrs: {kind: 'subtitles', label: 'English subtitle', srcset: './small_en.vtt', srclang: 'en', default: ''}},
                  {tagName: 'track', attrs: {kind: 'subtitles', label: '中文字幕', srcset: './small_zh.vtt', srclang: 'zh'}},
                ]});

                var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                var video = doc.querySelector(tagName);
                var sources = doc.querySelectorAll('source');
                var tracks = doc.querySelectorAll('track');
                assert.strictEqual(video.getAttribute('srcset'), './small.webm');
                assert.strictEqual(sources[0].getAttribute('srcset'), './small.ogg');
                assert.strictEqual(sources[1].getAttribute('srcset'), './small.mp4');
                assert.strictEqual(tracks[0].getAttribute('srcset'), './small_en.vtt');
                assert.strictEqual(tracks[1].getAttribute('srcset'), './small_zh.vtt');

                sinon.assert.notCalled(spyDownload);
              });

              it('should ignore non-HTML descendants', async function () {
                var doc = docFactoryComplex({ns: NS_SVG});

                var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                var video = doc.querySelector('video');
                var sources = doc.querySelectorAll('source');
                var tracks = doc.querySelectorAll('track');
                assert.strictEqual(video.getAttribute('src'), null);
                assert.strictEqual(sources[0].getAttribute('src'), './small.ogg');
                assert.strictEqual(sources[1].getAttribute('src'), './small.mp4');
                assert.strictEqual(tracks[0].getAttribute('src'), './small_en.vtt');
                assert.strictEqual(tracks[1].getAttribute('src'), './small_zh.vtt');

                sinon.assert.notCalled(spyDownload);

                sinon.assert.neverCalledWith(spyRewrite, sources[0], 'src');
                sinon.assert.neverCalledWith(spyRewrite, sources[1], 'src');
                sinon.assert.neverCalledWith(spyRewrite, tracks[0], 'src');
                sinon.assert.neverCalledWith(spyRewrite, tracks[1], 'src');
              });

              context(CONTEXT_BASE_URL, function () {
                it('should resolve the URLs with `baseUrl` (simple)', async function () {
                  var doc = docFactorySimple();
                  var tester = baseUrlHandlingTesterFactory({tagName, docUrl});

                  var {stub} = await rewriteNodeControlledTest({doc, docUrl, options, tester});
                  sinon.assert.called(stub);

                  sinon.assert.calledWithExactly(spyResolve.getCall(0), './myposter.bmp', 'https://example.com/baseUrl/');
                  sinon.assert.calledWithExactly(spyResolve.getCall(1), './small.ogg', 'https://example.com/baseUrl/');
                });

                it('should resolve the URLs with `baseUrl` (complex)', async function () {
                  var doc = docFactoryComplex();
                  var tester = baseUrlHandlingTesterFactory({selector: 'video, video source, video track', docUrl, interrupt: false});

                  var {stub} = await rewriteNodeControlledTest({doc, docUrl, options, tester});
                  sinon.assert.called(stub);

                  sinon.assert.calledWithExactly(spyResolve.getCall(0), './small.ogg', 'https://example.com/baseUrl/');
                  sinon.assert.calledWithExactly(spyResolve.getCall(1), './small.mp4', 'https://example.com/baseUrl/');
                  sinon.assert.calledWithExactly(spyResolve.getCall(2), './small_en.vtt', 'https://example.com/baseUrl/');
                  sinon.assert.calledWithExactly(spyResolve.getCall(3), './small_zh.vtt', 'https://example.com/baseUrl/');
                });
              });
            }
          });
        }
      });

      context('for <embed>', function () {
        const tagName = 'embed';

        for (const mode of ["save", "link", "blank", "remove", "<other>"]) {
          context(`when options["capture.embed"] = "${mode}"`, function () {
            const options = {
              "capture.embed": mode,
              "capture.saveAs": "folder",
              "capture.saveDataUriAsFile": false,
              "capture.saveResourcesSequentially": true,
            };

            const resMap = {
              [`${docUrl}frame1.html`]: {
                blob: new Blob(['<embed src="./frame2.html" width="200" height="200">'], {type: 'text/html'}),
              },
              [`${docUrl}frame2.html`]: {
                blob: new Blob(['<embed src="./frame1.html" width="200" height="200">'], {type: 'text/html'}),
              },
            };

            switch (mode) {
              case "save":
              default: {
                it('should capture the resource headlessly and rewrite `src` attribute for a headed document', async function () {
                  var {contentDocument: doc} = await createIframeFixture({docData: {tagName, attrs: {src: './page.html'}}});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, settings: {timeId}, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('src'), 'page.html');

                  sinon.assert.calledWithExactly(spyResolve, './page.html', 'https://example.com/');
                  sinon.assert.calledWithMatch(spyCaptureUrl, {
                    url: 'https://example.com/page.html',
                    refUrl: 'https://example.com/',
                    refPolicy: '',
                    settings: {
                      timeId,
                      documentName: 'index',
                      recurseChain: ['https://example.com/'],
                      depth: 0,
                      isMainPage: true,
                      isMainFrame: false,
                      type: '',
                      indexFilename: timeId,
                      fullPage: true,
                      usedCssImageUrl: undefined,
                      usedCssFontUrl: undefined,
                    },
                  });
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'page.html');
                });

                it('should capture the resource headlessly and rewrite `src` attribute for a headless document', async function () {
                  var doc = await createDocFixture({tagName, attrs: {src: './page.html'}});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, settings: {timeId}, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('src'), 'page.html');

                  sinon.assert.calledWithExactly(spyResolve, './page.html', 'https://example.com/');
                  sinon.assert.calledWithMatch(spyCaptureUrl, {
                    url: 'https://example.com/page.html',
                    refUrl: 'https://example.com/',
                    refPolicy: '',
                    settings: {
                      timeId,
                      documentName: 'index',
                      recurseChain: ['https://example.com/'],
                      depth: 0,
                      isMainPage: true,
                      isMainFrame: false,
                      type: '',
                      indexFilename: timeId,
                      fullPage: true,
                      usedCssImageUrl: undefined,
                      usedCssFontUrl: undefined,
                    },
                  });
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'page.html');
                });

                it('should keep about: URLs as-is', async function () {
                  var doc = createDocFixture({tagName: 'body', children: [
                    {tagName, attrs: {src: 'about:blank#foo'}},
                    {tagName, attrs: {src: 'about:blank?foo=bar#baz'}},
                    {tagName, attrs: {src: 'about:srcdoc'}},
                    {tagName, attrs: {src: 'about:invalid'}},
                  ]});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elems = doc.querySelectorAll(tagName);
                  assert.strictEqual(elems[0].getAttribute('src'), 'about:blank#foo');
                  assert.strictEqual(elems[1].getAttribute('src'), 'about:blank?foo=bar#baz');
                  assert.strictEqual(elems[2].getAttribute('src'), 'about:srcdoc');
                  assert.strictEqual(elems[3].getAttribute('src'), 'about:invalid');
                });

                it('should capture data URL as single HTML', async function () {
                  var doc = createDocFixture({tagName, attrs: {src: 'data:text/html,foo'}});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});

                  sinon.assert.calledWithMatch(spyCaptureUrl, {
                    url: 'data:text/html,foo',
                    options: {...options, "capture.saveAs": "singleHtml"},
                  });
                });

                it('should not capture data URL as single HTML if options["capture.saveDataUriAsFile"] is truthy', async function () {
                  sinon.stub(options, "capture.saveDataUriAsFile").value(true);

                  var doc = createDocFixture({tagName, attrs: {src: 'data:text/html,foo'}});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});

                  sinon.assert.calledWithMatch(spyCaptureUrl, {
                    url: 'data:text/html,foo',
                    options,
                  });
                });

                it('should safely handle circular referencing', async function () {
                  var doc = createDocFixture({tagName, attrs: {src: './frame1.html'}});

                  var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, options});

                  var doc = await utils.readFileAsDocument(data.get('index_1.html'));
                  assert.strictEqual(doc.querySelector(tagName).getAttribute('src'), 'index_2.html');

                  var doc = await utils.readFileAsDocument(data.get('index_2.html'));
                  assert.strictEqual(doc.querySelector(tagName).getAttribute('src'), 'index_1.html');
                });

                it('should rewrite circular referencing with `urn:scrapbook:download:circular:url:` when options["capture.saveAs"] = "singleHtml"', async function () {
                  sinon.stub(options, "capture.saveAs").value("singleHtml");

                  var doc = createDocFixture({tagName, attrs: {src: './frame1.html'}});

                  var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, options});
                  var doc = await utils.readFileAsDocument(data);

                  var url = doc.querySelector(tagName).getAttribute('src');
                  var {response: doc} = await utils.xhr({url, responseType: 'document'});

                  var url = doc.querySelector(tagName).getAttribute('src');
                  var {response: doc} = await utils.xhr({url, responseType: 'document'});

                  assert.strictEqual(doc.querySelector(tagName).getAttribute('src'), 'urn:scrapbook:download:circular:url:https://example.com/frame1.html');
                });

                break;
              }
              case "link": {
                it('should rewrite `src` attribute to the resolved URL', async function () {
                  var doc = createDocFixture({tagName, attrs: {src: './page.html'}});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('src'), 'https://example.com/page.html');

                  sinon.assert.calledWithExactly(spyResolve, './page.html', 'https://example.com/');
                  sinon.assert.notCalled(spyCaptureUrl);
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'https://example.com/page.html');
                });

                break;
              }
              case "blank": {
                it('should blank `src` attribute', async function () {
                  var doc = createDocFixture({tagName, attrs: {src: './page.html'}});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('src'), null);

                  sinon.assert.calledWithExactly(spyResolve, './page.html', 'https://example.com/');
                  sinon.assert.notCalled(spyCaptureUrl);
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'src', null);
                });

                break;
              }
              case "remove": {
                it('should remove the element', async function () {
                  var doc = createDocFixture({tagName, attrs: {src: './page.html'}});
                  var elemOrig = doc.querySelector(tagName);

                  var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isNull(rewriter.doc.querySelector(tagName));

                  sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                });

                break;
              }
            }

            if (mode !== "remove") {
              it('should rewrite `pluginspage` attribute to the resolved URL', async function () {
                var doc = createDocFixture({tagName, attrs: {src: './page.html', pluginspage: './plugins/'}});

                var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                var elem = doc.querySelector(tagName);
                assert.strictEqual(elem.getAttribute('pluginspage'), 'https://example.com/plugins/');

                sinon.assert.calledWithExactly(spyResolve, './plugins/', 'https://example.com/');
                sinon.assert.calledWithExactly(spyRewrite, elem, 'pluginspage', 'https://example.com/plugins/');
              });

              context(CONTEXT_BASE_URL, function () {
                it('should resolve the URLs with `baseUrl`', async function () {
                  var doc = createDocFixture({tagName, attrs: {src: './page.html', pluginspage: './plugins/'}});
                  var tester = baseUrlHandlingTesterFactory({tagName, docUrl});

                  var {stub} = await rewriteNodeControlledTest({doc, docUrl, options, tester});
                  sinon.assert.called(stub);

                  sinon.assert.calledWithExactly(spyResolve.getCall(0), './page.html', 'https://example.com/baseUrl/');
                  sinon.assert.calledWithExactly(spyResolve.getCall(1), './plugins/', 'https://example.com/baseUrl/');
                });
              });
            }
          });
        }
      });

      context('for <object>', function () {
        const tagName = 'object';

        for (const mode of ["save", "link", "blank", "remove", "<other>"]) {
          context(`when options["capture.object"] = "${mode}"`, function () {
            const options = {
              "capture.object": mode,
              "capture.saveAs": "folder",
              "capture.saveDataUriAsFile": false,
              "capture.saveResourcesSequentially": true,
            };

            const resMap = {
              [`${docUrl}frame1.html`]: {
                blob: new Blob(['<object data="./frame2.html" width="200" height="200"></object>'], {type: 'text/html'}),
              },
              [`${docUrl}frame2.html`]: {
                blob: new Blob(['<object data="./frame1.html" width="200" height="200"></object>'], {type: 'text/html'}),
              },
            };

            switch (mode) {
              case "save":
              default: {
                context('for modern object', function () {
                  it('should capture the resource headlessly and rewrite `data` attribute for a headed document', async function () {
                    var {contentDocument: doc} = await createIframeFixture({docData: {tagName, attrs: {data: './page.html'}}});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, settings: {timeId}, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('data'), 'page.html');

                    sinon.assert.calledWithExactly(spyResolve, './page.html', 'https://example.com/');
                    sinon.assert.calledWithMatch(spyCaptureUrl, {
                      url: 'https://example.com/page.html',
                      refUrl: 'https://example.com/',
                      refPolicy: '',
                      settings: {
                        timeId,
                        documentName: 'index',
                        recurseChain: ['https://example.com/'],
                        depth: 0,
                        isMainPage: true,
                        isMainFrame: false,
                        type: '',
                        indexFilename: timeId,
                        fullPage: true,
                        usedCssImageUrl: undefined,
                        usedCssFontUrl: undefined,
                      },
                    });
                    sinon.assert.calledWithExactly(spyRewrite, elem, 'data', 'page.html');
                  });

                  it('should capture the resource headlessly and rewrite `data` attribute for a headless document', async function () {
                    var doc = createDocFixture({tagName, attrs: {data: './page.html'}});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, settings: {timeId}, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('data'), 'page.html');

                    sinon.assert.calledWithExactly(spyResolve, './page.html', 'https://example.com/');
                    sinon.assert.calledWithMatch(spyCaptureUrl, {
                      url: 'https://example.com/page.html',
                      refUrl: 'https://example.com/',
                      refPolicy: '',
                      settings: {
                        timeId,
                        documentName: 'index',
                        recurseChain: ['https://example.com/'],
                        depth: 0,
                        isMainPage: true,
                        isMainFrame: false,
                        type: '',
                        indexFilename: timeId,
                        fullPage: true,
                        usedCssImageUrl: undefined,
                        usedCssFontUrl: undefined,
                      },
                    });
                    sinon.assert.calledWithExactly(spyRewrite, elem, 'data', 'page.html');
                  });

                  it('should keep about: URLs as-is', async function () {
                    var doc = createDocFixture({tagName: 'body', children: [
                      {tagName, attrs: {data: 'about:blank#foo'}},
                      {tagName, attrs: {data: 'about:blank?foo=bar#baz'}},
                      {tagName, attrs: {data: 'about:srcdoc'}},
                      {tagName, attrs: {data: 'about:invalid'}},
                    ]});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elems = doc.querySelectorAll(tagName);
                    assert.strictEqual(elems[0].getAttribute('data'), 'about:blank#foo');
                    assert.strictEqual(elems[1].getAttribute('data'), 'about:blank?foo=bar#baz');
                    assert.strictEqual(elems[2].getAttribute('data'), 'about:srcdoc');
                    assert.strictEqual(elems[3].getAttribute('data'), 'about:invalid');
                  });

                  it('should capture data URL as single HTML', async function () {
                    var doc = createDocFixture({tagName, attrs: {data: 'data:text/html,foo'}});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});

                    sinon.assert.calledWithMatch(spyCaptureUrl, {
                      url: 'data:text/html,foo',
                      options: {...options, "capture.saveAs": "singleHtml"},
                    });
                  });

                  it('should not capture data URL as single HTML if options["capture.saveDataUriAsFile"] is truthy', async function () {
                    sinon.stub(options, "capture.saveDataUriAsFile").value(true);

                    var doc = createDocFixture({tagName, attrs: {data: 'data:text/html,foo'}});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});

                    sinon.assert.calledWithMatch(spyCaptureUrl, {
                      url: 'data:text/html,foo',
                      options,
                    });
                  });

                  it('should safely handle circular referencing', async function () {
                    var doc = createDocFixture({tagName, attrs: {data: './frame1.html'}});

                    var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, options});

                    var doc = await utils.readFileAsDocument(data.get('index_1.html'));
                    assert.strictEqual(doc.querySelector(tagName).getAttribute('data'), 'index_2.html');

                    var doc = await utils.readFileAsDocument(data.get('index_2.html'));
                    assert.strictEqual(doc.querySelector(tagName).getAttribute('data'), 'index_1.html');
                  });

                  it('should rewrite circular referencing with `urn:scrapbook:download:circular:url:` when options["capture.saveAs"] = "singleHtml"', async function () {
                    sinon.stub(options, "capture.saveAs").value("singleHtml");

                    var doc = createDocFixture({tagName, attrs: {data: './frame1.html'}});

                    var {data} = await new TestCapturer(resMap).captureGeneral({doc, docUrl, options});
                    var doc = await utils.readFileAsDocument(data);

                    var url = doc.querySelector(tagName).getAttribute('data');
                    var {response: doc} = await utils.xhr({url, responseType: 'document'});

                    var url = doc.querySelector(tagName).getAttribute('data');
                    var {response: doc} = await utils.xhr({url, responseType: 'document'});

                    assert.strictEqual(doc.querySelector(tagName).getAttribute('data'), 'urn:scrapbook:download:circular:url:https://example.com/frame1.html');
                  });
                });

                break;
              }
              case "link": {
                context('for modern object', function () {
                  it('should rewrite `data` attribute to the resolved URL', async function () {
                    var doc = createDocFixture({tagName, attrs: {data: './page.html'}});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('data'), 'https://example.com/page.html');

                    sinon.assert.calledWithExactly(spyResolve, './page.html', 'https://example.com/');
                    sinon.assert.notCalled(spyCaptureUrl);
                    sinon.assert.notCalled(spyDownload);
                    sinon.assert.calledWithExactly(spyRewrite, elem, 'data', 'https://example.com/page.html');
                  });
                });

                break;
              }
              case "blank": {
                context('for modern object', function () {
                  it('should remove `data` attribute', async function () {
                    var doc = createDocFixture({tagName, attrs: {data: './page.html'}});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('data'), null);

                    sinon.assert.notCalled(spyCaptureUrl);
                    sinon.assert.notCalled(spyDownload);
                    sinon.assert.calledWithExactly(spyRewrite, elem, 'data', null);
                  });
                });

                break;
              }
              case "remove": {
                context('for modern object', function () {
                  it('should remove the element', async function () {
                    var doc = createDocFixture({tagName, attrs: {data: './page.html'}});
                    var elemOrig = doc.querySelector(tagName);

                    var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                    assert.isNull(rewriter.doc.querySelector(tagName));

                    sinon.assert.notCalled(spyCaptureUrl);
                    sinon.assert.notCalled(spyDownload);
                    sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                  });
                });

                break;
              }
            }

            if (!["blank", "remove"].includes(mode)) {
              context(CONTEXT_BASE_URL, function () {
                it('should resolve the URL with `baseUrl` for modern object', async function () {
                  var doc = createDocFixture({tagName, attrs: {data: './page.html'}});
                  var tester = baseUrlHandlingTesterFactory({tagName, docUrl, interrupt: false});

                  var {stub} = await rewriteNodeControlledTest({doc, docUrl, options, tester});
                  sinon.assert.called(stub);

                  sinon.assert.calledWithExactly(spyResolve, './page.html', 'https://example.com/baseUrl/');
                });

                it('should resolve the URLs with `baseUrl` for legacy object', async function () {
                  var doc = createDocFixture({tagName, attrs: {classid: 'java:MyApplet.class', archive: './archive.jar ./archive2.jar', codebase: './applets/'}});
                  var tester = baseUrlHandlingTesterFactory({tagName, docUrl, interrupt: false});

                  var {stub} = await rewriteNodeControlledTest({doc, docUrl, options, tester});
                  sinon.assert.called(stub);

                  sinon.assert.calledWithExactly(spyResolve, './applets/', 'https://example.com/baseUrl/');
                  sinon.assert.calledWithExactly(spyResolve, './archive.jar', 'https://example.com/baseUrl/applets/');
                  sinon.assert.calledWithExactly(spyResolve, './archive2.jar', 'https://example.com/baseUrl/applets/');
                });
              });
            }
          });
        }
      });

      context('for <applet>', function () {
        const tagName = 'applet';

        for (const mode of ["save", "link", "blank", "remove", "<other>"]) {
          context(`when options["capture.applet"] = "${mode}"`, function () {
            const options = {
              "capture.applet": mode,
            };

            switch (mode) {
              case "save":
              default: {
                it('should save the resource and rewrite `code` attribute', async function () {
                  var doc = createDocFixture({tagName, attrs: {code: './applet.class'}});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('code'), 'applet.class');

                  sinon.assert.calledWithExactly(spyResolve, './applet.class', 'https://example.com/');
                  sinon.assert.calledWithMatch(spyDownload, {
                    url: 'https://example.com/applet.class',
                    refUrl: 'https://example.com/',
                    refPolicy: '',
                  });
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'code', 'applet.class');
                });

                it('should save the resource and rewrite `archive` attribute', async function () {
                  var doc = createDocFixture({tagName, attrs: {code: 'MyApplet.class', archive: './archive.jar'}});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('archive'), 'archive.jar');

                  sinon.assert.calledWithExactly(spyResolve, './archive.jar', 'https://example.com/');
                  sinon.assert.calledWithMatch(spyDownload, {
                    url: 'https://example.com/archive.jar',
                    refUrl: 'https://example.com/',
                    refPolicy: '',
                  });
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'archive', 'archive.jar');
                });

                break;
              }
              case "link": {
                it('should rewrite `code` attribute to the resolved URL', async function () {
                  var doc = createDocFixture({tagName, attrs: {code: './applet.class'}});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('code'), 'https://example.com/applet.class');

                  sinon.assert.calledWithExactly(spyResolve, './applet.class', 'https://example.com/');
                  sinon.assert.notCalled(spyDownload);
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'code', 'https://example.com/applet.class');
                });

                it('should rewrite `archive` attribute to the resolved URL', async function () {
                  var doc = createDocFixture({tagName, attrs: {code: 'MyApplet.class', archive: './archive.jar'}});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('archive'), 'https://example.com/archive.jar');

                  sinon.assert.calledWithExactly(spyResolve, './archive.jar', 'https://example.com/');
                  sinon.assert.notCalled(spyDownload);
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'archive', 'https://example.com/archive.jar');
                });

                break;
              }
              case "blank": {
                it('should remove `code` attribute', async function () {
                  var doc = createDocFixture({tagName, attrs: {code: './applet.class'}});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('code'), null);

                  sinon.assert.calledWithExactly(spyResolve, './applet.class', 'https://example.com/');
                  sinon.assert.notCalled(spyDownload);
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'code', null);
                });

                it('should remove `archive` attribute', async function () {
                  var doc = createDocFixture({tagName, attrs: {code: 'MyApplet.class', archive: './archive.jar'}});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('archive'), null);

                  sinon.assert.calledWithExactly(spyResolve, './archive.jar', 'https://example.com/');
                  sinon.assert.notCalled(spyDownload);
                  sinon.assert.calledWithExactly(spyRewrite, elem, 'archive', null);
                });

                break;
              }
              case "remove": {
                it('should remove the element', async function () {
                  var doc = createDocFixture({tagName, attrs: {code: './applet.class'}});
                  var elemOrig = doc.querySelector(tagName);

                  var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isNull(rewriter.doc.querySelector(tagName));

                  sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                });

                break;
              }
            }

            if (mode !== "remove") {
              it('should rewrite `classid` attribute to the resolved URL', async function () {
                var doc = createDocFixture({tagName, attrs: {code: './applet.class', classid: './class/'}});

                var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                var elem = doc.querySelector(tagName);
                assert.strictEqual(elem.getAttribute('classid'), 'https://example.com/class/');

                sinon.assert.calledWithExactly(spyResolve, './class/', 'https://example.com/');
                sinon.assert.calledWithExactly(spyRewrite, elem, 'classid', 'https://example.com/class/');
              });

              context(CONTEXT_BASE_URL, function () {
                it('should resolve URLs with `baseUrl`', async function () {
                  var doc = createDocFixture({tagName, attrs: {code: './applet.class', archive: './archive.jar', classid: './class/'}});
                  var tester = baseUrlHandlingTesterFactory({tagName, docUrl});

                  var {stub} = await rewriteNodeControlledTest({doc, docUrl, options, tester});
                  sinon.assert.called(stub);

                  sinon.assert.calledWithExactly(spyResolve.getCall(0), './class/', 'https://example.com/baseUrl/');
                  sinon.assert.calledWithExactly(spyResolve.getCall(1), './applet.class', 'https://example.com/baseUrl/');
                  sinon.assert.calledWithExactly(spyResolve.getCall(2), './archive.jar', 'https://example.com/baseUrl/');
                });
              });
            }
          });
        }
      });

      context('for <canvas>', function () {
        const tagName = 'canvas';

        for (const mode of ["save", "blank", "remove", "<other>"]) {
          context(`when options["capture.canvas"] = "${mode}"`, function () {
            async function docFactory() {
              var {contentDocument: doc} = await createIframeFixture({docData: {tagName, attrs: {width: 320, height: 240}}});
              var elem = doc.querySelector(tagName);
              var ctx = elem.getContext("2d");
              ctx.fillStyle = "#00FF00";
              ctx.fillRect(0, 0, 100, 75);
              return doc;
            }

            async function docFactoryWebgl() {
              var {contentDocument: doc} = await createIframeFixture({docData: {tagName, attrs: {width: 320, height: 240}}});
              var elem = doc.querySelector(tagName);

              // code adopted from: https://stackoverflow.com/a/45804460/1667884 (CC BY-SA 3.0)
              /* eslint-disable @stylistic/no-multi-spaces */
              var squareVerticies = Float32Array.from([
                 0.5,  0.5,
                -0.5,  0.5,
                 0.5, -0.5,
                 0.5, -0.5,
                -0.5,  0.5,
                -0.5, -0.5,
              ]);
              /* eslint-enable @stylistic/no-multi-spaces */

              var vertexShaderCode = `
  precision lowp float;
  attribute vec2 aPos;
  void main() {
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`;

              var fragmentShaderCode = `
  precision lowp float;
  void main() {
    gl_FragColor = vec4(1.0, 1.0, 1.0, 1.0);
  }
`;

              // toDataURL gets blank image if preserveDrawingBuffer not set
              var gl = elem.getContext('webgl', {preserveDrawingBuffer: true});

              var vertexShader = gl.createShader(gl.VERTEX_SHADER);
              var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
              gl.shaderSource(vertexShader, vertexShaderCode);
              gl.shaderSource(fragmentShader, fragmentShaderCode);
              gl.compileShader(vertexShader);
              gl.compileShader(fragmentShader);

              var program = gl.createProgram();
              gl.attachShader(program, vertexShader);
              gl.attachShader(program, fragmentShader);
              gl.linkProgram(program);
              gl.deleteShader(vertexShader);
              gl.deleteShader(fragmentShader);
              gl.useProgram(program);

              var VBO = gl.createBuffer();
              gl.bindBuffer(gl.ARRAY_BUFFER, VBO);
              gl.bufferData(gl.ARRAY_BUFFER, squareVerticies, gl.STATIC_DRAW);

              var posAttributeLocation = gl.getAttribLocation(program, 'aPos');
              gl.vertexAttribPointer(
                posAttributeLocation,
                2,
                gl.FLOAT,
                gl.FALSE,
                2 * Float32Array.BYTES_PER_ELEMENT,
                0 * Float32Array.BYTES_PER_ELEMENT,
              );
              gl.enableVertexAttribArray(posAttributeLocation);
              gl.clearColor(0.5, 0.5, 0.5, 1.0);
              gl.clear(gl.COLOR_BUFFER_BIT);
              gl.drawArrays(gl.TRIANGLES, 0, 6);

              return doc;
            }

            async function docFactoryShadow() {
              var {contentDocument: doc} = await createIframeFixture({docData: {
                tagName: 'div',
                shadow: {
                  children: [
                    {tagName, attrs: {width: 320, height: 240}},
                  ],
                },
              }});
              var elem = doc.querySelector('div').shadowRoot.querySelector(tagName);
              var ctx = elem.getContext("2d");
              ctx.fillStyle = "#00FF00";
              ctx.fillRect(0, 0, 100, 75);
              return doc;
            }

            const options = {
              "capture.canvas": mode,
            };

            switch (mode) {
              case "save":
              default: {
                it('should save canvas data for a headed document', async function () {
                  var doc = await docFactory();

                  var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.match(elem.getAttribute('data-scrapbook-canvas'), rawRegex`${'^'}data:image/png;base64,`);
                  assert.isTrue(requireBasicLoader);
                });

                it('should save an empry canvas for a headless document', async function () {
                  var doc = createDocFixture({tagName});

                  var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('data-scrapbook-canvas'), null);
                  assert.isFalse(requireBasicLoader);
                });

                it('should work for a webgl canvas with `preserveDrawingBuffer` = true', async function () {
                  var doc = await docFactoryWebgl();

                  var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.match(elem.getAttribute('data-scrapbook-canvas'), rawRegex`${'^'}data:image/png;base64,`);
                  assert.isTrue(requireBasicLoader);
                });

                it('should work for a canvas in a shadow DOM', async function () {
                  var doc = await docFactoryShadow();

                  var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var html = doc.querySelector('div').getAttribute('data-scrapbook-shadowdom');
                  var shadow = createFragFixture(html);
                  var elem = shadow.querySelector(tagName);
                  assert.match(elem.getAttribute('data-scrapbook-canvas'), rawRegex`${'^'}data:image/png;base64,`);
                  assert.isTrue(requireBasicLoader);
                });

                break;
              }
              case "blank": {
                it('should save an empty canvas', async function () {
                  var doc = await docFactory();

                  var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('data-scrapbook-canvas'), null);
                  assert.isFalse(requireBasicLoader);
                });

                break;
              }
              case "remove": {
                it('should remove the element', async function () {
                  var doc = await docFactory();
                  var elemOrig = doc.querySelector(tagName);

                  var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isNull(rewriter.doc.querySelector(tagName));
                  assert.isFalse(rewriter.requireBasicLoader);

                  sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                });

                break;
              }
            }
          });
        }
      });

      context('for <form>', function () {
        const tagName = 'form';

        it('should rewrite `action` attribute to the resolved URL', async function () {
          var doc = createDocFixture({tagName, attrs: {action: "./submit.html"}});

          var {doc} = await new TestCapturer().captureDocument({doc, docUrl});
          var elem = doc.querySelector(tagName);
          assert.strictEqual(elem.getAttribute('action'), 'https://example.com/submit.html');

          sinon.assert.calledOnceWithExactly(spyResolve, "./submit.html", "https://example.com/", {checkJavascript: true});
          sinon.assert.calledWithExactly(spyRewrite, elem, "action", "https://example.com/submit.html");
        });

        context(CONTEXT_BASE_URL, function () {
          it('should resolve `action` with `baseUrlFinal`', async function () {
            var doc = createDocFixture({tagName, attrs: {action: "./submit.html"}});
            var tester = baseUrlHandlingTesterFactory({tagName, docUrl});

            var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester});
            sinon.assert.called(stub);

            sinon.assert.calledOnceWithExactly(spyResolve, './submit.html', 'https://example.com/baseUrlFinal/', {checkJavascript: true});
          });
        });
      });

      context('for <input>', function () {
        const tagName = 'input';

        for (const type of ["radio", "checkbox", "password", "text", "number", "color", "range", "file", "submit", "image", "<other>"]) {
          context(`for [type="${type}"]`, function () {
            function factory(present, consistent) {
              const valueTest = (() => {
                if (["number", "range"].includes(type)) {
                  return '10';
                }
                if (["color"].includes(type)) {
                  return '#ff0000';
                }
                return 'foo';
              })();
              const doc = createDocFixture({tagName, attrs: {type, ...(present && {value: valueTest})}});
              const elem = doc.querySelector(tagName);
              if (!consistent) {
                elem.value = present ? '' : valueTest;
              }
              return {doc, valueAttr: elem.getAttribute('value'), valueProp: elem.value};
            }

            function factoryCheck(present, consistent, indeterminate = false) {
              const doc = createDocFixture({tagName, attrs: {type, ...(present && {checked: ''})}});
              const elem = doc.querySelector(tagName);
              if (!consistent) {
                elem.checked = present ? false : true;
              }
              if (indeterminate) {
                elem.indeterminate = true;
              }
              return {doc, checkedAttr: elem.getAttribute('checked'), checkedProp: elem.checked, indeterminate: elem.indeterminate};
            }

            switch (type) {
              case 'radio': {
                for (const mode of ["save-all", "save", "keep-all", "keep", "html-all", "html", "reset", "<other>"]) {
                  context(`when options["capture.formStatus"] = "${mode}"`, function () {
                    const options = {
                      "capture.formStatus": mode,
                    };

                    switch (mode) {
                      case "save-all":
                      case "save": {
                        context('when `checked` attribute is present', function () {
                          context('when the current state is inconsistent to attribute', function () {
                            it('should save the checked state', async function () {
                              var {doc} = factoryCheck(true, false);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('checked'), '');
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), 'false');
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                              assert.isTrue(requireBasicLoader);

                              sinon.assert.neverCalledWith(spyRewrite, elem, 'checked');
                            });
                          });

                          context('when the current state is consistent to attribute', function () {
                            it('should not save the checked state', async function () {
                              var {doc} = factoryCheck(true, true);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('checked'), '');
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), null);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.neverCalledWith(spyRewrite, elem, 'checked');
                            });
                          });
                        });

                        context('when `checked` attribute is not present', function () {
                          context('when the current state is inconsistent to attribute', function () {
                            it('should save the checked state', async function () {
                              var {doc} = factoryCheck(false, false);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('checked'), null);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), 'true');
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                              assert.isTrue(requireBasicLoader);

                              sinon.assert.neverCalledWith(spyRewrite, elem, 'checked');
                            });
                          });

                          context('when the current state is consistent to attribute', function () {
                            it('should not save the checked state', async function () {
                              var {doc} = factoryCheck(false, true);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('checked'), null);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), null);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.neverCalledWith(spyRewrite, elem, 'checked');
                            });
                          });
                        });

                        break;
                      }
                      case "keep-all":
                      case "keep":
                      case "html-all":
                      case "html": {
                        context('when `checked` attribute is present', function () {
                          context('when the current state is inconsistent to attribute', function () {
                            it('should rewrite `checked` attribute', async function () {
                              var {doc} = factoryCheck(true, false);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('checked'), null);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), null);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.calledWithExactly(spyRewrite, elem, 'checked', false);
                            });
                          });

                          context('when the current state is consistent to attribute', function () {
                            it('should not rewrite `checked` attribute', async function () {
                              var {doc} = factoryCheck(true, true);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('checked'), '');
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), null);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.calledWithExactly(spyRewrite, elem, 'checked', true);
                            });
                          });
                        });

                        context('when `checked` attribute is not present', function () {
                          context('when the current state is inconsistent to attribute', function () {
                            it('should rewrite `checked` attribute', async function () {
                              var {doc} = factoryCheck(false, false);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('checked'), '');
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), null);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.calledWithExactly(spyRewrite, elem, 'checked', true);
                            });
                          });

                          context('when the current state is consistent to attribute', function () {
                            it('should not rewrite `checked` attribute', async function () {
                              var {doc} = factoryCheck(false, true);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('checked'), null);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), null);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.calledWithExactly(spyRewrite, elem, 'checked', false);
                            });
                          });
                        });

                        break;
                      }
                      case "reset":
                      default: {
                        for (const present of [true, false]) {
                          context(`when \`checked\` attribute ${present ? 'is' : 'is not'} present`, function () {
                            for (const consistent of [false, true]) {
                              context(`when the current state is ${consistent ? 'consistent' : 'inconsistent'} to attribute`, function () {
                                it('should not alter the element', async function () {
                                  var {doc, checkedAttr} = factoryCheck(present, consistent);

                                  var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                                  var elem = doc.querySelector(tagName);
                                  assert.strictEqual(elem.getAttribute('checked'), checkedAttr);
                                  assert.strictEqual(elem.getAttribute('data-scrapbook-input-value'), null);
                                  assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                                  assert.isFalse(requireBasicLoader);

                                  sinon.assert.neverCalledWith(spyRewrite, elem, 'value');
                                });
                              });
                            }
                          });
                        }

                        break;
                      }
                    }
                  });
                }

                break;
              }

              case 'checkbox': {
                for (const mode of ["save-all", "save", "keep-all", "keep", "html-all", "html", "reset", "<other>"]) {
                  context(`when options["capture.formStatus"] = "${mode}"`, function () {
                    const options = {
                      "capture.formStatus": mode,
                    };

                    switch (mode) {
                      case "save-all":
                      case "save": {
                        context('when `checked` attribute is present', function () {
                          context('when the current state is inconsistent to attribute', function () {
                            it('should save the checked state', async function () {
                              var {doc} = factoryCheck(true, false);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('checked'), '');
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), 'false');
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                              assert.isTrue(requireBasicLoader);

                              sinon.assert.neverCalledWith(spyRewrite, elem, 'checked');
                            });

                            it('should save the indeterminate state when presented', async function () {
                              var {doc} = factoryCheck(true, false, true);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('checked'), '');
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), 'false');
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), '');
                              assert.isTrue(requireBasicLoader);

                              sinon.assert.neverCalledWith(spyRewrite, elem, 'checked');
                            });
                          });

                          context('when the current state is consistent to attribute', function () {
                            it('should not save the checked state', async function () {
                              var {doc} = factoryCheck(true, true);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('checked'), '');
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), null);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.neverCalledWith(spyRewrite, elem, 'checked');
                            });

                            it('should save the indeterminate state when presented', async function () {
                              var {doc} = factoryCheck(true, true, true);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('checked'), '');
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), null);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), '');
                              assert.isTrue(requireBasicLoader);

                              sinon.assert.neverCalledWith(spyRewrite, elem, 'checked');
                            });
                          });
                        });

                        context('when `checked` attribute is not present', function () {
                          context('when the current state is inconsistent to attribute', function () {
                            it('should save the checked state', async function () {
                              var {doc} = factoryCheck(false, false);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('checked'), null);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), 'true');
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                              assert.isTrue(requireBasicLoader);

                              sinon.assert.neverCalledWith(spyRewrite, elem, 'checked');
                            });

                          });

                          context('when the current state is consistent to attribute', function () {
                            it('should not save the checked state', async function () {
                              var {doc} = factoryCheck(false, true);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('checked'), null);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), null);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.neverCalledWith(spyRewrite, elem, 'checked');
                            });
                          });
                        });

                        break;
                      }
                      case "keep-all":
                      case "keep":
                      case "html-all":
                      case "html": {
                        context('when `checked` attribute is present', function () {
                          context('when the current state is inconsistent to attribute', function () {
                            it('should rewrite `checked` attribute', async function () {
                              var {doc} = factoryCheck(true, false);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('checked'), null);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), null);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.calledWithExactly(spyRewrite, elem, 'checked', false);
                            });

                            if (["keep-all", "keep"].includes(mode)) {
                              it('should save the indeterminate state when presented', async function () {
                                var {doc} = factoryCheck(true, false, true);

                                var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                                var elem = doc.querySelector(tagName);
                                assert.strictEqual(elem.getAttribute('checked'), null);
                                assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), null);
                                assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), '');
                                assert.isTrue(requireBasicLoader);

                                sinon.assert.calledWithExactly(spyRewrite, elem, 'checked', false);
                              });
                            } else {
                              it('should ignore the indeterminate state', async function () {
                                var {doc} = factoryCheck(true, false, true);

                                var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                                var elem = doc.querySelector(tagName);
                                assert.strictEqual(elem.getAttribute('checked'), null);
                                assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), null);
                                assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                                assert.isFalse(requireBasicLoader);

                                sinon.assert.calledWithExactly(spyRewrite, elem, 'checked', false);
                              });
                            }
                          });

                          context('when the current state is consistent to attribute', function () {
                            it('should not rewrite `checked` attribute', async function () {
                              var {doc} = factoryCheck(true, true);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('checked'), '');
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), null);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.calledWithExactly(spyRewrite, elem, 'checked', true);
                            });

                            if (["keep-all", "keep"].includes(mode)) {
                              it('should save the indeterminate state when presented', async function () {
                                var {doc} = factoryCheck(true, true, true);

                                var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                                var elem = doc.querySelector(tagName);
                                assert.strictEqual(elem.getAttribute('checked'), '');
                                assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), null);
                                assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), '');
                                assert.isTrue(requireBasicLoader);

                                sinon.assert.calledWithExactly(spyRewrite, elem, 'checked', true);
                              });
                            } else {
                              it('should ignore the indeterminate state', async function () {
                                var {doc} = factoryCheck(true, true, true);

                                var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                                var elem = doc.querySelector(tagName);
                                assert.strictEqual(elem.getAttribute('checked'), '');
                                assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), null);
                                assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                                assert.isFalse(requireBasicLoader);

                                sinon.assert.calledWithExactly(spyRewrite, elem, 'checked', true);
                              });
                            }
                          });
                        });

                        context('when `checked` attribute is not present', function () {
                          context('when the current state is inconsistent to attribute', function () {
                            it('should rewrite `checked` attribute', async function () {
                              var {doc} = factoryCheck(false, false);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('checked'), '');
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), null);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.calledWithExactly(spyRewrite, elem, 'checked', true);
                            });

                            if (["keep-all", "keep"].includes(mode)) {
                              it('should save the indeterminate state when presented', async function () {
                                var {doc} = factoryCheck(false, false, true);

                                var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                                var elem = doc.querySelector(tagName);
                                assert.strictEqual(elem.getAttribute('checked'), '');
                                assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), null);
                                assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), '');
                                assert.isTrue(requireBasicLoader);

                                sinon.assert.calledWithExactly(spyRewrite, elem, 'checked', true);
                              });
                            } else {
                              it('should ignore the indeterminate state', async function () {
                                var {doc} = factoryCheck(false, false, true);

                                var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                                var elem = doc.querySelector(tagName);
                                assert.strictEqual(elem.getAttribute('checked'), '');
                                assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), null);
                                assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                                assert.isFalse(requireBasicLoader);

                                sinon.assert.calledWithExactly(spyRewrite, elem, 'checked', true);
                              });
                            }
                          });

                          context('when the current state is consistent to attribute', function () {
                            it('should not rewrite `checked` attribute', async function () {
                              var {doc} = factoryCheck(false, true);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('checked'), null);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), null);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.calledWithExactly(spyRewrite, elem, 'checked', false);
                            });

                            if (["keep-all", "keep"].includes(mode)) {
                              it('should save the indeterminate state when presented', async function () {
                                var {doc} = factoryCheck(false, true, true);

                                var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                                var elem = doc.querySelector(tagName);
                                assert.strictEqual(elem.getAttribute('checked'), null);
                                assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), null);
                                assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), '');
                                assert.isTrue(requireBasicLoader);

                                sinon.assert.calledWithExactly(spyRewrite, elem, 'checked', false);
                              });
                            } else {
                              it('should ignore the indeterminate state', async function () {
                                var {doc} = factoryCheck(false, true, true);

                                var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                                var elem = doc.querySelector(tagName);
                                assert.strictEqual(elem.getAttribute('checked'), null);
                                assert.strictEqual(elem.getAttribute('data-scrapbook-input-checked'), null);
                                assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                                assert.isFalse(requireBasicLoader);

                                sinon.assert.calledWithExactly(spyRewrite, elem, 'checked', false);
                              });
                            }
                          });
                        });

                        break;
                      }
                      case "reset":
                      default: {
                        for (const present of [true, false]) {
                          context(`when \`checked\` attribute ${present ? 'is' : 'is not'} present`, function () {
                            for (const consistent of [false, true]) {
                              context(`when the current state is ${consistent ? 'consistent' : 'inconsistent'} to attribute`, function () {
                                it('should not alter the element', async function () {
                                  var {doc, checkedAttr} = factoryCheck(present, consistent);

                                  var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                                  var elem = doc.querySelector(tagName);
                                  assert.strictEqual(elem.getAttribute('checked'), checkedAttr);
                                  assert.strictEqual(elem.getAttribute('data-scrapbook-input-value'), null);
                                  assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                                  assert.isFalse(requireBasicLoader);

                                  sinon.assert.neverCalledWith(spyRewrite, elem, 'value');
                                });

                                it('should ignore the indeterminate state', async function () {
                                  var {doc, checkedAttr} = factoryCheck(present, consistent, true);

                                  var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                                  var elem = doc.querySelector(tagName);
                                  assert.strictEqual(elem.getAttribute('checked'), checkedAttr);
                                  assert.strictEqual(elem.getAttribute('data-scrapbook-input-value'), null);
                                  assert.strictEqual(elem.getAttribute('data-scrapbook-input-indeterminate'), null);
                                  assert.isFalse(requireBasicLoader);

                                  sinon.assert.neverCalledWith(spyRewrite, elem, 'value');
                                });
                              });
                            }
                          });
                        }

                        break;
                      }
                    }
                  });
                }

                break;
              }

              case 'text':
              default: {
                for (const mode of ["save-all", "save", "keep-all", "keep", "html-all", "html", "reset", "<other>"]) {
                  context(`when options["capture.formStatus"] = "${mode}"`, function () {
                    const options = {
                      "capture.formStatus": mode,
                    };

                    switch (mode) {
                      case "save-all":
                      case "save": {
                        context('when `value` attribute is present', function () {
                          context('when the current value is inconsistent to attribute', function () {
                            it('should save the current value', async function () {
                              var {doc, valueAttr, valueProp} = factory(true, false);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('value'), valueAttr);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-value'), valueProp);
                              assert.isTrue(requireBasicLoader);

                              sinon.assert.neverCalledWith(spyRewrite, elem, 'value');
                            });
                          });

                          context('when the current value is consistent to attribute', function () {
                            it('should not save the current value', async function () {
                              var {doc, valueAttr, valueProp} = factory(true, true);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('value'), valueAttr);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-value'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.neverCalledWith(spyRewrite, elem, 'value');
                            });
                          });
                        });

                        context('when `value` attribute is not present', function () {
                          context('when the current value is inconsistent to attribute', function () {
                            it('should save the current value', async function () {
                              var {doc, valueAttr, valueProp} = factory(false, false);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('value'), valueAttr);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-value'), valueProp);
                              assert.isTrue(requireBasicLoader);

                              sinon.assert.neverCalledWith(spyRewrite, elem, 'value');
                            });
                          });

                          context('when the current value is consistent to attribute', function () {
                            $it.xfail()('should not save the current value', async function () {
                              var {doc, valueAttr, valueProp} = factory(false, true);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('value'), valueAttr);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-value'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.neverCalledWith(spyRewrite, elem, 'value');
                            });
                          });
                        });

                        break;
                      }
                      case "keep-all":
                      case "keep":
                      case "html-all":
                      case "html": {
                        context('when `value` attribute is present', function () {
                          context('when the current value is inconsistent to attribute', function () {
                            it('should rewrite `value` attribute', async function () {
                              var {doc, valueAttr, valueProp} = factory(true, false);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('value'), valueProp);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-value'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.calledWithExactly(spyRewrite, elem, 'value', valueProp);
                            });
                          });

                          context('when the current value is consistent to attribute', function () {
                            it('should not rewrite `value` attribute', async function () {
                              var {doc, valueAttr, valueProp} = factory(true, true);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('value'), valueAttr);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-value'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.calledWithExactly(spyRewrite, elem, 'value', valueAttr);
                            });
                          });
                        });

                        context('when `value` attribute is not present', function () {
                          context('when the current value is inconsistent to attribute', function () {
                            it('should rewrite `value` attribute', async function () {
                              var {doc, valueAttr, valueProp} = factory(false, false);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('value'), valueProp);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-value'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.calledWithExactly(spyRewrite, elem, 'value', valueProp);
                            });
                          });

                          context('when the current value is consistent to attribute', function () {
                            $it.xfail()('should not rewrite `value` attribute', async function () {
                              var {doc, valueAttr, valueProp} = factory(false, true);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('value'), valueAttr);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-value'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.neverCalledWith(spyRewrite, elem, 'value');
                            });
                          });
                        });

                        break;
                      }
                      case "reset":
                      default: {
                        for (const present of [true, false]) {
                          context(`when \`value\` attribute ${present ? 'is' : 'is not'} present`, function () {
                            for (const consistent of [false, true]) {
                              context(`when the current value is ${consistent ? 'consistent' : 'inconsistent'} to attribute`, function () {
                                it('should not alter the element', async function () {
                                  var {doc, valueAttr, valueProp} = factory(present, consistent);

                                  var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                                  var elem = doc.querySelector(tagName);
                                  assert.strictEqual(elem.getAttribute('value'), valueAttr);
                                  assert.strictEqual(elem.getAttribute('data-scrapbook-input-value'), null);
                                  assert.isFalse(requireBasicLoader);

                                  sinon.assert.neverCalledWith(spyRewrite, elem, 'value');
                                });
                              });
                            }
                          });
                        }

                        break;
                      }
                    }
                  });
                }

                break;
              }

              case 'password': {
                for (const mode of ["save-all", "save", "keep-all", "keep", "html-all", "html", "reset", "<other>"]) {
                  context(`when options["capture.formStatus"] = "${mode}"`, function () {
                    const options = {
                      "capture.formStatus": mode,
                    };

                    switch (mode) {
                      case "save-all": {
                        context('when `value` attribute is present', function () {
                          context('when the current value is inconsistent to attribute', function () {
                            it('should save the current value', async function () {
                              var {doc, valueAttr, valueProp} = factory(true, false);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('value'), valueAttr);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-value'), valueProp);
                              assert.isTrue(requireBasicLoader);

                              sinon.assert.neverCalledWith(spyRewrite, elem, 'value');
                            });
                          });

                          context('when the current value is consistent to attribute', function () {
                            it('should not save the current value', async function () {
                              var {doc, valueAttr, valueProp} = factory(true, true);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('value'), valueAttr);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-value'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.neverCalledWith(spyRewrite, elem, 'value');
                            });
                          });
                        });

                        context('when `value` attribute is not present', function () {
                          context('when the current value is inconsistent to attribute', function () {
                            it('should save the current value', async function () {
                              var {doc, valueAttr, valueProp} = factory(false, false);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('value'), valueAttr);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-value'), valueProp);
                              assert.isTrue(requireBasicLoader);

                              sinon.assert.neverCalledWith(spyRewrite, elem, 'value');
                            });
                          });

                          context('when the current value is consistent to attribute', function () {
                            $it.xfail()('should not save the current value', async function () {
                              var {doc, valueAttr, valueProp} = factory(false, true);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('value'), valueAttr);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-value'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.neverCalledWith(spyRewrite, elem, 'value');
                            });
                          });
                        });

                        break;
                      }
                      case "keep-all":
                      case "html-all": {
                        context('when `value` attribute is present', function () {
                          context('when the current value is inconsistent to attribute', function () {
                            it('should rewrite `value` attribute', async function () {
                              var {doc, valueAttr, valueProp} = factory(true, false);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('value'), valueProp);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-value'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.calledWithExactly(spyRewrite, elem, 'value', valueProp);
                            });
                          });

                          context('when the current value is consistent to attribute', function () {
                            it('should not rewrite `value` attribute', async function () {
                              var {doc, valueAttr, valueProp} = factory(true, true);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('value'), valueAttr);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-value'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.calledWithExactly(spyRewrite, elem, 'value', valueAttr);
                            });
                          });
                        });

                        context('when `value` attribute is not present', function () {
                          context('when the current value is inconsistent to attribute', function () {
                            it('should rewrite `value` attribute', async function () {
                              var {doc, valueAttr, valueProp} = factory(false, false);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('value'), valueProp);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-value'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.calledWithExactly(spyRewrite, elem, 'value', valueProp);
                            });
                          });

                          context('when the current value is consistent to attribute', function () {
                            $it.xfail()('should not rewrite `value` attribute', async function () {
                              var {doc, valueAttr, valueProp} = factory(false, true);

                              var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                              var elem = doc.querySelector(tagName);
                              assert.strictEqual(elem.getAttribute('value'), valueAttr);
                              assert.strictEqual(elem.getAttribute('data-scrapbook-input-value'), null);
                              assert.isFalse(requireBasicLoader);

                              sinon.assert.neverCalledWith(spyRewrite, elem, 'value');
                            });
                          });
                        });

                        break;
                      }
                      case "reset":
                      default: {
                        for (const present of [true, false]) {
                          context(`when \`value\` attribute ${present ? 'is' : 'is not'} present`, function () {
                            for (const consistent of [false, true]) {
                              context(`when the current value is ${consistent ? 'consistent' : 'inconsistent'} to attribute`, function () {
                                it('should not alter the element', async function () {
                                  var {doc, valueAttr, valueProp} = factory(present, consistent);

                                  var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                                  var elem = doc.querySelector(tagName);
                                  assert.strictEqual(elem.getAttribute('value'), valueAttr);
                                  assert.strictEqual(elem.getAttribute('data-scrapbook-input-value'), null);
                                  assert.isFalse(requireBasicLoader);

                                  sinon.assert.neverCalledWith(spyRewrite, elem, 'value');
                                });
                              });
                            }
                          });
                        }

                        break;
                      }
                    }
                  });
                }

                break;
              }

              case 'file': {
                for (const mode of ["save-all", "save", "keep-all", "keep", "html-all", "html", "reset", "<other>"]) {
                  context(`when options["capture.formStatus"] = "${mode}"`, function () {
                    const options = {
                      "capture.formStatus": mode,
                    };

                    it('should not alter the element', async function () {
                      var doc = createDocFixture({tagName, attrs: {type}});

                      var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.outerHTML, '<input type="file">');
                      assert.isFalse(requireBasicLoader);
                    });
                  });
                }

                break;
              }

              case 'submit': {
                it('should rewrite `formaction` attribute to the resolved URL', async function () {
                  var doc = createDocFixture({tagName, attrs: {type, formaction: "./submit.html"}});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('formaction'), 'https://example.com/submit.html');

                  sinon.assert.calledOnceWithExactly(spyResolve, "./submit.html", "https://example.com/", {checkJavascript: true});
                  sinon.assert.calledWithExactly(spyRewrite, elem, "formaction", "https://example.com/submit.html");
                });

                context(CONTEXT_BASE_URL, function () {
                  it('should resolve `formaction` with `baseUrlFinal`', async function () {
                    var doc = createDocFixture({tagName, attrs: {type, formaction: "./submit.html"}});
                    var tester = baseUrlHandlingTesterFactory({tagName, docUrl});

                    var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester});
                    sinon.assert.called(stub);

                    sinon.assert.calledOnceWithExactly(spyResolve, './submit.html', 'https://example.com/baseUrlFinal/', {checkJavascript: true});
                  });
                });

                break;
              }

              case 'image': {
                for (const mode of ["save", "save-current", "link", "blank", "remove", "<other>"]) {
                  context(`when options["capture.image"] = "${mode}"`, function () {
                    const options = {
                      "capture.image": mode,
                    };

                    switch (mode) {
                      case "save":
                      default: {
                        it('should save resource and rewrite `src` attribute', async function () {
                          var doc = createDocFixture({tagName, attrs: {type, src: './green.bmp'}});

                          var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                          var elem = doc.querySelector(tagName);
                          assert.strictEqual(elem.getAttribute('src'), 'green.bmp');

                          sinon.assert.calledWithMatch(spyDownload, {
                            url: `${docUrl}green.bmp`,
                          });
                          sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'green.bmp');
                        });

                        break;
                      }
                      case "link": {
                        it('should rewrite `src` attribute to the resolved URL', async function () {
                          var doc = createDocFixture({tagName, attrs: {type, src: './green.bmp'}});

                          var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                          var elem = doc.querySelector(tagName);
                          assert.strictEqual(elem.getAttribute('src'), 'https://example.com/green.bmp');

                          sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'https://example.com/green.bmp');
                        });

                        break;
                      }
                      case "blank": {
                        it('should blank `src` attribute', async function () {
                          var doc = createDocFixture({tagName, attrs: {type, src: './green.bmp'}});

                          var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                          var elem = doc.querySelector(tagName);
                          assert.strictEqual(elem.getAttribute('src'), 'about:blank');

                          sinon.assert.calledWithExactly(spyRewrite, elem, 'src', 'about:blank');
                        });

                        break;
                      }
                      case "remove": {
                        it('should remove the element', async function () {
                          var doc = createDocFixture({tagName, attrs: {type, src: './green.bmp'}});
                          var elemOrig = doc.querySelector(tagName);

                          var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                          assert.isNull(rewriter.doc.querySelector(tagName));

                          sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                        });

                        break;
                      }
                    }

                    if (mode !== 'remove') {
                      it('should rewrite `formaction` attribute to the resolved URL', async function () {
                        var doc = createDocFixture({tagName, attrs: {type, formaction: "./submit.html"}});

                        var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                        var elem = doc.querySelector(tagName);
                        assert.strictEqual(elem.getAttribute('formaction'), 'https://example.com/submit.html');

                        sinon.assert.calledOnceWithExactly(spyResolve, "./submit.html", "https://example.com/", {checkJavascript: true});
                        sinon.assert.calledWithExactly(spyRewrite, elem, "formaction", "https://example.com/submit.html");
                      });

                      context(CONTEXT_BASE_URL, function () {
                        it('should resolve `src` with `baseUrl`', async function () {
                          var doc = createDocFixture({tagName, attrs: {type, src: './green.bmp'}});
                          var tester = baseUrlHandlingTesterFactory({tagName, docUrl});

                          var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester});
                          sinon.assert.called(stub);

                          sinon.assert.calledOnceWithExactly(spyResolve, './green.bmp', 'https://example.com/baseUrl/');
                        });

                        it('should resolve `formaction` with `baseUrlFinal`', async function () {
                          var doc = createDocFixture({tagName, attrs: {type, formaction: "./submit.html"}});
                          var tester = baseUrlHandlingTesterFactory({tagName, docUrl});

                          var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester});
                          sinon.assert.called(stub);

                          sinon.assert.calledOnceWithExactly(spyResolve, './submit.html', 'https://example.com/baseUrlFinal/', {checkJavascript: true});
                        });
                      });
                    }
                  });
                }

                break;
              }
            }
          });
        }
      });

      context('for <button>', function () {
        const tagName = 'button';

        it('should rewrite `formaction` attribute to the resolved URL', async function () {
          var doc = createDocFixture({tagName, attrs: {formaction: "./submit.html"}});

          var {doc} = await new TestCapturer().captureDocument({doc, docUrl});
          var elem = doc.querySelector(tagName);
          assert.strictEqual(elem.getAttribute('formaction'), 'https://example.com/submit.html');

          sinon.assert.calledOnceWithExactly(spyResolve, "./submit.html", "https://example.com/", {checkJavascript: true});
          sinon.assert.calledWithExactly(spyRewrite, elem, "formaction", "https://example.com/submit.html");
        });

        context(CONTEXT_BASE_URL, function () {
          it('should resolve `formaction` with `baseUrlFinal`', async function () {
            var doc = createDocFixture({tagName, attrs: {formaction: "./submit.html"}});
            var tester = baseUrlHandlingTesterFactory({tagName, docUrl});

            var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester});
            sinon.assert.called(stub);

            sinon.assert.calledOnceWithExactly(spyResolve, './submit.html', 'https://example.com/baseUrlFinal/', {checkJavascript: true});
          });
        });
      });

      context('for <option>', function () {
        const tagName = 'option';

        function factory(present, consistent) {
          const doc = createDocFixture({tagName, attrs: {...(present && {selected: ''})}});
          const elem = doc.querySelector(tagName);
          if (!consistent) {
            elem.selected = present ? false : true;
          }
          return {doc, selectedAttr: elem.getAttribute('selected'), selectedProp: elem.selected};
        }

        for (const mode of ["save-all", "save", "keep-all", "keep", "html-all", "html", "reset", "<other>"]) {
          context(`when options["capture.formStatus"] = "${mode}"`, function () {
            const options = {
              "capture.formStatus": mode,
            };

            switch (mode) {
              case "save-all":
              case "save": {
                context('when `selected` attribute is present', function () {
                  context('when the current state is inconsistent to attribute', function () {
                    it('should save the selected state', async function () {
                      var {doc} = factory(true, false);

                      var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.getAttribute('selected'), '');
                      assert.strictEqual(elem.getAttribute('data-scrapbook-option-selected'), 'false');
                      assert.isTrue(requireBasicLoader);

                      sinon.assert.neverCalledWith(spyRewrite, elem, 'selected');
                    });
                  });

                  context('when the current state is consistent to attribute', function () {
                    it('should not save the selected state', async function () {
                      var {doc} = factory(true, true);

                      var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.getAttribute('selected'), '');
                      assert.strictEqual(elem.getAttribute('data-scrapbook-option-selected'), null);
                      assert.isFalse(requireBasicLoader);

                      sinon.assert.neverCalledWith(spyRewrite, elem, 'selected');
                    });
                  });
                });

                context('when `selected` attribute is not present', function () {
                  context('when the current state is inconsistent to attribute', function () {
                    it('should save the selected state', async function () {
                      var {doc} = factory(false, false);

                      var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.getAttribute('selected'), null);
                      assert.strictEqual(elem.getAttribute('data-scrapbook-option-selected'), 'true');
                      assert.isTrue(requireBasicLoader);

                      sinon.assert.neverCalledWith(spyRewrite, elem, 'selected');
                    });
                  });

                  context('when the current state is consistent to attribute', function () {
                    it('should not save the selected state', async function () {
                      var {doc} = factory(false, true);

                      var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.getAttribute('selected'), null);
                      assert.strictEqual(elem.getAttribute('data-scrapbook-option-selected'), null);
                      assert.isFalse(requireBasicLoader);

                      sinon.assert.neverCalledWith(spyRewrite, elem, 'selected');
                    });
                  });
                });

                break;
              }
              case "keep-all":
              case "keep":
              case "html-all":
              case "html": {
                context('when `selected` attribute is present', function () {
                  context('when the current state is inconsistent to attribute', function () {
                    it('should rewrite `selected` attribute', async function () {
                      var {doc} = factory(true, false);

                      var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.getAttribute('selected'), null);
                      assert.strictEqual(elem.getAttribute('data-scrapbook-option-selected'), null);
                      assert.isFalse(requireBasicLoader);

                      sinon.assert.calledWithExactly(spyRewrite, elem, 'selected', false);
                    });
                  });

                  context('when the current state is consistent to attribute', function () {
                    it('should not rewrite `selected` attribute', async function () {
                      var {doc} = factory(true, true);

                      var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.getAttribute('selected'), '');
                      assert.strictEqual(elem.getAttribute('data-scrapbook-option-selected'), null);
                      assert.isFalse(requireBasicLoader);

                      sinon.assert.calledWithExactly(spyRewrite, elem, 'selected', true);
                    });
                  });
                });

                context('when `selected` attribute is not present', function () {
                  context('when the current state is inconsistent to attribute', function () {
                    it('should rewrite `selected` attribute', async function () {
                      var {doc} = factory(false, false);

                      var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.getAttribute('selected'), '');
                      assert.strictEqual(elem.getAttribute('data-scrapbook-option-selected'), null);
                      assert.isFalse(requireBasicLoader);

                      sinon.assert.calledWithExactly(spyRewrite, elem, 'selected', true);
                    });
                  });

                  context('when the current state is consistent to attribute', function () {
                    it('should not rewrite `selected` attribute', async function () {
                      var {doc} = factory(false, true);

                      var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.getAttribute('selected'), null);
                      assert.strictEqual(elem.getAttribute('data-scrapbook-option-selected'), null);
                      assert.isFalse(requireBasicLoader);

                      sinon.assert.calledWithExactly(spyRewrite, elem, 'selected', false);
                    });
                  });
                });

                break;
              }
              case "reset":
              default: {
                for (const present of [true, false]) {
                  context(`when \`selected\` attribute ${present ? 'is' : 'is not'} present`, function () {
                    for (const consistent of [false, true]) {
                      context(`when the current state is ${consistent ? 'consistent' : 'inconsistent'} to attribute`, function () {
                        it('should not alter the element', async function () {
                          var {doc, selectedAttr} = factory(present, consistent);

                          var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                          var elem = doc.querySelector(tagName);
                          assert.strictEqual(elem.getAttribute('selected'), selectedAttr);
                          assert.strictEqual(elem.getAttribute('data-scrapbook-option-selected'), null);
                          assert.isFalse(requireBasicLoader);

                          sinon.assert.neverCalledWith(spyRewrite, elem, 'selected');
                        });
                      });
                    }
                  });
                }

                break;
              }
            }
          });
        }
      });

      context('for <textarea>', function () {
        const tagName = 'textarea';

        function factory(present, consistent) {
          const doc = createDocFixture({tagName, value: present ? 'foo' : ''});
          const elem = doc.querySelector(tagName);
          if (!consistent) {
            elem.value = present ? '' : 'foo';
          }
          return {doc, valueAttr: elem.textContent, valueProp: elem.value};
        }

        for (const mode of ["save-all", "save", "keep-all", "keep", "html-all", "html", "reset", "<other>"]) {
          context(`when options["capture.formStatus"] = "${mode}"`, function () {
            const options = {
              "capture.formStatus": mode,
            };

            switch (mode) {
              case "save-all":
              case "save": {
                context('when text content is not empty', function () {
                  context('when the current value is inconsistent to text content', function () {
                    it('should save the current value', async function () {
                      var {doc} = factory(true, false);

                      var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.textContent, 'foo');
                      assert.strictEqual(elem.getAttribute('data-scrapbook-textarea-value'), '');
                      assert.isTrue(requireBasicLoader);

                      sinon.assert.neverCalledWith(spyRewriteText, elem);
                    });
                  });

                  context('when the current value is consistent to text content', function () {
                    it('should not save the current value', async function () {
                      var {doc} = factory(true, true);

                      var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.textContent, 'foo');
                      assert.strictEqual(elem.getAttribute('data-scrapbook-textarea-value'), null);
                      assert.isFalse(requireBasicLoader);

                      sinon.assert.neverCalledWith(spyRewriteText, elem);
                    });
                  });
                });

                context('when text content is empty', function () {
                  context('when the current value is inconsistent to text content', function () {
                    it('should save the current value', async function () {
                      var {doc} = factory(false, false);

                      var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.textContent, '');
                      assert.strictEqual(elem.getAttribute('data-scrapbook-textarea-value'), 'foo');
                      assert.isTrue(requireBasicLoader);

                      sinon.assert.neverCalledWith(spyRewriteText, elem);
                    });
                  });

                  context('when the current value is consistent to text content', function () {
                    it('should not save the current value', async function () {
                      var {doc} = factory(false, true);

                      var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.textContent, '');
                      assert.strictEqual(elem.getAttribute('data-scrapbook-textarea-value'), null);
                      assert.isFalse(requireBasicLoader);

                      sinon.assert.neverCalledWith(spyRewriteText, elem);
                    });
                  });
                });

                break;
              }
              case "keep-all":
              case "keep":
              case "html-all":
              case "html": {
                context('when text content is not empty', function () {
                  context('when the current value is inconsistent to text content', function () {
                    it('should rewrite text content', async function () {
                      var {doc} = factory(true, false);

                      var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.textContent, '');
                      assert.strictEqual(elem.getAttribute('data-scrapbook-textarea-value'), null);
                      assert.isFalse(requireBasicLoader);

                      sinon.assert.calledWithExactly(spyRewriteText, elem, '');
                    });
                  });

                  context('when the current value is consistent to text content', function () {
                    it('should not rewrite text content', async function () {
                      var {doc} = factory(true, true);

                      var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.textContent, 'foo');
                      assert.strictEqual(elem.getAttribute('data-scrapbook-textarea-value'), null);
                      assert.isFalse(requireBasicLoader);

                      sinon.assert.calledWithExactly(spyRewriteText, elem, 'foo');
                    });
                  });
                });

                context('when text content is empty', function () {
                  context('when the current value is inconsistent to text content', function () {
                    it('should rewrite text content', async function () {
                      var {doc} = factory(false, false);

                      var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.textContent, 'foo');
                      assert.strictEqual(elem.getAttribute('data-scrapbook-textarea-value'), null);
                      assert.isFalse(requireBasicLoader);

                      sinon.assert.calledWithExactly(spyRewriteText, elem, 'foo');
                    });
                  });

                  context('when the current value is consistent to text content', function () {
                    it('should not rewrite text content', async function () {
                      var {doc} = factory(false, true);

                      var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                      var elem = doc.querySelector(tagName);
                      assert.strictEqual(elem.textContent, '');
                      assert.strictEqual(elem.getAttribute('data-scrapbook-textarea-value'), null);
                      assert.isFalse(requireBasicLoader);

                      sinon.assert.calledWithExactly(spyRewriteText, elem, '');
                    });
                  });
                });

                break;
              }
              case "reset":
              default: {
                for (const present of [true, false]) {
                  context(`when text content ${present ? 'is not' : 'is'} empty`, function () {
                    for (const consistent of [false, true]) {
                      context(`when the current value is ${consistent ? 'consistent' : 'inconsistent'} to text content`, function () {
                        it('should not alter the element', async function () {
                          var {doc, valueAttr} = factory(present, consistent);

                          var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                          var elem = doc.querySelector(tagName);
                          assert.strictEqual(elem.textContent, valueAttr);
                          assert.strictEqual(elem.getAttribute('data-scrapbook-textarea-value'), null);
                          assert.isFalse(requireBasicLoader);

                          sinon.assert.neverCalledWith(spyRewriteText, elem);
                        });
                      });
                    }
                  });
                }

                break;
              }
            }
          });
        }
      });

      for (const tagName of ["blockquote", "q", "ins", "del"]) {
        context(`for <${tagName}>`, function () {
          it('should rewrite `cite` attribute to the resolved URL', async function () {
            var doc = createDocFixture({tagName, attrs: {cite: "./page.html"}});

            var {doc} = await new TestCapturer().captureDocument({doc, docUrl});
            var elem = doc.querySelector(tagName);
            assert.strictEqual(elem.getAttribute('cite'), 'https://example.com/page.html');

            sinon.assert.calledOnceWithExactly(spyResolve, "./page.html", "https://example.com/");
            sinon.assert.calledWithExactly(spyRewrite, elem, "cite", "https://example.com/page.html");
          });

          context(CONTEXT_BASE_URL, function () {
            it('should resolve `cite` with `baseUrlFinal`', async function () {
              var doc = createDocFixture({tagName, attrs: {cite: "./page.html"}});
              var tester = baseUrlHandlingTesterFactory({tagName, docUrl});

              var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester});
              sinon.assert.called(stub);

              sinon.assert.calledOnceWithExactly(spyResolve, './page.html', 'https://example.com/baseUrlFinal/');
            });
          });
        });
      }

      context('for <template>', function () {
        /**
         * Check if template content is rewritten.
         *
         * - Getting/setting template.innerHTML/outerHTML is redirected to handle
         *   template.content, which is a hidden DocumentFragment.
         * - Getting/setting template.textContent or template.appendChild handles
         *   its childNodes. By default a templates is styled display: none, but can
         *   be changed by CSS.
         */
        it('should keep the current content without rewriting for a headless document', async function () {
          var doc = createDocFixture({code: '<template><img src="./green.bmp"><a href="./page.html">anchor</a></template>'});
          var {doc} = await new TestCapturer().captureDocument({doc, docUrl});
          assert.strictEqual(doc.querySelector('template').innerHTML, '<img src="./green.bmp"><a href="./page.html">anchor</a>');
        });

        it('should keep the current content without rewriting for a headed document', async function () {
          var {contentDocument: doc} = await createIframeFixture({docData: {code: '<template><img src="./green.bmp"><a href="./page.html">anchor</a></template>'}});
          var {doc} = await new TestCapturer().captureDocument({doc, docUrl});
          assert.strictEqual(doc.querySelector('template').innerHTML, '<img src="./green.bmp"><a href="./page.html">anchor</a>');
        });
      });

      $context.skipIf($.noShadowRootSlotAssignment)('for <slot>', function () {
        function slotAssign(slotElem, ...nodes) {
          try {
            return slotElem.assign(...nodes);
          } catch (ex) {
            if (ex.message.includes('must have a callable @@iterator')) {
              // Chromium < 92: HTMLSlotElement.assign() accepts sequence<Node>
              return slotElem.assign(nodes);
            } else {
              throw ex;
            }
          }
        }

        function docFactory(slotAssignment) {
          return createDocFixture({
            tagName: 'div',
            children: [
              {tagName: 'span', value: 'Default'},
              {tagName: 'span', value: 'Default2'},
              {tagName: '#text', value: 'Default3'},
              {tagName: 'span', attrs: {slot: 'person'}, value: 'Mr. Apple'},
              {tagName: 'span', attrs: {slot: 'person'}, value: 'Mr. Black'},
              {tagName: 'span', attrs: {slot: 'person'}, value: 'Ms. Cindy'},
            ],
            shadow: {
              slotAssignment,
              children: [
                {tagName: 'style', value: 'slot { display: block; } ::slotted(*) { background-color: yellow; }'},
                {tagName: 'slot', value: 'default missing'},
                {tagName: 'slot', attrs: {name: 'person'}, value: 'person missing'},
                {
                  tagName: 'div',
                  children: [
                    {tagName: 'span', attrs: {slot: 'person'}, value: 'person1'},
                    {tagName: 'span', attrs: {slot: 'person'}, value: 'person2'},
                    {tagName: 'span', attrs: {slot: 'person'}, value: 'person3'},
                  ],
                  shadow: {
                    slotAssignment,
                    children: [
                      {tagName: 'style', value: 'slot { display: block; } ::slotted(*) { background-color: yellow; }'},
                      {tagName: 'slot', attrs: {name: 'person'}, value: 'person missing'},
                    ],
                  },
                },
              ],
            },
          });
        }

        const options = {
          "capture.shadowDom": "save",
        };

        it('should rewrite slot elements in a shadow DOM with `slotAssignment` = "manual"', async function () {
          var doc = (() => {
            var doc = docFactory('manual');

            var host = doc.querySelector('div');
            var shadow = host.shadowRoot;
            var slots = shadow.querySelectorAll('slot');
            var spans = host.querySelectorAll('span');
            slotAssign(slots[0], spans[0], spans[1].nextSibling);
            slotAssign(slots[1], spans[2], spans[3]);

            var host = shadow.querySelector('div');
            var shadow = host.shadowRoot;
            var slots = shadow.querySelectorAll('slot');
            var spans = host.querySelectorAll('span');
            slotAssign(slots[0], spans[1], spans[2]);

            return doc;
          })();

          var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});

          var host = doc.querySelector('div');
          var shadow = createFragFixture(host.getAttribute('data-scrapbook-shadowdom'));

          var spans = host.querySelectorAll('span');
          assert.deepEqual(getAttributes(spans[0]), {
            'data-scrapbook-slot-index': '0',
          });
          assert.deepEqual(getAttributes(spans[1]), {});
          assert.deepEqual(getAttributes(spans[2]), {
            'slot': 'person',
            'data-scrapbook-slot-index': '2',
          });
          assert.deepEqual(getAttributes(spans[3]), {
            'slot': 'person',
            'data-scrapbook-slot-index': '3',
          });
          assert.deepEqual(getAttributes(spans[4]), {
            'slot': 'person',
          });

          var node = spans[1].nextSibling;
          assert.strictEqual(node.nodeType, Node.COMMENT_NODE);
          assert.strictEqual(node.nodeValue, 'scrapbook-slot-index=1');
          var node = node.nextSibling;
          assert.strictEqual(node.nodeType, Node.TEXT_NODE);
          assert.strictEqual(node.nodeValue, 'Default3');
          var node = node.nextSibling;
          assert.strictEqual(node.nodeType, Node.COMMENT_NODE);
          assert.strictEqual(node.nodeValue, '/scrapbook-slot-index');

          var slots = shadow.querySelectorAll('slot');
          assert.deepEqual(getAttributes(slots[0]), {
            'data-scrapbook-slot-assigned': '0,1',
          });
          assert.deepEqual(getAttributes(slots[1]), {
            'name': 'person',
            'data-scrapbook-slot-assigned': '2,3',
          });

          var host2 = shadow.querySelector('div');
          var shadow2 = createFragFixture(host2.getAttribute('data-scrapbook-shadowdom'));

          var spans = host2.querySelectorAll('span');
          assert.deepEqual(getAttributes(spans[0]), {
            'slot': 'person',
          });
          assert.deepEqual(getAttributes(spans[1]), {
            'slot': 'person',
            'data-scrapbook-slot-index': '4',
          });
          assert.deepEqual(getAttributes(spans[2]), {
            'slot': 'person',
            'data-scrapbook-slot-index': '5',
          });

          var slots = shadow2.querySelectorAll('slot');
          assert.deepEqual(getAttributes(slots[0]), {
            'name': 'person',
            'data-scrapbook-slot-assigned': '4,5',
          });
        });

        it('should not rewrite slot elements in a shadow DOM with `slotAssignment` != "manual"', async function () {
          var doc = docFactory();

          var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});

          var host = doc.querySelector('div');
          var shadow = createFragFixture(host.getAttribute('data-scrapbook-shadowdom'));

          var spans = host.querySelectorAll('span');
          assert.deepEqual(getAttributes(spans[0]), {});
          assert.deepEqual(getAttributes(spans[1]), {});
          assert.deepEqual(getAttributes(spans[2]), {slot: 'person'});
          assert.deepEqual(getAttributes(spans[3]), {slot: 'person'});
          assert.deepEqual(getAttributes(spans[4]), {slot: 'person'});

          var node = spans[1].nextSibling;
          assert.strictEqual(node.nodeType, Node.TEXT_NODE);
          assert.strictEqual(node.nodeValue, 'Default3');
          assert.strictEqual(node.nextSibling, spans[2]);

          var slots = shadow.querySelectorAll('slot');
          assert.deepEqual(getAttributes(slots[0]), {});
          assert.deepEqual(getAttributes(slots[1]), {name: 'person'});

          var host2 = shadow.querySelector('div');
          var shadow2 = createFragFixture(host2.getAttribute('data-scrapbook-shadowdom'));

          var spans = host2.querySelectorAll('span');
          assert.deepEqual(getAttributes(spans[0]), {slot: 'person'});
          assert.deepEqual(getAttributes(spans[1]), {slot: 'person'});
          assert.deepEqual(getAttributes(spans[2]), {slot: 'person'});

          var slots = shadow2.querySelectorAll('slot');
          assert.deepEqual(getAttributes(slots[0]), {name: 'person'});
        });
      });

      context('for <xmp>', function () {
        const tagName = 'xmp';

        context(CONTEXT_RAW_TEXT_ESCAPING, function () {
          it('should escape tag-ending text in HTML document', async function () {
            var doc = createDocFixture({tagName, value: 'some text with </xmp>'});

            var {doc} = await new TestCapturer().captureDocument({doc, docUrl});
            var elem = doc.querySelector(tagName);
            assert.strictEqual(elem.textContent, 'some text with <\\/xmp>');

            sinon.assert.calledWithExactly(spyRewriteText, elem, 'some text with <\\/xmp>');
          });

          it('should not escape tag-ending text in non-HTML document', async function () {
            var doc = createDocFixture({type: 'xhtml', tagName, value: 'some text with </xmp>'});

            var {doc} = await new TestCapturer().captureDocument({doc, docUrl});
            var elem = doc.querySelector(tagName);
            assert.strictEqual(elem.textContent, 'some text with </xmp>');
          });
        });
      });

      context('for <svg:style>', function () {
        function docFactory(value) {
          return createDocFixture({type: 'svg', tagName, ns: NS_SVG, value});
        }

        function docFactoryHtml(value) {
          return createDocFixture({
            tagName: 'svg',
            ns: NS_SVG,
            children: [
              {tagName, ns: NS_SVG, value},
            ],
          });
        }

        const tagName = 'style';

        for (const mode of ["save", "link", "blank", "remove", "<other>"]) {
          context(`when options["capture.style"] = "${mode}"`, function () {
            const options = {
              "capture.style": mode,
            };

            switch (mode) {
              case "save":
              case "link":
              default: {
                it('should rewrite the text content with `DocumentCssHandler.rewriteCss`', async function () {
                  var doc = docFactory('circle { background-image: url("./green.bmp"); }');

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.textContent, 'circle { background-image: url("green.bmp"); }');

                  sinon.assert.calledOnceWithMatch(spyRewritCss, {
                    elem,
                    baseUrl: 'https://example.com/',
                    refUrl: 'https://example.com/',
                    refPolicy: '',
                    envCharset: 'UTF-8',
                  });
                  sinon.assert.calledOnceWithExactly(spyRewriteText, elem, 'circle { background-image: url("green.bmp"); }');
                });

                context(CONTEXT_BASE_URL, function () {
                  it('should resolve the URLs with `baseUrl`', async function () {
                    var doc = docFactory('circle { background-image: url("./green.bmp"); }');
                    var tester = baseUrlHandlingTesterFactory({tagName, docUrl, interrupt: false});

                    var {stub} = await rewriteNodeControlledTest({doc, docUrl, options, tester});
                    sinon.assert.called(stub);

                    sinon.assert.calledOnceWithMatch(spyRewritCss, {
                      baseUrl: 'https://example.com/baseUrl/',
                    });
                  });
                });

                context(CONTEXT_RAW_TEXT_ESCAPING, function () {
                  it('should not escape tag-ending text in non-HTML document', async function () {
                    var doc = docFactory('body { content: "</style>"; background-image: url("./green.bmp"); }');

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.textContent, 'body { content: "</style>"; background-image: url("green.bmp"); }');
                  });

                  it('should not escape tag-ending text in HTML document', async function () {
                    var doc = docFactoryHtml('body { content: "</style>"; background-image: url("./green.bmp"); }');

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.textContent, 'body { content: "</style>"; background-image: url("green.bmp"); }');
                  });
                });

                break;
              }
              case "blank": {
                it('should blank the text content', async function () {
                  var doc = docFactory('circle { background-image: url("./green.bmp"); }');

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.textContent, '');

                  sinon.assert.notCalled(spyRewritCss);
                  sinon.assert.calledOnceWithExactly(spyRewriteText, elem, '');
                });

                break;
              }
              case "remove": {
                it('should remove the element', async function () {
                  var doc = docFactory('circle { background-image: url("./green.bmp"); }');
                  var elemOrig = doc.querySelector(tagName);

                  var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isNull(rewriter.doc.querySelector(tagName));

                  sinon.assert.notCalled(spyRewritCss);
                  sinon.assert.calledOnceWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                });

                break;
              }
            }
          });
        }
      });

      context('for <svg:script>', function () {
        function docFactory({attrs, value = ''} = {}) {
          return createDocFixture({type: 'svg', tagName, ns: NS_SVG, attrs, value});
        }

        function docFactoryHtml({attrs, value = ''} = {}) {
          return createDocFixture({tagName: 'svg', ns: NS_SVG, children: [
            {tagName, ns: NS_SVG, attrs, value},
          ]});
        }

        const tagName = 'script';

        for (const mode of ["save", "link", "blank", "remove", "<other>"]) {
          context(`when options["capture.script"] = "${mode}"`, function () {
            const options = {
              "capture.script": mode,
            };

            switch (mode) {
              case "save":
              default: {
                it('should save resource and rewrite `href` attribute', async function () {
                  var doc = docFactory({attrs: [['href', './script.js']]});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttributeNS(null, 'href'), 'script.js');

                  sinon.assert.calledWithExactly(spyRewrite, elem, "href", "script.js", {ns: null});
                });

                it('should save resource and rewrite `xlink:href` attribute', async function () {
                  var doc = docFactory({attrs: [['xlink:href', './script.js', NS_XLINK]]});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), 'script.js');

                  sinon.assert.calledWithExactly(spyRewrite, elem, "href", "script.js", {ns: NS_XLINK});
                });

                it('should keep the text content', async function () {
                  var doc = docFactory({value: 'console.debug("test")'});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.textContent, 'console.debug("test")');

                  sinon.assert.notCalled(spyRewriteText);
                });

                break;
              }
              case "link": {
                it('should rewrite `href` attribute to the resolved URL', async function () {
                  var doc = docFactory({attrs: [['href', './script.js']]});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttributeNS(null, 'href'), 'https://example.com/script.js');

                  sinon.assert.calledWithExactly(spyRewrite, elem, "href", 'https://example.com/script.js', {ns: null});
                });

                it('should rewrite `xlink:href` attribute to the resolved URL', async function () {
                  var doc = docFactory({attrs: [['xlink:href', './script.js', NS_XLINK]]});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), 'https://example.com/script.js');

                  sinon.assert.calledWithExactly(spyRewrite, elem, "href", 'https://example.com/script.js', {ns: NS_XLINK});
                });

                it('should keep the text content', async function () {
                  var doc = docFactory({value: 'console.debug("test")'});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.textContent, 'console.debug("test")');

                  sinon.assert.notCalled(spyRewriteText);
                });

                break;
              }
              case "blank": {
                it('should blank `href` attribute', async function () {
                  var doc = docFactory({attrs: [['href', './script.js']]});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttributeNS(null, 'href'), null);

                  sinon.assert.calledWithExactly(spyRewrite, elem, "href", null, {ns: null});
                });

                it('should blank `xlink:href` attribute', async function () {
                  var doc = docFactory({attrs: [['xlink:href', './script.js', NS_XLINK]]});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), null);

                  sinon.assert.calledWithExactly(spyRewrite, elem, "href", null, {ns: NS_XLINK});
                });

                it('should blank the text content', async function () {
                  var doc = docFactory({value: 'console.debug("test")'});

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.textContent, '');

                  sinon.assert.calledOnceWithExactly(spyRewriteText, elem, "");
                });

                break;
              }
              case "remove": {
                it('should remove the element', async function () {
                  var doc = docFactory({attrs: [['href', './script.js'], ['xlink:href', './script2.js', NS_XLINK]], value: 'console.debug("test")'});
                  var elemOrig = doc.querySelector(tagName);

                  var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isNull(rewriter.doc.querySelector(tagName));

                  sinon.assert.calledOnceWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                });

                it('should remove the element when having no `*:href` and text content', async function () {
                  var doc = docFactory();
                  var elemOrig = doc.querySelector(tagName);

                  var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isNull(rewriter.doc.querySelector(tagName));

                  sinon.assert.calledOnceWithExactly(spyRemove, rewriter.getClonedNode(elemOrig));
                });

                break;
              }
            }

            context(CONTEXT_BASE_URL, function () {
              it('should resolve the URL with `baseUrl`', async function () {
                var doc = docFactory({attrs: [['href', './script.js'], ['xlink:href', './script2.js', NS_XLINK]]});
                var tester = baseUrlHandlingTesterFactory({tagName, docUrl});

                var {stub} = await rewriteNodeControlledTest({doc, docUrl, options, tester});
                sinon.assert.called(stub);

                sinon.assert.calledWithExactly(spyResolve, './script.js', 'https://example.com/baseUrl/');
                sinon.assert.calledWithExactly(spyResolve, './script2.js', 'https://example.com/baseUrl/');
                sinon.assert.calledTwice(spyResolve);
              });
            });

            context(CONTEXT_RAW_TEXT_ESCAPING, function () {
              switch (mode) {
                case "save":
                case "link": {
                  it('should not escape tag-ending text in non-HTML document', async function () {
                    var doc = docFactory({value: 'console.debug("</script>")'});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.textContent, 'console.debug("</script>")');
                  });

                  it('should not escape tag-ending text in HTML document', async function () {
                    var doc = docFactoryHtml({value: 'console.debug("</script>")'});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.textContent, 'console.debug("</script>")');
                  });

                  break;
                }
              }
            });
          });
        }
      });

      for (const tagName of ["image", "feImage"]) {
        context(`for <svg:${tagName}>`, function () {
          function docFactory({attrs} = {}) {
            return createDocFixture({type: 'svg', tagName, ns: NS_SVG, attrs});
          }

          for (const mode of ["save", "link", "blank", "remove", "<other>"]) {
            context(`when options["capture.image"] = "${mode}"`, function () {
              const options = {
                "capture.image": mode,
              };

              for (const [ns, prefix] of [[null, ''], [NS_XLINK, 'xlink:']]) {
                context(`when having \`${prefix}href\` attribute`, function () {
                  switch (mode) {
                    case "save":
                    default: {
                      it('should save resource and rewrite the attribute', async function () {
                        var doc = docFactory({attrs: [[`${prefix}href`, './myicon.bmp', ns]]});

                        var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                        var elem = doc.querySelector(tagName);
                        assert.strictEqual(elem.getAttributeNS(ns, 'href'), "myicon.bmp");

                        sinon.assert.calledOnceWithExactly(spyResolve, './myicon.bmp', 'https://example.com/');
                        sinon.assert.calledWithExactly(spyRewrite, elem, 'href', 'myicon.bmp', {ns});
                      });

                      break;
                    }
                    case "link": {
                      it('should rewrite the attribute to the resolved URL', async function () {
                        var doc = docFactory({attrs: [[`${prefix}href`, './myicon.bmp', ns]]});

                        var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                        var elem = doc.querySelector(tagName);
                        assert.strictEqual(elem.getAttributeNS(ns, 'href'), 'https://example.com/myicon.bmp');

                        sinon.assert.calledOnceWithExactly(spyResolve, './myicon.bmp', 'https://example.com/');
                        sinon.assert.calledWithExactly(spyRewrite, elem, 'href', 'https://example.com/myicon.bmp', {ns});
                      });

                      break;
                    }
                    case "blank":
                    case "remove": {
                      it('should remove the attribute', async function () {
                        var doc = docFactory({attrs: [[`${prefix}href`, './myicon.bmp', ns]]});

                        var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                        var elem = doc.querySelector(tagName);
                        assert.strictEqual(elem.getAttributeNS(ns, 'href'), null);

                        sinon.assert.calledOnceWithExactly(spyResolve, './myicon.bmp', 'https://example.com/');
                        sinon.assert.calledWithExactly(spyRewrite, elem, 'href', null, {ns});
                      });

                      break;
                    }
                  }

                  context(CONTEXT_BASE_URL, function () {
                    it('should resolve the URL with `baseUrl`', async function () {
                      var doc = docFactory({attrs: [[`${prefix}href`, './myicon.bmp', ns]]});
                      var tester = baseUrlHandlingTesterFactory({tagName, docUrl});

                      var {stub} = await rewriteNodeControlledTest({doc, docUrl, options, tester});
                      sinon.assert.called(stub);

                      sinon.assert.calledOnceWithExactly(spyResolve, './myicon.bmp', 'https://example.com/baseUrl/');
                    });
                  });
                });
              }

              context('when having no `*:href` attribute', function () {
                it('should do nothing', async function () {
                  var doc = docFactory();
                  var elem = doc.querySelector(tagName);

                  var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttributeNS(null, 'href'), null);
                  assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), null);

                  sinon.assert.neverCalledWith(spyRewrite, elem, 'href');
                });
              });
            });
          }
        });
      }

      for (const tagName of [
        "use",
        "animate", "animateMotion", "animateTransform",
        "linearGradient", "radialGradient",
        "set", "mpath", "pattern",
        "textPath",
      ]) {
        context(`for <svg:${tagName}>`, function () {
          function docFactory({attrs} = {}) {
            return createDocFixture({type: 'svg', tagName: 'svg', ns: NS_SVG, children: [
              {tagName, ns: NS_SVG, attrs},
              {tagName: 'circle', ns: NS_SVG, id: 'img', attrs: {cx: '50', cy: '50', r: '50'}},
            ]});
          }

          for (const [ns, prefix] of [[null, ''], [NS_XLINK, 'xlink:']]) {
            context(`when having \`${prefix}href\` attribute`, function () {
              it('should rewrite the attribute to the resolved URL', async function () {
                var doc = docFactory({attrs: [[`${prefix}href`, '#img', ns]]});

                var {doc} = await new TestCapturer().captureDocument({doc, docUrl});
                var elem = doc.querySelector(tagName);
                assert.strictEqual(elem.getAttributeNS(ns, "href"), "#img");

                sinon.assert.calledOnceWithExactly(spyResolve, '#img', 'https://example.com/');
                sinon.assert.calledWithExactly(spyRewrite, elem, 'href', '#img', {ns});
              });

              context(CONTEXT_BASE_URL, function () {
                it('should resolve the URL with `baseUrl`', async function () {
                  var doc = docFactory({attrs: [[`${prefix}href`, './file#img', ns]]});
                  var tester = baseUrlHandlingTesterFactory({tagName, docUrl});

                  var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester});
                  sinon.assert.called(stub);

                  sinon.assert.calledOnceWithExactly(spyResolve, './file#img', 'https://example.com/baseUrl/');
                });
              });
            });
          }

          context('when having no `*:href` attribute', function () {
            it('should do nothing', async function () {
              var doc = docFactory();

              var {doc} = await new TestCapturer().captureDocument({doc, docUrl});
              var elem = doc.querySelector(tagName);
              assert.strictEqual(elem.getAttributeNS(null, 'href'), null);
              assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), null);
            });
          });
        });
      }

      context('for <svg:a>', function () {
        function docFactory({attrs, value = 'text'} = {}) {
          return createDocFixture({type: 'svg', tagName, ns: NS_SVG, attrs, value});
        }

        const tagName = 'a';

        const options = {
          "capture.downLink.file.mode": "none",
          "capture.downLink.doc.depth": null,
        };

        for (const [ns, prefix] of [[null, ''], [NS_XLINK, 'xlink:']]) {
          context(`when having \`${prefix}href\` attribute`, function () {
            it('should rewrite the attribute to the resolved URL', async function () {
              var doc = docFactory({attrs: [[`${prefix}href`, './linked.html', ns]]});

              var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
              var elem = doc.querySelector('a');
              assert.strictEqual(elem.getAttributeNS(ns, 'href'), 'https://example.com/linked.html');

              sinon.assert.calledOnceWithExactly(spyResolveLink, './linked.html', 'https://example.com/', {checkJavascript: true});
              sinon.assert.calledWithExactly(spyRewriteAnchor, elem, 'href', {ns: null});
              sinon.assert.calledWithExactly(spyRewriteAnchor, elem, 'href', {ns: NS_XLINK});
              sinon.assert.calledTwice(spyRewriteAnchor);
              sinon.assert.calledOnceWithExactly(spyRewrite, elem, 'href', 'https://example.com/linked.html', {ns});
              sinon.assert.notCalled(spyCaptureUrl);
            });

            context(CONTEXT_BASE_URL, function () {
              it('should resolve the URL with `baseUrlFinal`', async function () {
                var doc = docFactory({attrs: [[`${prefix}href`, './linked.html', ns]]});
                var tester = baseUrlHandlingTesterFactory({tagName: 'a', docUrl});

                var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester});
                sinon.assert.called(stub);

                sinon.assert.calledOnceWithExactly(spyResolveLink, "./linked.html", "https://example.com/baseUrlFinal/", {checkJavascript: true});
              });
            });

            context(CONTEXT_DOWN_LINK, function () {
              const options = {
                "capture.downLink.file.mode": "none",
                "capture.downLink.doc.depth": 1,
              };

              it('should call `captureUrl` when downLink is set', async function () {
                var doc = docFactory({attrs: [[`${prefix}href`, './linked.html?id=123#foo', ns]]});
                await new TestCapturer().captureDocument({doc, docUrl, settings: {timeId}, options});

                sinon.assert.calledWithMatch(spyCaptureUrl, {
                  url: 'https://example.com/linked.html?id=123#foo',
                  refUrl: docUrl,
                  refPolicy: '',
                  isAttachment: false,
                  downLink: true,
                  settings: {
                    timeId,
                    depth: 1,
                    isMainPage: false,
                    isMainFrame: true,
                    recurseChain: [],
                  },
                });
              });

              it('should ignore `download` attribute', async function () {
                var doc = docFactory({attrs: [[`${prefix}href`, './linked.html?id=123#foo', ns], ['download', 'linked.html']]});
                await new TestCapturer().captureDocument({doc, docUrl, settings: {timeId}, options});

                sinon.assert.calledWithMatch(spyCaptureUrl, {
                  url: 'https://example.com/linked.html?id=123#foo',
                  refUrl: docUrl,
                  refPolicy: '',
                  isAttachment: false,
                  downLink: true,
                  settings: {
                    timeId,
                    depth: 1,
                    isMainPage: false,
                    isMainFrame: true,
                    recurseChain: [],
                  },
                });
              });
            });
          });
        }
      });

      context('for <math:*>', function () {
        it('should rewrite `href` to the resolved URL', async function () {
          var doc = createDocFixture({tagName: 'math', ns: NS_MATHML, attrs: {href: './math.html'}, children: [
            {tagName: 'mrow', ns: NS_MATHML, attrs: {href: './mrow.html'}, children: [
              {tagName: 'mo', ns: NS_MATHML, attrs: {href: './mo.html'}, value: '123'},
            ]},
          ]});

          var {doc} = await new TestCapturer().captureDocument({doc, docUrl});
          assert.strictEqual(doc.querySelector('math').getAttribute('href'), 'https://example.com/math.html');
          assert.strictEqual(doc.querySelector('mrow').getAttribute('href'), 'https://example.com/mrow.html');
          assert.strictEqual(doc.querySelector('mo').getAttribute('href'), 'https://example.com/mo.html');

          sinon.assert.notCalled(spyCaptureUrl);

          sinon.assert.calledWithExactly(spyRewrite, doc.querySelector('math'), 'href', 'https://example.com/math.html', {ns: undefined});
          sinon.assert.calledWithExactly(spyRewrite, doc.querySelector('mrow'), 'href', 'https://example.com/mrow.html', {ns: undefined});
          sinon.assert.calledWithExactly(spyRewrite, doc.querySelector('mo'), 'href', 'https://example.com/mo.html', {ns: undefined});
        });

        context(CONTEXT_BASE_URL, function () {
          it('should resolve the URL with `baseUrlFinal`', async function () {
            var doc = createDocFixture({tagName: 'math', ns: NS_MATHML, attrs: {href: './math.html?id=123#foo'}});
            var tester = baseUrlHandlingTesterFactory({tagName: 'math', docUrl});

            var {stub} = await rewriteNodeControlledTest({doc, docUrl, tester});
            sinon.assert.called(stub);

            sinon.assert.calledOnceWithExactly(spyResolveLink, "./math.html?id=123#foo", "https://example.com/baseUrlFinal/", {checkJavascript: true});
          });
        });

        context(CONTEXT_DOWN_LINK, function () {
          it('should call `captureUrl` when downLink is set', async function () {
            var options = {
              "capture.downLink.file.mode": "none",
              "capture.downLink.doc.depth": 1,
            };
            var doc = createDocFixture({tagName: 'math', ns: NS_MATHML, attrs: {href: './math.html?id=123#foo'}});
            await new TestCapturer().captureDocument({doc, docUrl, settings: {timeId}, options});

            sinon.assert.calledWithMatch(spyCaptureUrl, {
              url: 'https://example.com/math.html?id=123#foo',
              refUrl: docUrl,
              refPolicy: '',
              isAttachment: false,
              downLink: true,
              settings: {
                timeId,
                depth: 1,
                isMainPage: false,
                isMainFrame: true,
                recurseChain: [],
              },
            });
          });
        });
      });

      context('for `style` attribute handling', function () {
        for (const mode of ["save", "blank", "remove", "<other>"]) {
          context(`when options["capture.styleInline"] = "${mode}"`, function () {
            function docFactory(tagName, style) {
              return createDocFixture({tagName, attrs: {style}});
            }

            function docFactorySvg(tagName, style) {
              return createDocFixture({type: 'svg', tagName, ns: NS_SVG, attrs: {style}});
            }

            const options = {
              "capture.styleInline": mode,
              "capture.style": "remove",
            };

            const testCases = [
              ['body', docFactory],
              ['span', docFactory],
              ['div', docFactory],
              ['circle', docFactorySvg],
              ['rect', docFactorySvg],
            ];

            switch (mode) {
              case "save":
              default: {
                for (const [tagName, factory] of testCases) {
                  const tag = `${factory === docFactorySvg ? 'svg:' : ''}${tagName}`;
                  const style = factory === docFactorySvg ? 'filter: url(#image);' : 'background: url(./green.bmp);';
                  const expected = factory === docFactorySvg ? 'filter: url("#image");' : 'background: url("green.bmp");';

                  it(`should rewrite \`style\` attribute with \`DocumentCssHandler.rewriteCssText\` (for <${tag}>)`, async function () {
                    var doc = factory(tagName, style);

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('style'), expected);

                    // @TODO: handle other options["capture.rewriteCss"] modes
                    sinon.assert.calledWithMatch(spyRewritCssText, {
                      cssText: style,
                      baseUrl: docUrl,
                      refUrl: docUrl,
                      refPolicy: '',
                      envCharset: 'UTF-8',
                      isInline: true,
                      settings: {
                        usedCssFontUrl: undefined,
                        usedCssImageUrl: undefined,
                      },
                    });
                    sinon.assert.calledWithExactly(spyRewrite, elem, 'style', expected);
                  });
                }

                it('should not rewrite @font-face URLs', async function () {
                  var tagName = 'span';
                  var doc = docFactory(tagName, '@font-face { font-family: myFont; src: url(./font.woff); }');

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('style'), '@font-face { font-family: myFont; src: url("./font.woff"); }');
                });

                it('should not rewrite @import URLs', async function () {
                  var tagName = 'span';
                  var doc = docFactory(tagName, '@import "./import.css";');

                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.querySelector(tagName);
                  assert.strictEqual(elem.getAttribute('style'), '@import "./import.css";');
                });

                break;
              }
              case "blank": {
                for (const [tagName, factory] of testCases) {
                  const tag = `${factory === docFactorySvg ? 'svg:' : ''}${tagName}`;
                  const style = factory === docFactorySvg ? 'filter: url(#image);' : 'background: url(./green.bmp);';

                  it(`should blank \`style\` attribute (for <${tag}>)`, async function () {
                    var doc = factory(tagName, style);

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('style'), '');

                    sinon.assert.notCalled(spyRewritCssText);
                    sinon.assert.calledWithExactly(spyRewrite, elem, 'style', '');
                  });
                }

                break;
              }
              case "remove": {
                for (const [tagName, factory] of testCases) {
                  const tag = `${factory === docFactorySvg ? 'svg:' : ''}${tagName}`;
                  const style = factory === docFactorySvg ? 'filter: url(#image);' : 'background: url(./green.bmp);';

                  it(`should remove \`style\` attribute (for <${tag}>)`, async function () {
                    var doc = factory(tagName, style);

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('style'), null);

                    sinon.assert.notCalled(spyRewritCssText);
                    sinon.assert.calledWithExactly(spyRewrite, elem, 'style', null);
                  });
                }

                break;
              }
            }
          });
        }
      });

      context('for script-like attributes handling', function () {
        for (const mode of ["save", "link", "blank", "remove", "<other>"]) {
          context(`when options["capture.script"] = "${mode}"`, function () {
            function docFactory(tagName, attr, script = 'console.log("test");') {
              return createDocFixture({tagName, attrs: {[attr]: script}});
            }

            function docFactorySvg(tagName, attr, script = 'console.log("test");') {
              return createDocFixture({type: 'svg', tagName, ns: NS_SVG, attrs: {[attr]: script}});
            }

            const options = {
              "capture.script": mode,
            };

            const testCases = [
              ['body', 'onload', docFactory],
              ['span', 'onclick', docFactory],
              ['div', 'onclick', docFactory],
              ['circle', 'onclick', docFactorySvg],
              ['rect', 'onclick', docFactorySvg],
            ];

            switch (mode) {
              case "save":
              case "link": {
                for (const [tagName, attr, factory] of testCases) {
                  const sample = `${factory === docFactorySvg ? 'svg:' : ''}${tagName}[${attr}]`;

                  it(`should keep \`on*\` attributes (for \`${sample}\`)`, async function () {
                    var doc = factory(tagName, attr);

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute(attr), 'console.log("test");');

                    sinon.assert.neverCalledWith(spyRewrite, elem, attr);
                  });
                }

                break;
              }
              case "blank":
              case "remove":
              default: {
                for (const [tagName, attr, factory] of testCases) {
                  const sample = `${factory === docFactorySvg ? 'svg:' : ''}${tagName}[${attr}]`;

                  it(`should remove \`on*\` attributes (for \`${sample}\`)`, async function () {
                    var doc = factory(tagName, attr);

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute(attr), null);

                    sinon.assert.calledWithExactly(spyRewrite, elem, attr, null);
                  });
                }

                break;
              }
            }
          });
        }
      });

      context('for `nonce` attribute handling', function () {
        const nonce = utils.dateToId();

        for (const mode of ["save", "remove", "<other>"]) {
          context(`when options["capture.contentSecurityPolicy"] = "${mode}"`, function () {
            const options = {
              "capture.contentSecurityPolicy": mode,
              "capture.script": "save",
            };

            const testCases = [
              ['style', 'div { font-size: 1.5em; }'],
              ['script', 'console.debug("test");'],
            ];

            switch (mode) {
              case "save": {
                for (const [tagName, text] of testCases) {
                  it(`should keep \`nonce\` attribute (for <${tagName}>)`, async function () {
                    var doc = createDocFixture({tagName, attrs: {nonce}, value: text});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('nonce'), nonce);

                    sinon.assert.neverCalledWith(spyRewrite, elem, "nonce");
                  });
                }

                break;
              }
              case "remove":
              default: {
                for (const [tagName, text] of testCases) {
                  it(`should remove \`nonce\` attribute (for <${tagName}>)`, async function () {
                    var doc = createDocFixture({tagName, attrs: {nonce}, value: text});

                    var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                    var elem = doc.querySelector(tagName);
                    assert.strictEqual(elem.getAttribute('nonce'), null);

                    sinon.assert.calledWithExactly(spyRewrite, elem, "nonce", null);
                  });
                }

                break;
              }
            }
          });
        }
      });

      context('for shadow DOMs handling', function () {
        function docFactory(props = {}) {
          return createDocFixture({tagName: 'div', shadow: {
            ...props,
            children: [
              {tagName: 'img', attrs: {src: './green.bmp'}},
              {tagName: 'div', shadow: {
                ...props,
                children: [
                  {tagName: 'img', attrs: {src: './blue.bmp'}},
                ],
              }},
            ],
          }});
        }

        async function docFactoryCustom(props = {}) {
          const {contentDocument: doc} = await createIframeFixture({
            docData: {tagName: 'custom-elem'},
            onload: ({target: {contentWindow: window, contentDocument: document}}) => {
              window.customElements.define(
                'custom-elem',
                class CustomElem extends window.HTMLElement {
                  constructor() {
                    super();
                    var shadow = this.attachShadow({mode: 'open', ...props});
                    var style = shadow.appendChild(document.createElement('style'));
                    style.textContent = [
                      ':host { display: block; background-color: yellow; }',
                      'div { background-color: red; }',
                      'img { width: 60px; height: 60px; }',
                    ].join('\n');
                    var div = shadow.appendChild(document.createElement('div'));
                    div.textContent = 'This is sub-content.';
                    var img = shadow.appendChild(document.createElement('img'));
                    img.src = './green.bmp';
                  }
                },
              );
            },
          });
          return doc;
        }

        for (const mode of ["save", "remove", "<other>"]) {
          context(`when options["capture.shadowDom"] = "${mode}"`, function () {
            const options = {
              "capture.shadowDom": mode,
              "capture.image": "save",
            };

            switch (mode) {
              case "save": {
                it('should save rewritten shadow DOM content recursively', async function () {
                  var doc = docFactory();

                  var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isTrue(requireBasicLoader);

                  var host = doc.querySelector('div');
                  var shadow = createFragFixture(host.getAttribute('data-scrapbook-shadowdom'));
                  assert.deepEqual(getAttributes(shadow.querySelector('img')), {
                    src: 'green.bmp',
                  });

                  var host = shadow.querySelector('div');
                  var shadow = createFragFixture(host.getAttribute('data-scrapbook-shadowdom'));
                  assert.deepEqual(getAttributes(shadow.querySelector('img')), {
                    src: 'blue.bmp',
                  });
                });

                $it.skipIf(
                  utils.userAgent.is('chromium') && utils.userAgent.major < 88,
                  'retrieving closed shadow DOM is not supported in Chromium < 88',
                )('should work for closed shadow DOMs', async function () {
                  var doc = docFactory({mode: 'closed'});

                  var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isTrue(requireBasicLoader);

                  var host = doc.querySelector('div');
                  var {'data-scrapbook-shadowdom': _, ...attrs} = getAttributes(host);
                  assert.deepEqual(attrs, {
                    'data-scrapbook-shadowdom-mode': 'closed',
                  });

                  var shadow = createFragFixture(host.getAttribute('data-scrapbook-shadowdom'));
                  assert.deepEqual(getAttributes(shadow.querySelector('img')), {
                    src: 'green.bmp',
                  });

                  var host = shadow.querySelector('div');
                  var {'data-scrapbook-shadowdom': _, ...attrs} = getAttributes(host);
                  assert.deepEqual(attrs, {
                    'data-scrapbook-shadowdom-mode': 'closed',
                  });

                  var shadow = createFragFixture(host.getAttribute('data-scrapbook-shadowdom'));
                  assert.deepEqual(getAttributes(shadow.querySelector('img')), {
                    src: 'blue.bmp',
                  });
                });

                $it.skipIf($.noShadowRootClonable)('should work for clonable shadow DOMs', async function () {
                  var doc = docFactory({clonable: true});

                  var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isTrue(requireBasicLoader);

                  var host = doc.querySelector('div');
                  var {'data-scrapbook-shadowdom': _, ...attrs} = getAttributes(host);
                  assert.deepEqual(attrs, {
                    'data-scrapbook-shadowdom-clonable': '',
                  });

                  var shadow = createFragFixture(host.getAttribute('data-scrapbook-shadowdom'));
                  assert.deepEqual(getAttributes(shadow.querySelector('img')), {
                    src: 'green.bmp',
                  });

                  var host = shadow.querySelector('div');
                  var {'data-scrapbook-shadowdom': _, ...attrs} = getAttributes(host);
                  assert.deepEqual(attrs, {
                    'data-scrapbook-shadowdom-clonable': '',
                  });

                  var shadow = createFragFixture(host.getAttribute('data-scrapbook-shadowdom'));
                  assert.deepEqual(getAttributes(shadow.querySelector('img')), {
                    src: 'blue.bmp',
                  });
                });

                $it.skipIf($.noShadowRootDelegatesFocus)('should handle `delegatesFocus` property for shadow DOMs', async function () {
                  var doc = docFactory({delegatesFocus: true});

                  var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isTrue(requireBasicLoader);

                  var host = doc.querySelector('div');
                  var {'data-scrapbook-shadowdom': _, ...attrs} = getAttributes(host);
                  assert.deepEqual(attrs, {
                    'data-scrapbook-shadowdom-delegates-focus': '',
                  });

                  var shadow = createFragFixture(host.getAttribute('data-scrapbook-shadowdom'));

                  var host = shadow.querySelector('div');
                  var {'data-scrapbook-shadowdom': _, ...attrs} = getAttributes(host);
                  assert.deepEqual(attrs, {
                    'data-scrapbook-shadowdom-delegates-focus': '',
                  });
                });

                $it.skipIf($.noShadowRootSlotAssignment)('should handle `slotAssignment` property for shadow DOMs', async function () {
                  var doc = docFactory({slotAssignment: 'manual'});

                  var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isTrue(requireBasicLoader);

                  var host = doc.querySelector('div');
                  var {'data-scrapbook-shadowdom': _, ...attrs} = getAttributes(host);
                  assert.deepEqual(attrs, {
                    'data-scrapbook-shadowdom-slot-assignment': 'manual',
                  });

                  var shadow = createFragFixture(host.getAttribute('data-scrapbook-shadowdom'));

                  var host = shadow.querySelector('div');
                  var {'data-scrapbook-shadowdom': _, ...attrs} = getAttributes(host);
                  assert.deepEqual(attrs, {
                    'data-scrapbook-shadowdom-slot-assignment': 'manual',
                  });
                });

                $it.skipIf($.noShadowRootSerializable)('should handle `serializable` property for shadow DOMs', async function () {
                  var doc = docFactory({serializable: true});

                  var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isTrue(requireBasicLoader);

                  var host = doc.querySelector('div');
                  var {'data-scrapbook-shadowdom': _, ...attrs} = getAttributes(host);
                  assert.deepEqual(attrs, {
                    'data-scrapbook-shadowdom-serializable': '',
                  });

                  var shadow = createFragFixture(host.getAttribute('data-scrapbook-shadowdom'));

                  var host = shadow.querySelector('div');
                  var {'data-scrapbook-shadowdom': _, ...attrs} = getAttributes(host);
                  assert.deepEqual(attrs, {
                    'data-scrapbook-shadowdom-serializable': '',
                  });
                });

                it('should work for shadow DOMs auto-generated by custom elements', async function () {
                  var doc = await docFactoryCustom();

                  var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isTrue(requireBasicLoader);

                  var host = doc.querySelector('custom-elem');
                  var shadow = createFragFixture(host.getAttribute('data-scrapbook-shadowdom'));
                  assert.deepEqual(getAttributes(shadow.querySelector('img')), {
                    src: 'green.bmp',
                  });
                });

                $it.skipIf(
                  utils.userAgent.is('chromium') && utils.userAgent.major < 88,
                  'retrieving closed shadow DOM is not supported in Chromium < 88',
                )('should work for closed shadow DOMs auto-generated by custom elements', async function () {
                  var doc = await docFactoryCustom({mode: 'closed'});

                  var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isTrue(requireBasicLoader);

                  var host = doc.querySelector('custom-elem');
                  var {'data-scrapbook-shadowdom': _, ...attrs} = getAttributes(host);
                  assert.deepEqual(attrs, {
                    'data-scrapbook-shadowdom-mode': 'closed',
                  });

                  var shadow = createFragFixture(host.getAttribute('data-scrapbook-shadowdom'));
                  assert.deepEqual(getAttributes(shadow.querySelector('img')), {
                    src: 'green.bmp',
                  });
                });

                break;
              }
              case "remove":
              default: {
                it('should not save shadow DOM content', async function () {
                  var doc = docFactory();

                  var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isFalse(requireBasicLoader);

                  assert.isEmpty(getAttributes(doc.querySelector('div')));
                });

                $it.skipIf($.noShadowRootClonable)('should work for clonable shadow DOMs', async function () {
                  var doc = docFactory({clonable: true});

                  var {doc, requireBasicLoader} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isFalse(requireBasicLoader);

                  assert.isEmpty(getAttributes(doc.querySelector('div')));
                });

                break;
              }
            }
          });
        }
      });

      context('for custom elements', function () {
        async function docFactory() {
          const {contentDocument: doc} = await createIframeFixture({
            docData: {tagName: 'body', children: [
              {tagName: 'custom-elem'},
              {tagName: 'custom-elem2'},
              {tagName: 'custom-elem-undefined'},
            ]},
            onload: ({target: {contentWindow: window, contentDocument: document}}) => {
              window.customElements.define(
                'custom-elem',
                class CustomElem extends window.HTMLElement {
                  constructor() {
                    super();
                    var shadow = this.attachShadow({mode: 'open'});
                    var style = shadow.appendChild(document.createElement('style'));
                    style.textContent = 'div { background-color: red; }';
                    var div = shadow.appendChild(document.createElement('div'));
                    div.textContent = 'This is custom-elem';
                    var subElem = shadow.appendChild(document.createElement('custom-subelem'));
                  }
                },
              );
              window.customElements.define(
                'custom-elem2',
                class CustomElem extends window.HTMLElement {},
              );
              window.customElements.define(
                'custom-subelem',
                class CustomSubElem extends window.HTMLElement {
                  constructor() {
                    super();
                    var shadow = this.attachShadow({mode: 'open'});
                    var style = shadow.appendChild(document.createElement('style'));
                    style.textContent = 'div { background-color: yellow; }';
                    var div = shadow.appendChild(document.createElement('div'));
                    div.textContent = 'This is custom-subelem';
                  }
                },
              );
            },
          });
          return doc;
        }

        it('should generate registry for defined custom elements', async function () {
          var doc = await docFactory();
          var rewriter = await new TestCapturer().captureDocument({doc, docUrl});
          assert.deepEqual(rewriter.customElementNames, new Set(['custom-subelem', 'custom-elem', 'custom-elem2']));
        });

        it('should not generate registry for invalid custom elements', async function () {
          var doc = createDocFixture({tagName: 'body', children: [
            {tagName: 'div'},
            {tagName: 'audio'},
            {tagName: 'video'},
            {tagName: 'custom-elem', ns: NS_SVG},
            {tagName: 'custom-elem', ns: NS_MATHML},
            {tagName: 'annotation-xml', value: 'something'},
            {tagName: 'color-profile', value: 'something'},
            {tagName: 'font-face', value: 'something'},
            {tagName: 'font-face-src', value: 'something'},
            {tagName: 'font-face-uri', value: 'something'},
            {tagName: 'font-face-format', value: 'something'},
            {tagName: 'font-face-name', value: 'something'},
            {tagName: 'missing-glyph', value: 'something'},
            {tagName: 'missing-glyph', value: 'something'},
          ]});
          var rewriter = await new TestCapturer().captureDocument({doc, docUrl});
          assert.deepEqual(rewriter.customElementNames, new Set([]));
        });

        it('should work for an XHTML element with altered prefix', async function () {
          var doc = await (async () => {
            const {contentDocument: doc} = await createIframeFixture({
              docData: {
                type: 'xhtml',
                nsmap: {h: NS_HTML},
                tagName: 'h:html',
                ns: NS_HTML,
                children: [
                  {tagName: 'h:head', ns: NS_HTML},
                  {tagName: 'h:body', ns: NS_HTML, children: [
                    {tagName: 'h:custom-elem', ns: NS_HTML},
                  ]},
                ],
              },
              onload: ({target: {contentWindow: window, contentDocument: document}}) => {
                window.customElements.define(
                  'custom-elem',
                  class CustomElem extends window.HTMLElement {},
                );
              },
            });
            return doc;
          })();
          var rewriter = await new TestCapturer().captureDocument({doc, docUrl});
          assert.deepEqual(rewriter.customElementNames, new Set(["custom-elem"]));
        });

        for (const mode of ["save", "link", "blank", "remove", "<other>"]) {
          context(`when options["capture.script"] = "${mode}"`, function () {
            const options = {
              "capture.script": mode,
            };

            switch (mode) {
              case "save":
              case "link": {
                it('should not generate loader for custom elements', async function () {
                  var doc = await docFactory();
                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.isNull(doc.querySelector('[data-scrapbook-elem="custom-elements-loader"]'));
                });

                break;
              }
              case "blank":
              case "remove":
              default: {
                it('should generate loader for custom elements', async function () {
                  var doc = await docFactory();
                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var loader = doc.querySelector('[data-scrapbook-elem="custom-elements-loader"]');
                  assert.match(loader.textContent, rawRegex`${'^'}(function${'\\s*'}(${'\\w+'})${'\\s*'}{${'.+'}})(["custom-subelem","custom-elem","custom-elem2"])${'$'}`);
                });

                break;
              }
            }
          });
        }
      });

      context('removeHidden handling', function () {
        function docFactoryData() {
          return {
            tagName: 'html',
            children: [
              {tagName: 'head', children: [
                {tagName: 'meta', attrs: {charset: 'utf-8'}},
                {tagName: 'title', value: 'Test Remove Hidden'},
                {tagName: 'style', value: 'img { width: 60px; }'},
                {tagName: 'link', attrs: {rel: 'stylesheet', href: "./link.css"}},
              ]},
              {tagName: 'body', children: [
                {tagName: 'noscript', value: 'Your browser does not support JavaScript.'},
                {tagName: 'p', attrs: {style: 'display: none'}, value: 'Text.'},
                {tagName: 'blockquote', attrs: {hidden: ''}, value: 'Text.'},
                {tagName: 'img', attrs: {src: './red.bmp', hidden: ''}},
                {tagName: 'template', innerHTML: '<blockquote hidden>Text.</blockquote>'},
              ]},
            ],
          };
        }

        async function docFactory() {
          const {contentDocument: doc} = await createIframeFixture({hidden: false, docData: docFactoryData()});
          return doc;
        }

        function docFactoryHeadless() {
          return createDocFixture(docFactoryData());
        }

        for (const mode of ["undisplayed", "none", "<other>"]) {
          context(`when options["capture.removeHidden"] = "${mode}"`, function () {
            const options = {
              "capture.removeHidden": mode,
            };

            switch (mode) {
              case "undisplayed": {
                it('should remove elements with computed style `display: none` for a headed document', async function () {
                  var doc = await docFactory();
                  var docOrig = doc;
                  var rewriter = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var {doc} = rewriter;

                  assert.notExists(doc.querySelector('p'));
                  assert.notExists(doc.querySelector('blockquote'));
                  assert.notExists(doc.querySelector('img'));

                  // these elements should not be altered anyway
                  assert.exists(doc.querySelector('html'));
                  assert.exists(doc.querySelector('head'));
                  assert.exists(doc.querySelector('meta'));
                  assert.exists(doc.querySelector('title'));
                  assert.exists(doc.querySelector('style'));
                  assert.exists(doc.querySelector('link[rel="stylesheet"]'));
                  assert.exists(doc.querySelector('body'));
                  assert.exists(doc.querySelector('noscript'));
                  assert.exists(doc.querySelector('template'));

                  sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(docOrig.querySelector('p')));
                  sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(docOrig.querySelector('blockquote')));
                  sinon.assert.calledWithExactly(spyRemove, rewriter.getClonedNode(docOrig.querySelector('img')));
                });

                it('should do nothing for a headless document', async function () {
                  var doc = docFactoryHeadless();
                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});

                  assert.exists(doc.querySelector('p'));
                  assert.exists(doc.querySelector('blockquote'));
                  assert.exists(doc.querySelector('img'));

                  assert.exists(doc.querySelector('html'));
                  assert.exists(doc.querySelector('head'));
                  assert.exists(doc.querySelector('meta'));
                  assert.exists(doc.querySelector('title'));
                  assert.exists(doc.querySelector('style'));
                  assert.exists(doc.querySelector('link[rel="stylesheet"]'));
                  assert.exists(doc.querySelector('body'));
                  assert.exists(doc.querySelector('noscript'));
                  assert.exists(doc.querySelector('template'));

                  sinon.assert.notCalled(spyRemove);
                });

                break;
              }
              case "none":
              default: {
                it('should do nothing', async function () {
                  var doc = await docFactory();
                  var {doc} = await new TestCapturer().captureDocument({doc, docUrl, options});

                  assert.exists(doc.querySelector('p'));
                  assert.exists(doc.querySelector('blockquote'));
                  assert.exists(doc.querySelector('img'));

                  assert.exists(doc.querySelector('html'));
                  assert.exists(doc.querySelector('head'));
                  assert.exists(doc.querySelector('meta'));
                  assert.exists(doc.querySelector('title'));
                  assert.exists(doc.querySelector('style'));
                  assert.exists(doc.querySelector('link[rel="stylesheet"]'));
                  assert.exists(doc.querySelector('body'));
                  assert.exists(doc.querySelector('noscript'));
                  assert.exists(doc.querySelector('template'));

                  sinon.assert.notCalled(spyRemove);
                });

                break;
              }
            }
          });
        }
      });
    });

    describe('#recordMetadata()', function () {
      const options = {
        "capture.recordDocumentMeta": true,
        "capture.saveAs": "folder",
        "capture.favIcon": "save",
      };

      let timeId;
      let settings;

      beforeEach(function () {
        // set up a unique timeId for each test
        timeId = utils.dateToId();

        settings = {
          timeId,
          isMainPage: true,
          isMainFrame: true,
          title: 'Preset Title',
          favIconUrl: `${docUrl}/preset-favicon.ico`,
          type: 'site',
        };
      });

      it('should record `source` and `create`', async function () {
        var doc = createDocFixture({tagName: 'head', children: [
          {tagName: 'meta', attrs: {charset: 'utf-8'}},
          {tagName: 'title', value: 'My Title'},
          {tagName: 'link', attrs: {rel: 'shortcut icon', href: './icon.bmp'}},
        ]});
        var {doc} = await new TestCapturer().captureDocument({doc, docUrl: `${docUrl}#foo`, settings: {timeId}, options});
        assert.deepEqual(getAttributes(doc.documentElement), {
          'data-scrapbook-source': 'https://example.com/#foo',
          'data-scrapbook-create': timeId,
        });
      });

      it('should record `title`, `icon`, and `type` from `settings`', async function () {
        var doc = createDocFixture({tagName: 'head', children: [
          {tagName: 'meta', attrs: {charset: 'utf-8'}},
          {tagName: 'title', value: 'My Title'},
          {tagName: 'link', attrs: {rel: 'shortcut icon', href: './icon.bmp'}},
        ]});
        var {doc} = await new TestCapturer().captureDocument({doc, docUrl: `${docUrl}#foo`, settings, options});
        assert.deepEqual(getAttributes(doc.documentElement), {
          'data-scrapbook-source': 'https://example.com/#foo',
          'data-scrapbook-create': timeId,
          'data-scrapbook-title': 'Preset Title',
          'data-scrapbook-icon': 'https://example.com//preset-favicon.ico',
          'data-scrapbook-type': 'site',
        });
      });

      it('should record only hash-less `source` for main XHTML document', async function () {
        var doc = createDocFixture({type: 'xhtml', tagName: 'head', children: [
          {tagName: 'meta', attrs: {charset: 'utf-8'}},
          {tagName: 'title', value: 'My Title'},
          {tagName: 'link', attrs: {rel: 'shortcut icon', href: './icon.bmp'}},
        ]});
        var {doc} = await new TestCapturer().captureDocument({doc, docUrl: `${docUrl}#foo`, settings, options});
        assert.deepEqual(getAttributes(doc.documentElement), {
          [`{${NS_XMLNS}}xmlns`]: NS_HTML,
          'data-scrapbook-source': 'https://example.com/',
        });
      });

      it('should work normally for main XHTML document when options["capture.saveAs"] = "singleHtml"', async function () {
        sinon.stub(options, "capture.saveAs").value("singleHtml");
        sinon.stub(settings, "type").value("");
        var doc = createDocFixture({type: 'xhtml', tagName: 'head', children: [
          {tagName: 'meta', attrs: {charset: 'utf-8'}},
          {tagName: 'title', value: 'My Title'},
          {tagName: 'link', attrs: {rel: 'shortcut icon', href: './icon.bmp'}},
        ]});
        var {doc} = await new TestCapturer().captureDocument({doc, docUrl: `${docUrl}#foo`, settings, options});
        assert.deepEqual(getAttributes(doc.documentElement), {
          [`{${NS_XMLNS}}xmlns`]: NS_HTML,
          'data-scrapbook-source': 'https://example.com/#foo',
          'data-scrapbook-create': timeId,
          'data-scrapbook-title': 'Preset Title',
          'data-scrapbook-icon': 'https://example.com//preset-favicon.ico',
        });
      });

      it('should record only hash-less `source` for main SVG document', async function () {
        var doc = createDocFixture({type: 'svg', nsmap: {}, tagName: 'title', ns: NS_SVG, value: 'My Title'});
        var {doc} = await new TestCapturer().captureDocument({doc, docUrl: `${docUrl}#foo`, settings, options});
        assert.deepEqual(getAttributes(doc.documentElement), {
          [`{${NS_XMLNS}}xmlns`]: NS_SVG,
          'data-scrapbook-source': 'https://example.com/',
        });
      });

      it('should work normally for main SVG document when options["capture.saveAs"] = "singleHtml"', async function () {
        sinon.stub(options, "capture.saveAs").value("singleHtml");
        sinon.stub(settings, "type").value("");
        var doc = createDocFixture({type: 'svg', nsmap: {}, tagName: 'title', ns: NS_SVG, value: 'My Title'});
        var {doc} = await new TestCapturer().captureDocument({doc, docUrl: `${docUrl}#foo`, settings, options});
        assert.deepEqual(getAttributes(doc.documentElement), {
          [`{${NS_XMLNS}}xmlns`]: NS_SVG,
          'data-scrapbook-source': 'https://example.com/#foo',
          'data-scrapbook-create': timeId,
          'data-scrapbook-title': 'Preset Title',
          'data-scrapbook-icon': 'https://example.com//preset-favicon.ico',
        });
      });

      it('should record only hash-less `source` if not main page', async function () {
        sinon.stub(settings, "isMainPage").value(false);
        var doc = createDocFixture({tagName: 'head', children: [
          {tagName: 'meta', attrs: {charset: 'utf-8'}},
          {tagName: 'title', value: 'My Title'},
          {tagName: 'link', attrs: {rel: 'shortcut icon', href: './icon.bmp'}},
        ]});
        var {doc} = await new TestCapturer().captureDocument({doc, docUrl: `${docUrl}subpage#foo`, settings, options});
        assert.deepEqual(getAttributes(doc.documentElement), {
          'data-scrapbook-source': 'https://example.com/subpage',
        });
      });

      it('should record only hash-less `source` if not main frame', async function () {
        sinon.stub(settings, "isMainFrame").value(false);
        var doc = createDocFixture({tagName: 'head', children: [
          {tagName: 'meta', attrs: {charset: 'utf-8'}},
          {tagName: 'title', value: 'My Title'},
          {tagName: 'link', attrs: {rel: 'shortcut icon', href: './icon.bmp'}},
        ]});
        var {doc} = await new TestCapturer().captureDocument({doc, docUrl: `${docUrl}subpage#foo`, settings, options});
        assert.deepEqual(getAttributes(doc.documentElement), {
          'data-scrapbook-source': 'https://example.com/subpage',
        });
      });

      it('should not record metadata when options["capture.recordDocumentMeta"] is falsy', async function () {
        sinon.stub(options, "capture.recordDocumentMeta").value(false);
        var doc = createDocFixture({tagName: 'head', children: [
          {tagName: 'meta', attrs: {charset: 'utf-8'}},
          {tagName: 'title', value: 'My Title'},
          {tagName: 'link', attrs: {rel: 'shortcut icon', href: './icon.bmp'}},
        ]});
        var {doc} = await new TestCapturer().captureDocument({doc, docUrl, settings: {timeId}, options});
        assert.deepEqual(getAttributes(doc.documentElement), {});
      });

      it('should record truncated URL for data URL', async function () {
        var doc = createDocFixture();
        var {doc} = await new TestCapturer().captureDocument({doc, docUrl: `data:text/html,`, settings: {timeId}, options});
        assert.deepEqual(getAttributes(doc.documentElement), {
          'data-scrapbook-source': 'data:',
          'data-scrapbook-create': timeId,
        });
      });
    });

    describe('#ensureMetaCharset()', function () {
      let spyAdd;

      beforeEach(function () {
        spyAdd = sinon.spy(CaptureDocumentRewriter.prototype, 'captureRecordAddedNode');
      });

      for (const type of ['html', 'xhtml']) {
        context(`for ${type.toUpperCase()} document`, function () {
          it('should generate a meta charset node when `metaCharsetNode` not exists', async function () {
            var fn = async function () {
              var doc = createDocFixture({type, tagName: 'head', children: [
                {tagName: 'title', value: 'My Title'},
              ]});
              var {doc, metaCharsetNode} = await new TestCapturer().captureDocument({doc, docUrl});
              var elem = doc.head.firstChild;
              assert.strictEqual(elem.namespaceURI, NS_HTML);
              assert.strictEqual(elem.localName, 'meta');
              assert.deepEqual(getAttributes(elem), {charset: 'UTF-8'});

              sinon.assert.calledWithExactly(spyAdd, elem);
              assert.strictEqual(metaCharsetNode, elem);
            };
            var tester = function (args, {func}) {
              assert.notExists(this.metaCharsetNode);
              return func.apply(this, args);
            };
            var stub = await runControlledTest(CaptureDocumentRewriter.prototype, "ensureMetaCharset", fn, tester);
            sinon.assert.called(stub);
          });

          it('should do nothing when `metaCharsetNode` exists', async function () {
            var fn = async function () {
              var doc = createDocFixture({type, tagName: 'head', children: [
                {tagName: 'meta', attrs: {charset: 'UTF-8'}},
              ]});
              var {doc} = await new TestCapturer().captureDocument({doc, docUrl});
              assert.lengthOf(doc.head.querySelectorAll('meta'), 1);
            };
            var tester = function (args, {func}) {
              assert.exists(this.metaCharsetNode);
              return func.apply(this, args);
            };
            var stub = await runControlledTest(CaptureDocumentRewriter.prototype, "ensureMetaCharset", fn, tester);
            sinon.assert.called(stub);
          });
        });
      }

      context('for SVG document', function () {
        it('should do nothing', async function () {
          var fn = async function () {
            var doc = createDocFixture({type: 'svg', tagName: 'svg', ns: NS_SVG, children: [
              {tagName: 'circle', ns: NS_SVG, attrs: {r: '15'}},
            ]});
            var {doc, metaCharsetNode} = await new TestCapturer().captureDocument({doc, docUrl});
            assert.lengthOf(doc.documentElement.childNodes, 1);
            assert.notExists(metaCharsetNode);
          };
          var tester = function (args, {func}) {
            assert.notExists(this.metaCharsetNode);
            return func.apply(this, args);
          };
          var stub = await runControlledTest(CaptureDocumentRewriter.prototype, "ensureMetaCharset", fn, tester);
          sinon.assert.called(stub);
        });
      });
    });

    describe('#fetchSiteFavIcon()', function () {
      let timeId;
      let spyAdd;
      let spyDownload;

      beforeEach(function () {
        // set up a unique timeId for each test
        timeId = utils.dateToId();

        spyAdd = sinon.spy(CaptureDocumentRewriter.prototype, 'captureRecordAddedNode');
        spyDownload = sinon.spy(CaptureDocumentRewriter.prototype, 'downloadFile');
      });

      for (const mode of ["save", "link", "blank", "remove", "<other>"]) {
        context(`when options["capture.favicon"] = "${mode}"`, function () {
          const options = {
            "capture.favicon": mode,
          };

          switch (mode) {
            case "save":
            default: {
              it('should save site favicon when `favIconUrl` not exists', async function () {
                var fn = async function () {
                  var doc = createDocFixture({tagName: 'head', children: [
                    {tagName: 'title', value: 'My Title'},
                  ]});
                  var {doc, favIconUrl} = await new TestCapturer().captureDocument({doc, docUrl, settings: {timeId}, options});
                  var elem = doc.head.lastChild;
                  assert.strictEqual(elem.namespaceURI, NS_HTML);
                  assert.strictEqual(elem.localName, 'link');
                  assert.deepEqual(getAttributes(elem), {rel: 'shortcut icon', href: 'favicon.ico'});

                  sinon.assert.calledWithMatch(spyDownload, {
                    url: `${docUrl}favicon.ico`,
                    refUrl: docUrl,
                    refPolicy: '',
                    settings: {timeId},
                    options,
                  });
                  sinon.assert.calledWithExactly(spyAdd, elem);
                  assert.strictEqual(favIconUrl, 'favicon.ico');
                };
                var tester = function (args, {func}) {
                  assert.strictEqual(this.favIconUrl, undefined);
                  return func.apply(this, args);
                };
                var stub = await runControlledTest(CaptureDocumentRewriter.prototype, "fetchSiteFavIcon", fn, tester);
                sinon.assert.called(stub);
              });

              it('should fail safely if site favicon cannot be fetched', async function () {
                var fn = async function () {
                  var doc = createDocFixture({tagName: 'head', children: [
                    {tagName: 'title', value: 'My Title'},
                  ]});
                  var resMap = {};
                  var {doc, favIconUrl} = await new TestCapturer(resMap).captureDocument({doc, docUrl, options});
                  assert.lengthOf(doc.head.querySelectorAll('link'), 0);

                  sinon.assert.notCalled(spyDownload);
                  assert.strictEqual(favIconUrl, undefined);
                };
                var tester = function (args, {func}) {
                  assert.strictEqual(this.favIconUrl, undefined);
                  return func.apply(this, args);
                };
                var stub = await runControlledTest(CaptureDocumentRewriter.prototype, "fetchSiteFavIcon", fn, tester);
                sinon.assert.called(stub);
              });

              it('should do nothing when `favIconUrl` exists', async function () {
                var fn = async function () {
                  var doc = createDocFixture({tagName: 'head', children: [
                    {tagName: 'link', attrs: {rel: 'shortcut icon', href: './icon.bmp'}},
                  ]});
                  var {doc, favIconUrl} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.lengthOf(doc.head.querySelectorAll('link'), 1);
                  assert.strictEqual(favIconUrl, 'icon.bmp');
                };
                var tester = function (args, {func}) {
                  assert.strictEqual(this.favIconUrl, 'https://example.com/icon.bmp');
                  return func.apply(this, args);
                };
                var stub = await runControlledTest(CaptureDocumentRewriter.prototype, "fetchSiteFavIcon", fn, tester);
                sinon.assert.called(stub);
              });

              break;
            }
            case "link": {
              it('should link to site favicon when `favIconUrl` not exists', async function () {
                var fn = async function () {
                  var doc = createDocFixture({tagName: 'head', children: [
                    {tagName: 'title', value: 'My Title'},
                  ]});
                  var {doc, favIconUrl} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  var elem = doc.head.lastChild;
                  assert.strictEqual(elem.namespaceURI, NS_HTML);
                  assert.strictEqual(elem.localName, 'link');
                  assert.deepEqual(getAttributes(elem), {rel: 'shortcut icon', href: 'https://example.com/favicon.ico'});

                  sinon.assert.notCalled(spyDownload);
                  sinon.assert.calledWithExactly(spyAdd, elem);
                  assert.strictEqual(favIconUrl, 'https://example.com/favicon.ico');
                };
                var tester = function (args, {func}) {
                  assert.strictEqual(this.favIconUrl, undefined);
                  return func.apply(this, args);
                };
                var stub = await runControlledTest(CaptureDocumentRewriter.prototype, "fetchSiteFavIcon", fn, tester);
                sinon.assert.called(stub);
              });

              it('should fail safely if site favicon cannot be fetched', async function () {
                var fn = async function () {
                  var doc = createDocFixture({tagName: 'head', children: [
                    {tagName: 'title', value: 'My Title'},
                  ]});
                  var resMap = {};
                  var {doc, favIconUrl} = await new TestCapturer(resMap).captureDocument({doc, docUrl, options});
                  assert.lengthOf(doc.head.querySelectorAll('link'), 0);

                  sinon.assert.notCalled(spyDownload);
                  assert.strictEqual(favIconUrl, undefined);
                };
                var tester = function (args, {func}) {
                  assert.strictEqual(this.favIconUrl, undefined);
                  return func.apply(this, args);
                };
                var stub = await runControlledTest(CaptureDocumentRewriter.prototype, "fetchSiteFavIcon", fn, tester);
                sinon.assert.called(stub);
              });

              it('should do nothing when `favIconUrl` exists', async function () {
                var fn = async function () {
                  var doc = createDocFixture({tagName: 'head', children: [
                    {tagName: 'link', attrs: {rel: 'shortcut icon', href: './icon.bmp'}},
                  ]});
                  var {doc, favIconUrl} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.lengthOf(doc.head.querySelectorAll('link'), 1);

                  sinon.assert.notCalled(spyDownload);
                  assert.strictEqual(favIconUrl, 'https://example.com/icon.bmp');
                };
                var tester = function (args, {func}) {
                  assert.strictEqual(this.favIconUrl, 'https://example.com/icon.bmp');
                  return func.apply(this, args);
                };
                var stub = await runControlledTest(CaptureDocumentRewriter.prototype, "fetchSiteFavIcon", fn, tester);
                sinon.assert.called(stub);
              });

              break;
            }
            case "blank":
            case "remove": {
              it('should do nothing', async function () {
                var fn = async function () {
                  var doc = createDocFixture({tagName: 'head', children: [
                    {tagName: 'title', value: 'My Title'},
                  ]});
                  var {doc, favIconUrl} = await new TestCapturer().captureDocument({doc, docUrl, options});
                  assert.lengthOf(doc.head.querySelectorAll('link'), 0);

                  sinon.assert.notCalled(spyDownload);
                  assert.strictEqual(favIconUrl, undefined);
                };
                var tester = function (args, {func}) {
                  assert.strictEqual(this.favIconUrl, undefined);
                  return func.apply(this, args);
                };
                var stub = await runControlledTest(CaptureDocumentRewriter.prototype, "fetchSiteFavIcon", fn, tester);
                sinon.assert.called(stub);
              });

              break;
            }
          }

          it('should do nothing for SVG document', async function () {
            var fn = async function () {
              var doc = createDocFixture({type: 'svg', tagName: 'svg', ns: NS_SVG, children: [
                {tagName: 'circle', ns: NS_SVG, attrs: {r: '15'}},
              ]});
              var {doc, favIconUrl} = await new TestCapturer().captureDocument({doc, docUrl, options});
              assert.lengthOf(doc.documentElement.childNodes, 1);

              sinon.assert.notCalled(spyDownload);
              assert.strictEqual(favIconUrl, undefined);
            };
            var tester = function (args, {func}) {
              assert.strictEqual(this.favIconUrl, undefined);
              return func.apply(this, args);
            };
            var stub = await runControlledTest(CaptureDocumentRewriter.prototype, "fetchSiteFavIcon", fn, tester);
            sinon.assert.called(stub);
          });
        });
      }
    });

    describe('#downloadFile()', function () {
      const options = {
        "capture.saveAs": "folder",
        "capture.saveDataUriAsFile": false,
        "capture.resourceSizeLimit": null,
        "capture.referrerPolicy": "",
        "capture.referrerSpoofSource": false,
      };

      let timeId;

      beforeEach(function () {
        // set up a unique timeId for each test
        timeId = utils.dateToId();
      });

      it('should call `Capturer.downloadFile` and return with hash handled by `Capturer.getRedirectedUrl`', async function () {
        var stubDownloadFile = sinon.stub(Capturer.prototype, 'downloadFile').returns({
          filename: '中文 redirected.txt',
          url: '中文%20redirected.txt',
        });
        var spyGetRedirectedUrl = sinon.spy(Capturer.prototype, 'getRedirectedUrl');

        var settings = {timeId};
        var rewriter = new CaptureDocumentRewriter();
        rewriter.capturer = new Capturer();
        var result = await rewriter.downloadFile({
          url: `${docUrl}file.txt#foo`,
          settings,
          options,
        });
        sinon.assert.match(result, {
          filename: '中文 redirected.txt',
          url: '中文%20redirected.txt#foo',
        });

        sinon.assert.calledWithExactly(stubDownloadFile, {
          url: 'https://example.com/file.txt#foo',
          settings,
          options,
        });
        sinon.assert.calledWithExactly(spyGetRedirectedUrl, '中文%20redirected.txt', '#foo');
      });

      /** Currently not working. See {@link BaseCapturer.getRedirectedUrl}. */
      $it.xfail()('should take hash from the redirected URL if exists', async function () {
        stubXhr(sinon, {
          url: `${docUrl}redirected.txt#bar`,
          status: 200,
          statusText: 'OK',
          response: new Blob(['123'], {type: 'text/plain'}),
        });

        var spyGetRedirectedUrl = sinon.spy(Capturer.prototype, 'getRedirectedUrl');

        var settings = {timeId};
        var rewriter = new CaptureDocumentRewriter();
        rewriter.capturer = new Capturer();
        var result = await rewriter.downloadFile({
          url: `${docUrl}file.txt#foo`,
          settings,
          options,
        });
        sinon.assert.match(result, {
          filename: 'redirected.txt',
          url: 'redirected.txt#bar',
        });

        sinon.assert.calledWithExactly(spyGetRedirectedUrl, 'redirected.txt#bar', '#foo');
      });

      it('should return with `{error}` if the fetch fails', async function () {
        sinon.stub(console, 'error');
        var stubFetch = sinon.stub(Capturer.prototype, 'fetch').returns({
          url: 'https://example.com/page.html',
          status: 404,
          headers: {},
          blob: new Blob(['foo'], {type: 'text/html'}),
          error: {name: 'HttpError', message: '404 Not Found'},
        });
        var spyGetErrorUrl = sinon.spy(Capturer.prototype, 'getErrorUrl');

        var settings = {timeId};
        var rewriter = new CaptureDocumentRewriter();
        rewriter.capturer = new Capturer();
        var result = await rewriter.downloadFile({
          url: `${docUrl}file.txt#foo`,
          settings,
          options,
        });
        sinon.assert.match(result, {
          url: 'urn:scrapbook:download:error:https://example.com/file.txt#foo',
          error: {message: '404 Not Found'},
        });

        sinon.assert.calledWithExactly(spyGetErrorUrl, 'https://example.com/file.txt#foo', options);
      });

      for (const url of ['ws://example.com/', 'wss://example.com/', 'ftp://example.com/', 'mailto:someone@example.com']) {
        it('should return with the original URL if it has an unsupported scheme' + ` ["${url}"]`, async function () {
          var settings = {timeId};
          var rewriter = new CaptureDocumentRewriter();
          rewriter.capturer = new Capturer();
          var result = await rewriter.downloadFile({
            url,
            settings,
            options,
          });
          sinon.assert.match(result, {url});
        });
      }
    });

    describe('#captureRecordAddedNode()', function () {
      let rewriter;
      let timeId;

      beforeEach(function () {
        rewriter = new CaptureDocumentRewriter();
        timeId = utils.dateToId();
      });

      context('when `record` is falsy', function () {
        it('should do nothing', function () {
          var wrapper = createDomFixture('<section><div foo="bar">text</div></section>');
          var elem = wrapper.querySelector('div');
          rewriter.captureRecordAddedNode(elem, {record: false});
          assert.strictEqual(wrapper.outerHTML, '<section><div foo="bar">text</div></section>');
        });
      });

      context('when `record` is truthy', function () {
        it('should add recording attribute if not exists', function () {
          var wrapper = createDomFixture('<section><div foo="bar">text</div></section>');
          var elem = wrapper.querySelector('div');
          rewriter.captureRecordAddedNode(elem, {record: true, timeId});
          assert.strictEqual(wrapper.outerHTML, `<section><div foo="bar" data-scrapbook-orig-null-node-${timeId}="">text</div></section>`);
        });

        it('should do nothing if the recording attribute exists', function () {
          var wrapper = createDomFixture(`<section><div foo="bar" data-scrapbook-orig-null-node-${timeId}="foo">text</div></section>`);
          var elem = wrapper.querySelector('div');
          rewriter.captureRecordAddedNode(elem, {record: true, timeId});
          assert.strictEqual(wrapper.outerHTML, `<section><div foo="bar" data-scrapbook-orig-null-node-${timeId}="foo">text</div></section>`);
        });
      });
    });

    describe('#captureRemoveNode()', function () {
      let rewriter;
      let timeId;

      beforeEach(function () {
        rewriter = new CaptureDocumentRewriter();
        timeId = utils.dateToId();
      });

      context('when `record` is falsy', function () {
        it('should remove the element', function () {
          var wrapper = createDomFixture('<section><div foo="bar">text</div></section>');
          var elem = wrapper.querySelector('div');
          rewriter.captureRemoveNode(elem, {record: false});
          assert.strictEqual(wrapper.outerHTML, '<section></section>');
        });
      });

      context('when `record` is truthy', function () {
        it('should replace the element with a recording comment', function () {
          var wrapper = createDomFixture('<section><div foo="bar">text</div></section>');
          var elem = wrapper.querySelector('div');
          rewriter.captureRemoveNode(elem, {record: true, timeId});
          assert.strictEqual(wrapper.outerHTML, `<section><!--scrapbook-orig-node-${timeId}=<div foo="bar">text</div>--></section>`);
        });

        it('should escape the content of the comment', function () {
          var wrapper = createDomFixture('<section><script>alert("-->");</script></section>');
          var elem = wrapper.querySelector('script');
          rewriter.captureRemoveNode(elem, {record: true, timeId});
          assert.strictEqual(wrapper.outerHTML, `<section><!--scrapbook-orig-node-${timeId}=<script>alert("-\u200B->");</script>--></section>`);
        });
      });
    });

    describe('#captureRewriteAttr()', function () {
      let rewriter;
      let timeId;

      beforeEach(function () {
        rewriter = new CaptureDocumentRewriter();
        timeId = utils.dateToId();
      });

      context('when `record` is falsy', function () {
        context('when `ns` is null', function () {
          context('when providing no prefix', function () {
            it('should alter the attribute if value is a string', function () {
              var elem = createNodeFixture({tagName: 'a', attrs: {href: 'foo'}, value: 'text'});
              rewriter.captureRewriteAttr(elem, 'href', 'bar', {ns: null, record: false});
              assert.strictEqual(elem.outerHTML, '<a href="bar">text</a>');
              assert.strictEqual(elem.getAttributeNS(null, 'href'), 'bar');
            });

            it('should add the attribute if not exists and value is a string', function () {
              var elem = createNodeFixture({tagName: 'a', value: 'text'});
              rewriter.captureRewriteAttr(elem, 'href', 'bar', {ns: null, record: false});
              assert.strictEqual(elem.outerHTML, '<a href="bar">text</a>');
              assert.strictEqual(elem.getAttributeNS(null, 'href'), 'bar');
            });

            it('should empty the attribute if value is an empty string', function () {
              var elem = createNodeFixture({tagName: 'a', attrs: {href: 'foo'}, value: 'text'});
              rewriter.captureRewriteAttr(elem, 'href', '', {ns: null, record: false});
              assert.strictEqual(elem.outerHTML, '<a href="">text</a>');
              assert.strictEqual(elem.getAttributeNS(null, 'href'), '');
            });

            it('should add empty attribute if not exists and value is true ', function () {
              var elem = createNodeFixture({tagName: 'a', value: 'text'});
              rewriter.captureRewriteAttr(elem, 'href', true, {ns: null, record: false});
              assert.strictEqual(elem.outerHTML, '<a href="">text</a>');
              assert.strictEqual(elem.getAttributeNS(null, 'href'), '');
            });

            it('should not alter the attribute if exists and value is true ', function () {
              var elem = createNodeFixture({tagName: 'a', attrs: {href: 'foo'}, value: 'text'});
              rewriter.captureRewriteAttr(elem, 'href', true, {ns: null, record: false});
              assert.strictEqual(elem.outerHTML, '<a href="foo">text</a>');
              assert.strictEqual(elem.getAttributeNS(null, 'href'), 'foo');
            });

            for (const value of [null, undefined, false]) {
              it(`should remove the attribute if value is ${String(value)}`, function () {
                var elem = createNodeFixture({tagName: 'a', attrs: {href: 'foo'}, value: 'text'});
                rewriter.captureRewriteAttr(elem, 'href', value, {ns: null, record: false});
                assert.strictEqual(elem.outerHTML, '<a>text</a>');
                assert.strictEqual(elem.getAttributeNS(null, 'href'), null);
              });
            }
          });

          context('when providing a prefix', function () {
            it('should throw an error', function () {
              var elem = createNodeFixture({tagName: 'a', attrs: {href: 'foo'}, value: 'text'});
              assert.throws(() => {
                rewriter.captureRewriteAttr(elem, 'prefix:href', 'bar', {ns: null, record: false});
              });
            });
          });
        });

        context('when `ns` is non-null', function () {
          context('for SVG document', function () {
            for (const [ctx, prefix] of [
              ['when providing same prefix', 'xlink:'],
              ['when providing another prefix', 'x:'],
              ['when providing no prefix', ''],
            ]) {
              context(ctx, function () {
                it('should alter the attribute if value is a string', function () {
                  var doc = createDocFixture({type: 'svg', tagName: 'a', ns: NS_SVG, attrs: [['xlink:href', 'foo', NS_XLINK]], value: 'text'});
                  var elem = doc.querySelector('a');
                  rewriter.captureRewriteAttr(elem, `${prefix}href`, 'bar', {ns: NS_XLINK, record: false});
                  assert.strictEqual(utils.documentToString(doc), `<svg xmlns="${NS_SVG}" xmlns:xlink="${NS_XLINK}"><a xlink:href="bar">text</a></svg>`);
                  assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), 'bar');
                });

                it('should add the attribute if not exists and value is a string', function () {
                  var doc = createDocFixture({type: 'svg', tagName: 'a', ns: NS_SVG, value: 'text'});
                  var elem = doc.querySelector('a');
                  rewriter.captureRewriteAttr(elem, `${prefix}href`, 'bar', {ns: NS_XLINK, record: false});
                  assert.strictEqual(utils.documentToString(doc), `<svg xmlns="${NS_SVG}" xmlns:xlink="${NS_XLINK}"><a xlink:href="bar">text</a></svg>`);
                  assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), 'bar');
                });

                it('should empty the attribute if value is an empty string', function () {
                  var doc = createDocFixture({type: 'svg', tagName: 'a', ns: NS_SVG, attrs: [['xlink:href', 'foo', NS_XLINK]], value: 'text'});
                  var elem = doc.querySelector('a');
                  rewriter.captureRewriteAttr(elem, `${prefix}href`, '', {ns: NS_XLINK, record: false});
                  assert.strictEqual(utils.documentToString(doc), `<svg xmlns="${NS_SVG}" xmlns:xlink="${NS_XLINK}"><a xlink:href="">text</a></svg>`);
                  assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), '');
                });

                it('should add empty attribute if not exists and value is true ', function () {
                  var doc = createDocFixture({type: 'svg', tagName: 'a', ns: NS_SVG, value: 'text'});
                  var elem = doc.querySelector('a');
                  rewriter.captureRewriteAttr(elem, `${prefix}href`, true, {ns: NS_XLINK, record: false});
                  assert.strictEqual(utils.documentToString(doc), `<svg xmlns="${NS_SVG}" xmlns:xlink="${NS_XLINK}"><a xlink:href="">text</a></svg>`);
                  assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), '');
                });

                it('should not alter the attribute if exists and value is true ', function () {
                  var doc = createDocFixture({type: 'svg', tagName: 'a', ns: NS_SVG, attrs: [['xlink:href', 'foo', NS_XLINK]], value: 'text'});
                  var elem = doc.querySelector('a');
                  rewriter.captureRewriteAttr(elem, `${prefix}href`, true, {ns: NS_XLINK, record: false});
                  assert.strictEqual(utils.documentToString(doc), `<svg xmlns="${NS_SVG}" xmlns:xlink="${NS_XLINK}"><a xlink:href="foo">text</a></svg>`);
                  assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), 'foo');
                });

                for (const value of [null, undefined, false]) {
                  it(`should remove the attribute if value is ${String(value)}`, function () {
                    var doc = createDocFixture({type: 'svg', tagName: 'a', ns: NS_SVG, attrs: [['xlink:href', 'foo', NS_XLINK]], value: 'text'});
                    var elem = doc.querySelector('a');
                    rewriter.captureRewriteAttr(elem, `${prefix}href`, value, {ns: NS_XLINK, record: false});
                    assert.strictEqual(utils.documentToString(doc), `<svg xmlns="${NS_SVG}" xmlns:xlink="${NS_XLINK}"><a>text</a></svg>`);
                    assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), null);
                  });
                }

                it('should use the prefix if defined elsewhere', function () {
                  var doc = createDocFixture({
                    type: 'svg', nsmap: {},
                    tagName: 'a', ns: NS_SVG,
                    attrs: [
                      ['xmlns:xlink', NS_XLINK, NS_XMLNS],
                      ['xlink:href', 'foo', NS_XLINK],
                    ],
                    value: 'text',
                  });
                  var elem = doc.querySelector('a');
                  rewriter.captureRewriteAttr(elem, `${prefix}href`, 'bar', {ns: NS_XLINK, record: false});
                  assert.strictEqual(utils.documentToString(doc), `<svg xmlns="${NS_SVG}"><a xmlns:xlink="${NS_XLINK}" xlink:href="bar">text</a></svg>`);
                  assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), 'bar');
                });
              });
            }

            context('when prefix mapping not defined', function () {
              // Don't check `documentToString` directly since the order of the
              // auto-generated `xmlns:*` and other attributes and the name of the
              // auto-generated prefix may differ among browsers.

              it('should add attribute with default prefix if provided', function () {
                var doc = createDocFixture({type: 'svg', nsmap: {}, tagName: 'a', ns: NS_SVG, value: 'text'});
                var elem = doc.querySelector('a');
                rewriter.captureRewriteAttr(elem, 'xlink:href', 'foo', {ns: NS_XLINK, record: false});
                var attr = elem.getAttributeNodeNS(NS_XLINK, 'href');
                assert.strictEqual(attr.prefix, 'xlink');
                assert.strictEqual(attr.nodeValue, 'foo');

                // verify that `xmlns:xlink` attribute is generated by the browser when serialized
                var doc = createDocFixture({type: 'svg', code: utils.documentToString(doc)});
                var elem = doc.querySelector('a');
                assert.strictEqual(elem.getAttribute('xmlns:xlink'), NS_XLINK);
                var attr = elem.getAttributeNodeNS(NS_XLINK, 'href');
                assert.strictEqual(attr.prefix, 'xlink');
                assert.strictEqual(attr.nodeValue, 'foo');
              });

              it('should add attribute with null prefix if default prefix not provided', function () {
                var doc = createDocFixture({type: 'svg', nsmap: {}, tagName: 'a', ns: NS_SVG, value: 'text'});
                var elem = doc.querySelector('a');
                rewriter.captureRewriteAttr(elem, 'href', 'foo', {ns: NS_XLINK, record: false});
                var attr = elem.getAttributeNodeNS(NS_XLINK, 'href');
                assert.strictEqual(attr.prefix, null);
                assert.strictEqual(attr.nodeValue, 'foo');

                // verify that a prefix and `xmlns:*` attribute are generated by the browser when serialized
                var doc = createDocFixture({type: 'svg', code: utils.documentToString(doc)});
                var elem = doc.querySelector('a');
                var prefix = Array.prototype.find.call(elem.attributes, e => e.prefix === 'xmlns').localName;
                var attr = elem.getAttributeNodeNS(NS_XLINK, 'href');
                assert.notStrictEqual(attr.prefix, 'xlink');
                assert.strictEqual(attr.prefix, prefix);
                assert.strictEqual(attr.nodeValue, 'foo');
              });
            });
          });

          context('for HTML document', function () {
            for (const [ctx, prefix] of [
              ['when providing same prefix', 'xlink:'],
              ['when providing another prefix', 'x:'],
              ['when providing no prefix', ''],
            ]) {
              context(ctx, function () {
                it('should alter the attribute if value is a string', function () {
                  var doc = createDocFixture({tagName: 'svg', ns: NS_SVG, children: [
                    {tagName: 'a', ns: NS_SVG, attrs: [['xlink:href', 'foo', NS_XLINK]], value: 'text'},
                  ]});
                  var elem = doc.querySelector('a');
                  rewriter.captureRewriteAttr(elem, `${prefix}href`, 'bar', {ns: NS_XLINK, record: false});
                  assert.strictEqual(elem.outerHTML, '<a xlink:href="bar">text</a>');
                  assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), 'bar');
                });

                it('should add the attribute if not exists and value is a string', function () {
                  var doc = createDocFixture({tagName: 'svg', ns: NS_SVG, children: [
                    {tagName: 'a', ns: NS_SVG, value: 'text'},
                  ]});
                  var elem = doc.querySelector('a');
                  rewriter.captureRewriteAttr(elem, `${prefix}href`, 'bar', {ns: NS_XLINK, record: false});
                  assert.strictEqual(elem.outerHTML, '<a xlink:href="bar">text</a>');
                  assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), 'bar');
                });

                it('should empty the attribute if value is an empty string', function () {
                  var doc = createDocFixture({tagName: 'svg', ns: NS_SVG, children: [
                    {tagName: 'a', ns: NS_SVG, attrs: [['xlink:href', 'foo', NS_XLINK]], value: 'text'},
                  ]});
                  var elem = doc.querySelector('a');
                  rewriter.captureRewriteAttr(elem, `${prefix}href`, '', {ns: NS_XLINK, record: false});
                  assert.strictEqual(elem.outerHTML, '<a xlink:href="">text</a>');
                  assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), '');
                });

                it('should add empty attribute if not exists and value is true ', function () {
                  var doc = createDocFixture({tagName: 'svg', ns: NS_SVG, children: [
                    {tagName: 'a', ns: NS_SVG, value: 'text'},
                  ]});
                  var elem = doc.querySelector('a');
                  rewriter.captureRewriteAttr(elem, `${prefix}href`, true, {ns: NS_XLINK, record: false});
                  assert.strictEqual(elem.outerHTML, '<a xlink:href="">text</a>');
                  assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), '');
                });

                it('should not alter the attribute if exists and value is true ', function () {
                  var doc = createDocFixture({tagName: 'svg', ns: NS_SVG, children: [
                    {tagName: 'a', ns: NS_SVG, attrs: [['xlink:href', 'foo', NS_XLINK]], value: 'text'},
                  ]});
                  var elem = doc.querySelector('a');
                  rewriter.captureRewriteAttr(elem, `${prefix}href`, true, {ns: NS_XLINK, record: false});
                  assert.strictEqual(elem.outerHTML, '<a xlink:href="foo">text</a>');
                  assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), 'foo');
                });

                for (const value of [null, undefined, false]) {
                  it(`should remove the attribute if value is ${String(value)}`, function () {
                    var doc = createDocFixture({tagName: 'svg', ns: NS_SVG, children: [
                      {tagName: 'a', ns: NS_SVG, attrs: [['xlink:href', 'foo', NS_XLINK]], value: 'text'},
                    ]});
                    var elem = doc.querySelector('a');
                    rewriter.captureRewriteAttr(elem, `${prefix}href`, value, {ns: NS_XLINK, record: false});
                    assert.strictEqual(elem.outerHTML, '<a>text</a>');
                    assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), null);
                  });
                }
              });
            }
          });
        });
      });

      context('when `record` is truthy', function () {
        context('when attribute exists', function () {
          it('should add recording attribute in same namespace', function () {
            var doc = createDocFixture({type: 'svg', tagName: 'a', ns: NS_SVG, attrs: [['xlink:href', 'foo', NS_XLINK]], value: 'text'});
            var elem = doc.querySelector('a');
            rewriter.captureRewriteAttr(elem, 'href', 'bar', {ns: NS_XLINK, record: true, timeId});
            assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), 'bar');
            assert.strictEqual(elem.getAttributeNS(NS_XLINK, `data-scrapbook-orig-attr-href-${timeId}`), 'foo');
          });

          it('should not add recording attribute if value not changed', function () {
            var doc = createDocFixture({type: 'svg', tagName: 'a', ns: NS_SVG, attrs: [['xlink:href', 'bar', NS_XLINK]], value: 'text'});
            var elem = doc.querySelector('a');
            rewriter.captureRewriteAttr(elem, 'href', 'bar', {ns: NS_XLINK, record: true, timeId});
            assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), 'bar');
            assert.strictEqual(elem.hasAttributeNS(NS_XLINK, `data-scrapbook-orig-attr-href-${timeId}`), false);
          });

          it('should not alter the recording attribute if exists', function () {
            var doc = createDocFixture({type: 'svg', tagName: 'a', ns: NS_SVG, attrs: [['xlink:href', 'foo', NS_XLINK]], value: 'text'});
            var elem = doc.querySelector('a');
            rewriter.captureRewriteAttr(elem, 'href', 'bar', {ns: NS_XLINK, record: true, timeId});
            rewriter.captureRewriteAttr(elem, 'href', 'baz', {ns: NS_XLINK, record: true, timeId});
            assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), 'baz');
            assert.strictEqual(elem.getAttributeNS(NS_XLINK, `data-scrapbook-orig-attr-href-${timeId}`), 'foo');
          });

          it('should not add recording attribute if recorded as a null attribute', function () {
            var doc = createDocFixture({type: 'svg', tagName: 'a', ns: NS_SVG, value: 'text'});
            var elem = doc.querySelector('a');
            rewriter.captureRewriteAttr(elem, 'href', 'foo', {ns: NS_XLINK, record: true, timeId});
            rewriter.captureRewriteAttr(elem, 'href', 'bar', {ns: NS_XLINK, record: true, timeId});
            assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), 'bar');
            assert.strictEqual(elem.getAttributeNS(NS_XLINK, `data-scrapbook-orig-attr-href-${timeId}`), null);
            assert.strictEqual(elem.getAttributeNS(NS_XLINK, `data-scrapbook-orig-null-attr-href-${timeId}`), '');
          });

          it('should not add recording attribute if recorded as a null node', function () {
            var doc = createDocFixture({type: 'svg', tagName: 'a', ns: NS_SVG, attrs: [['xlink:href', 'foo', NS_XLINK]], value: 'text'});
            var elem = doc.querySelector('a');
            rewriter.captureRecordAddedNode(elem, {record: true, timeId});
            rewriter.captureRewriteAttr(elem, 'href', 'bar', {ns: NS_XLINK, record: true, timeId});
            assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), 'bar');
            assert.strictEqual(elem.getAttributeNS(NS_XLINK, `data-scrapbook-orig-attr-href-${timeId}`), null);
            assert.strictEqual(elem.getAttributeNS(null, `data-scrapbook-orig-null-node-${timeId}`), '');
          });
        });

        context('when attribute not exists', function () {
          it('should add recording attribute in same namespace', function () {
            var doc = createDocFixture({type: 'svg', tagName: 'a', ns: NS_SVG, value: 'text'});
            var elem = doc.querySelector('a');
            rewriter.captureRewriteAttr(elem, 'href', 'bar', {ns: NS_XLINK, record: true, timeId});
            assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), 'bar');
            assert.strictEqual(elem.getAttributeNS(NS_XLINK, `data-scrapbook-orig-null-attr-href-${timeId}`), '');
          });

          for (const value of [null, undefined, false]) {
            it(`should not add recording attribute if value is ${String(value)}`, function () {
              var doc = createDocFixture({type: 'svg', tagName: 'a', ns: NS_SVG, value: 'text'});
              var elem = doc.querySelector('a');
              rewriter.captureRewriteAttr(elem, 'href', value, {ns: NS_XLINK, record: true, timeId});
              assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), null);
              assert.strictEqual(elem.getAttributeNS(NS_XLINK, `data-scrapbook-orig-null-attr-href-${timeId}`), null);
            });
          }

          it('should not alter the recording attribute if exists', function () {
            var doc = createDocFixture({type: 'svg', tagName: 'a', ns: NS_SVG, value: 'text'});
            var elem = doc.querySelector('a');
            rewriter.captureRewriteAttr(elem, 'href', 'foo', {ns: NS_XLINK, record: true, timeId});
            rewriter.captureRewriteAttr(elem, 'href', null, {ns: NS_XLINK, record: true, timeId});
            rewriter.captureRewriteAttr(elem, 'href', 'bar', {ns: NS_XLINK, record: true, timeId});
            assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), 'bar');
            assert.strictEqual(elem.getAttributeNS(NS_XLINK, `data-scrapbook-orig-null-attr-href-${timeId}`), '');
          });

          it('should not add recording attribute if recorded as having a value', function () {
            var doc = createDocFixture({type: 'svg', tagName: 'a', ns: NS_SVG, attrs: [['xlink:href', 'foo', NS_XLINK]], value: 'text'});
            var elem = doc.querySelector('a');
            rewriter.captureRewriteAttr(elem, 'href', null, {ns: NS_XLINK, record: true, timeId});
            rewriter.captureRewriteAttr(elem, 'href', 'bar', {ns: NS_XLINK, record: true, timeId});
            assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), 'bar');
            assert.strictEqual(elem.getAttributeNS(NS_XLINK, `data-scrapbook-orig-null-attr-href-${timeId}`), null);
            assert.strictEqual(elem.getAttributeNS(NS_XLINK, `data-scrapbook-orig-attr-href-${timeId}`), 'foo');
          });

          it('should not add recording attribute if recorded as a null node', function () {
            var doc = createDocFixture({type: 'svg', tagName: 'a', ns: NS_SVG, value: 'text'});
            var elem = doc.querySelector('a');
            rewriter.captureRecordAddedNode(elem, {record: true, timeId});
            rewriter.captureRewriteAttr(elem, 'href', 'foo', {ns: NS_XLINK, record: true, timeId});
            assert.strictEqual(elem.getAttributeNS(NS_XLINK, 'href'), 'foo');
            assert.strictEqual(elem.getAttributeNS(NS_XLINK, `data-scrapbook-orig-null-attr-href-${timeId}`), null);
            assert.strictEqual(elem.getAttributeNS(NS_XLINK, `data-scrapbook-orig-attr-href-${timeId}`), null);
            assert.strictEqual(elem.getAttributeNS(null, `data-scrapbook-orig-null-node-${timeId}`), '');
          });
        });
      });
    });

    describe('#captureRewriteTextContent()', function () {
      let rewriter;
      let timeId;

      beforeEach(function () {
        rewriter = new CaptureDocumentRewriter();
        timeId = utils.dateToId();
      });

      context('when `record` is falsy', function () {
        it('should alter the text content', function () {
          var wrapper = createDomFixture('<section><div foo="bar">text</div></section>');
          var elem = wrapper.querySelector('div');
          rewriter.captureRewriteTextContent(elem, 'newtext', {record: false});
          assert.strictEqual(wrapper.outerHTML, '<section><div foo="bar">newtext</div></section>');
        });
      });

      context('when `record` is truthy', function () {
        it('should alter the text content and add recording attribute', function () {
          var wrapper = createDomFixture('<section><div foo="bar">text</div></section>');
          var elem = wrapper.querySelector('div');
          rewriter.captureRewriteTextContent(elem, 'newtext', {record: true, timeId});
          assert.strictEqual(wrapper.outerHTML, `<section><div foo="bar" data-scrapbook-orig-textcontent-${timeId}="text">newtext</div></section>`);
        });

        it('should not add recording attribute if text content not changed', function () {
          var wrapper = createDomFixture('<section><div foo="bar">text</div></section>');
          var elem = wrapper.querySelector('div');
          rewriter.captureRewriteTextContent(elem, 'text', {record: true, timeId});
          assert.strictEqual(wrapper.outerHTML, '<section><div foo="bar">text</div></section>');
        });

        it('should not alter the recording attribute if exists', function () {
          var wrapper = createDomFixture('<section><div foo="bar">text</div></section>');
          var elem = wrapper.querySelector('div');
          rewriter.captureRewriteTextContent(elem, 'new text', {record: true, timeId});
          rewriter.captureRewriteTextContent(elem, 'brand new text', {record: true, timeId});
          assert.strictEqual(wrapper.outerHTML, `<section><div foo="bar" data-scrapbook-orig-textcontent-${timeId}="text">brand new text</div></section>`);
        });
      });
    });

    describe('#resolveRelativeUrl()', function () {
      const modeCases = ["save", "link", "blank", "remove"];
      const skipLocalCases = [undefined, true, false];
      const urlCases = ["https://example.com", "javascript:alert('test')"];

      let rewriter;
      let stubResolve;

      beforeEach(function () {
        rewriter = new CaptureDocumentRewriter();
        rewriter.capturer = new TestCapturer();
        stubResolve = sinon.stub(rewriter.capturer, 'resolveRelativeUrl').returns("<resolved>");
      });

      context('when `checkJavascript` is truthy', function () {
        const checkJavascript = true;

        for (const mode of modeCases) {
          context(`options["capture.script"] = "${mode}"`, function () {
            it('should check the input URL with `isJavascriptUrl`', function () {
              var spy = sinon.spy(rewriter, 'isJavascriptUrl');
              for (const url of urlCases) {
                rewriter.resolveRelativeUrl(url, "http://example.com/", {
                  checkJavascript,
                  scriptMode: mode,
                });
                assert.deepEqual(spy.lastCall.args, [url]);
              }
            });

            context('for javascript: protocol', function () {
              switch (mode) {
                case "save":
                case "link": {
                  it('should call and return the result from `Capturer.resolveRelativeUrl`', function () {
                    for (const skipLocal of skipLocalCases) {
                      assert.strictEqual(
                        rewriter.resolveRelativeUrl("javascript:alert('test')", "http://example.com/", {
                          checkJavascript,
                          skipLocal,
                          scriptMode: mode,
                        }),
                        stubResolve.lastCall.returnValue,
                      );
                      assert.deepEqual(stubResolve.lastCall.args, ["javascript:alert('test')", "http://example.com/", {skipLocal}]);
                    }
                  });

                  break;
                }
                case "blank":
                case "remove": {
                  it('should return blanked "javascript:"', function () {
                    for (const skipLocal of skipLocalCases) {
                      assert.strictEqual(
                        rewriter.resolveRelativeUrl("javascript:alert('test')", "http://example.com/", {
                          checkJavascript,
                          skipLocal,
                          scriptMode: mode,
                        }),
                        "javascript:",
                      );
                      sinon.assert.notCalled(stubResolve);
                    }
                  });

                  break;
                }
              }
            });

            context('for other protocol', function () {
              it('should call and return the result from `Capturer.resolveRelativeUrl`', function () {
                for (const skipLocal of skipLocalCases) {
                  assert.strictEqual(
                    rewriter.resolveRelativeUrl("page.html", "http://example.com/", {
                      checkJavascript,
                      skipLocal,
                      scriptMode: mode,
                    }),
                    stubResolve.lastCall.returnValue,
                  );
                  assert.deepEqual(stubResolve.lastCall.args, ["page.html", "http://example.com/", {skipLocal}]);
                }
              });
            });
          });
        }
      });

      context('when `checkJavascript` is falsy', function () {
        const checkJavascript = false;

        for (const mode of modeCases) {
          context(`options["capture.script"] = "${mode}"`, function () {
            it('should not check input URL with `isJavascriptUrl`', function () {
              var spy = sinon.spy(rewriter, 'isJavascriptUrl');
              for (const url of urlCases) {
                rewriter.resolveRelativeUrl(url, "http://example.com/", {
                  checkJavascript,
                  scriptMode: mode,
                });
                sinon.assert.notCalled(spy);
              }
            });

            it('should call and return the result from `Capturer.resolveRelativeUrl`', function () {
              for (const skipLocal of skipLocalCases) {
                for (const url of urlCases) {
                  assert.strictEqual(
                    rewriter.resolveRelativeUrl(url, "http://example.com/", {
                      checkJavascript,
                      skipLocal,
                      scriptMode: mode,
                    }),
                    stubResolve.lastCall.returnValue,
                  );
                  assert.deepEqual(stubResolve.lastCall.args, [url, "http://example.com/", {skipLocal}]);
                }
              }
            });
          });
        }
      });
    });

    describe('#resolveLocalLink()', function () {
      function docFactory(id, type = 'id') {
        const attrs = (() => {
          switch (type) {
            case 'id':
              return {id};
            case 'name':
              return {name: id};
          }
        })();
        return createDocFixture({name: 'a', attrs});
      }

      const isPartial = false;

      let rewriter;
      let spyResolve;

      beforeEach(function () {
        rewriter = new CaptureDocumentRewriter();
        rewriter.capturer = new TestCapturer();
        spyResolve = sinon.spy(rewriter, 'resolveRelativeUrl');
      });

      context('when the resolved URL targets `docUrl`', function () {
        context('when `docUrl` is not inherited', function () {
          context('when the resolved URL contains an empty hash', function () {
            it('should return hash when the URL is ""', function () {
              Object.assign(rewriter, {
                doc: docFactory(),
                docUrl,
                options: {},
              });
              var url = "";
              var baseUrl = docUrl;
              assert.strictEqual(
                rewriter.resolveLocalLink(url, baseUrl),
                "",
              );
              assert.deepEqual(spyResolve.lastCall.args, [url, baseUrl, {checkJavascript: false, skipLocal: false}]);
            });

            it('should return hash when the URL is "#"', function () {
              Object.assign(rewriter, {
                doc: docFactory(),
                docUrl,
                options: {},
              });
              var url = "#";
              var baseUrl = docUrl;
              assert.strictEqual(
                rewriter.resolveLocalLink(url, baseUrl),
                "#",
              );
              assert.deepEqual(spyResolve.lastCall.args, [url, baseUrl, {checkJavascript: false, skipLocal: false}]);
            });

            it('should return hash when the URL is same as document', function () {
              Object.assign(rewriter, {
                doc: docFactory(),
                docUrl,
                options: {},
              });
              var url = docUrl + '#';
              var baseUrl = docUrl;
              assert.strictEqual(
                rewriter.resolveLocalLink(url, baseUrl),
                "#",
              );
              assert.deepEqual(spyResolve.lastCall.args, [url, baseUrl, {checkJavascript: false, skipLocal: false}]);
            });

            it('should return hash when the URL is resolved to be same as document', function () {
              Object.assign(rewriter, {
                doc: docFactory(),
                docUrl: "https://example.com/",
                options: {},
              });
              var url = "..#";
              var baseUrl = "https://example.com/rebased/";
              assert.strictEqual(
                rewriter.resolveLocalLink(url, baseUrl),
                "#",
              );
              assert.deepEqual(spyResolve.lastCall.args, [url, baseUrl, {checkJavascript: false, skipLocal: false}]);
            });
          });

          context('when the resolved URL contains a hash', function () {
            context('when `isPartial` is truthy', function () {
              const isPartial = true;

              context('when hash target exists', function () {
                it('should return hash when the document has `*[id="<hash>"]`', function () {
                  Object.assign(rewriter, {
                    doc: docFactory("foo"),
                    docUrl,
                    isPartial,
                    options: {},
                  });
                  var url = "#foo";
                  var baseUrl = docUrl;
                  assert.strictEqual(
                    rewriter.resolveLocalLink(url, baseUrl),
                    "#foo",
                  );
                  assert.deepEqual(spyResolve.lastCall.args, [url, baseUrl, {checkJavascript: false, skipLocal: false}]);
                });

                it('should return hash when the document has `a[name="<hash>"]`', function () {
                  Object.assign(rewriter, {
                    doc: docFactory("foo", "name"),
                    docUrl,
                    isPartial,
                    options: {},
                  });
                  var url = "#foo";
                  var baseUrl = docUrl;
                  assert.strictEqual(
                    rewriter.resolveLocalLink(url, baseUrl),
                    "#foo",
                  );
                  assert.deepEqual(spyResolve.lastCall.args, [url, baseUrl, {checkJavascript: false, skipLocal: false}]);
                });
              });

              context('when hash target not exists', function () {
                it('should call and return the result from `#resolveRelativeUrl`', function () {
                  Object.assign(rewriter, {
                    doc: docFactory(),
                    docUrl,
                    isPartial,
                    options: {},
                  });
                  var url = "#foo";
                  var baseUrl = docUrl;
                  assert.strictEqual(
                    rewriter.resolveLocalLink(url, baseUrl),
                    spyResolve.lastCall.returnValue,
                  );
                  assert.deepEqual(spyResolve.lastCall.args, [url, baseUrl, {checkJavascript: false, skipLocal: false}]);
                });
              });
            });

            context('when `isPartial` is falsy', function () {
              const isPartial = false;

              it('should return hash when the URL is hash-only', function () {
                Object.assign(rewriter, {
                  doc: docFactory(),
                  docUrl,
                  isPartial,
                  options: {},
                });
                var url = "#foo";
                var baseUrl = docUrl;
                assert.strictEqual(
                  rewriter.resolveLocalLink(url, baseUrl),
                  "#foo",
                );
                assert.deepEqual(spyResolve.lastCall.args, [url, baseUrl, {checkJavascript: false, skipLocal: false}]);
              });

              it('should return hash when the URL is same as document (except for hash)', function () {
                Object.assign(rewriter, {
                  doc: docFactory(),
                  docUrl,
                  isPartial,
                  options: {},
                });
                var url = docUrl + '#foo';
                var baseUrl = docUrl;
                assert.strictEqual(
                  rewriter.resolveLocalLink(url, baseUrl),
                  "#foo",
                );
                assert.deepEqual(spyResolve.lastCall.args, [url, baseUrl, {checkJavascript: false, skipLocal: false}]);
              });
            });
          });
        });

        context('when `docUrl` is inherited', function () {
          it('should call and return the result from `#resolveRelativeUrl` when the URL is "about:blank"', function () {
            Object.assign(rewriter, {
              doc: docFactory(),
              docUrl: "about:blank",
              isPartial,
              options: {},
            });
            var url = "about:blank#foo";
            var baseUrl = docUrl;
            assert.strictEqual(
              rewriter.resolveLocalLink(url, baseUrl),
              spyResolve.lastCall.returnValue,
            );
            assert.deepEqual(spyResolve.lastCall.args, [url, baseUrl, {checkJavascript: false, skipLocal: false}]);
          });

          it('should call and return the result from `#resolveRelativeUrl` when the URL is "about:srcdoc"', function () {
            Object.assign(rewriter, {
              doc: docFactory(),
              docUrl: "about:srcdoc",
              isPartial,
              options: {},
            });
            var url = "about:srcdoc#foo";
            var baseUrl = docUrl;
            assert.strictEqual(
              rewriter.resolveLocalLink(url, baseUrl),
              spyResolve.lastCall.returnValue,
            );
            assert.deepEqual(spyResolve.lastCall.args, [url, baseUrl, {checkJavascript: false, skipLocal: false}]);
          });
        });
      });

      context('when the resolved URL not targets `docUrl`', function () {
        it('should call and return the result from `#resolveRelativeUrl`', function () {
          Object.assign(rewriter, {
            doc: docFactory(),
            docUrl,
            isPartial,
            options: {},
          });
          const url = docUrl + '?id=123';
          const baseUrl = docUrl;
          assert.strictEqual(
            rewriter.resolveLocalLink(url, baseUrl),
            spyResolve.lastCall.returnValue,
          );
          assert.deepEqual(spyResolve.lastCall.args, [url, baseUrl, {checkJavascript: false, skipLocal: false}]);
        });

        it('should pass `checkJavascript` to `#resolveRelativeUrl`', function () {
          Object.assign(rewriter, {
            doc: docFactory(),
            docUrl,
            isPartial,
            options: {},
          });
          const url = 'javascript:alert("123")';
          const baseUrl = docUrl;
          for (const checkJavascript of [undefined, true, false]) {
            const checkJavascriptArg = checkJavascript ?? false;
            assert.strictEqual(
              rewriter.resolveLocalLink(url, baseUrl, {checkJavascript}),
              spyResolve.lastCall.returnValue,
            );
            assert.deepEqual(spyResolve.lastCall.args, [url, baseUrl, {
              checkJavascript: checkJavascriptArg,
              skipLocal: false,
            }]);
          }
        });
      });
    });
  });
});
