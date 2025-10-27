import {
  MochaQuery as $, assert,
  GREEN_BMP_DATAURL,
  rawRegex, getAttributes, slotAssign,
  createFragFixture, createDomFixture, createNodeFixture, createDocFixture, createIframeFixture,
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
const $it = $(it);

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

    describe('#eraseRange()', function () {
      it('should convert range to comment', function () {
        var spy = sinon.spy(DocumentRewriter.prototype, "htmlify");

        var doc = createDocFixture({name: 'body', children: [
          {name: 'div', id: 'd1', children: [
            {name: 'span', id: 's1-1', value: 'text'},
            {name: 'span', id: 's1-2', value: 'text'},
            {name: 'span', id: 's1-3', value: 'text'},
          ]},
        ]});
        var span1 = doc.querySelector('#s1-1');
        var span2 = doc.querySelector('#s1-2');
        var span3 = doc.querySelector('#s1-3');

        var range = doc.createRange();
        range.setStartBefore(span1);
        range.setEndAfter(span2);
        rewriter.eraseRange(range, {timeId});
        assert.strictEqual(doc.body.innerHTML, `<div id="d1"><!--scrapbook-erased-${timeId}=<span id="s1-1">text</span><span id="s1-2">text</span>--><span id="s1-3">text</span></div>`);

        var wrapper = span1.parentNode;
        assert.deepEqual(Array.from(wrapper.childNodes), [span1, span2]);
        sinon.assert.calledOnceWithExactly(spy, wrapper);
      });

      it('should build maps for the erased content and generated comment', function () {
        var spy = sinon.spy(DocumentRewriter.prototype, "htmlify");

        var doc = createDocFixture({name: 'body', children: [
          {name: 'div', id: 'd1', children: [
            {name: 'span', id: 's1-1', value: 'text'},
            {name: 'span', id: 's1-2', value: 'text'},
            {name: 'span', id: 's1-3', value: 'text'},
          ]},
        ]});
        var span1 = doc.querySelector('#s1-1');
        var span2 = doc.querySelector('#s1-2');
        var span3 = doc.querySelector('#s1-3');

        var mapWrapperToComment = new Map();
        var mapCommentToWrapper = new Map();
        var range = doc.createRange();
        range.setStartBefore(span1);
        range.setEndAfter(span2);
        rewriter.eraseRange(range, {timeId, mapWrapperToComment, mapCommentToWrapper});
        assert.strictEqual(doc.body.innerHTML, `<div id="d1"><!--scrapbook-erased-${timeId}=<span id="s1-1">text</span><span id="s1-2">text</span>--><span id="s1-3">text</span></div>`);

        var wrapper = span1.parentNode;
        var comment = Array.prototype.find.call(doc.querySelector('div').childNodes, x => x.nodeType === Node.COMMENT_NODE);
        assert.strictEqual(mapWrapperToComment.get(wrapper), comment);
        assert.strictEqual(mapCommentToWrapper.get(comment), wrapper);
        assert.deepEqual(Array.from(wrapper.childNodes), [span1, span2]);
        sinon.assert.calledOnceWithExactly(spy, wrapper);
      });

      it('should escape special chars in the generated comment', function () {
        var doc = createDocFixture({name: 'body', innerHTML: 'foo <!--test--> bar'});
        var range = doc.createRange();
        range.selectNodeContents(doc.body);
        rewriter.eraseRange(range, {timeId});
        assert.strictEqual(doc.body.innerHTML, `<!--scrapbook-erased-${timeId}=foo <!-\u200B-test-\u200B-> bar-->`);
      });
    });

    describe('#eraseNode()', function () {
      it('should convert node to comment', function () {
        var spy = sinon.spy(DocumentRewriter.prototype, "htmlify");

        var doc = createDocFixture({name: 'div', attrs: {id: 'myid'}, children: [
          {name: 'span', value: 'text1'},
          {name: 'span', value: 'text2'},
        ]});
        var elem = doc.querySelector('div');

        rewriter.eraseNode(elem, {timeId});
        assert.strictEqual(doc.body.innerHTML, `<!--scrapbook-erased-${timeId}=<div id="myid"><span>text1</span><span>text2</span></div>-->`);

        var wrapper = elem.parentNode;
        assert.deepEqual(Array.from(wrapper.childNodes), [elem]);
        sinon.assert.calledOnceWithExactly(spy, wrapper);
      });

      it('should build maps for the erased content and generated comment', function () {
        var spy = sinon.spy(DocumentRewriter.prototype, "htmlify");

        var doc = createDocFixture({name: 'div', attrs: {id: 'myid'}, children: [
          {name: 'span', value: 'text1'},
          {name: 'span', value: 'text2'},
        ]});
        var elem = doc.querySelector('div');

        var mapWrapperToComment = new Map();
        var mapCommentToWrapper = new Map();
        rewriter.eraseNode(elem, {timeId, mapWrapperToComment, mapCommentToWrapper});
        assert.strictEqual(doc.body.innerHTML, `<!--scrapbook-erased-${timeId}=<div id="myid"><span>text1</span><span>text2</span></div>-->`);

        var wrapper = elem.parentNode;
        var comment = doc.body.firstChild;
        assert.strictEqual(mapWrapperToComment.get(wrapper), comment);
        assert.strictEqual(mapCommentToWrapper.get(comment), wrapper);
        assert.deepEqual(Array.from(wrapper.childNodes), [elem]);
        sinon.assert.calledOnceWithExactly(spy, wrapper);
      });

      it('should escape special chars in the generated comment', function () {
        var doc = createDocFixture({name: 'body', innerHTML: 'foo <!--test--> bar'});
        var range = doc.createRange();
        rewriter.eraseNode(doc.body.childNodes[1], {timeId});
        assert.strictEqual(doc.body.innerHTML, `foo <!--scrapbook-erased-${timeId}=<!-\u200B-test-\u200B->--> bar`);
      });
    });

    describe('#uneraseNode()', function () {
      it('should convert comment to node', function () {
        var spy = sinon.spy(DocumentRewriter.prototype, "_unhtmlify");

        var doc = createDocFixture({name: 'div', attrs: {id: 'myid'}, children: [
          {name: 'span', value: 'text1'},
          {name: 'span', value: 'text2'},
        ]});
        var elem = doc.querySelector('div');
        var span1 = elem.querySelectorAll('span')[0];
        var span2 = elem.querySelectorAll('span')[1];

        rewriter.eraseNode(elem, {timeId});
        rewriter.uneraseNode(doc.body.firstChild);
        assert.strictEqual(doc.body.innerHTML, '<div id="myid"><span>text1</span><span>text2</span></div>');

        assert.notStrictEqual(doc.querySelector('div'), elem);
        assert.notStrictEqual(doc.querySelectorAll('div span')[0], span1);
        assert.notStrictEqual(doc.querySelectorAll('div span')[1], span2);
        sinon.assert.calledWithExactly(spy, doc.querySelector('div'), {});
        sinon.assert.calledWithExactly(spy, doc.querySelectorAll('div span')[0], {});
        sinon.assert.calledWithExactly(spy, doc.querySelectorAll('div span')[1], {});
      });

      it('should convert comment to the mapped wrapper when exists', function () {
        var spy = sinon.spy(DocumentRewriter.prototype, "_unhtmlify");

        var doc = createDocFixture({name: 'div', attrs: {id: 'myid'}, children: [
          {name: 'span', value: 'text1'},
          {name: 'span', value: 'text2'},
        ]});
        var elem = doc.querySelector('div');
        var span1 = elem.querySelectorAll('span')[0];
        var span2 = elem.querySelectorAll('span')[1];

        var mapCommentToWrapper = new Map();
        rewriter.eraseNode(elem, {timeId, mapCommentToWrapper});
        rewriter.uneraseNode(doc.body.firstChild, {mapCommentToWrapper});
        assert.strictEqual(doc.body.innerHTML, '<div id="myid"><span>text1</span><span>text2</span></div>');

        assert.strictEqual(doc.querySelector('div'), elem);
        assert.strictEqual(doc.querySelectorAll('div span')[0], span1);
        assert.strictEqual(doc.querySelectorAll('div span')[1], span2);
        sinon.assert.calledWithExactly(spy, elem, {apply: false});
        sinon.assert.calledWithExactly(spy, span1, {apply: false});
        sinon.assert.calledWithExactly(spy, span2, {apply: false});
      });

      it('should normalize parent when `normalize` is not set', function () {
        var doc = createDocFixture({
          name: 'body',
          innerHTML: `foo <!--scrapbook-erased-${timeId}=bar <span id="myid">mytext</span> baz--> qux`,
        });
        var comment = Array.prototype.find.call(doc.body.childNodes, x => x.nodeType === Node.COMMENT_NODE);
        rewriter.uneraseNode(comment);
        assert.strictEqual(doc.body.innerHTML, 'foo bar <span id="myid">mytext</span> baz qux');
        assert.lengthOf(doc.body.childNodes, 3);
      });

      it('should normalize parent when `normalize` is truthy', function () {
        var doc = createDocFixture({
          name: 'body',
          innerHTML: `foo <!--scrapbook-erased-${timeId}=bar <span id="myid">mytext</span> baz--> qux`,
        });
        var comment = Array.prototype.find.call(doc.body.childNodes, x => x.nodeType === Node.COMMENT_NODE);
        rewriter.uneraseNode(comment, {normalize: true});
        assert.strictEqual(doc.body.innerHTML, 'foo bar <span id="myid">mytext</span> baz qux');
        assert.lengthOf(doc.body.childNodes, 3);
      });

      it('should not normalize parent when `normalize` is falsy', function () {
        var doc = createDocFixture({
          name: 'body',
          innerHTML: `foo <!--scrapbook-erased-${timeId}=bar <span id="myid">mytext</span> baz--> qux`,
        });
        var comment = Array.prototype.find.call(doc.body.childNodes, x => x.nodeType === Node.COMMENT_NODE);
        rewriter.uneraseNode(comment, {normalize: false});
        assert.strictEqual(doc.body.innerHTML, 'foo bar <span id="myid">mytext</span> baz qux');
        assert.lengthOf(doc.body.childNodes, 5);
      });

      it('should unescape special chars in the comment', function () {
        var doc = createDocFixture({name: 'body', innerHTML: '<!--scrapbook-erased-${timeId}=<!-\u200B-test-\u200B->-->'});
        rewriter.uneraseNode(doc.body.firstChild);
        assert.strictEqual(doc.body.innerHTML, `<!--test-->`);
      });
    });

    describe('#htmlify()', function () {
      context('shadow DOMs handling', function () {
        it('should record shadow DOMs recursively', function () {
          var spy = sinon.spy(DocumentRewriter.prototype, "htmlify");

          var doc = createDocFixture({name: 'div', shadow: {
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
          var {'data-scrapbook-shadowdom': html, ...attrs} = getAttributes(elem);
          assert.deepEqual(attrs, {});
          var shadow = createFragFixture(html);
          var {'data-scrapbook-shadowdom': html, ...attrs} = getAttributes(shadow.querySelector('div'));
          assert.deepEqual(attrs, {});
          assert.strictEqual(html, '<span title="span title">text</span>');

          var shadow1 = utils.getShadowRoot(elem);
          var shadow2 = utils.getShadowRoot(shadow1.querySelector('div'));
          sinon.assert.calledWithExactly(spy, shadow1, {});
          sinon.assert.calledWithExactly(spy, shadow2, {});
        });

        $it.skipIf($.noShadowRootClosed)('should work for closed shadow DOMs', function () {
          var spy = sinon.spy(DocumentRewriter.prototype, "htmlify");

          var doc = createDocFixture({name: 'div', shadow: {
            mode: 'closed',
            children: [{name: 'div'}],
          }});
          var elem = doc.querySelector('div');

          rewriter.htmlify(elem);
          var {'data-scrapbook-shadowdom': html, ...attrs} = getAttributes(elem);
          assert.deepEqual(attrs, {'data-scrapbook-shadowdom-mode': 'closed'});
          var shadow = createFragFixture(html);
          var attrs = getAttributes(shadow.querySelector('div'));
          assert.deepEqual(attrs, {});

          sinon.assert.calledWithExactly(spy, utils.getShadowRoot(elem), {});
        });

        $it.skipIf($.noShadowRootClonable)('should work for clonable shadow DOMs', function () {
          var spy = sinon.spy(DocumentRewriter.prototype, "htmlify");

          var doc = createDocFixture({name: 'div', shadow: {
            clonable: true,
            children: [{name: 'div'}],
          }});
          var elem = doc.querySelector('div');

          rewriter.htmlify(elem);
          var {'data-scrapbook-shadowdom': html, ...attrs} = getAttributes(elem);
          assert.deepEqual(attrs, {'data-scrapbook-shadowdom-clonable': ''});
          var shadow = createFragFixture(html);
          var attrs = getAttributes(shadow.querySelector('div'));
          assert.deepEqual(attrs, {});

          sinon.assert.calledWithExactly(spy, utils.getShadowRoot(elem), {});
        });

        $it.skipIf($.noShadowRootDelegatesFocus)('should handle `delegatesFocus` for shadow DOMs', function () {
          var spy = sinon.spy(DocumentRewriter.prototype, "htmlify");

          var doc = createDocFixture({name: 'div', shadow: {
            delegatesFocus: true,
            children: [{name: 'div'}],
          }});
          var elem = doc.querySelector('div');

          rewriter.htmlify(elem);
          var {'data-scrapbook-shadowdom': html, ...attrs} = getAttributes(elem);
          assert.deepEqual(attrs, {'data-scrapbook-shadowdom-delegates-focus': ''});
          var shadow = createFragFixture(html);
          var attrs = getAttributes(shadow.querySelector('div'));
          assert.deepEqual(attrs, {});

          sinon.assert.calledWithExactly(spy, utils.getShadowRoot(elem), {});
        });

        $it.skipIf($.noShadowRootSerializable)('should handle `serializable` for shadow DOMs', function () {
          var spy = sinon.spy(DocumentRewriter.prototype, "htmlify");

          var doc = createDocFixture({name: 'div', shadow: {
            serializable: true,
            children: [{name: 'div'}],
          }});
          var elem = doc.querySelector('div');

          rewriter.htmlify(elem);
          var {'data-scrapbook-shadowdom': html, ...attrs} = getAttributes(elem);
          assert.deepEqual(attrs, {'data-scrapbook-shadowdom-serializable': ''});
          var shadow = createFragFixture(html);
          var attrs = getAttributes(shadow.querySelector('div'));
          assert.deepEqual(attrs, {});

          sinon.assert.calledWithExactly(spy, utils.getShadowRoot(elem), {});
        });

        $it.skipIf($.noShadowRootSlotAssignment)('should handle `slotAssignment` for shadow DOMs', function () {
          var spy = sinon.spy(DocumentRewriter.prototype, "htmlify");

          var doc = createDocFixture({name: 'div', shadow: {
            slotAssignment: 'manual',
            children: [{name: 'div'}],
          }});
          var elem = doc.querySelector('div');

          rewriter.htmlify(elem);
          var {'data-scrapbook-shadowdom': html, ...attrs} = getAttributes(elem);
          assert.deepEqual(attrs, {'data-scrapbook-shadowdom-slot-assignment': 'manual'});
          var shadow = createFragFixture(html);
          var attrs = getAttributes(shadow.querySelector('div'));
          assert.deepEqual(attrs, {});

          sinon.assert.calledWithExactly(spy, utils.getShadowRoot(elem), {});
        });
      });

      context('constructed stylesheets handling', function () {
        $it.skipIf($.noAdoptedStylesheet)('should record constructed stylesheets', async function () {
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
          var elem = doc.querySelector('div');

          rewriter.htmlify(elem);
          assert.deepEqual(getAttributes(elem), {
            'data-scrapbook-adoptedstylesheets': '0,1',
            'data-scrapbook-adoptedstylesheet-0': ['#s1 { color: red; }', '#s2 { color: green; }'].join('\n\n'),
            'data-scrapbook-adoptedstylesheet-1': ['#s1 { background-color: green; }', '#s2 { background-color: blue; }'].join('\n\n'),
            'data-scrapbook-shadowdom': '',
          });
        });

        $it.skipIf($.noAdoptedStylesheet)('should record shared constructed stylesheets as separated entries', async function () {
          var {contentDocument: doc} = await createIframeFixture({
            docData: {name: 'div', shadow: {children: [
              {name: 'div', shadow: {}},
            ]}},
            onload: function ({target: {contentWindow: win, contentDocument: doc}}) {
              var css = new win.CSSStyleSheet();
              css.insertRule('#adopted1-1 { color: green; }', css.cssRules.length);
              css.insertRule('#adopted1-2 { color: yellow; }', css.cssRules.length);
              var css1 = css;

              var css = new win.CSSStyleSheet();
              css.insertRule('#adopted2-1 { color: red; }', css.cssRules.length);
              css.insertRule('#adopted2-2 { color: blue; }', css.cssRules.length);
              var css2 = css;

              var shadow = doc.querySelector('div').shadowRoot;
              shadow.adoptedStyleSheets = [css2];

              var shadow = shadow.querySelector('div').shadowRoot;
              shadow.adoptedStyleSheets = [css1, css2];
            },
          });
          var elem = doc.querySelector('div');

          rewriter.htmlify(elem);
          var {'data-scrapbook-shadowdom': html, ...attrs} = getAttributes(elem);
          assert.deepEqual(attrs, {
            'data-scrapbook-adoptedstylesheets': '0',
            'data-scrapbook-adoptedstylesheet-0': ['#adopted2-1 { color: red; }', '#adopted2-2 { color: blue; }'].join('\n\n'),
          });
          var shadow = createFragFixture(html);
          var {'data-scrapbook-shadowdom': html, ...attrs} = getAttributes(shadow.querySelector('div'));
          assert.deepEqual(attrs, {
            'data-scrapbook-adoptedstylesheets': '0,1',
            'data-scrapbook-adoptedstylesheet-0': ['#adopted1-1 { color: green; }', '#adopted1-2 { color: yellow; }'].join('\n\n'),
            'data-scrapbook-adoptedstylesheet-1': ['#adopted2-1 { color: red; }', '#adopted2-2 { color: blue; }'].join('\n\n'),
          });
        });

        $it.skipIf($.noAdoptedStylesheet)('should remove obsolete special attributes', async function () {
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

      context('<slot> handling', function () {
        $it.skipIf($.noShadowRootSlotAssignment)('should record properties for <slot>', function () {
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

          rewriter.htmlify(host);

          assert.strictEqual(host.innerHTML, `\
<span data-scrapbook-slot-index="0">Default</span>\
<span>Default2</span>\
<!--scrapbook-slot-index=1-->Default3<!--/scrapbook-slot-index-->\
<span slot="person" data-scrapbook-slot-index="2">Mr. Apple</span>\
<span slot="person" data-scrapbook-slot-index="3">Mr. Black</span>\
<span slot="person">Ms. Cindy</span>`);
          assert.strictEqual(host.getAttribute('data-scrapbook-shadowdom'), `\
<slot data-scrapbook-slot-assigned="0,1">default missing</slot>\
<slot name="person" data-scrapbook-slot-assigned="2,3">person missing</slot>`);
        });
      });

      context('<canvas> handling', function () {
        it('should record properties for <canvas>', async function () {
          var {contentDocument: doc} = await createIframeFixture({docData: {name: 'canvas', attrs: {width: 1, height: 1}}});
          var elem = doc.querySelector('canvas');
          var ctx = elem.getContext("2d");
          ctx.fillStyle = "#00FF00";
          ctx.fillRect(0, 0, 1, 1);

          rewriter.htmlify(elem);
          assert.match(elem.getAttribute('data-scrapbook-canvas'), rawRegex`${'^'}data:image/png;base64,`);
        });
      });

      context('form status handling', function () {
        it('should record properties for <input>', async function () {
          var doc = createDocFixture({name: 'input'});
          var elem = doc.querySelector('input');
          elem.value = 'foo';

          rewriter.htmlify(elem);
          assert.deepEqual(getAttributes(elem), {
            'data-scrapbook-input-value': 'foo',
          });
        });

        it('should record properties for <input type="radio">', async function () {
          var doc = createDocFixture({name: 'input', attrs: {type: 'radio'}});
          var elem = doc.querySelector('input');
          elem.checked = true;

          rewriter.htmlify(elem);
          assert.deepEqual(getAttributes(elem), {
            'type': 'radio',
            'data-scrapbook-input-checked': 'true',
          });
        });

        it('should record properties for <input type="checkbox">', async function () {
          var doc = createDocFixture({name: 'input', attrs: {type: 'checkbox'}});
          var elem = doc.querySelector('input');
          elem.checked = true;
          elem.indeterminate = true;

          rewriter.htmlify(elem);
          assert.deepEqual(getAttributes(elem), {
            'type': 'checkbox',
            'data-scrapbook-input-checked': 'true',
            'data-scrapbook-input-indeterminate': '',
          });
        });

        it('should not record properties for <input type="password">', async function () {
          var doc = createDocFixture({name: 'input', attrs: {type: 'password'}});
          var elem = doc.querySelector('input');
          elem.value = 'foo';

          rewriter.htmlify(elem);
          assert.deepEqual(getAttributes(elem), {
            'type': 'password',
          });
        });

        it('should record properties for <textarea>', async function () {
          var doc = createDocFixture({name: 'textarea'});
          var elem = doc.querySelector('textarea');
          elem.value = 'foo';

          rewriter.htmlify(elem);
          assert.deepEqual(getAttributes(elem), {
            'data-scrapbook-textarea-value': 'foo',
          });
        });

        it('should record properties for <option>', async function () {
          var doc = createDocFixture({name: 'option'});
          var elem = doc.querySelector('option');
          elem.selected = true;

          rewriter.htmlify(elem);
          assert.deepEqual(getAttributes(elem), {
            'data-scrapbook-option-selected': 'true',
          });
        });
      });
    });

    describe('#unhtmlify()', function () {
      context('shadow DOMs handling', function () {
        it('should recover shadow DOMs recursively', function () {
          var doc = createDocFixture({name: 'div', shadow: {
            virtual: true,
            children: [
              {name: 'div', shadow: {
                virtual: true,
                children: [
                  {name: 'span', attrs: {title: 'span title'}, value: 'text'},
                ],
              }},
            ],
          }});
          var elem = doc.querySelector('div');

          rewriter.unhtmlify(elem);

          var host1 = elem;
          var shadow1 = host1.shadowRoot;
          var host2 = shadow1.querySelector('div');
          var shadow2 = host2.shadowRoot;

          // should recover shadow DOMs
          assert.strictEqual(shadow1.innerHTML, '<div></div>');
          assert.strictEqual(shadow2.innerHTML, '<span title="span title">text</span>');

          // should remove special attributes
          assert.deepEqual(getAttributes(host1), {});
          assert.deepEqual(getAttributes(host2), {});
        });

        $it.skipIf($.noShadowRootClosed)('should recover closed shadow DOMs', function () {
          var doc = createDocFixture({name: 'div', shadow: {
            virtual: true,
            mode: 'closed',
            children: [{name: 'span', value: 'text'}],
          }});
          var elem = doc.querySelector('div');

          rewriter.unhtmlify(elem);

          var shadow = utils.getShadowRoot(elem);

          // should recover shadow DOMs
          assert.strictEqual(shadow.innerHTML, '<span>text</span>');
          assert.strictEqual(shadow.mode, 'closed');

          // should remove special attributes
          assert.deepEqual(getAttributes(elem), {});
        });

        $it.skipIf($.noShadowRootClonable)('should recover clonable shadow DOMs', function () {
          var doc = createDocFixture({name: 'div', shadow: {
            virtual: true,
            clonable: true,
            children: [{name: 'span', value: 'text'}],
          }});
          var elem = doc.querySelector('div');

          rewriter.unhtmlify(elem);

          var shadow = elem.shadowRoot;

          // should recover shadow DOMs
          assert.strictEqual(shadow.innerHTML, '<span>text</span>');
          assert.strictEqual(shadow.clonable, true);

          // should remove special attributes
          assert.deepEqual(getAttributes(elem), {});
        });

        $it.skipIf($.noShadowRootDelegatesFocus)('should recover `delegatesFocus` for shadow DOMs', function () {
          var doc = createDocFixture({name: 'div', shadow: {
            virtual: true,
            delegatesFocus: true,
            children: [{name: 'span', value: 'text'}],
          }});
          var elem = doc.querySelector('div');

          rewriter.unhtmlify(elem);

          var shadow = elem.shadowRoot;

          // should recover shadow DOMs
          assert.strictEqual(shadow.innerHTML, '<span>text</span>');
          assert.strictEqual(shadow.delegatesFocus, true);

          // should remove special attributes
          assert.deepEqual(getAttributes(elem), {});
        });

        $it.skipIf($.noShadowRootSerializable)('should recover `serializable` for shadow DOMs', function () {
          var doc = createDocFixture({name: 'div', shadow: {
            virtual: true,
            serializable: true,
            children: [{name: 'span', value: 'text'}],
          }});
          var elem = doc.querySelector('div');

          rewriter.unhtmlify(elem);

          var shadow = elem.shadowRoot;

          // should recover shadow DOMs
          assert.strictEqual(shadow.innerHTML, '<span>text</span>');
          assert.strictEqual(shadow.serializable, true);

          // should remove special attributes
          assert.deepEqual(getAttributes(elem), {});
        });

        $it.skipIf($.noShadowRootSlotAssignment)('should recover `slotAssignment` for shadow DOMs', function () {
          var doc = createDocFixture({name: 'div', shadow: {
            virtual: true,
            slotAssignment: 'manual',
            children: [{name: 'span', value: 'text'}],
          }});
          var elem = doc.querySelector('div');

          rewriter.unhtmlify(elem);

          var shadow = elem.shadowRoot;

          // should recover shadow DOMs
          assert.strictEqual(shadow.innerHTML, '<span>text</span>');
          assert.strictEqual(shadow.slotAssignment, 'manual');

          // should remove special attributes
          assert.deepEqual(getAttributes(elem), {});
        });
      });

      context('constructed stylesheets handling', function () {
        $it.skipIf($.noAdoptedStylesheet)('should recover constructed stylesheets', async function () {
          var {contentDocument: doc} = await createIframeFixture({docData: {
            name: 'div',
            attrs: {
              'data-scrapbook-adoptedstylesheets': '0,1',
              'data-scrapbook-adoptedstylesheet-0': ['#s1 { color: red; }', '#s2 { color: green; }'].join('\n\n'),
              'data-scrapbook-adoptedstylesheet-1': ['#s1 { background-color: green; }', '#s2 { background-color: blue; }'].join('\n\n'),
            },
            shadow: {virtual: true},
          }});
          var elem = doc.querySelector('div');

          rewriter.unhtmlify(elem);

          // should recover constructed stylesheets
          var constructed = elem.shadowRoot.adoptedStyleSheets;
          assert.strictEqual(constructed[0].cssRules[0].cssText, '#s1 { color: red; }');
          assert.strictEqual(constructed[0].cssRules[1].cssText, '#s2 { color: green; }');
          assert.strictEqual(constructed[1].cssRules[0].cssText, '#s1 { background-color: green; }');
          assert.strictEqual(constructed[1].cssRules[1].cssText, '#s2 { background-color: blue; }');

          // should remove special attributes
          assert.deepEqual(getAttributes(elem), {});
        });

        $it.skipIf($.noAdoptedStylesheet)('should use separated maps for different shadow roots', async function () {
          var {contentDocument: doc} = await createIframeFixture({docData: {
            name: 'div',
            attrs: {
              'data-scrapbook-adoptedstylesheets': '0',
              'data-scrapbook-adoptedstylesheet-0': ['#adopted2-1 { color: red; }', '#adopted2-2 { color: blue; }'].join('\n\n'),
            },
            shadow: {virtual: true, children: [{
              name: 'div',
              attrs: {
                'data-scrapbook-adoptedstylesheets': '0,1',
                'data-scrapbook-adoptedstylesheet-0': ['#adopted1-1 { color: green; }', '#adopted1-2 { color: yellow; }'].join('\n\n'),
                'data-scrapbook-adoptedstylesheet-1': ['#adopted2-1 { color: red; }', '#adopted2-2 { color: blue; }'].join('\n\n'),
              },
              shadow: {virtual: true},
            }]},
          }});
          var elem = doc.querySelector('div');

          rewriter.unhtmlify(elem);

          var host1 = elem, shadow1 = host1.shadowRoot;
          var host2 = shadow1.querySelector('div'), shadow2 = host2.shadowRoot;

          // should recover constructed stylesheets
          var constructed = shadow1.adoptedStyleSheets;
          assert.strictEqual(constructed[0].cssRules[0].cssText, '#adopted2-1 { color: red; }');
          assert.strictEqual(constructed[0].cssRules[1].cssText, '#adopted2-2 { color: blue; }');
          var constructed = shadow2.adoptedStyleSheets;
          assert.strictEqual(constructed[0].cssRules[0].cssText, '#adopted1-1 { color: green; }');
          assert.strictEqual(constructed[0].cssRules[1].cssText, '#adopted1-2 { color: yellow; }');
          assert.strictEqual(constructed[1].cssRules[0].cssText, '#adopted2-1 { color: red; }');
          assert.strictEqual(constructed[1].cssRules[1].cssText, '#adopted2-2 { color: blue; }');

          // should remove special attributes
          assert.deepEqual(getAttributes(host1), {});
          assert.deepEqual(getAttributes(host2), {});
        });
      });

      context('<slot> handling', function () {
        $it.skipIf($.noShadowRootSlotAssignment)('should recover assigned nodes for <slot>', function () {
          var doc = createDocFixture({
            name: 'div',
            children: [
              {name: 'span', value: 'Default', attrs: {'data-scrapbook-slot-index': '0'}},
              {name: 'span', value: 'Default2'},
              {name: '#comment', value: 'scrapbook-slot-index=1'},
              {name: '#text', value: 'Default3'},
              {name: '#comment', value: '/scrapbook-slot-index'},
              {name: 'span', value: 'Mr. Apple', attrs: {'slot': 'person', 'data-scrapbook-slot-index': '2'}},
              {name: 'span', value: 'Mr. Black', attrs: {'slot': 'person', 'data-scrapbook-slot-index': '3'}},
              {name: 'span', value: 'Ms. Cindy', attrs: {'slot': 'person'}},
            ],
            shadow: {
              virtual: true,
              slotAssignment: 'manual',
              children: [
                {name: 'slot', value: 'default missing', attrs: {'data-scrapbook-slot-assigned': '0,1'}},
                {name: 'slot', value: 'person missing', attrs: {'name': 'person', 'data-scrapbook-slot-assigned': '2,3'}},
              ],
            },
          });
          var elem = doc.querySelector('div');

          rewriter.unhtmlify(elem);

          // should recover assigned nodes
          var shadow = elem.shadowRoot;
          assert.deepEqual(shadow.querySelector('slot:not([name])').assignedNodes(), [
            elem.childNodes[0], elem.childNodes[2],
          ]);
          assert.deepEqual(shadow.querySelector('slot[name="person"]').assignedNodes(), [
            elem.childNodes[3], elem.childNodes[4],
          ]);

          // should remove special attributes
          assert.deepEqual(elem.innerHTML, `\
<span>Default</span>\
<span>Default2</span>\
Default3\
<span slot="person">Mr. Apple</span>\
<span slot="person">Mr. Black</span>\
<span slot="person">Ms. Cindy</span>`);
          assert.deepEqual(shadow.innerHTML, `\
<slot>default missing</slot>\
<slot name="person">person missing</slot>`);
        });
      });

      context('<canvas> handling', function () {
        it('should recover image data for <canvas>', async function () {
          var {contentDocument: doc} = await createIframeFixture({docData: {name: 'canvas', attrs: {
            'width': '1',
            'height': '1',
            'data-scrapbook-canvas': GREEN_BMP_DATAURL,
          }}});
          var elem = doc.querySelector('canvas');

          rewriter.unhtmlify(elem);
          await utils.delay(300);

          // should recover image data
          assert.notDeepEqual(
            elem.getContext('2d').getImageData(0, 0, 1, 1).data,
            new Uint8ClampedArray([0, 0, 0, 0]),
          );

          // should remove special attributes
          assert.deepEqual(getAttributes(elem), {width: '1', height: '1'});
        });
      });

      context('form status handling', function () {
        it('should recover properties for <input>', async function () {
          var doc = createDocFixture({name: 'input', attrs: {
            'data-scrapbook-input-value': 'foo',
          }});
          var elem = doc.querySelector('input');

          rewriter.unhtmlify(elem);

          // should recover properties
          assert.strictEqual(elem.value, 'foo');

          // should remove special attributes
          assert.deepEqual(getAttributes(elem), {});
        });

        it('should recover properties for <input type="radio">', async function () {
          var doc = createDocFixture({name: 'input', attrs: {
            'type': 'radio',
            'data-scrapbook-input-checked': 'true',
            'data-scrapbook-input-indeterminate': '',
          }});
          var elem = doc.querySelector('input');

          rewriter.unhtmlify(elem);

          // should recover properties
          assert.strictEqual(elem.checked, true);

          // should remove special attributes
          assert.deepEqual(getAttributes(elem), {
            'type': 'radio',
            'data-scrapbook-input-indeterminate': '',
          });
        });

        it('should recover properties for <input type="checkbox">', async function () {
          var doc = createDocFixture({name: 'input', attrs: {
            'type': 'checkbox',
            'data-scrapbook-input-checked': 'true',
            'data-scrapbook-input-indeterminate': '',
          }});
          var elem = doc.querySelector('input');

          rewriter.unhtmlify(elem);

          // should recover properties
          assert.strictEqual(elem.checked, true);
          assert.strictEqual(elem.indeterminate, true);

          // should remove special attributes
          assert.deepEqual(getAttributes(elem), {'type': 'checkbox'});
        });

        it('should recover properties for <textarea>', async function () {
          var doc = createDocFixture({name: 'textarea', attrs: {
            'data-scrapbook-textarea-value': 'foo',
          }});
          var elem = doc.querySelector('textarea');

          rewriter.unhtmlify(elem);

          // should recover properties
          assert.strictEqual(elem.value, 'foo');

          // should remove special attributes
          assert.deepEqual(getAttributes(elem), {});
        });

        it('should recover properties for <option>', async function () {
          var doc = createDocFixture({name: 'option', attrs: {
            'data-scrapbook-option-selected': 'true',
          }});
          var elem = doc.querySelector('option');

          rewriter.unhtmlify(elem);

          // should recover properties
          assert.strictEqual(elem.selected, true);

          // should remove special attributes
          assert.deepEqual(getAttributes(elem), {});
        });
      });
    });
  });
});
