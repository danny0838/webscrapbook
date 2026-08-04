import {
  MochaQuery as $, assert,
  rawRegex, getAttributes, slotAssign,
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

      context('shadow DOMs handling', function () {
        it('should record shadow DOMs recursively', async function () {
          var spy = sinon.spy(TestCapturer.prototype, "preSaveProcess");

          var doc = createDocFixture({name: 'div', shadow: {
            children: [
              {name: 'div', shadow: {
                children: [
                  {name: 'span', attrs: {title: 'span title'}, value: 'text'},
                ],
              }},
            ],
          }});
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var {'data-scrapbook-shadowdom': html, ...attrs} = getAttributes(doc.querySelector('div'));
          assert.deepEqual(attrs, {});
          var shadow = createFragFixture(html);
          var {'data-scrapbook-shadowdom': html, ...attrs} = getAttributes(shadow.querySelector('div'));
          assert.deepEqual(attrs, {});
          assert.strictEqual(html, '<span title="span title">text</span>');

          sinon.assert.calledWithMatch(spy, {
            requireBasicLoader: true,
          });
        });

        $it.skipIf($.noShadowRootClosed)('should work for closed shadow DOMs', async function () {
          var doc = createDocFixture({name: 'div', shadow: {
            mode: 'closed',
            children: [{name: 'div'}],
          }});
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var {'data-scrapbook-shadowdom': html, ...attrs} = getAttributes(doc.querySelector('div'));
          assert.deepEqual(attrs, {'data-scrapbook-shadowdom-mode': 'closed'});
          var shadow = createFragFixture(html);
          var attrs = getAttributes(shadow.querySelector('div'));
          assert.deepEqual(attrs, {});
        });

        $it.skipIf($.noShadowRootClonable)('should work for clonable shadow DOMs', async function () {
          var doc = createDocFixture({name: 'div', shadow: {
            clonable: true,
            children: [{name: 'div'}],
          }});
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var {'data-scrapbook-shadowdom': html, ...attrs} = getAttributes(doc.querySelector('div'));
          assert.deepEqual(attrs, {'data-scrapbook-shadowdom-clonable': ''});
          var shadow = createFragFixture(html);
          var attrs = getAttributes(shadow.querySelector('div'));
          assert.deepEqual(attrs, {});
        });

        $it.skipIf($.noShadowRootDelegatesFocus)('should handle `delegatesFocus` for shadow DOMs', async function () {
          var doc = createDocFixture({name: 'div', shadow: {
            delegatesFocus: true,
            children: [{name: 'div'}],
          }});
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var {'data-scrapbook-shadowdom': html, ...attrs} = getAttributes(doc.querySelector('div'));
          assert.deepEqual(attrs, {'data-scrapbook-shadowdom-delegates-focus': ''});
          var shadow = createFragFixture(html);
          var attrs = getAttributes(shadow.querySelector('div'));
          assert.deepEqual(attrs, {});
        });

        $it.skipIf($.noShadowRootSerializable)('should handle `serializable` for shadow DOMs', async function () {
          var doc = createDocFixture({name: 'div', shadow: {
            serializable: true,
            children: [{name: 'div'}],
          }});
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var {'data-scrapbook-shadowdom': html, ...attrs} = getAttributes(doc.querySelector('div'));
          assert.deepEqual(attrs, {'data-scrapbook-shadowdom-serializable': ''});
          var shadow = createFragFixture(html);
          var attrs = getAttributes(shadow.querySelector('div'));
          assert.deepEqual(attrs, {});
        });

        $it.skipIf($.noShadowRootSlotAssignment)('should handle `slotAssignment` for shadow DOMs', async function () {
          var doc = createDocFixture({name: 'div', shadow: {
            slotAssignment: 'manual',
            children: [{name: 'div'}],
          }});
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var {'data-scrapbook-shadowdom': html, ...attrs} = getAttributes(doc.querySelector('div'));
          assert.deepEqual(attrs, {'data-scrapbook-shadowdom-slot-assignment': 'manual'});
          var shadow = createFragFixture(html);
          var attrs = getAttributes(shadow.querySelector('div'));
          assert.deepEqual(attrs, {});
        });

        it('should remove obsolete shadow DOM attributes', async function () {
          var spy = sinon.spy(TestCapturer.prototype, "preSaveProcess");

          var doc = createDocFixture({name: 'div', attrs: {
            'data-scrapbook-shadowdom': 'foo',
            'data-scrapbook-shadowdom-mode': 'closed',
            'data-scrapbook-shadowdom-clonable': '',
            'data-scrapbook-shadowdom-delegates-focus': '',
            'data-scrapbook-shadowdom-serializable': '',
            'data-scrapbook-shadowdom-slot-assignment': 'manual',
          }});
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var attrs = getAttributes(doc.querySelector('div'));
          assert.deepEqual(attrs, {});

          sinon.assert.calledWithMatch(spy, {
            requireBasicLoader: false,
          });
        });
      });

      context('constructed stylesheets handling', function () {
        $it.skipIf($.noAdoptedStylesheet)('should record constructed stylesheets', async function () {
          var spy = sinon.spy(TestCapturer.prototype, "preSaveProcess");

          var {contentDocument: doc} = await createIframeFixture({
            docData: {name: 'body'},
            onload: function ({target: {contentWindow: win, contentDocument: doc}}) {
              var css = new win.CSSStyleSheet();
              css.insertRule('#s1 { color: red; }', css.cssRules.length);
              css.insertRule('#s2 { color: green; }', css.cssRules.length);
              var css1 = css;

              var css = new win.CSSStyleSheet();
              css.insertRule('#s1 { background-color: green; }', css.cssRules.length);
              css.insertRule('#s2 { background-color: blue; }', css.cssRules.length);
              var css2 = css;

              doc.adoptedStyleSheets = [css1, css2];
            },
          });
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var attrs = getAttributes(doc.documentElement);
          assert.deepEqual(attrs, {
            'data-scrapbook-adoptedstylesheets': '0,1',
            'data-scrapbook-adoptedstylesheet-0': ['#s1 { color: red; }', '#s2 { color: green; }'].join('\n\n'),
            'data-scrapbook-adoptedstylesheet-1': ['#s1 { background-color: green; }', '#s2 { background-color: blue; }'].join('\n\n'),
          });

          sinon.assert.calledWithMatch(spy, {
            requireBasicLoader: true,
          });
        });

        $it.skipIf($.noAdoptedStylesheet)('should record constructed stylesheets for shadow DOMs', async function () {
          var spy = sinon.spy(TestCapturer.prototype, "preSaveProcess");

          var {contentDocument: doc} = await createIframeFixture({
            docData: {
              name: 'div',
              shadow: {},
            },
            onload: function ({target: {contentWindow: win, contentDocument: doc}}) {
              var css = new win.CSSStyleSheet();
              css.insertRule('#s1 { color: red; }', css.cssRules.length);
              css.insertRule('#s2 { color: green; }', css.cssRules.length);
              var css1 = css;

              var css = new win.CSSStyleSheet();
              css.insertRule('#s1 { background-color: green; }', css.cssRules.length);
              css.insertRule('#s2 { background-color: blue; }', css.cssRules.length);
              var css2 = css;

              var shadow = doc.querySelector('div').shadowRoot;
              shadow.adoptedStyleSheets = [css1, css2];
            },
          });
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var attrs = getAttributes(doc.documentElement);
          assert.deepEqual(attrs, {
            'data-scrapbook-adoptedstylesheet-0': ['#s1 { color: red; }', '#s2 { color: green; }'].join('\n\n'),
            'data-scrapbook-adoptedstylesheet-1': ['#s1 { background-color: green; }', '#s2 { background-color: blue; }'].join('\n\n'),
          });
          var {'data-scrapbook-shadowdom': html, ...attrs} = getAttributes(doc.querySelector('div'));
          assert.deepEqual(attrs, {
            'data-scrapbook-adoptedstylesheets': '0,1',
          });

          sinon.assert.calledWithMatch(spy, {
            requireBasicLoader: true,
          });
        });

        $it.skipIf($.noAdoptedStylesheet)('should record shared constructed stylesheets as same entry', async function () {
          var {contentDocument: doc} = await createIframeFixture({
            docData: {name: 'div', shadow: {}},
            onload: function ({target: {contentWindow: win, contentDocument: doc}}) {
              var css = new win.CSSStyleSheet();
              css.insertRule('#adopted1-1 { color: green; }', css.cssRules.length);
              css.insertRule('#adopted1-2 { color: yellow; }', css.cssRules.length);
              var css1 = css;

              var css = new win.CSSStyleSheet();
              css.insertRule('#adopted2-1 { color: red; }', css.cssRules.length);
              css.insertRule('#adopted2-2 { color: blue; }', css.cssRules.length);
              var css2 = css;

              doc.adoptedStyleSheets = [css1];

              var shadow = doc.querySelector('div').shadowRoot;
              shadow.adoptedStyleSheets = [css1, css2];
            },
          });
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var attrs = getAttributes(doc.documentElement);
          assert.deepEqual(attrs, {
            'data-scrapbook-adoptedstylesheets': '0',
            'data-scrapbook-adoptedstylesheet-0': ['#adopted1-1 { color: green; }', '#adopted1-2 { color: yellow; }'].join('\n\n'),
            'data-scrapbook-adoptedstylesheet-1': ['#adopted2-1 { color: red; }', '#adopted2-2 { color: blue; }'].join('\n\n'),
          });
          var {'data-scrapbook-shadowdom': html, ...attrs} = getAttributes(doc.querySelector('div'));
          assert.deepEqual(attrs, {
            'data-scrapbook-adoptedstylesheets': '0,1',
          });
        });

        $it.skipIf($.noAdoptedStylesheet)('should remove obsolete special attributes', async function () {
          var spy = sinon.spy(TestCapturer.prototype, "preSaveProcess");

          var doc = createDocFixture({name: 'html', attrs: {
            'data-scrapbook-adoptedstylesheets': '0,1',
            'data-scrapbook-adoptedstylesheet-0': ['#s1 { color: red; }', '#s2 { color: green; }'].join('\n\n'),
            'data-scrapbook-adoptedstylesheet-1': ['#s1 { background-color: green; }', '#s2 { background-color: blue; }'].join('\n\n'),
          }});
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var attrs = getAttributes(doc.documentElement);
          assert.deepEqual(attrs, {});

          sinon.assert.calledWithMatch(spy, {
            requireBasicLoader: false,
          });
        });

        $it.skipIf($.noBrowser).skipIf(
          !$.noAdoptedStylesheet.condition,
          'Document.adoptedStyleSheets supported',
        )('should keep special attributes if browser not supported', async function () {
          var spy = sinon.spy(TestCapturer.prototype, "preSaveProcess");

          var doc = createDocFixture({name: 'html', attrs: {
            'data-scrapbook-adoptedstylesheets': '0,1',
            'data-scrapbook-adoptedstylesheet-0': ['#s1 { color: red; }', '#s2 { color: green; }'].join('\n\n'),
            'data-scrapbook-adoptedstylesheet-1': ['#s1 { background-color: green; }', '#s2 { background-color: blue; }'].join('\n\n'),
          }});
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var attrs = getAttributes(doc.documentElement);
          assert.deepEqual(attrs, {
            'data-scrapbook-adoptedstylesheets': '0,1',
            'data-scrapbook-adoptedstylesheet-0': ['#s1 { color: red; }', '#s2 { color: green; }'].join('\n\n'),
            'data-scrapbook-adoptedstylesheet-1': ['#s1 { background-color: green; }', '#s2 { background-color: blue; }'].join('\n\n'),
          });

          // @FIXME: should set requireBasicLoader = true
          sinon.assert.calledWithMatch(spy, {
            requireBasicLoader: false,
          });
        });
      });

      context('<slot> handling', function () {
        $it.skipIf($.noShadowRootSlotAssignment)('should record properties for <slot>', async function () {
          var doc = createDocFixture({
            name: 'div',
            children: [
              {name: 'span', value: 'Default'},
              {name: 'span', value: 'Default2'},
              {name: '#text', value: 'Default3'},
              {name: 'span', attrs: {slot: 'person'}, value: 'Mr. Apple'},
              {name: 'span', attrs: {slot: 'person'}, value: 'Mr. Black'},
              {name: 'span', attrs: {slot: 'person'}, value: 'Ms. Cindy'},
            ],
            shadow: {
              slotAssignment: 'manual',
              children: [
                {name: 'style', value: 'slot { display: block; } ::slotted(*) { background-color: yellow; }'},
                {name: 'slot', value: 'default missing'},
                {name: 'slot', attrs: {name: 'person'}, value: 'person missing'},
              ],
            },
          });
          var host = doc.querySelector('div');
          var shadow = host.shadowRoot;
          var slots = shadow.querySelectorAll('slot');
          var spans = host.querySelectorAll('span');
          slotAssign(slots[0], spans[0], spans[1].nextSibling);
          slotAssign(slots[1], spans[2], spans[3]);
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var host = doc.querySelector('div');
          assert.strictEqual(host.innerHTML, `\
<span data-scrapbook-slot-index="0">Default</span>\
<span>Default2</span>\
<!--scrapbook-slot-index=1-->Default3<!--/scrapbook-slot-index-->\
<span slot="person" data-scrapbook-slot-index="2">Mr. Apple</span>\
<span slot="person" data-scrapbook-slot-index="3">Mr. Black</span>\
<span slot="person">Ms. Cindy</span>`);
          assert.strictEqual(host.getAttribute('data-scrapbook-shadowdom'), `\
<style>slot { display: block; } ::slotted(*) { background-color: yellow; }</style>\
<slot data-scrapbook-slot-assigned="0,1">default missing</slot>\
<slot name="person" data-scrapbook-slot-assigned="2,3">person missing</slot>`);
        });

        $it.skipIf($.noShadowRootSlotAssignment)('should record with shared map for multiple <slot>s', async function () {
          var doc = createDocFixture({
            name: 'body', children: [
            {
              name: 'div',
              id: 'd1',
              children: [
                {name: 'span', value: 'Default'},
              ],
              shadow: {
                slotAssignment: 'manual',
                children: [
                  {name: 'slot', value: 'default missing'},
                ],
              },
            },
            {
              name: 'div',
              id: 'd2',
              children: [
                {name: 'span', value: 'Mr. Apple'},
              ],
              shadow: {
                slotAssignment: 'manual',
                children: [
                  {name: 'slot', value: 'person missing'},
                ],
              },
            },
          ]});
          slotAssign(doc.querySelector('#d1').shadowRoot.querySelector('slot'), doc.querySelector('#d1 span'));
          slotAssign(doc.querySelector('#d2').shadowRoot.querySelector('slot'), doc.querySelector('#d2 span'));
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var host = doc.querySelector('#d1');
          assert.strictEqual(host.innerHTML, '<span data-scrapbook-slot-index="0">Default</span>');
          assert.strictEqual(host.getAttribute('data-scrapbook-shadowdom'), '<slot data-scrapbook-slot-assigned="0">default missing</slot>');

          var host = doc.querySelector('#d2');
          assert.strictEqual(host.innerHTML, '<span data-scrapbook-slot-index="1">Mr. Apple</span>');
          assert.strictEqual(host.getAttribute('data-scrapbook-shadowdom'), '<slot data-scrapbook-slot-assigned="1">person missing</slot>');
        });

        $it.skipIf($.noShadowRootSlotAssignment)('should clear obsolete attributes for <slot>', async function () {
          var doc = createDocFixture({
            name: 'div',
            children: [
              {name: 'span', attrs: {'data-scrapbook-slot-index': '0'}, value: 'Default'},
              {name: 'span', value: 'Default2'},
              {name: '#comment', value: 'scrapbook-slot-index=1'},
              {name: '#text', value: 'Default3'},
              {name: '#comment', value: '/scrapbook-slot-index'},
              {name: 'span', attrs: {'slot': 'person', 'data-scrapbook-slot-index': '2'}, value: 'Mr. Apple'},
              {name: 'span', attrs: {'slot': 'person', 'data-scrapbook-slot-index': '3'}, value: 'Mr. Black'},
              {name: 'span', attrs: {'slot': 'person'}, value: 'Ms. Cindy'},
            ],
            shadow: {
              slotAssignment: 'manual',
              children: [
                {name: 'style', value: 'slot { display: block; } ::slotted(*) { background-color: yellow; }'},
                {name: 'slot', attrs: {'data-scrapbook-slot-assigned': '0,1'}, value: 'default missing'},
                {name: 'slot', attrs: {'name': 'person', 'data-scrapbook-slot-assigned': '2,3'}, value: 'person missing'},
              ],
            },
          });
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var host = doc.querySelector('div');
          assert.strictEqual(host.innerHTML, `\
<span>Default</span>\
<span>Default2</span>\
Default3\
<span slot="person">Mr. Apple</span>\
<span slot="person">Mr. Black</span>\
<span slot="person">Ms. Cindy</span>`);
          assert.strictEqual(host.getAttribute('data-scrapbook-shadowdom'), `\
<style>slot { display: block; } ::slotted(*) { background-color: yellow; }</style>\
<slot>default missing</slot>\
<slot name="person">person missing</slot>`);
        });

        it('should keep attributes for <slot> if `slotAssignment` != "manual"', async function () {
          var doc = createDocFixture({
            name: 'div',
            children: [
              {name: 'span', attrs: {'data-scrapbook-slot-index': '0'}, value: 'Default'},
              {name: 'span', value: 'Default2'},
              {name: '#comment', value: 'scrapbook-slot-index=1'},
              {name: '#text', value: 'Default3'},
              {name: '#comment', value: '/scrapbook-slot-index'},
              {name: 'span', attrs: {'slot': 'person', 'data-scrapbook-slot-index': '2'}, value: 'Mr. Apple'},
              {name: 'span', attrs: {'slot': 'person', 'data-scrapbook-slot-index': '3'}, value: 'Mr. Black'},
              {name: 'span', attrs: {'slot': 'person'}, value: 'Ms. Cindy'},
            ],
            shadow: {
              children: [
                {name: 'style', value: 'slot { display: block; } ::slotted(*) { background-color: yellow; }'},
                {name: 'slot', attrs: {'data-scrapbook-slot-assigned': '0,1'}, value: 'default missing'},
                {name: 'slot', attrs: {'name': 'person', 'data-scrapbook-slot-assigned': '2,3'}, value: 'person missing'},
              ],
            },
          });
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var host = doc.querySelector('div');
          assert.strictEqual(host.innerHTML, `\
<span data-scrapbook-slot-index="0">Default</span>\
<span>Default2</span>\
<!--scrapbook-slot-index=1-->Default3<!--/scrapbook-slot-index-->\
<span slot="person" data-scrapbook-slot-index="2">Mr. Apple</span>\
<span slot="person" data-scrapbook-slot-index="3">Mr. Black</span>\
<span slot="person">Ms. Cindy</span>`);
          assert.strictEqual(host.getAttribute('data-scrapbook-shadowdom'), `\
<style>slot { display: block; } ::slotted(*) { background-color: yellow; }</style>\
<slot data-scrapbook-slot-assigned="0,1">default missing</slot>\
<slot name="person" data-scrapbook-slot-assigned="2,3">person missing</slot>`);
        });
      });

      context('<canvas> handling', function () {
        it('should record properties for <canvas>', async function () {
          var spy = sinon.spy(TestCapturer.prototype, "preSaveProcess");

          var {contentDocument: doc} = await createIframeFixture({docData: {name: 'canvas', attrs: {width: 320, height: 240}}});
          var elem = doc.querySelector('canvas');
          var ctx = elem.getContext("2d");
          ctx.fillStyle = "#00FF00";
          ctx.fillRect(0, 0, 100, 75);
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var elem = doc.querySelector('canvas');
          assert.match(elem.getAttribute('data-scrapbook-canvas'), rawRegex`${'^'}data:image/png;base64,`);

          sinon.assert.calledWithMatch(spy, {
            requireBasicLoader: true,
          });
        });

        it('should remove obsolete canvas attributes', async function () {
          var spy = sinon.spy(TestCapturer.prototype, "preSaveProcess");

          var doc = createDocFixture({name: 'canvas', attrs: {
            'data-scrapbook-canvas': 'data:image/png,aaa',
          }});
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var attrs = getAttributes(doc.querySelector('canvas'));
          assert.deepEqual(attrs, {});

          sinon.assert.calledWithMatch(spy, {
            requireBasicLoader: false,
          });
        });
      });

      context('form status handling', function () {
        it('should record properties for <input>', async function () {
          var spy = sinon.spy(TestCapturer.prototype, "preSaveProcess");

          var doc = createDocFixture({name: 'input'});
          var elem = doc.querySelector('input');
          elem.value = 'foo';
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var attrs = getAttributes(doc.querySelector('input'));
          assert.deepEqual(attrs, {value: 'foo'});

          sinon.assert.calledWithMatch(spy, {
            requireBasicLoader: false,
          });
        });

        it('should record properties for <input type="radio">', async function () {
          var spy = sinon.spy(TestCapturer.prototype, "preSaveProcess");

          var doc = createDocFixture({name: 'input', attrs: {type: 'radio'}});
          var elem = doc.querySelector('input');
          elem.checked = true;
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var attrs = getAttributes(doc.querySelector('input'));
          assert.deepEqual(attrs, {type: 'radio', checked: ''});

          sinon.assert.calledWithMatch(spy, {
            requireBasicLoader: false,
          });
        });

        it('should record properties for <input type="checkbox">', async function () {
          var spy = sinon.spy(TestCapturer.prototype, "preSaveProcess");

          var doc = createDocFixture({name: 'input', attrs: {type: 'checkbox'}});
          var elem = doc.querySelector('input');
          elem.checked = true;
          elem.indeterminate = true;
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var attrs = getAttributes(doc.querySelector('input'));
          assert.deepEqual(attrs, {
            'type': 'checkbox',
            'checked': '',
            'data-scrapbook-input-indeterminate': '',
          });

          sinon.assert.calledWithMatch(spy, {
            requireBasicLoader: true,
          });
        });

        it('should not record properties for <input type="password">', async function () {
          var spy = sinon.spy(TestCapturer.prototype, "preSaveProcess");

          var doc = createDocFixture({name: 'input', attrs: {type: 'password'}});
          var elem = doc.querySelector('input');
          elem.value = 'foo';
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var attrs = getAttributes(doc.querySelector('input'));
          assert.deepEqual(attrs, {type: 'password'});

          sinon.assert.calledWithMatch(spy, {
            requireBasicLoader: false,
          });
        });

        it('should record properties for <textarea>', async function () {
          var spy = sinon.spy(TestCapturer.prototype, "preSaveProcess");

          var doc = createDocFixture({name: 'textarea'});
          var elem = doc.querySelector('textarea');
          elem.value = 'foo';
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var elem = doc.querySelector('textarea');
          assert.strictEqual(elem.textContent, 'foo');
          assert.deepEqual(getAttributes(elem), {});

          sinon.assert.calledWithMatch(spy, {
            requireBasicLoader: false,
          });
        });

        it('should record properties for <option>', async function () {
          var spy = sinon.spy(TestCapturer.prototype, "preSaveProcess");

          var doc = createDocFixture({name: 'option'});
          var elem = doc.querySelector('option');
          elem.selected = true;
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          var attrs = getAttributes(doc.querySelector('option'));
          assert.deepEqual(attrs, {selected: ''});

          sinon.assert.calledWithMatch(spy, {
            requireBasicLoader: false,
          });
        });
      });

      context('internalize handling', function () {
        const REGEX_UUID = /urn:scrapbook:url:([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})/;
        const REGEX_SRCSET = rawRegex`${REGEX_UUID} 2x, ${REGEX_UUID} 3x`;

        it('should rewrite resource elements', async function () {
          var doc = createDocFixture({name: 'body', children: [
            {name: 'img', attrs: {src: 'https://example.com/img.png'}},
            {name: 'img', attrs: {srcset: 'https://example.com/img-2x.png 2x, https://example.com/img-3x.png 3x'}},
            {name: 'input', attrs: {type: 'image', src: 'https://example.com/input.png'}},
            {name: 'picture', children: [
              {name: 'source', attrs: {srcset: 'https://example.com/picture-2x.png 2x, https://example.com/picture-3x.png 3x'}},
            ]},
            {name: 'audio', attrs: {src: 'https://example.com/audio.oga'}},
            {name: 'audio', children: [
              {name: 'source', attrs: {src: 'https://example.com/audio-source.oga'}},
              {name: 'track', attrs: {src: 'https://example.com/audio.vtt'}},
            ]},
            {name: 'video', attrs: {src: 'https://example.com/video.ogv', poster: 'https://example.com/video.jpg'}},
            {name: 'video', children: [
              {name: 'source', attrs: {src: 'https://example.com/video-source.ogv'}},
              {name: 'track', attrs: {src: 'https://example.com/video.vtt'}},
            ]},
          ]});
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
            internalize: true,
          });

          var {[docUrl]: {blob, resources}} = response;
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(blob));

          var m = doc.querySelector('img[src]').getAttribute('src').match(REGEX_UUID);
          assert.strictEqual(resources[m[1]], 'https://example.com/img.png');

          var m = doc.querySelector('img[srcset]').getAttribute('srcset').match(REGEX_SRCSET);
          assert.strictEqual(resources[m[1]], 'https://example.com/img-2x.png');
          assert.strictEqual(resources[m[2]], 'https://example.com/img-3x.png');

          var m = doc.querySelector('input[type="image"]').getAttribute('src').match(REGEX_UUID);
          assert.strictEqual(resources[m[1]], 'https://example.com/input.png');

          var m = doc.querySelector('picture source').getAttribute('srcset').match(REGEX_SRCSET);
          assert.strictEqual(resources[m[1]], 'https://example.com/picture-2x.png');
          assert.strictEqual(resources[m[2]], 'https://example.com/picture-3x.png');

          var m = doc.querySelector('audio[src]').getAttribute('src').match(REGEX_UUID);
          assert.strictEqual(resources[m[1]], 'https://example.com/audio.oga');

          var m = doc.querySelector('audio source').getAttribute('src').match(REGEX_UUID);
          assert.strictEqual(resources[m[1]], 'https://example.com/audio-source.oga');

          var m = doc.querySelector('audio track').getAttribute('src').match(REGEX_UUID);
          assert.strictEqual(resources[m[1]], 'https://example.com/audio.vtt');

          var m = doc.querySelector('video[src]').getAttribute('src').match(REGEX_UUID);
          assert.strictEqual(resources[m[1]], 'https://example.com/video.ogv');

          var m = doc.querySelector('video[src]').getAttribute('poster').match(REGEX_UUID);
          assert.strictEqual(resources[m[1]], 'https://example.com/video.jpg');

          var m = doc.querySelector('video source').getAttribute('src').match(REGEX_UUID);
          assert.strictEqual(resources[m[1]], 'https://example.com/video-source.ogv');

          var m = doc.querySelector('video track').getAttribute('src').match(REGEX_UUID);
          assert.strictEqual(resources[m[1]], 'https://example.com/video.vtt');
        });

        it('should not rewrite resource elements when `internalize` is not set', async function () {
          var doc = createDocFixture({name: 'body', children: [
            {name: 'img', attrs: {src: 'https://example.com/img.png'}},
            {name: 'img', attrs: {srcset: 'https://example.com/img-2x.png 2x, https://example.com/img-3x.png 3x'}},
            {name: 'input', attrs: {type: 'image', src: 'https://example.com/input.png'}},
            {name: 'picture', children: [
              {name: 'source', attrs: {srcset: 'https://example.com/picture-2x.png 2x, https://example.com/picture-3x.png 3x'}},
            ]},
            {name: 'audio', attrs: {src: 'https://example.com/audio.oga'}},
            {name: 'audio', children: [
              {name: 'source', attrs: {src: 'https://example.com/audio-source.oga'}},
              {name: 'track', attrs: {src: 'https://example.com/audio.vtt'}},
            ]},
            {name: 'video', attrs: {src: 'https://example.com/video.ogv', poster: 'https://example.com/video.jpg'}},
            {name: 'video', children: [
              {name: 'source', attrs: {src: 'https://example.com/video-source.ogv'}},
              {name: 'track', attrs: {src: 'https://example.com/video.vtt'}},
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

          var {[docUrl]: {blob, resources}} = response;
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(blob));

          assert.strictEqual(
            doc.querySelector('img[src]').getAttribute('src'),
            'https://example.com/img.png',
          );
          assert.strictEqual(
            doc.querySelector('img[srcset]').getAttribute('srcset'),
            'https://example.com/img-2x.png 2x, https://example.com/img-3x.png 3x',
          );
          assert.strictEqual(
            doc.querySelector('input[type="image"]').getAttribute('src'),
            'https://example.com/input.png',
          );
          assert.strictEqual(
            doc.querySelector('picture source').getAttribute('srcset'),
            'https://example.com/picture-2x.png 2x, https://example.com/picture-3x.png 3x',
          );
          assert.strictEqual(
            doc.querySelector('audio[src]').getAttribute('src'),
            'https://example.com/audio.oga',
          );
          assert.strictEqual(
            doc.querySelector('audio source').getAttribute('src'),
            'https://example.com/audio-source.oga',
          );
          assert.strictEqual(
            doc.querySelector('audio track').getAttribute('src'),
            'https://example.com/audio.vtt',
          );
          assert.strictEqual(
            doc.querySelector('video[src]').getAttribute('src'),
            'https://example.com/video.ogv',
          );
          assert.strictEqual(
            doc.querySelector('video[src]').getAttribute('poster'),
            'https://example.com/video.jpg',
          );
          assert.strictEqual(
            doc.querySelector('video source').getAttribute('src'),
            'https://example.com/video-source.ogv',
          );
          assert.strictEqual(
            doc.querySelector('video track').getAttribute('src'),
            'https://example.com/video.vtt',
          );
        });

        it('should rewrite resource elements in shadow DOMs', async function () {
          var doc = createDocFixture({name: 'body', children: [
            {name: 'div', shadow: {children: [
              {name: 'img', attrs: {src: 'https://example.com/img.png'}},
            ]}},
          ]});
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
            internalize: true,
          });

          var {[docUrl]: {blob, resources}} = response;
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(blob));

          var html = doc.querySelector('div').getAttribute('data-scrapbook-shadowdom');
          var shadow = createFragFixture(html);

          var m = shadow.querySelector('img[src]').getAttribute('src').match(REGEX_UUID);
          assert.strictEqual(resources[m[1]], 'https://example.com/img.png');
        });
      });

      context('<noscript> handling', function () {
        async function docFactory() {
          const _doc = createDocFixture({name: 'noscript', children: [
            {name: 'blockquote', attrs: {'data-scrapbook-elem': 'title'}, value: 'foo'},
            {name: 'blockquote', attrs: {'data-scrapbook-elem': 'title'}, value: 'bar'},
          ]});
          const blob = new Blob([utils.documentToString(_doc)], {type: _doc.contentType});
          const src = URL.createObjectURL(blob);
          const {contentDocument: doc} = await createIframeFixture({src});
          URL.revokeObjectURL(src);

          // When JavaScript is enabled (which is always the case in an extension page),
          // noscript content is loaded as text by the browser.
          assert.lengthOf(doc.querySelector('noscript').childNodes, 1);

          return doc;
        }

        it('should rewrite <noscript> contents', async function () {
          var doc = await docFactory();
          sinon.stub(doc, 'URL').value(docUrl);

          var capturer = new TestCapturer();
          var response = await capturer.retrieveDocumentContent({
            doc,
            isMainPage: true,
            item,
            options,
          });
          var doc = await utils.readFileAsDocument(await capturer.loadBlobCache(response[docUrl].blob));

          assert.strictEqual(doc.querySelectorAll('noscript blockquote')[0].textContent, 'My Title');
          assert.strictEqual(doc.querySelectorAll('noscript blockquote')[1].textContent, 'My Title');
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
