import {
  MochaQuery as $, assert, assertRangesEqual,
  GREEN_BMP_BYTES, createNodeFixture, createDomFixture, createDocFixture, createIframeFixture,
} from "./unittest.mjs";
import sinon from "./lib/sinon-esm.js";
import {
  userAgent, documentToString, getShadowRoot, byteStringToArrayBuffer,
} from "../utils/common.mjs";

import {DocumentCloner, PartialDocumentCloner} from "../utils/doc-cloner.mjs";

const $describe = $(describe);
const $context = $(context);
const $it = $(it);

describe('utils/doc-cloner.mjs', function () {
  afterEach(function () {
    sinon.restore();

    for (const elem of document.querySelectorAll('iframe')) {
      elem.remove();
    }
  });

  $describe.skipIf($.noBrowser)('DocumentCloner', function () {
    describe('.clone()', function () {
      it('should return the cloned document', function () {
        var spy1 = sinon.spy(DocumentCloner, 'cloneDocument');
        var spy2 = sinon.spy(DocumentCloner, 'cloneNode');

        var doc = createDocFixture({code: '<!DOCTYPE html><html><head><!--comment--></head><body>text</body></html>'});
        var newDoc = DocumentCloner.clone(doc);

        var expected = '<!DOCTYPE html><html><head><!--comment--></head><body>text</body></html>';
        assert.strictEqual(documentToString(doc), expected);
        assert.strictEqual(documentToString(newDoc), expected);

        sinon.assert.calledWithExactly(spy1.getCall(0), doc, {
          origNodeMap: undefined,
          clonedNodeMap: undefined,
        });
        assert.isNull(spy1.getCall(1));

        sinon.assert.calledWithExactly(spy2.getCall(0), doc.doctype, true, {
          newDoc,
          origNodeMap: undefined,
          clonedNodeMap: undefined,
          includeShadowDom: undefined,
        });
        sinon.assert.calledWithExactly(spy2.getCall(1), doc.documentElement, true, {
          newDoc,
          origNodeMap: undefined,
          clonedNodeMap: undefined,
          includeShadowDom: undefined,
        });
        assert.isNull(spy2.getCall(2));
      });

      it('should populate maps when provided', function () {
        var spy1 = sinon.spy(DocumentCloner, 'cloneDocument');
        var spy2 = sinon.spy(DocumentCloner, 'cloneNode');

        var origNodeMap = new WeakMap();
        var clonedNodeMap = new WeakMap();
        var includeShadowDom = true;
        var doc = createDocFixture({code: '<!DOCTYPE html><html><head><!--comment--></head><body>text</body></html>'});
        var newDoc = DocumentCloner.clone(doc, {origNodeMap, clonedNodeMap, includeShadowDom});

        var expected = '<!DOCTYPE html><html><head><!--comment--></head><body>text</body></html>';
        assert.strictEqual(documentToString(doc), expected);
        assert.strictEqual(documentToString(newDoc), expected);

        sinon.assert.calledWithExactly(spy1.getCall(0), doc, {origNodeMap, clonedNodeMap});
        assert.isNull(spy1.getCall(1));

        sinon.assert.calledWithExactly(spy2.getCall(0), doc.doctype, true, {
          newDoc,
          origNodeMap,
          clonedNodeMap,
          includeShadowDom,
        });
        sinon.assert.calledWithExactly(spy2.getCall(1), doc.documentElement, true, {
          newDoc,
          origNodeMap,
          clonedNodeMap,
          includeShadowDom,
        });
        assert.isNull(spy2.getCall(2));
      });

      it('should return the cloned document for XHTML', function () {
        var doc = createDocFixture({type: 'xhtml', code: `\
<?xml version="1.0" encoding="UTF-8"?>
<!--before doctype-->
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<!--before html-->
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8" />
<title>ABC 中文 𠀀</title>
</head>
<body>
<p><![CDATA[1 + 1 > 2]]></p>
</body>
</html>
<!--after html-->
`});
        var newDoc = DocumentCloner.clone(doc);

        var expected = `\
<!--before doctype-->\
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">\
<!--before html-->\
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="UTF-8" />
<title>ABC 中文 𠀀</title>
</head>
<body>
<p><![CDATA[1 + 1 > 2]]></p>
</body>
</html>\
<!--after html-->\
`;
        assert.strictEqual(documentToString(doc), expected);
        assert.strictEqual(documentToString(newDoc), expected);
      });

      it('should not trigger custom element constructor during cloning', async function () {
        var {contentDocument: doc} = await createIframeFixture({
          docData: {name: 'custom-elem'},
          onload: ({target: {contentWindow: iwin}}) => {
            iwin.customElements.define(
              'custom-elem',
              class extends iwin.HTMLElement {
                constructor() {
                  super();
                  var shadow = this.attachShadow({mode: 'open'});
                  shadow.innerHTML = '<div>dummy</div>';
                }
              },
            );
          },
        });
        var newDoc = DocumentCloner.clone(doc, {includeShadowDom: false});

        assert.isNull(newDoc.querySelector('custom-elem').shadowRoot);
      });
    });

    describe('.cloneDocument()', function () {
      it('should return an empty HTMLDocument for HTML', function () {
        var doc = createDocFixture();
        var newDoc = DocumentCloner.cloneDocument(doc);

        assert.instanceOf(newDoc, HTMLDocument);
        assert.strictEqual(newDoc.childNodes.length, 0);
      });

      it('should return an empty XMLDocument for XHTML', function () {
        var doc = createDocFixture({type: 'xhtml'});
        var newDoc = DocumentCloner.cloneDocument(doc);

        assert.instanceOf(newDoc, XMLDocument);
        assert.strictEqual(newDoc.childNodes.length, 0);
      });

      it('should return an empty XMLDocument for SVG', function () {
        var doc = createDocFixture({type: 'svg'});
        var newDoc = DocumentCloner.cloneDocument(doc);

        assert.instanceOf(newDoc, XMLDocument);
        assert.strictEqual(newDoc.childNodes.length, 0);
      });

      it('should return an empty HTMLDocument for other types', async function () {
        var blob = new Blob([byteStringToArrayBuffer(GREEN_BMP_BYTES)], {type: 'image/bmp'});
        var src = URL.createObjectURL(blob);
        var iframe = await createIframeFixture({src});

        var doc = iframe.contentDocument;
        var newDoc = DocumentCloner.cloneDocument(doc);

        assert.instanceOf(newDoc, HTMLDocument);
        assert.strictEqual(newDoc.childNodes.length, 0);
      });

      it('should populate maps when provided', function () {
        var origNodeMap = new Map();
        var clonedNodeMap = new Map();
        var doc = createDocFixture();
        var newDoc = DocumentCloner.cloneDocument(doc, {origNodeMap, clonedNodeMap});

        assert.deepEqual(origNodeMap, new Map([[newDoc, doc]]));
        assert.deepEqual(clonedNodeMap, new Map([[doc, newDoc]]));
      });
    });

    describe('.cloneNode()', function () {
      it('should call `_cloneNode` with input parameters', function () {
        var stub = sinon.stub(DocumentCloner, '_cloneNode');

        var node = createNodeFixture({name: 'div'});
        var options = {
          newDoc: DocumentCloner.cloneDocument(node.ownerDocument),
          origNodeMap: new WeakMap(),
          clonedNodeMap: new WeakMap(),
          includeShadowDom: true,
        };

        DocumentCloner.cloneNode(node, true, options);
        sinon.assert.calledOnceWithExactly(stub, node, true, options);
      });

      it('should provide default values for options when omitted', function () {
        var stub = sinon.stub(DocumentCloner, '_cloneNode');

        var node = createNodeFixture({name: 'div'});

        DocumentCloner.cloneNode(node, true, {});
        sinon.assert.calledOnceWithExactly(stub, node, true, {
          newDoc: node.ownerDocument,
          origNodeMap: undefined,
          clonedNodeMap: undefined,
          includeShadowDom: false,
        });
      });

      it('should default `deep` to false and `options` as an empty object when omitted', function () {
        var stub = sinon.stub(DocumentCloner, '_cloneNode');

        var node = createNodeFixture({name: 'div'});

        DocumentCloner.cloneNode(node);
        sinon.assert.calledOnceWithExactly(stub, node, false, {
          newDoc: node.ownerDocument,
          origNodeMap: undefined,
          clonedNodeMap: undefined,
          includeShadowDom: false,
        });
      });
    });

    describe('._cloneNode()', function () {
      context('when `deep` is falsy', function () {
        it('should import the cloned node into `newDoc` and return the result', function () {
          var node = createDomFixture('<div id="1-1"><span>dummy</span></div>');

          var spy = sinon.spy(node.ownerDocument, 'importNode');

          var newNode = DocumentCloner._cloneNode(node, false, {
            newDoc: node.ownerDocument,
            origNodeMap: undefined,
            clonedNodeMap: undefined,
            includeShadowDom: false,
          });

          assert.strictEqual(newNode.outerHTML, '<div id="1-1"></div>');

          sinon.assert.calledOnceWithExactly(spy, node, false);
          assert.strictEqual(spy.lastCall.returnValue, newNode);
        });

        it('should populate maps when provided', function () {
          var node = createDomFixture('<div id="1-1"><span>dummy</span></div>');

          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var newNode = DocumentCloner._cloneNode(node, false, {
            newDoc: node.ownerDocument,
            origNodeMap,
            clonedNodeMap,
            includeShadowDom: false,
          });

          assert.deepEqual(origNodeMap, new Map([[newNode, node]]));
          assert.deepEqual(clonedNodeMap, new Map([[node, newNode]]));
        });

        it('should call `cloneShadowDom` when `includeShadowDom` is truthy', function () {
          var spy = sinon.spy(DocumentCloner, 'cloneShadowDom');

          var shadowOptions = {mode: 'open'};
          var node = createNodeFixture({name: 'div', shadow: shadowOptions});

          var options = {
            newDoc: node.ownerDocument,
            origNodeMap: new Map(),
            clonedNodeMap: new Map(),
            includeShadowDom: true,
          };
          var newNode = DocumentCloner._cloneNode(node, false, options);

          sinon.assert.calledWithExactly(spy.getCall(0), node, newNode, options);
          assert.isNull(spy.getCall(1));
        });

        $it.skipIf($.noShadowRootClonable).xfail()('should never clone clonable shadow roots', function () {
          var node = createNodeFixture({
            name: 'div',
            id: 'foo',
            children: [{name: 'br'}],
            shadow: {mode: 'open', clonable: true},
          });

          var options = {
            newDoc: node.ownerDocument,
            includeShadowDom: true,
          };
          var newNode = DocumentCloner._cloneNode(node, false, options);

          assert.strictEqual(newNode.outerHTML, '<div id="foo"></div>');
          assert.isNull(newNode.shadowRoot);
        });
      });

      context('when `deep` is truthy', function () {
        it('should import the cloned node into `newDoc` and return the result', function () {
          var node = createDomFixture('<div id="1-1"><span>dummy</span></div>');

          var spy = sinon.spy(node.ownerDocument, 'importNode');

          var newNode = DocumentCloner._cloneNode(node, true, {
            newDoc: node.ownerDocument,
            origNodeMap: undefined,
            clonedNodeMap: undefined,
            includeShadowDom: false,
          });

          assert.strictEqual(newNode.outerHTML, '<div id="1-1"><span>dummy</span></div>');

          sinon.assert.calledOnceWithExactly(spy, node, true);
          assert.strictEqual(spy.lastCall.returnValue, newNode);
        });

        it('should populate maps when provided', function () {
          var node = createDomFixture('<div id="1-1"><span>dummy</span><!--comment--></div>');

          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var newNode = DocumentCloner._cloneNode(node, true, {
            newDoc: node.ownerDocument,
            origNodeMap,
            clonedNodeMap,
            includeShadowDom: false,
          });

          assert.deepEqual(origNodeMap, new Map([
            [newNode, node],
            [newNode.childNodes[0], node.childNodes[0]],
            [newNode.childNodes[0].childNodes[0], node.childNodes[0].childNodes[0]],
            [newNode.childNodes[1], node.childNodes[1]],
          ]));
          assert.deepEqual(clonedNodeMap, new Map([
            [node, newNode],
            [node.childNodes[0], newNode.childNodes[0]],
            [node.childNodes[0].childNodes[0], newNode.childNodes[0].childNodes[0]],
            [node.childNodes[1], newNode.childNodes[1]],
          ]));
        });

        it('should call `cloneShadowDom` when `includeShadowDom` is truthy', function () {
          var spy = sinon.spy(DocumentCloner, 'cloneShadowDom');

          var shadowOptions = {mode: 'open'};
          var node = createNodeFixture({
            name: 'div',
            children: [{
              name: 'span',
              value: 'dummy',
              shadow: shadowOptions,
            }],
            shadow: shadowOptions,
          });

          var options = {
            newDoc: node.ownerDocument,
            origNodeMap: new Map(),
            clonedNodeMap: new Map(),
            includeShadowDom: true,
          };
          var newNode = DocumentCloner._cloneNode(node, true, options);

          sinon.assert.calledWithExactly(spy.getCall(0), node, newNode, options);
          sinon.assert.calledWithExactly(spy.getCall(1), node.firstChild, newNode.firstChild, options);
          sinon.assert.calledWithExactly(spy.getCall(2), node.firstChild.firstChild, newNode.firstChild.firstChild, options);
          assert.isNull(spy.getCall(3));
        });

        // @FIXME: should never clone clonable shadow roots when `includeShadowDom` = false
        $it.skipIf($.noShadowRootClonable).xfail()('should never clone clonable shadow roots when `includeShadowDom` is falsy', function () {
          var shadowOptions = {
            mode: 'open',
            clonable: true,
          };
          var node = createNodeFixture({
            name: 'div',
            id: 'foo',
            children: [{name: 'br'}],
            shadow: shadowOptions,
          });

          var options = {
            newDoc: node.ownerDocument,
            includeShadowDom: false,
          };
          var newNode = DocumentCloner._cloneNode(node, true, options);

          assert.strictEqual(newNode.outerHTML, '<div id="foo"><br></div>');
          assert.isNull(newNode.shadowRoot);
        });
      });
    });

    describe('.cloneShadowDom()', function () {
      it('should create a shadow root with same options and populate maps', function () {
        var spy = sinon.spy(DocumentCloner, '_cloneNode');

        var node = createNodeFixture({
          name: 'div',
          shadow: {
            mode: 'open',
            clonable: false,
            delegatesFocus: false,
            serializable: false,
            slotAssignment: "named",
          },
        });

        var newNode = node.cloneNode();
        var origNodeMap = new Map();
        var clonedNodeMap = new Map();
        var options = {
          newDoc: node.ownerDocument,
          origNodeMap,
          clonedNodeMap,
          includeShadowDom: true,
        };
        DocumentCloner.cloneShadowDom(node, newNode, options);

        assert.strictEqual(newNode.shadowRoot.mode, node.shadowRoot.mode);
        assert.strictEqual(newNode.shadowRoot.clonable, node.shadowRoot.clonable);
        assert.strictEqual(newNode.shadowRoot.delegatesFocus, node.shadowRoot.delegatesFocus);
        assert.strictEqual(newNode.shadowRoot.serializable, node.shadowRoot.serializable);
        assert.strictEqual(newNode.shadowRoot.slotAssignment, node.shadowRoot.slotAssignment);

        assert.deepEqual(origNodeMap, new Map([[newNode.shadowRoot, node.shadowRoot]]));
        assert.deepEqual(clonedNodeMap, new Map([[node.shadowRoot, newNode.shadowRoot]]));
      });

      it('should clone nodes in the shadow DOM', function () {
        var spy = sinon.spy(DocumentCloner, '_cloneNode');

        var node = createNodeFixture({
          name: 'div',
          shadow: {
            mode: 'open',
            clonable: false,
            delegatesFocus: false,
            serializable: false,
            slotAssignment: "named",
            innerHTML: '<div><span></span></div>text<!--comment-->',
          },
        });

        var newNode = node.cloneNode();
        var origNodeMap = new Map();
        var clonedNodeMap = new Map();
        var options = {
          newDoc: node.ownerDocument,
          origNodeMap,
          clonedNodeMap,
          includeShadowDom: true,
        };
        DocumentCloner.cloneShadowDom(node, newNode, options);

        assert.strictEqual(newNode.shadowRoot.innerHTML, '<div><span></span></div>text<!--comment-->');

        assert.deepEqual(origNodeMap, new Map([
          [newNode.shadowRoot, node.shadowRoot],
          [newNode.shadowRoot.childNodes[0], node.shadowRoot.childNodes[0]],
          [newNode.shadowRoot.childNodes[0].firstChild, node.shadowRoot.childNodes[0].firstChild],
          [newNode.shadowRoot.childNodes[1], node.shadowRoot.childNodes[1]],
          [newNode.shadowRoot.childNodes[2], node.shadowRoot.childNodes[2]],
        ]));
        assert.deepEqual(clonedNodeMap, new Map([
          [node.shadowRoot, newNode.shadowRoot],
          [node.shadowRoot.childNodes[0], newNode.shadowRoot.childNodes[0]],
          [node.shadowRoot.childNodes[0].firstChild, newNode.shadowRoot.childNodes[0].firstChild],
          [node.shadowRoot.childNodes[1], newNode.shadowRoot.childNodes[1]],
          [node.shadowRoot.childNodes[2], newNode.shadowRoot.childNodes[2]],
        ]));

        sinon.assert.calledWithExactly(spy.getCall(0), node.shadowRoot.childNodes[0], true, options);
        sinon.assert.calledWithExactly(spy.getCall(1), node.shadowRoot.childNodes[1], true, options);
        sinon.assert.calledWithExactly(spy.getCall(2), node.shadowRoot.childNodes[2], true, options);
        assert.isNull(spy.getCall(3));
      });

      it('should clone nested shadow DOMs', function () {
        var spy = sinon.spy(DocumentCloner, 'cloneShadowDom');

        var shadowOptions = {
          mode: 'open',
          clonable: false,
          delegatesFocus: false,
          serializable: false,
          slotAssignment: "named",
        };
        var node = createNodeFixture({name: 'div', shadow: {
          ...shadowOptions,
          children: [{name: 'div', id: '1', shadow: {
            ...shadowOptions,
            children: [{name: 'div', id: '2'}],
          }}],
        }});

        var newNode = node.cloneNode();
        var origNodeMap = new Map();
        var clonedNodeMap = new Map();
        var options = {
          newDoc: node.ownerDocument,
          origNodeMap,
          clonedNodeMap,
          includeShadowDom: true,
        };
        DocumentCloner.cloneShadowDom(node, newNode, options);

        assert.strictEqual(newNode.shadowRoot.innerHTML, '<div id="1"></div>');
        assert.strictEqual(newNode.shadowRoot.firstChild.shadowRoot.innerHTML, '<div id="2"></div>');

        sinon.assert.calledWithExactly(spy.getCall(0),
          node,
          newNode,
          options,
        );
        sinon.assert.calledWithExactly(spy.getCall(1),
          node.shadowRoot.firstChild,
          newNode.shadowRoot.firstChild,
          options,
        );
        sinon.assert.calledWithExactly(spy.getCall(2),
          node.shadowRoot.firstChild.shadowRoot.firstChild,
          newNode.shadowRoot.firstChild.shadowRoot.firstChild,
          options,
        );
        assert.isNull(spy.getCall(3));
      });

      $context.skipIf(
        userAgent.is('chromium') && userAgent.major < 88,
        'retrieving closed shadow DOM is not supported in Chromium < 88',
      )('for closed shadow roots', function () {
        it('should clone nodes in the shadow DOM', function () {
          var spy = sinon.spy(DocumentCloner, '_cloneNode');

          var node = createNodeFixture({name: 'div', shadow: {
            mode: 'closed',
            innerHTML: '<div><span></span></div>text<!--comment-->',
          }});

          var newNode = node.cloneNode();
          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var options = {
            newDoc: node.ownerDocument,
            origNodeMap,
            clonedNodeMap,
            includeShadowDom: true,
          };
          DocumentCloner.cloneShadowDom(node, newNode, options);

          assert.strictEqual(getShadowRoot(newNode).innerHTML, '<div><span></span></div>text<!--comment-->');

          assert.deepEqual(origNodeMap, new Map([
            [getShadowRoot(newNode), getShadowRoot(node)],
            [getShadowRoot(newNode).childNodes[0], getShadowRoot(node).childNodes[0]],
            [getShadowRoot(newNode).childNodes[0].firstChild, getShadowRoot(node).childNodes[0].firstChild],
            [getShadowRoot(newNode).childNodes[1], getShadowRoot(node).childNodes[1]],
            [getShadowRoot(newNode).childNodes[2], getShadowRoot(node).childNodes[2]],
          ]));
          assert.deepEqual(clonedNodeMap, new Map([
            [getShadowRoot(node), getShadowRoot(newNode)],
            [getShadowRoot(node).childNodes[0], getShadowRoot(newNode).childNodes[0]],
            [getShadowRoot(node).childNodes[0].firstChild, getShadowRoot(newNode).childNodes[0].firstChild],
            [getShadowRoot(node).childNodes[1], getShadowRoot(newNode).childNodes[1]],
            [getShadowRoot(node).childNodes[2], getShadowRoot(newNode).childNodes[2]],
          ]));

          sinon.assert.calledWithExactly(spy.getCall(0), getShadowRoot(node).childNodes[0], true, options);
          sinon.assert.calledWithExactly(spy.getCall(1), getShadowRoot(node).childNodes[1], true, options);
          sinon.assert.calledWithExactly(spy.getCall(2), getShadowRoot(node).childNodes[2], true, options);
          assert.isNull(spy.getCall(3));
        });
      });

      $context.skipIf($.noShadowRootClonable)('for clonable shadow roots', function () {
        it('should populate maps for nodes in the shadow DOM', function () {
          var spy = sinon.spy(DocumentCloner, 'cloneShadowDom');

          var node = createNodeFixture({name: 'div', shadow: {
            mode: 'open',
            clonable: true,
            delegatesFocus: false,
            serializable: false,
            slotAssignment: "named",
            innerHTML: '<div><span></span></div>text<!--comment-->',
          }});

          var newNode = node.cloneNode(true);
          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var options = {
            newDoc: node.ownerDocument,
            origNodeMap,
            clonedNodeMap,
            includeShadowDom: true,
          };
          DocumentCloner.cloneShadowDom(node, newNode, options);

          assert.strictEqual(newNode.shadowRoot.innerHTML, '<div><span></span></div>text<!--comment-->');

          assert.deepEqual(origNodeMap, new Map([
            [newNode.shadowRoot, node.shadowRoot],
            [newNode.shadowRoot.childNodes[0], node.shadowRoot.childNodes[0]],
            [newNode.shadowRoot.childNodes[0].firstChild, node.shadowRoot.childNodes[0].firstChild],
            [newNode.shadowRoot.childNodes[1], node.shadowRoot.childNodes[1]],
            [newNode.shadowRoot.childNodes[2], node.shadowRoot.childNodes[2]],
          ]));
          assert.deepEqual(clonedNodeMap, new Map([
            [node.shadowRoot, newNode.shadowRoot],
            [node.shadowRoot.childNodes[0], newNode.shadowRoot.childNodes[0]],
            [node.shadowRoot.childNodes[0].firstChild, newNode.shadowRoot.childNodes[0].firstChild],
            [node.shadowRoot.childNodes[1], newNode.shadowRoot.childNodes[1]],
            [node.shadowRoot.childNodes[2], newNode.shadowRoot.childNodes[2]],
          ]));

          sinon.assert.calledWithExactly(spy.getCall(0), node, newNode, options);
          sinon.assert.calledWithExactly(spy.getCall(1), node.shadowRoot, newNode.shadowRoot, options);
          sinon.assert.calledWithExactly(spy.getCall(2), node.shadowRoot.childNodes[0], newNode.shadowRoot.childNodes[0], options);
          sinon.assert.calledWithExactly(spy.getCall(3), node.shadowRoot.childNodes[0].firstChild, newNode.shadowRoot.childNodes[0].firstChild, options);
          sinon.assert.calledWithExactly(spy.getCall(4), node.shadowRoot.childNodes[1], newNode.shadowRoot.childNodes[1], options);
          sinon.assert.calledWithExactly(spy.getCall(5), node.shadowRoot.childNodes[2], newNode.shadowRoot.childNodes[2], options);
          assert.isNull(spy.getCall(6));
        });

        it('should clone nested shadow DOMs', function () {
          var spy = sinon.spy(DocumentCloner, 'cloneShadowDom');

          var shadowOptions = {
            mode: 'open',
            clonable: true,
            delegatesFocus: false,
            serializable: false,
            slotAssignment: "named",
          };
          var node = createNodeFixture({name: 'div', shadow: {
            ...shadowOptions,
            children: [{name: 'div', id: '1', shadow: {
              ...shadowOptions,
              children: [{name: 'div', id: '2'}],
            }}],
          }});

          var newNode = node.cloneNode();
          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var options = {
            newDoc: node.ownerDocument,
            origNodeMap,
            clonedNodeMap,
            includeShadowDom: true,
          };
          DocumentCloner.cloneShadowDom(node, newNode, options);

          assert.strictEqual(newNode.shadowRoot.innerHTML, '<div id="1"></div>');
          assert.strictEqual(newNode.shadowRoot.firstChild.shadowRoot.innerHTML, '<div id="2"></div>');

          sinon.assert.calledWithExactly(spy.getCall(0),
            node,
            newNode,
            options,
          );
          sinon.assert.calledWithExactly(spy.getCall(1),
            node.shadowRoot,
            newNode.shadowRoot,
            options,
          );
          sinon.assert.calledWithExactly(spy.getCall(2),
            node.shadowRoot.firstChild,
            newNode.shadowRoot.firstChild,
            options,
          );
          sinon.assert.calledWithExactly(spy.getCall(3),
            node.shadowRoot.firstChild.shadowRoot,
            newNode.shadowRoot.firstChild.shadowRoot,
            options,
          );
          sinon.assert.calledWithExactly(spy.getCall(4),
            node.shadowRoot.firstChild.shadowRoot.firstChild,
            newNode.shadowRoot.firstChild.shadowRoot.firstChild,
            options,
          );
          assert.isNull(spy.getCall(5));
        });
      });
    });
  });

  $describe.skipIf($.noBrowser)('PartialDocumentCloner', function () {
    const hookBeforeRange = (refNode) => {
      const doc = refNode.ownerDocument || refNode;
      refNode.appendChild(doc.createComment("range"));
    };
    const hookAfterRange = (refNode) => {
      const doc = refNode.ownerDocument || refNode;
      refNode.appendChild(doc.createComment("/range"));
    };
    const hookBetweenText = (refNode) => {
      const doc = refNode.ownerDocument || refNode;
      refNode.appendChild(doc.createComment("splitter"));
      refNode.appendChild(doc.createTextNode(" … "));
      refNode.appendChild(doc.createComment("/splitter"));
    };
    const hookBetweenComment = (refNode) => {
      const doc = refNode.ownerDocument || refNode;
      refNode.appendChild(doc.createComment("splitter"));
      refNode.appendChild(doc.createComment(" … "));
      refNode.appendChild(doc.createComment("/splitter"));
    };
    const hookBetweenCdata = (refNode) => {
      const doc = refNode.ownerDocument || refNode;
      refNode.appendChild(doc.createComment("splitter"));
      refNode.appendChild(doc.createCDATASection(" … "));
      refNode.appendChild(doc.createComment("/splitter"));
    };

    describe('.clone()', function () {
      context('option `includeDoctype`', function () {
        let baseDoc;

        before(function initBaseDoc() {
          baseDoc = createDocFixture({code: `\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body><section></section></body>\
</html>`});
          assert.strictEqual(
            documentToString(baseDoc),
            `\
<!DOCTYPE html>\
<html>\
<head><meta charset="utf-8"></head>
<body><section></section></body>\
</html>`,
          );
        });

        it('should clone doctype if exists when truthy', function () {
          var doc = baseDoc;
          var selection = [
            (() => {
              var range = doc.createRange();
              range.selectNode(doc.querySelector('section'));
              return range;
            })(),
          ];
          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var newDoc = PartialDocumentCloner.clone(doc, {
            selection, origNodeMap, clonedNodeMap,
            hookBeforeRange, hookAfterRange,
            hookBetweenText, hookBetweenComment, hookBetweenCdata,
            includeDoctype: true,
            includeRoot: false,
            includeHead: false,
            includeBody: false,
          });

          assert.strictEqual(
            documentToString(newDoc),
            `\
<!DOCTYPE html>\
<html>\
<body><!--range--><section></section><!--/range--></body>\
</html>`,
          );
        });

        it('should safely do nothing if doctype does not exist when truthy', function () {
          var doc = DocumentCloner.clone(baseDoc);
          doc.doctype.remove();
          assert.strictEqual(
            documentToString(doc),
            `\
<html>\
<head><meta charset="utf-8"></head>
<body><section></section></body>\
</html>`,
          );

          var selection = [
            (() => {
              var range = doc.createRange();
              range.selectNode(doc.querySelector('section'));
              return range;
            })(),
          ];
          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var newDoc = PartialDocumentCloner.clone(doc, {
            selection, origNodeMap, clonedNodeMap,
            hookBeforeRange, hookAfterRange,
            hookBetweenText, hookBetweenComment, hookBetweenCdata,
            includeDoctype: true,
            includeRoot: false,
            includeHead: false,
            includeBody: false,
          });

          assert.strictEqual(
            documentToString(newDoc),
            `\
<html>\
<body><!--range--><section></section><!--/range--></body>\
</html>`,
          );
        });

        it('should not clone doctype when falsy', function () {
          var doc = baseDoc;
          var selection = [
            (() => {
              var range = doc.createRange();
              range.selectNode(doc.querySelector('section'));
              return range;
            })(),
          ];
          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var newDoc = PartialDocumentCloner.clone(doc, {
            selection, origNodeMap, clonedNodeMap,
            hookBeforeRange, hookAfterRange,
            hookBetweenText, hookBetweenComment, hookBetweenCdata,
            includeDoctype: false,
            includeRoot: false,
            includeHead: false,
            includeBody: false,
          });

          assert.strictEqual(
            documentToString(newDoc),
            `\
<html>\
<body><!--range--><section></section><!--/range--></body>\
</html>`,
          );
        });
      });

      context('option `includeRoot`', function () {
        let baseDoc;

        before(function initBaseDoc() {
          baseDoc = createDocFixture({code: `\
<!DOCTYPE html>\
<!-- before html -->\
<html>\
<head><meta charset="utf-8"></head>
<body><section></section></body>\
</html>\
<!-- after html -->`});
          assert.strictEqual(
            documentToString(baseDoc),
            `\
<!DOCTYPE html>\
<!-- before html -->\
<html>\
<head><meta charset="utf-8"></head>
<body><section></section></body>\
</html>\
<!-- after html -->`,
          );
        });

        it('should clone documentElement if exists when truthy', function () {
          var doc = baseDoc;
          var selection = [
            (() => {
              var range = doc.createRange();
              range.selectNode(doc.childNodes[1]);
              return range;
            })(),
            (() => {
              var range = doc.createRange();
              range.selectNode(doc.lastChild);
              return range;
            })(),
          ];
          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var newDoc = PartialDocumentCloner.clone(doc, {
            selection, origNodeMap, clonedNodeMap,
            hookBeforeRange, hookAfterRange,
            hookBetweenText, hookBetweenComment, hookBetweenCdata,
            includeDoctype: false,
            includeRoot: true,
            includeHead: false,
            includeBody: false,
          });

          assert.strictEqual(
            documentToString(newDoc),
            `\
<!--range--><!-- before html --><!--/range-->\
<html></html>\
<!--range--><!-- after html --><!--/range-->`,
          );
        });

        it('should safely do nothing if documentElement does not exist when truthy', function () {
          var doc = DocumentCloner.clone(baseDoc);
          doc.documentElement.remove();
          assert.strictEqual(
            documentToString(doc),
            `\
<!DOCTYPE html>\
<!-- before html -->\
<!-- after html -->`,
          );

          var selection = [
            (() => {
              var range = doc.createRange();
              range.selectNode(doc.childNodes[1]);
              return range;
            })(),
            (() => {
              var range = doc.createRange();
              range.selectNode(doc.lastChild);
              return range;
            })(),
          ];
          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var newDoc = PartialDocumentCloner.clone(doc, {
            selection, origNodeMap, clonedNodeMap,
            hookBeforeRange, hookAfterRange,
            hookBetweenText, hookBetweenComment, hookBetweenCdata,
            includeDoctype: false,
            includeRoot: true,
            includeHead: false,
            includeBody: false,
          });

          assert.strictEqual(
            documentToString(newDoc),
            `\
<!--range--><!-- before html --><!--/range-->\
<!--range--><!-- after html --><!--/range-->`,
          );
        });

        it('should not clone documentElement when falsy', function () {
          var doc = baseDoc;
          var selection = [
            (() => {
              var range = doc.createRange();
              range.selectNode(doc.childNodes[1]);
              return range;
            })(),
            (() => {
              var range = doc.createRange();
              range.selectNode(doc.lastChild);
              return range;
            })(),
          ];
          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var newDoc = PartialDocumentCloner.clone(doc, {
            selection, origNodeMap, clonedNodeMap,
            hookBeforeRange, hookAfterRange,
            hookBetweenText, hookBetweenComment, hookBetweenCdata,
            includeDoctype: false,
            includeRoot: false,
            includeHead: false,
            includeBody: false,
          });

          assert.strictEqual(
            documentToString(newDoc),
            `\
<!--range--><!-- before html --><!--/range-->\
<!--range--><!-- after html --><!--/range-->`,
          );
        });

        it('should safely do nothing if documentElement is cloned with selected descendants when falsy', function () {
          var doc = baseDoc;
          var selection = [
            (() => {
              var range = doc.createRange();
              range.selectNode(doc.querySelector('section'));
              return range;
            })(),
          ];
          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var newDoc = PartialDocumentCloner.clone(doc, {
            selection, origNodeMap, clonedNodeMap,
            hookBeforeRange, hookAfterRange,
            hookBetweenText, hookBetweenComment, hookBetweenCdata,
            includeDoctype: false,
            includeRoot: false,
            includeHead: false,
            includeBody: false,
          });

          assert.strictEqual(
            documentToString(newDoc),
            `\
<html>\
<body><!--range--><section></section><!--/range--></body>\
</html>`,
          );
        });
      });

      context('option `includeHead`', function () {
        let baseDoc;

        before(function initBaseDoc() {
          baseDoc = createDocFixture({code: `\
<!DOCTYPE html>\
<html>\
<head>
<meta charset="utf-8">
<title>mytitle</title>
</head>
<body><section></section></body>\
</html>`});
          assert.strictEqual(
            documentToString(baseDoc),
            `\
<!DOCTYPE html>\
<html>\
<head>
<meta charset="utf-8">
<title>mytitle</title>
</head>
<body><section></section></body>\
</html>`,
          );
        });

        it('should clone head if exists when truthy', function () {
          var doc = baseDoc;
          var selection = [
            (() => {
              var range = doc.createRange();
              range.selectNode(doc.querySelector('section'));
              return range;
            })(),
          ];
          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var newDoc = PartialDocumentCloner.clone(doc, {
            selection, origNodeMap, clonedNodeMap,
            hookBeforeRange, hookAfterRange,
            hookBetweenText, hookBetweenComment, hookBetweenCdata,
            includeDoctype: false,
            includeRoot: false,
            includeHead: true,
            includeBody: false,
          });

          assert.strictEqual(
            documentToString(newDoc),
            `\
<html>\
<head>
<meta charset="utf-8">
<title>mytitle</title>
</head>\
<body><!--range--><section></section><!--/range--></body>\
</html>`,
          );
        });

        it('should safely do nothing if head does not exist when truthy', function () {
          var doc = DocumentCloner.clone(baseDoc);
          doc.head.remove();
          assert.strictEqual(
            documentToString(doc),
            `\
<!DOCTYPE html>\
<html>
<body><section></section></body>\
</html>`,
          );

          var selection = [
            (() => {
              var range = doc.createRange();
              range.selectNode(doc.querySelector('section'));
              return range;
            })(),
          ];
          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var newDoc = PartialDocumentCloner.clone(doc, {
            selection, origNodeMap, clonedNodeMap,
            hookBeforeRange, hookAfterRange,
            hookBetweenText, hookBetweenComment, hookBetweenCdata,
            includeDoctype: false,
            includeRoot: false,
            includeHead: false,
            includeBody: false,
          });

          assert.strictEqual(
            documentToString(newDoc),
            `\
<html>\
<body><!--range--><section></section><!--/range--></body>\
</html>`,
          );
        });

        it('should not clone head when falsy', function () {
          var doc = baseDoc;
          var selection = [
            (() => {
              var range = doc.createRange();
              range.selectNode(doc.querySelector('section'));
              return range;
            })(),
          ];
          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var newDoc = PartialDocumentCloner.clone(doc, {
            selection, origNodeMap, clonedNodeMap,
            hookBeforeRange, hookAfterRange,
            hookBetweenText, hookBetweenComment, hookBetweenCdata,
            includeDoctype: false,
            includeRoot: false,
            includeHead: false,
            includeBody: false,
          });

          assert.strictEqual(
            documentToString(newDoc),
            `\
<html>\
<body><!--range--><section></section><!--/range--></body>\
</html>`,
          );
        });

        it('should safely do nothing if head is cloned with selected descendants when falsy', function () {
          var doc = baseDoc;
          var selection = [
            (() => {
              var range = doc.createRange();
              range.selectNode(doc.querySelector('meta'));
              return range;
            })(),
          ];
          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var newDoc = PartialDocumentCloner.clone(doc, {
            selection, origNodeMap, clonedNodeMap,
            hookBeforeRange, hookAfterRange,
            hookBetweenText, hookBetweenComment, hookBetweenCdata,
            includeDoctype: false,
            includeRoot: false,
            includeHead: false,
            includeBody: false,
          });

          assert.strictEqual(
            documentToString(newDoc),
            `\
<html>\
<head>\
<!--range--><meta charset="utf-8"><!--/range-->\
</head>\
</html>`,
          );
        });
      });

      context('option `includeBody`', function () {
        var doc;

        before(function initDoc() {
          doc = createDocFixture({code: `\
<!DOCTYPE html>\
<html>\
<head><meta charset="utf-8"></head>
<body><section></section></body>\
</html>`});
          doc.body.insertAdjacentHTML('afterend', '<script>console.log("after body");</script>');
          assert.strictEqual(
            documentToString(doc),
            `\
<!DOCTYPE html>\
<html>\
<head><meta charset="utf-8"></head>
<body><section></section></body>\
<script>console.log("after body");</script>\
</html>`,
          );
        });

        it('should clone body if exists when truthy', function () {
          var selection = [
            (() => {
              var range = doc.createRange();
              range.selectNode(doc.querySelector('script'));
              return range;
            })(),
          ];
          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var newDoc = PartialDocumentCloner.clone(doc, {
            selection, origNodeMap, clonedNodeMap,
            hookBeforeRange, hookAfterRange,
            hookBetweenText, hookBetweenComment, hookBetweenCdata,
            includeDoctype: false,
            includeRoot: false,
            includeHead: false,
            includeBody: true,
          });

          assert.strictEqual(
            documentToString(newDoc),
            `\
<html>\
<body></body>\
<!--range--><script>console.log("after body");</script><!--/range-->\
</html>`,
          );
        });

        it('should safely do nothing if body does not exist when truthy', function () {
          var doc = createDocFixture({code: `\
<!DOCTYPE html>\
<html>\
<head><meta charset="utf-8"></head>
<body><section></section></body>\
</html>`});
          doc.body.remove();
          assert.strictEqual(
            documentToString(doc),
            `\
<!DOCTYPE html>\
<html>\
<head><meta charset="utf-8"></head>
</html>`,
          );

          var selection = [
            (() => {
              var range = doc.createRange();
              range.selectNode(doc.querySelector('meta'));
              return range;
            })(),
          ];
          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var newDoc = PartialDocumentCloner.clone(doc, {
            selection, origNodeMap, clonedNodeMap,
            hookBeforeRange, hookAfterRange,
            hookBetweenText, hookBetweenComment, hookBetweenCdata,
            includeDoctype: false,
            includeRoot: false,
            includeHead: false,
            includeBody: true,
          });

          assert.strictEqual(
            documentToString(newDoc),
            `\
<html>\
<head><!--range--><meta charset="utf-8"><!--/range--></head>\
</html>`,
          );
        });

        it('should not clone body when falsy', function () {
          var selection = [
            (() => {
              var range = doc.createRange();
              range.selectNode(doc.querySelector('script'));
              return range;
            })(),
          ];
          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var newDoc = PartialDocumentCloner.clone(doc, {
            selection, origNodeMap, clonedNodeMap,
            hookBeforeRange, hookAfterRange,
            hookBetweenText, hookBetweenComment, hookBetweenCdata,
            includeDoctype: false,
            includeRoot: false,
            includeHead: false,
            includeBody: false,
          });

          assert.strictEqual(
            documentToString(newDoc),
            `\
<html>\
<!--range--><script>console.log("after body");</script><!--/range-->\
</html>`,
          );
        });

        it('should safely do nothing if body is cloned with selected descendants when falsy', function () {
          var selection = [
            (() => {
              var range = doc.createRange();
              range.selectNode(doc.querySelector('section'));
              return range;
            })(),
          ];
          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var newDoc = PartialDocumentCloner.clone(doc, {
            selection, origNodeMap, clonedNodeMap,
            hookBeforeRange, hookAfterRange,
            hookBetweenText, hookBetweenComment, hookBetweenCdata,
            includeDoctype: false,
            includeRoot: false,
            includeHead: false,
            includeBody: false,
          });

          assert.strictEqual(
            documentToString(newDoc),
            `\
<html>\
<body><!--range--><section></section><!--/range--></body>\
</html>`,
          );
        });

      });

      context('default options', function () {
        let baseDoc;

        before(function initBaseDoc() {
          baseDoc = createDocFixture({code: `\
<!DOCTYPE html>\
<html>\
<head>
<meta charset="utf-8">
</head>
<body>
<section>text<div><br></div><!--comment--></section>
</body>\
</html>`});
          assert.strictEqual(
            documentToString(baseDoc),
            `\
<!DOCTYPE html>\
<html>\
<head>
<meta charset="utf-8">
</head>
<body>
<section>text<div><br></div><!--comment--></section>
</body>\
</html>`,
          );
        });

        it('should clone the selected nodes with ancestors', function () {
          var doc = baseDoc;
          var selection = [
            (() => {
              var range = doc.createRange();
              range.selectNode(doc.querySelector('div'));
              return range;
            })(),
          ];
          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var newDoc = PartialDocumentCloner.clone(doc, {
            selection, origNodeMap, clonedNodeMap,
            hookBeforeRange, hookAfterRange,
            hookBetweenText, hookBetweenComment, hookBetweenCdata,
          });

          assert.strictEqual(
            documentToString(newDoc),
            `\
<!DOCTYPE html>\
<html>\
<head>
<meta charset="utf-8">
</head>\
<body>\
<section><!--range--><div><br></div><!--/range--></section>\
</body>\
</html>`,
          );
        });

        it('should clone doctype, documentElement, head, and body when no selection', function () {
          var doc = baseDoc;
          var selection = [];
          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          var newDoc = PartialDocumentCloner.clone(doc, {
            selection, origNodeMap, clonedNodeMap,
            hookBeforeRange, hookAfterRange,
            hookBetweenText, hookBetweenComment, hookBetweenCdata,
          });

          assert.strictEqual(
            documentToString(newDoc),
            `\
<!DOCTYPE html>\
<html>\
<head>
<meta charset="utf-8">
</head>\
<body></body>\
</html>`,
          );
        });
      });

      context('shadow DOM handling', function () {
        it('should treat each range in a shadow DOM as selecting the outermost shadow root', function () {
          var stub = sinon.stub(PartialDocumentCloner, 'cloneSelection');

          var doc = createDocFixture({name: 'div', shadow: {
            children: [
              {name: 'div', shadow: {
                children: [
                  {name: 'span', value: 'text'},
                ],
              }},
            ],
          }});
          var ranges = [
            (() => {
              var range = doc.createRange();
              range.selectNode(doc.querySelector('div').shadowRoot.querySelector('div').shadowRoot.querySelector('span'));
              return range;
            })(),
          ];
          var origNodeMap = new Map();
          var clonedNodeMap = new Map();
          PartialDocumentCloner.clone(doc, {
            selection: ranges,
            origNodeMap,
            clonedNodeMap,
            includeDoctype: false,
            includeRoot: false,
            includeHead: false,
            includeBody: false,
          });

          sinon.assert.calledOnceWithMatch(stub, doc, {
            ranges: sinon.match.array,
            origNodeMap,
            clonedNodeMap,
          });
          assertRangesEqual(
            stub.getCall(0).args[1].ranges[0],
            (() => {
              var range = doc.createRange();
              range.selectNode(doc.querySelector('div'));
              return range;
            })(),
          );
        });
      });
    });

    describe('.cloneSelection()', function () {
      context('for single range', function () {
        let baseDoc;

        before(function initBaseDoc() {
          baseDoc = createDocFixture({code: `\
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
</head>
<body>
<section>text<div><br></div><!--comment--></section>
</body>
</html>`});
        });

        context('when selecting an Element', function () {
          it('should clone the selected nodes with ancestors', function () {
            var spy = sinon.spy(PartialDocumentCloner, 'cloneNodeAndAncestors');

            var doc = baseDoc;
            var ranges = [
              (() => {
                var range = doc.createRange();
                range.selectNode(doc.querySelector('div'));
                return range;
              })(),
            ];
            var origNodeMap = new Map();
            var clonedNodeMap = new Map();
            var newDoc = PartialDocumentCloner.cloneSelection(doc, {
              ranges, origNodeMap, clonedNodeMap,
              hookBeforeRange, hookAfterRange, hookBetweenText, hookBetweenComment, hookBetweenCdata,
            });

            assert.strictEqual(
              documentToString(newDoc),
              '<html><body><section><!--range--><div><br></div><!--/range--></section></body></html>',
            );

            sinon.assert.calledWithExactly(spy.getCall(0),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(1),
              doc.querySelector('div'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(2),
              doc.querySelector('br'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            assert.isNull(spy.getCall(3));
          });
        });

        context('when selecting a Text', function () {
          it('should clone the selected nodes with ancestors', function () {
            var spy = sinon.spy(PartialDocumentCloner, 'cloneNodeAndAncestors');

            var doc = baseDoc;
            var ranges = [
              (() => {
                var range = doc.createRange();
                range.selectNode(doc.querySelector('section').firstChild);
                return range;
              })(),
            ];
            var origNodeMap = new Map();
            var clonedNodeMap = new Map();
            var newDoc = PartialDocumentCloner.cloneSelection(doc, {
              ranges, origNodeMap, clonedNodeMap,
              hookBeforeRange, hookAfterRange, hookBetweenText, hookBetweenComment, hookBetweenCdata,
            });

            assert.strictEqual(
              documentToString(newDoc),
              '<html><body><section><!--range-->text<!--/range--></section></body></html>',
            );

            sinon.assert.calledWithExactly(spy.getCall(0),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(1),
              doc.querySelector('section').firstChild,
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            assert.isNull(spy.getCall(2));
          });

          it('should insert the split node when the selection starts in a Text', function () {
            var spy = sinon.spy(PartialDocumentCloner, 'cloneNodeAndAncestors');

            var doc = baseDoc;
            var ranges = [
              (() => {
                var range = doc.createRange();
                range.setStart(doc.querySelector('section').firstChild, 1);
                range.setEndAfter(doc.querySelector('section').firstChild);
                return range;
              })(),
            ];
            var origNodeMap = new Map();
            var clonedNodeMap = new Map();
            var newDoc = PartialDocumentCloner.cloneSelection(doc, {
              ranges, origNodeMap, clonedNodeMap,
              hookBeforeRange, hookAfterRange, hookBetweenText, hookBetweenComment, hookBetweenCdata,
            });

            assert.strictEqual(
              documentToString(newDoc),
              '<html><body><section><!--range-->ext<!--/range--></section></body></html>',
            );

            sinon.assert.calledWithExactly(spy.getCall(0),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(1),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            assert.isNull(spy.getCall(2));
          });

          it('should insert the split node when the selection ends in a Text', function () {
            var spy = sinon.spy(PartialDocumentCloner, 'cloneNodeAndAncestors');

            var doc = baseDoc;
            var ranges = [
              (() => {
                var range = doc.createRange();
                range.setStartBefore(doc.querySelector('section').firstChild);
                range.setEnd(doc.querySelector('section').firstChild, 3);
                return range;
              })(),
            ];
            var origNodeMap = new Map();
            var clonedNodeMap = new Map();
            var newDoc = PartialDocumentCloner.cloneSelection(doc, {
              ranges, origNodeMap, clonedNodeMap,
              hookBeforeRange, hookAfterRange, hookBetweenText, hookBetweenComment, hookBetweenCdata,
            });

            assert.strictEqual(
              documentToString(newDoc),
              '<html><body><section><!--range-->tex<!--/range--></section></body></html>',
            );

            sinon.assert.calledWithExactly(spy.getCall(0),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(1),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            assert.isNull(spy.getCall(2));
          });

          it('should insert the split node when the selection starts and ends in a Text', function () {
            var spy = sinon.spy(PartialDocumentCloner, 'cloneNodeAndAncestors');

            var doc = baseDoc;
            var ranges = [
              (() => {
                var range = doc.createRange();
                range.setStart(doc.querySelector('section').firstChild, 1);
                range.setEnd(doc.querySelector('section').firstChild, 3);
                return range;
              })(),
            ];
            var origNodeMap = new Map();
            var clonedNodeMap = new Map();
            var newDoc = PartialDocumentCloner.cloneSelection(doc, {
              ranges, origNodeMap, clonedNodeMap,
              hookBeforeRange, hookAfterRange, hookBetweenText, hookBetweenComment, hookBetweenCdata,
            });

            assert.strictEqual(
              documentToString(newDoc),
              '<html><body><section><!--range-->ex<!--/range--></section></body></html>',
            );

            sinon.assert.calledWithExactly(spy.getCall(0),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(1),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            assert.isNull(spy.getCall(2));
          });
        });

        context('when selecting a Comment', function () {
          it('should clone the selected nodes with ancestors', function () {
            var spy = sinon.spy(PartialDocumentCloner, 'cloneNodeAndAncestors');

            var doc = baseDoc;
            var ranges = [
              (() => {
                var range = doc.createRange();
                range.selectNode(doc.querySelector('section').lastChild);
                return range;
              })(),
            ];
            var origNodeMap = new Map();
            var clonedNodeMap = new Map();
            var newDoc = PartialDocumentCloner.cloneSelection(doc, {
              ranges, origNodeMap, clonedNodeMap,
              hookBeforeRange, hookAfterRange, hookBetweenText, hookBetweenComment, hookBetweenCdata,
            });

            assert.strictEqual(
              documentToString(newDoc),
              '<html><body><section><!--range--><!--comment--><!--/range--></section></body></html>',
            );

            sinon.assert.calledWithExactly(spy.getCall(0),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(1),
              doc.querySelector('section').lastChild,
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            assert.isNull(spy.getCall(2));
          });

          it('should insert the split node when the selection starts in a Comment', function () {
            var spy = sinon.spy(PartialDocumentCloner, 'cloneNodeAndAncestors');

            var doc = baseDoc;
            var ranges = [
              (() => {
                var range = doc.createRange();
                range.setStart(doc.querySelector('section').lastChild, 3);
                range.setEndAfter(doc.querySelector('section').lastChild);
                return range;
              })(),
            ];
            var origNodeMap = new Map();
            var clonedNodeMap = new Map();
            var newDoc = PartialDocumentCloner.cloneSelection(doc, {
              ranges, origNodeMap, clonedNodeMap,
              hookBeforeRange, hookAfterRange, hookBetweenText, hookBetweenComment, hookBetweenCdata,
            });

            assert.strictEqual(
              documentToString(newDoc),
              '<html><body><section><!--range--><!--ment--><!--/range--></section></body></html>',
            );

            sinon.assert.calledWithExactly(spy.getCall(0),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(1),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            assert.isNull(spy.getCall(2));
          });

          it('should insert the split node when the selection ends in a Comment', function () {
            var spy = sinon.spy(PartialDocumentCloner, 'cloneNodeAndAncestors');

            var doc = baseDoc;
            var ranges = [
              (() => {
                var range = doc.createRange();
                range.setStartBefore(doc.querySelector('section').lastChild);
                range.setEnd(doc.querySelector('section').lastChild, 3);
                return range;
              })(),
            ];
            var origNodeMap = new Map();
            var clonedNodeMap = new Map();
            var newDoc = PartialDocumentCloner.cloneSelection(doc, {
              ranges, origNodeMap, clonedNodeMap,
              hookBeforeRange, hookAfterRange, hookBetweenText, hookBetweenComment, hookBetweenCdata,
            });

            assert.strictEqual(
              documentToString(newDoc),
              '<html><body><section><!--range--><!--com--><!--/range--></section></body></html>',
            );

            sinon.assert.calledWithExactly(spy.getCall(0),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(1),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            assert.isNull(spy.getCall(2));
          });

          it('should insert the split node when the selection starts and ends in a Comment', function () {
            var spy = sinon.spy(PartialDocumentCloner, 'cloneNodeAndAncestors');

            var doc = baseDoc;
            var ranges = [
              (() => {
                var range = doc.createRange();
                range.setStart(doc.querySelector('section').lastChild, 3);
                range.setEnd(doc.querySelector('section').lastChild, 6);
                return range;
              })(),
            ];
            var origNodeMap = new Map();
            var clonedNodeMap = new Map();
            var newDoc = PartialDocumentCloner.cloneSelection(doc, {
              ranges, origNodeMap, clonedNodeMap,
              hookBeforeRange, hookAfterRange, hookBetweenText, hookBetweenComment, hookBetweenCdata,
            });

            assert.strictEqual(
              documentToString(newDoc),
              '<html><body><section><!--range--><!--men--><!--/range--></section></body></html>',
            );

            sinon.assert.calledWithExactly(spy.getCall(0),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(1),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            assert.isNull(spy.getCall(2));
          });
        });

        context('when selecting a CDATA', function () {
          let baseDoc;

          before(function initBaseDoc() {
            baseDoc = createDocFixture({type: 'xhtml', code: `\
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
<section><![CDATA[1 + 1 > 2]]></section>
</body>
</html>`});
          });

          it('should clone the selected nodes with ancestors', function () {
            var spy = sinon.spy(PartialDocumentCloner, 'cloneNodeAndAncestors');

            var doc = baseDoc;
            var ranges = [
              (() => {
                var range = doc.createRange();
                range.selectNode(doc.querySelector('section').firstChild);
                return range;
              })(),
            ];
            var origNodeMap = new Map();
            var clonedNodeMap = new Map();
            var newDoc = PartialDocumentCloner.cloneSelection(doc, {
              ranges, origNodeMap, clonedNodeMap,
              hookBeforeRange, hookAfterRange, hookBetweenText, hookBetweenComment, hookBetweenCdata,
            });

            assert.strictEqual(
              documentToString(newDoc),
              '<html xmlns="http://www.w3.org/1999/xhtml"><body><section><!--range--><![CDATA[1 + 1 > 2]]><!--/range--></section></body></html>',
            );

            sinon.assert.calledWithExactly(spy.getCall(0),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(1),
              doc.querySelector('section').firstChild,
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            assert.isNull(spy.getCall(2));
          });

          it('should insert the split node when the selection starts in a CDATA', function () {
            var spy = sinon.spy(PartialDocumentCloner, 'cloneNodeAndAncestors');

            var doc = baseDoc;
            var ranges = [
              (() => {
                var range = doc.createRange();
                range.setStart(doc.querySelector('section').firstChild, 4);
                range.setEndAfter(doc.querySelector('section').firstChild);
                return range;
              })(),
            ];
            var origNodeMap = new Map();
            var clonedNodeMap = new Map();
            var newDoc = PartialDocumentCloner.cloneSelection(doc, {
              ranges, origNodeMap, clonedNodeMap,
              hookBeforeRange, hookAfterRange, hookBetweenText, hookBetweenComment, hookBetweenCdata,
            });

            assert.strictEqual(
              documentToString(newDoc),
              '<html xmlns="http://www.w3.org/1999/xhtml"><body><section><!--range--><![CDATA[1 > 2]]><!--/range--></section></body></html>',
            );

            sinon.assert.calledWithExactly(spy.getCall(0),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(1),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            assert.isNull(spy.getCall(2));
          });

          it('should insert the split node when the selection ends in a CDATA', function () {
            var spy = sinon.spy(PartialDocumentCloner, 'cloneNodeAndAncestors');

            var doc = baseDoc;
            var ranges = [
              (() => {
                var range = doc.createRange();
                range.setStartBefore(doc.querySelector('section').firstChild);
                range.setEnd(doc.querySelector('section').firstChild, 5);
                return range;
              })(),
            ];
            var origNodeMap = new Map();
            var clonedNodeMap = new Map();
            var newDoc = PartialDocumentCloner.cloneSelection(doc, {
              ranges, origNodeMap, clonedNodeMap,
              hookBeforeRange, hookAfterRange, hookBetweenText, hookBetweenComment, hookBetweenCdata,
            });

            assert.strictEqual(
              documentToString(newDoc),
              '<html xmlns="http://www.w3.org/1999/xhtml"><body><section><!--range--><![CDATA[1 + 1]]><!--/range--></section></body></html>',
            );

            sinon.assert.calledWithExactly(spy.getCall(0),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(1),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            assert.isNull(spy.getCall(2));
          });

          it('should insert the split node when the selection starts and ends in a CDATA', function () {
            var spy = sinon.spy(PartialDocumentCloner, 'cloneNodeAndAncestors');

            var doc = baseDoc;
            var ranges = [
              (() => {
                var range = doc.createRange();
                range.setStart(doc.querySelector('section').firstChild, 2);
                range.setEnd(doc.querySelector('section').firstChild, 5);
                return range;
              })(),
            ];
            var origNodeMap = new Map();
            var clonedNodeMap = new Map();
            var newDoc = PartialDocumentCloner.cloneSelection(doc, {
              ranges, origNodeMap, clonedNodeMap,
              hookBeforeRange, hookAfterRange, hookBetweenText, hookBetweenComment, hookBetweenCdata,
            });

            assert.strictEqual(
              documentToString(newDoc),
              '<html xmlns="http://www.w3.org/1999/xhtml"><body><section><!--range--><![CDATA[+ 1]]><!--/range--></section></body></html>',
            );

            sinon.assert.calledWithExactly(spy.getCall(0),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(1),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            assert.isNull(spy.getCall(2));
          });
        });

        context('when selecting multiple nodes', function () {
          let baseDoc;

          before(function initBaseDoc() {
            baseDoc = createDocFixture({code: `\
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
</head>
<body>
<section id="s1">text<div><br></div><!--comment--></section>
<section id="s2">text<div><br></div><!--comment--></section>
<section id="s3">text<div><br></div><!--comment--></section>
</body>
</html>`});
          });

          it('should clone the selected nodes with ancestors', function () {
            var spy = sinon.spy(PartialDocumentCloner, 'cloneNodeAndAncestors');

            var doc = baseDoc;
            var ranges = [
              (() => {
                var range = doc.createRange();
                range.setStart(doc.querySelector('#s1'), 2);
                range.setEnd(doc.querySelector('#s3'), 1);
                return range;
              })(),
            ];
            var origNodeMap = new Map();
            var clonedNodeMap = new Map();
            var newDoc = PartialDocumentCloner.cloneSelection(doc, {
              ranges, origNodeMap, clonedNodeMap,
              hookBeforeRange, hookAfterRange, hookBetweenText, hookBetweenComment, hookBetweenCdata,
            });

            assert.strictEqual(
              documentToString(newDoc),
              `\
<html>\
<body>\
<!--range-->\
<section id="s1"><!--comment--></section>
<section id="s2">text<div><br></div><!--comment--></section>
<section id="s3">text</section>\
<!--/range-->\
</body>\
</html>`,
            );

            sinon.assert.calledWithExactly(spy.getCall(0),
              doc.querySelector('body'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(1),
              doc.querySelector('#s1').lastChild,
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(2),
              doc.querySelector('#s1').nextSibling,
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(3),
              doc.querySelector('#s2'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(4),
              doc.querySelector('#s2').firstChild,
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(5),
              doc.querySelector('#s2 div'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(6),
              doc.querySelector('#s2 div br'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(7),
              doc.querySelector('#s2').lastChild,
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(8),
              doc.querySelector('#s2').nextSibling,
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(9),
              doc.querySelector('#s3').firstChild,
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            assert.isNull(spy.getCall(10));
          });
        });

        context('when collapsed', function () {
          it('should do nothing', function () {
            var spy = sinon.spy(PartialDocumentCloner, 'cloneNodeAndAncestors');

            var doc = baseDoc;
            var ranges = [
              (() => {
                var range = doc.createRange();
                range.setStart(doc.querySelector('section'), 0);
                range.setEnd(doc.querySelector('section'), 0);
                return range;
              })(),
            ];
            var origNodeMap = new Map();
            var clonedNodeMap = new Map();
            var newDoc = PartialDocumentCloner.cloneSelection(doc, {
              ranges, origNodeMap, clonedNodeMap,
              hookBeforeRange, hookAfterRange, hookBetweenText, hookBetweenComment, hookBetweenCdata,
            });

            assert.strictEqual(
              documentToString(newDoc),
              '',
            );

            sinon.assert.notCalled(spy);
          });
        });
      });

      context('for multiple ranges', function () {
        context('for ranges of nodes', function () {
          it('should clone the selected nodes with ancestors', function () {
            var spy = sinon.spy(PartialDocumentCloner, 'cloneNodeAndAncestors');

            var doc = createDocFixture({code: `\
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
</head>
<body>
<section id="s1">text<div><br></div><!--comment--></section>
<section id="s2">text<div><br></div><!--comment--></section>
<section id="s3">text<div><br></div><!--comment--></section>
</body>
</html>`});
            var ranges = [
              (() => {
                var range = doc.createRange();
                range.setStart(doc.querySelector('#s1'), 0);
                range.setEnd(doc.querySelector('#s1'), 1);
                return range;
              })(),
              (() => {
                var range = doc.createRange();
                range.selectNode(doc.querySelector('#s2'));
                return range;
              })(),
              (() => {
                var range = doc.createRange();
                range.setStart(doc.querySelector('#s3'), 1);
                range.setEnd(doc.querySelector('#s3'), 2);
                return range;
              })(),
            ];
            var origNodeMap = new Map();
            var clonedNodeMap = new Map();
            var newDoc = PartialDocumentCloner.cloneSelection(doc, {
              ranges, origNodeMap, clonedNodeMap,
              hookBeforeRange, hookAfterRange, hookBetweenText, hookBetweenComment, hookBetweenCdata,
            });

            assert.strictEqual(
              documentToString(newDoc),
              `\
<html>\
<body>\
<section id="s1"><!--range-->text<!--/range--></section>\
<!--range--><section id="s2">text<div><br></div><!--comment--></section><!--/range-->\
<section id="s3"><!--range--><div><br></div><!--/range--></section>\
</body>\
</html>`,
            );

            sinon.assert.calledWithExactly(spy.getCall(0),
              doc.querySelector('#s1'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(1),
              doc.querySelector('#s1').firstChild,
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(2),
              doc.querySelector('#s2'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(3),
              doc.querySelector('#s2').firstChild,
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(4),
              doc.querySelector('#s2 div'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(5),
              doc.querySelector('#s2 br'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(6),
              doc.querySelector('#s2').lastChild,
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(7),
              doc.querySelector('#s3'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(8),
              doc.querySelector('#s3 div'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(9),
              doc.querySelector('#s3 br'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            assert.isNull(spy.getCall(10));
          });
        });

        context('for ranges in a Text', function () {
          it('should split the Text and add splitters between them', function () {
            var spy = sinon.spy(PartialDocumentCloner, 'cloneNodeAndAncestors');

            var doc = createDocFixture({code: `\
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
</head>
<body>
<section>text1 text2 text3 text4 text5</section>
</body>
</html>`});
            var ranges = [
              (() => {
                var range = doc.createRange();
                range.setStartBefore(doc.querySelector('section').firstChild);
                range.setEnd(doc.querySelector('section').firstChild, 5);
                return range;
              })(),
              (() => {
                var range = doc.createRange();
                range.setStart(doc.querySelector('section').firstChild, 12);
                range.setEnd(doc.querySelector('section').firstChild, 17);
                return range;
              })(),
              (() => {
                var range = doc.createRange();
                range.setStart(doc.querySelector('section').firstChild, 24);
                range.setEndAfter(doc.querySelector('section').firstChild);
                return range;
              })(),
            ];
            var origNodeMap = new Map();
            var clonedNodeMap = new Map();
            var newDoc = PartialDocumentCloner.cloneSelection(doc, {
              ranges, origNodeMap, clonedNodeMap,
              hookBeforeRange, hookAfterRange, hookBetweenText, hookBetweenComment, hookBetweenCdata,
            });

            assert.strictEqual(
              documentToString(newDoc),
              `\
<html>\
<body>\
<section>\
<!--range-->text1<!--/range-->\
<!--splitter--> … <!--/splitter-->\
<!--range-->text3<!--/range-->\
<!--splitter--> … <!--/splitter-->\
<!--range-->text5<!--/range-->\
</section>\
</body>\
</html>`,
            );

            sinon.assert.calledWithExactly(spy.getCall(0),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(1),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(2),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(3),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            assert.isNull(spy.getCall(4));
          });
        });

        context('for ranges in a Comment', function () {
          it('should split the Comment and add splitters between them', function () {
            var spy = sinon.spy(PartialDocumentCloner, 'cloneNodeAndAncestors');

            var doc = createDocFixture({code: `\
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
</head>
<body>
<section><!--text1 text2 text3 text4 text5--></section>
</body>
</html>`});
            var ranges = [
              (() => {
                var range = doc.createRange();
                range.setStartBefore(doc.querySelector('section').firstChild);
                range.setEnd(doc.querySelector('section').firstChild, 5);
                return range;
              })(),
              (() => {
                var range = doc.createRange();
                range.setStart(doc.querySelector('section').firstChild, 12);
                range.setEnd(doc.querySelector('section').firstChild, 17);
                return range;
              })(),
              (() => {
                var range = doc.createRange();
                range.setStart(doc.querySelector('section').firstChild, 24);
                range.setEndAfter(doc.querySelector('section').firstChild);
                return range;
              })(),
            ];
            var origNodeMap = new Map();
            var clonedNodeMap = new Map();
            var newDoc = PartialDocumentCloner.cloneSelection(doc, {
              ranges, origNodeMap, clonedNodeMap,
              hookBeforeRange, hookAfterRange, hookBetweenText, hookBetweenComment, hookBetweenCdata,
            });

            assert.strictEqual(
              documentToString(newDoc),
              `\
<html>\
<body>\
<section>\
<!--range--><!--text1--><!--/range-->\
<!--splitter--><!-- … --><!--/splitter-->\
<!--range--><!--text3--><!--/range-->\
<!--splitter--><!-- … --><!--/splitter-->\
<!--range--><!--text5--><!--/range-->\
</section>\
</body>\
</html>`,
            );

            sinon.assert.calledWithExactly(spy.getCall(0),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(1),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(2),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(3),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            assert.isNull(spy.getCall(4));
          });
        });

        context('for ranges in a CDATA', function () {
          it('should split the CDATA and add splitters between them', function () {
            var spy = sinon.spy(PartialDocumentCloner, 'cloneNodeAndAncestors');

            var doc = createDocFixture({type: 'xhtml', code: `\
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN" "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
<section><![CDATA[text1 text2 text3 text4 text5]]></section>
</body>
</html>`});
            var ranges = [
              (() => {
                var range = doc.createRange();
                range.setStartBefore(doc.querySelector('section').firstChild);
                range.setEnd(doc.querySelector('section').firstChild, 5);
                return range;
              })(),
              (() => {
                var range = doc.createRange();
                range.setStart(doc.querySelector('section').firstChild, 12);
                range.setEnd(doc.querySelector('section').firstChild, 17);
                return range;
              })(),
              (() => {
                var range = doc.createRange();
                range.setStart(doc.querySelector('section').firstChild, 24);
                range.setEndAfter(doc.querySelector('section').firstChild);
                return range;
              })(),
            ];
            var origNodeMap = new Map();
            var clonedNodeMap = new Map();
            var newDoc = PartialDocumentCloner.cloneSelection(doc, {
              ranges, origNodeMap, clonedNodeMap,
              hookBeforeRange, hookAfterRange, hookBetweenText, hookBetweenComment, hookBetweenCdata,
            });

            assert.strictEqual(
              documentToString(newDoc),
              `\
<html xmlns="http://www.w3.org/1999/xhtml">\
<body>\
<section>\
<!--range--><![CDATA[text1]]><!--/range-->\
<!--splitter--><![CDATA[ … ]]><!--/splitter-->\
<!--range--><![CDATA[text3]]><!--/range-->\
<!--splitter--><![CDATA[ … ]]><!--/splitter-->\
<!--range--><![CDATA[text5]]><!--/range-->\
</section>\
</body>\
</html>`,
            );

            sinon.assert.calledWithExactly(spy.getCall(0),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(1),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(2),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(3),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            assert.isNull(spy.getCall(4));
          });
        });
      });

      context('for special ranges', function () {
        let baseDoc;

        before(function initBaseDoc() {
          baseDoc = createDocFixture({code: `\
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
</head>
<body>
<section>text<div><br></div><!--comment--></section>
</body>
</html>`});
        });

        context('when selecting nodes', function () {
          it('should ignore `hookBeforeRange`/`hookAfterRange`', function () {
            var spy = sinon.spy(PartialDocumentCloner, 'cloneNodeAndAncestors');

            var doc = baseDoc;
            var ranges = [
              (() => {
                var range = doc.createRange();
                range.setStart(doc.querySelector('section'), 0);
                range.setEnd(doc.querySelector('section').lastChild, 3);
                return range;
              })(),
              (() => {
                var range = doc.createRange();
                range.setStart(doc.querySelector('section').lastChild, 4);
                range.setEnd(doc.querySelector('section').lastChild, 7);
                return range;
              })(),
            ];
            var specialRanges = new Set(ranges);
            var origNodeMap = new Map();
            var clonedNodeMap = new Map();
            var newDoc = PartialDocumentCloner.cloneSelection(doc, {
              ranges, specialRanges, origNodeMap, clonedNodeMap,
              hookBeforeRange, hookAfterRange, hookBetweenText, hookBetweenComment, hookBetweenCdata,
            });

            assert.strictEqual(
              documentToString(newDoc),
              `\
<html>\
<body>\
<section>text<div><br></div><!--com--><!--splitter--><!-- … --><!--/splitter--><!--ent--></section>\
</body>\
</html>`,
            );

            sinon.assert.calledWithExactly(spy.getCall(0),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(1),
              doc.querySelector('section').firstChild,
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(2),
              doc.querySelector('section div'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(3),
              doc.querySelector('section br'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(4),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            sinon.assert.calledWithExactly(spy.getCall(5),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            assert.isNull(spy.getCall(6));
          });
        });

        context('when collapsed', function () {
          it('should clone the common ancestor node with ancestors', function () {
            var spy = sinon.spy(PartialDocumentCloner, 'cloneNodeAndAncestors');

            var doc = baseDoc;
            var ranges = [
              (() => {
                var range = doc.createRange();
                range.setStart(doc.querySelector('section'), 0);
                range.setEnd(doc.querySelector('section'), 0);
                return range;
              })(),
            ];
            var specialRanges = new Set(ranges);
            var origNodeMap = new Map();
            var clonedNodeMap = new Map();
            var newDoc = PartialDocumentCloner.cloneSelection(doc, {
              ranges, specialRanges, origNodeMap, clonedNodeMap,
              hookBeforeRange, hookAfterRange, hookBetweenText, hookBetweenComment, hookBetweenCdata,
            });

            assert.strictEqual(
              documentToString(newDoc),
              '<html><body><section></section></body></html>',
            );

            sinon.assert.calledWithExactly(spy.getCall(0),
              doc.querySelector('section'),
              {newDoc, origNodeMap, clonedNodeMap, includeShadowDom: undefined},
            );
            assert.isNull(spy.getCall(1));
          });
        });
      });
    });

    describe('.cloneNodeAndAncestors()', function () {
      let baseDoc;

      before(function initBaseDoc() {
        baseDoc = createDocFixture({code: `\
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
</head>
<body>
<section>text<div><br></div><!--comment--></section>
</body>
</html>`});
      });

      it('should clone the specified node with ancestors and append to the cloned document', function () {
        var spy = sinon.spy(PartialDocumentCloner, 'cloneNode');

        var origNodeMap = new Map();
        var clonedNodeMap = new Map();
        var doc = baseDoc;
        var newDoc = PartialDocumentCloner.cloneDocument(doc, {origNodeMap, clonedNodeMap});
        var node = doc.querySelector('div');
        PartialDocumentCloner.cloneNodeAndAncestors(node, {newDoc, origNodeMap, clonedNodeMap});

        assert.strictEqual(documentToString(newDoc), '<html><body><section><div></div></section></body></html>');

        sinon.assert.calledWithExactly(spy.getCall(0), doc.documentElement, false, {
          newDoc,
          origNodeMap,
          clonedNodeMap,
        });
        sinon.assert.calledWithExactly(spy.getCall(1), doc.body, false, {
          newDoc,
          origNodeMap,
          clonedNodeMap,
        });
        sinon.assert.calledWithExactly(spy.getCall(2), doc.querySelector('section'), false, {
          newDoc,
          origNodeMap,
          clonedNodeMap,
        });
        sinon.assert.calledWithExactly(spy.getCall(3), doc.querySelector('div'), false, {
          newDoc,
          origNodeMap,
          clonedNodeMap,
        });
        assert.isNull(spy.getCall(4));
      });

      it('should do nothing if the specified node has already been added', function () {
        var origNodeMap = new Map();
        var clonedNodeMap = new Map();
        var doc = baseDoc;
        var newDoc = PartialDocumentCloner.cloneDocument(doc, {origNodeMap, clonedNodeMap});

        var node = doc.querySelector('div');
        PartialDocumentCloner.cloneNodeAndAncestors(node, {newDoc, origNodeMap, clonedNodeMap});
        assert.strictEqual(documentToString(newDoc), '<html><body><section><div></div></section></body></html>');

        var spy = sinon.spy(PartialDocumentCloner, 'cloneNode');

        var node = doc.querySelector('div');
        PartialDocumentCloner.cloneNodeAndAncestors(node, {newDoc, origNodeMap, clonedNodeMap});
        assert.strictEqual(documentToString(newDoc), '<html><body><section><div></div></section></body></html>');

        sinon.assert.notCalled(spy);
      });
    });
  });
});
