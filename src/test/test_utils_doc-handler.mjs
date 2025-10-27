import {
  MochaQuery as $, assert,
  getAttributes,
  createDomFixture, createNodeFixture, createDocFixture, createIframeFixture,
} from "./unittest.mjs";
import sinon from "./lib/sinon-esm.js";
import {NS_XMLNS, NS_HTML, NS_SVG, NS_XLINK, NS_MATHML} from "../utils/common.mjs";
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

    describe('#captureRecordAddedNode()', function () {
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
