import {
  MochaQuery as $, assert,
  GREEN_BMP_BYTES, createNodeFixture, createDomFixture, createDocFixture, createIframeFixture,
} from "./unittest.mjs";
import sinon from "./lib/sinon-esm.js";
import {
  userAgent, documentToString, getShadowRoot, byteStringToArrayBuffer,
} from "../utils/common.mjs";

import {DocumentCloner} from "../utils/doc-cloner.mjs";

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
});
