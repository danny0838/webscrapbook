import {
  MochaQuery as $, assert,
  getAttributes,
  createDocFixture, createIframeFixture,
} from "./unittest.mjs";
import sinon from "./lib/sinon-esm.js";
import * as utils from "../utils/common.mjs";
import {DocumentCloner} from "../utils/doc-cloner.mjs";

import {
  BaseDocumentRewriter,
  DocumentRewriter,
  MapperMixin,
} from "../utils/doc-handler.mjs";

const $describe = $(describe);

describe('utils/doc-handler.mjs', function () {
  afterEach(function () {
    sinon.restore();

    for (const elem of document.querySelectorAll('iframe')) {
      elem.remove();
    }
  });

  $describe.skipIf($.noBrowser)('BaseDocumentRewriter', function () {
    describe('.run()', function () {
      it('should return a new instance of the same class', function () {
        var stub = sinon.stub(BaseDocumentRewriter.prototype, "run").returns(true);

        var doc = createDocFixture();

        var rewriter1 = BaseDocumentRewriter.run(doc);
        assert.instanceOf(rewriter1, BaseDocumentRewriter);

        var rewriter2 = BaseDocumentRewriter.run(123, 456);
        assert.instanceOf(rewriter2, BaseDocumentRewriter);

        assert.notStrictEqual(rewriter1, rewriter2);

        class SubClass extends BaseDocumentRewriter {}

        var rewriter3 = SubClass.run();
        assert.instanceOf(rewriter3, SubClass);
      });

      it('should call `run` on the new instance with passed arguments', function () {
        var stub = sinon.stub(BaseDocumentRewriter.prototype, "run");

        var doc = createDocFixture();

        BaseDocumentRewriter.run(doc);
        sinon.assert.calledOnce(stub);
        assert.deepEqual(stub.lastCall.args, [doc]);

        BaseDocumentRewriter.run(doc, {key1: "value1", key2: "value2"});
        sinon.assert.calledTwice(stub);
        assert.deepEqual(stub.lastCall.args, [doc, {key1: "value1", key2: "value2"}]);

        BaseDocumentRewriter.run();
        sinon.assert.calledThrice(stub);
        assert.deepEqual(stub.lastCall.args, []);
      });
    });
  });

  $describe.skipIf($.noBrowser)('MapperMixin', function () {
    const MappedDocumentRewriter = MapperMixin(BaseDocumentRewriter);

    describe('.runWithClone()', function () {
      it('should call base class with a cloned document and options', function () {
        var spy = sinon.spy(BaseDocumentRewriter, "run");
        var stub = sinon.stub(BaseDocumentRewriter.prototype, "processRootNode");

        var doc = new createDocFixture({code: 'dummy'});
        MappedDocumentRewriter.runWithClone(doc, {key1: "value1"});

        sinon.assert.calledOnce(spy);
        assert.strictEqual(spy.lastCall.args[0].body.textContent, 'dummy');
        assert.notStrictEqual(spy.lastCall.args[0], doc);
        assert.instanceOf(spy.lastCall.args[1].origNodeMap, WeakMap);
        assert.instanceOf(spy.lastCall.args[1].clonedNodeMap, WeakMap);
        assert.strictEqual(spy.lastCall.args[1].key1, "value1");
      });

      it('should ignore passed `origNodeMap`/`clonedNodeMap`/`includeShadowDom` options', function () {
        var stub = sinon.stub(BaseDocumentRewriter, "run");

        var doc = createDocFixture();
        MappedDocumentRewriter.runWithClone(doc, {origNodeMap: 1, clonedNodeMap: 2, includeShadowDom: 3});

        assert.instanceOf(stub.lastCall.args[1].origNodeMap, WeakMap);
        assert.instanceOf(stub.lastCall.args[1].clonedNodeMap, WeakMap);
        assert.isUndefined(stub.lastCall.args[1].includeShadowDom);
      });

      it('should clone with passed `includeShadowDom` option', function () {
        var spy = sinon.spy(MappedDocumentRewriter, "clone");
        var stub = sinon.stub(BaseDocumentRewriter, "run");

        var doc = createDocFixture();
        MappedDocumentRewriter.runWithClone(doc, {includeShadowDom: true, key1: "value1"});

        sinon.assert.calledOnce(spy);
        assert.deepEqual(spy.lastCall.args, [doc, {includeShadowDom: true}]);
      });
    });

    describe('.clone()', function () {
      it('should call `DocumentCloner.clone` and return document and maps', function () {
        var spy = sinon.spy(DocumentCloner, "clone");

        var doc = new createDocFixture({code: 'dummy'});
        var result = MappedDocumentRewriter.clone(doc, {includeShadowDom: true});
        sinon.assert.calledOnce(spy);
        assert.strictEqual(spy.lastCall.args[0], doc);
        assert.instanceOf(spy.lastCall.args[1].origNodeMap, WeakMap);
        assert.instanceOf(spy.lastCall.args[1].clonedNodeMap, WeakMap);
        assert.strictEqual(spy.lastCall.args[1].includeShadowDom, true);

        assert.strictEqual(result.newDoc.body.textContent, 'dummy');
        assert.strictEqual(result.origNodeMap, spy.lastCall.args[1].origNodeMap);
        assert.strictEqual(result.clonedNodeMap, spy.lastCall.args[1].clonedNodeMap);

        var doc = new createDocFixture({code: 'dummy'});
        var result = MappedDocumentRewriter.clone(doc, {includeShadowDom: false});
        sinon.assert.calledTwice(spy);
        assert.strictEqual(spy.lastCall.args[0], doc);
        assert.instanceOf(spy.lastCall.args[1].origNodeMap, WeakMap);
        assert.instanceOf(spy.lastCall.args[1].clonedNodeMap, WeakMap);
        assert.strictEqual(spy.lastCall.args[1].includeShadowDom, false);

        assert.strictEqual(result.newDoc.body.textContent, 'dummy');
        assert.strictEqual(result.origNodeMap, spy.lastCall.args[1].origNodeMap);
        assert.strictEqual(result.clonedNodeMap, spy.lastCall.args[1].clonedNodeMap);
      });
    });

    describe('#getOrigNode()', function () {
      it('should return the node mapped by `origNodeMap`', function () {
        var stub = sinon.stub(BaseDocumentRewriter.prototype, "processRootNode");

        var doc = createDocFixture({code: '<b>foo</b><i>bar</i>'});
        var nodeOrig = doc.querySelector('b');
        var nodeCloned = nodeOrig.cloneNode();
        var origNodeMap = new WeakMap([[nodeOrig, nodeCloned]]);
        var rewriter = new MappedDocumentRewriter();
        rewriter.run(doc, {origNodeMap});

        assert.isDefined(rewriter.origNodeMap);
        assert.strictEqual(rewriter.getOrigNode(nodeOrig), nodeCloned);
        assert.isUndefined(rewriter.getOrigNode(nodeCloned));
      });

      it('should return undefined if no `origNodeMap`', function () {
        var stub = sinon.stub(BaseDocumentRewriter.prototype, "processRootNode");

        var doc = createDocFixture({code: '<b>foo</b><i>bar</i>'});
        var nodeOrig = doc.querySelector('b');
        var rewriter = new MappedDocumentRewriter();
        rewriter.run(doc);

        assert.isUndefined(rewriter.origNodeMap);
        assert.isUndefined(rewriter.getOrigNode(nodeOrig));
      });
    });

    describe('#getClonedNode()', function () {
      it('should return the node mapped by `clonedNodeMap`', function () {
        var stub = sinon.stub(BaseDocumentRewriter.prototype, "processRootNode");

        var doc = createDocFixture({code: '<b>foo</b><i>bar</i>'});
        var nodeOrig = doc.querySelector('b');
        var nodeCloned = nodeOrig.cloneNode();
        var clonedNodeMap = new WeakMap([[nodeCloned, nodeOrig]]);
        var rewriter = new MappedDocumentRewriter();
        rewriter.run(doc, {clonedNodeMap});

        assert.isDefined(rewriter.clonedNodeMap);
        assert.strictEqual(rewriter.getClonedNode(nodeCloned), nodeOrig);
        assert.isUndefined(rewriter.getClonedNode(nodeOrig));
      });

      it('should return undefined if no `clonedNodeMap`', function () {
        var stub = sinon.stub(BaseDocumentRewriter.prototype, "processRootNode");

        var doc = createDocFixture({code: '<b>foo</b><i>bar</i>'});
        var nodeOrig = doc.querySelector('b');
        var nodeCloned = nodeOrig.cloneNode();
        var rewriter = new MappedDocumentRewriter();
        rewriter.run(doc);

        assert.isUndefined(rewriter.clonedNodeMap);
        assert.isUndefined(rewriter.getClonedNode(nodeCloned));
      });
    });

    describe('#origDoc (getter)', function () {
      it('should return the document mapped by `origNodeMap`', function () {
        var stub = sinon.stub(BaseDocumentRewriter.prototype, "processRootNode");

        var doc = createDocFixture();
        var rewriter = MappedDocumentRewriter.runWithClone(doc);

        assert.isDefined(rewriter.origNodeMap);
        assert.strictEqual(rewriter.origDoc, doc);
        assert.notStrictEqual(rewriter.doc, doc);
        assert.strictEqual(rewriter.origNodeMap.get(rewriter.doc), doc);
      });

      it('should return the input document if no `origNodeMap`', function () {
        var stub = sinon.stub(BaseDocumentRewriter.prototype, "processRootNode");

        var doc = createDocFixture();
        var rewriter = MappedDocumentRewriter.run(doc);

        assert.isUndefined(rewriter.origNodeMap);
        assert.strictEqual(rewriter.origDoc, doc);
        assert.strictEqual(rewriter.doc, doc);
      });
    });
  });

  $describe.skipIf($.noBrowser)('DocumentRewriter', function () {
    let rewriter;
    let timeId;

    beforeEach(function () {
      rewriter = new DocumentRewriter();
      timeId = utils.dateToId();
    });

    describe('#htmlify()', function () {
      it('should record shadow DOMs recursively', function () {
        var doc = createDocFixture({name: 'div', shadow: {
          mode: 'closed',
          children: [
            {name: 'div', shadow: {
              children: [
                {name: 'span', attrs: {title: 'span title'}, value: 'text'},
              ],
            }},
          ],
        }});
        var elem = doc.querySelector('div');

        rewriter.htmlify(elem);
        assert.deepEqual(getAttributes(elem), {
          'data-scrapbook-shadowdom': '<div data-scrapbook-shadowdom="&lt;span title=&quot;span title&quot;&gt;text&lt;/span&gt;"></div>',
          'data-scrapbook-shadowdom-mode': 'closed',
        });
      });

      it('should record adoptedStyleSheets', async function () {
        var {contentDocument: doc} = await createIframeFixture({
          docData: {
            name: 'div',
            shadow: {},
          },
          onload: function ({target: {contentWindow: win, contentDocument: doc}}) {
            var shadow = doc.querySelector('div').shadowRoot;

            var css = new win.CSSStyleSheet();
            css.insertRule('#s1 { color: red; }', css.cssRules.length);
            css.insertRule('#s2 { color: green; }', css.cssRules.length);
            shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, css];

            var css = new win.CSSStyleSheet();
            css.insertRule('#s1 { background-color: green; }', css.cssRules.length);
            css.insertRule('#s2 { background-color: blue; }', css.cssRules.length);
            shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, css];
          },
        });
        var elem = doc.querySelector('div');

        rewriter.htmlify(elem);
        assert.deepEqual(getAttributes(elem), {
          'data-scrapbook-adoptedstylesheets': '0,1',
          'data-scrapbook-adoptedstylesheet-0': ['#s1 { color: red; }', '#s2 { color: green; }'].join('\n\n'),
          'data-scrapbook-adoptedstylesheet-1': ['#s1 { background-color: green; }', '#s2 { background-color: blue; }'].join('\n\n'),
          'data-scrapbook-shadowdom': '',
        });
      });

      it('should remove previously recorded adoptedStyleSheets', async function () {
        var {contentDocument: doc} = await createIframeFixture({
          docData: {
            name: 'div',
            attrs: {
              'data-scrapbook-adoptedstylesheets': '0,1,2',
              'data-scrapbook-adoptedstylesheet-0': '#s1 { color: red; }',
              'data-scrapbook-adoptedstylesheet-1': '#s2 { color: green; }',
              'data-scrapbook-adoptedstylesheet-2': '#s3 { color: blue; }',
            },
            shadow: {},
          },
        });
        var elem = doc.querySelector('div');

        rewriter.htmlify(elem);
        assert.deepEqual(getAttributes(elem), {
          'data-scrapbook-shadowdom': '',
        });
      });
    });

    describe('#unhtmlify()', function () {
      it('should recover shadow DOMs recursively', function () {
        var doc = createDocFixture({name: 'div', attrs: {
          'data-scrapbook-shadowdom': '<div data-scrapbook-shadowdom="&lt;span title=&quot;span title&quot;&gt;text&lt;/span&gt;"></div>',
        }});
        var elem = doc.querySelector('div');

        rewriter.unhtmlify(elem);
        assert.strictEqual(elem.shadowRoot.innerHTML, '<div></div>');
        assert.strictEqual(elem.shadowRoot.querySelector('div').shadowRoot.innerHTML, '<span title="span title">text</span>');
      });

      it('should recover adoptedStyleSheets', async function () {
        var {contentDocument: doc} = await createIframeFixture({docData: {
          name: 'div',
          attrs: {
            'data-scrapbook-adoptedstylesheets': '0,1',
            'data-scrapbook-adoptedstylesheet-0': ['#s1 { color: red; }', '#s2 { color: green; }'].join('\n\n'),
            'data-scrapbook-adoptedstylesheet-1': ['#s1 { background-color: green; }', '#s2 { background-color: blue; }'].join('\n\n'),
            'data-scrapbook-shadowdom': '',
          },
        }});
        var elem = doc.querySelector('div');

        rewriter.unhtmlify(elem);
        var constructed = elem.shadowRoot.adoptedStyleSheets;
        assert.strictEqual(constructed[0].cssRules[0].cssText, '#s1 { color: red; }');
        assert.strictEqual(constructed[0].cssRules[1].cssText, '#s2 { color: green; }');
        assert.strictEqual(constructed[1].cssRules[0].cssText, '#s1 { background-color: green; }');
        assert.strictEqual(constructed[1].cssRules[1].cssText, '#s2 { background-color: blue; }');
      });
    });
  });
});
