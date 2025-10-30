import {MochaQuery as $, assert, runControlledTest, createDocFixture} from "./unittest.mjs";
import sinon from "./lib/sinon-esm.js";
import {NS_HTML, NS_SVG, NS_XLINK} from "../utils/common.mjs";

import {CaptureHelperHandler} from "../capturer/helper-handler.mjs";

const $describe = $(describe);
const $it = $(it);

const r = String.raw;

describe('capturer/helper-handler.mjs', function () {
  afterEach(function () {
    sinon.restore();
  });

  $describe.skipIf($.noBrowser)('CaptureHelperHandler', function () {
    describe(".getOverwritingOptions()", function () {
      it("should not include capture helper related options", function () {
        var options = CaptureHelperHandler.getOverwritingOptions(
          [
            {
              options: {
                "capture.saveTo": "server",
                "capture.saveAs": "folder",
                "capture.helpersEnabled": false,
                "capture.helpers": "[]",
              },
            },
          ],
          "http://example.com",
        );
        assert.deepEqual(options, {
          "capture.saveTo": "server",
          "capture.saveAs": "folder",
        });
      });

      it("should merge options in last-win manner", function () {
        var options = CaptureHelperHandler.getOverwritingOptions(
          [
            {
              options: {
                "capture.image": "link",
                "capture.imageBackground": "link",
                "capture.favicon": "link",
              },
            },
            {
              options: {
                "capture.imageBackground": "save",
                "capture.font": "save",
              },
            },
          ],
          "http://example.com",
        );
        assert.deepEqual(options, {
          "capture.image": "link",
          "capture.imageBackground": "save",
          "capture.favicon": "link",
          "capture.font": "save",
        });
      });

      it("should skip helpers with truthy disabled property", function () {
        var options = CaptureHelperHandler.getOverwritingOptions(
          [
            {
              options: {
                "capture.image": "link",
                "capture.imageBackground": "link",
              },
            },
            {
              disabled: false,
              options: {
                "capture.favicon": "link",
              },
            },
            {
              disabled: true,
              options: {
                "capture.imageBackground": "save",
                "capture.font": "save",
              },
            },
          ],
          "http://example.com",
        );
        assert.deepEqual(options, {
          "capture.image": "link",
          "capture.imageBackground": "link",
          "capture.favicon": "link",
        });
      });

      it("should skip helpers whose pattern do not match document URL", function () {
        var options = CaptureHelperHandler.getOverwritingOptions(
          [
            {
              pattern: /unknown\.site/,
              options: {
                "capture.image": "link",
                "capture.imageBackground": "link",
              },
            },
            {
              pattern: /example\.com/,
              options: {
                "capture.image": "remove",
                "capture.imageBackground": "remove",
              },
            },
          ],
          "http://example.com",
        );
        assert.deepEqual(options, {
          "capture.image": "remove",
          "capture.imageBackground": "remove",
        });
      });

      it("should return empty object if docUrl is falsy", function () {
        var options = CaptureHelperHandler.getOverwritingOptions(
          [
            {
              options: {
                "capture.image": "link",
              },
            },
            {
              pattern: /(?:)/,
              options: {
                "capture.imageBackground": "link",
              },
            },
          ],
          "",
        );
        assert.deepEqual(options, {});
      });
    });

    describe(".parseRegexStr()", function () {
      it("should return {source, flags} for a RegExp", function () {
        var {source, flags} = CaptureHelperHandler.parseRegexStr(`/abc/def/`);
        assert.deepEqual({source, flags}, {source: r`abc\/def`, flags: ``});

        var {source, flags} = CaptureHelperHandler.parseRegexStr(`/abc/def/imguy`);
        assert.deepEqual({source, flags}, {source: r`abc\/def`, flags: `gimuy`});
      });

      it("should return null for an invalid regex string", function () {
        assert.strictEqual(CaptureHelperHandler.parseRegexStr(`abc/def`), null);
      });
    });

    describe(".isCommand()", function () {
      it("should return true if passing a command array", function () {
        assert.strictEqual(CaptureHelperHandler.isCommand(["if", true, "yes", "no"]), true);
        assert.strictEqual(CaptureHelperHandler.isCommand(["if"]), true);
      });

      it("should return true if passing another value", function () {
        assert.strictEqual(CaptureHelperHandler.isCommand(null), false);
        assert.strictEqual(CaptureHelperHandler.isCommand(0), false);
        assert.strictEqual(CaptureHelperHandler.isCommand(1), false);
        assert.strictEqual(CaptureHelperHandler.isCommand(""), false);
        assert.strictEqual(CaptureHelperHandler.isCommand(`["if", true, "yes", "no"]`), false);
        assert.strictEqual(CaptureHelperHandler.isCommand([]), false);
        assert.strictEqual(CaptureHelperHandler.isCommand([1, 2, 3]), false);
        assert.strictEqual(CaptureHelperHandler.isCommand({}), false);
      });
    });

    describe(".selectNodes()", function () {
      function makeTestDoc() {
        return createDocFixture({code: `\
<body>
<div id="parent-prev"></div>
<div id="parent">
  <div id="prev"></div>
  <div id="target">
    <div id="child-1"></div>
    <div id="child-2"></div>
    <div id="child-3"></div>
  </div>
  <div id="next"></div>
</div>
<div id="parent-next"></div>
</body>`});
      }

      context("when passing an object selector", function () {
        context("should select with CSS when having `.css`", function () {
          it("should return matched elements", function () {
            var doc = makeTestDoc();
            var selector = {css: "div"};
            var result = Array.from(CaptureHelperHandler.selectNodes(doc, selector));
            assert.deepEqual(result, [
              doc.querySelector('#parent-prev'),
              doc.querySelector('#parent'),
              doc.querySelector('#prev'),
              doc.querySelector('#target'),
              doc.querySelector('#child-1'),
              doc.querySelector('#child-2'),
              doc.querySelector('#child-3'),
              doc.querySelector('#next'),
              doc.querySelector('#parent-next'),
            ]);
          });
        });

        context("should select with XPath when having `.xpath`", function () {
          it("should return matched nodes", function () {
            var doc = makeTestDoc();
            var selector = {xpath: ".//div"};
            var result = CaptureHelperHandler.selectNodes(doc, selector);
            assert.deepEqual(result, [
              doc.querySelector('#parent-prev'),
              doc.querySelector('#parent'),
              doc.querySelector('#prev'),
              doc.querySelector('#target'),
              doc.querySelector('#child-1'),
              doc.querySelector('#child-2'),
              doc.querySelector('#child-3'),
              doc.querySelector('#next'),
              doc.querySelector('#parent-next'),
            ]);
          });

          it("should resolve namespaces with `.nsmap`", function () {
            var doc = createDocFixture({
              name: 'body',
              children: [
                {name: 'div', id: 'e1'},
                {name: 'circle', ns: NS_SVG, id: 'e2'},
              ],
            });

            var selector = {xpath: ".//div", nsmap: {}};
            var result = CaptureHelperHandler.selectNodes(doc, selector);
            assert.deepEqual(result, [doc.querySelector('#e1')]);

            var selector = {xpath: ".//html:div", nsmap: {
              html: NS_HTML,
            }};
            var result = CaptureHelperHandler.selectNodes(doc, selector);
            assert.deepEqual(result, [doc.querySelector('#e1')]);

            var selector = {xpath: ".//svg:circle", nsmap: {
              svg: NS_SVG,
            }};
            var result = CaptureHelperHandler.selectNodes(doc, selector);
            assert.deepEqual(result, [doc.querySelector('#e2')]);
          });
        });

        context("should modify refNode when having `.base`", function () {
          it("should handle a simple base", function () {
            var doc = makeTestDoc();

            var selector = {base: "self"};
            var refNode = doc.querySelector('#target');
            var result = CaptureHelperHandler.selectNodes(refNode, selector);
            assert.deepEqual(result, [refNode]);

            var selector = {base: "root"};
            var refNode = doc.querySelector('#target');
            var result = CaptureHelperHandler.selectNodes(refNode, selector);
            assert.deepEqual(result, [doc]);

            var selector = {base: "parent"};
            var refNode = doc.querySelector('#target');
            var result = CaptureHelperHandler.selectNodes(refNode, selector);
            assert.deepEqual(result, [refNode.parentNode]);

            var selector = {base: "previousSibling"};
            var refNode = doc.querySelector('#target');
            var result = CaptureHelperHandler.selectNodes(refNode, selector);
            assert.deepEqual(result, [refNode.previousSibling]);

            var selector = {base: "nextSibling"};
            var refNode = doc.querySelector('#target');
            var result = CaptureHelperHandler.selectNodes(refNode, selector);
            assert.deepEqual(result, [refNode.nextSibling]);

            var selector = {base: "firstChild"};
            var refNode = doc.querySelector('#target');
            var result = CaptureHelperHandler.selectNodes(refNode, selector);
            assert.deepEqual(result, [refNode.firstChild]);

            var selector = {base: "lastChild"};
            var refNode = doc.querySelector('#target');
            var result = CaptureHelperHandler.selectNodes(refNode, selector);
            assert.deepEqual(result, [refNode.lastChild]);

            var selector = {base: "previousElementSibling"};
            var refNode = doc.querySelector('#target');
            var result = CaptureHelperHandler.selectNodes(refNode, selector);
            assert.deepEqual(result, [refNode.previousElementSibling]);

            var selector = {base: "nextElementSibling"};
            var refNode = doc.querySelector('#target');
            var result = CaptureHelperHandler.selectNodes(refNode, selector);
            assert.deepEqual(result, [refNode.nextElementSibling]);

            var selector = {base: "firstElementChild"};
            var refNode = doc.querySelector('#target');
            var result = CaptureHelperHandler.selectNodes(refNode, selector);
            assert.deepEqual(result, [refNode.firstElementChild]);

            var selector = {base: "lastElementChild"};
            var refNode = doc.querySelector('#target');
            var result = CaptureHelperHandler.selectNodes(refNode, selector);
            assert.deepEqual(result, [refNode.lastElementChild]);
          });

          it('should handle a chained base', function () {
            var doc = makeTestDoc();
            var selector = {base: "firstChild.nextSibling.nextSibling.nextSibling"};
            var refNode = doc.querySelector('#target');
            var result = CaptureHelperHandler.selectNodes(refNode, selector);
            assert.deepEqual(result, [refNode.firstChild.nextSibling.nextSibling.nextSibling]);
          });

          it('should select from modified refNode when also having selector', function () {
            var doc = makeTestDoc();
            var selector = {base: "parent", css: "div"};
            var result = Array.from(CaptureHelperHandler.selectNodes(doc.querySelector('#target'), selector));
            assert.deepEqual(result, [
              doc.querySelector('#prev'),
              doc.querySelector('#target'),
              doc.querySelector('#child-1'),
              doc.querySelector('#child-2'),
              doc.querySelector('#child-3'),
              doc.querySelector('#next'),
            ]);
          });
        });
      });

      context("when passing a string selector", function () {
        it('should treat valid base as {base: ...}', function () {
          var doc = makeTestDoc();
          var selector = "parent";
          var refNode = doc.querySelector('#target');
          var result = CaptureHelperHandler.selectNodes(refNode, selector);
          assert.deepEqual(result, [refNode.parentNode]);

          var doc = makeTestDoc();
          var selector = "parent.firstChild.nextSibling";
          var refNode = doc.querySelector('#target');
          var result = CaptureHelperHandler.selectNodes(refNode, selector);
          assert.deepEqual(result, [refNode.parentNode.firstChild.nextSibling]);
        });

        it('should treat invalid base as {css: ...}', function () {
          var doc = makeTestDoc();
          var selector = "div";
          var result = Array.from(CaptureHelperHandler.selectNodes(doc, selector));
          assert.deepEqual(result, [
            doc.querySelector('#parent-prev'),
            doc.querySelector('#parent'),
            doc.querySelector('#prev'),
            doc.querySelector('#target'),
            doc.querySelector('#child-1'),
            doc.querySelector('#child-2'),
            doc.querySelector('#child-3'),
            doc.querySelector('#next'),
            doc.querySelector('#parent-next'),
          ]);

          var doc = makeTestDoc();
          var selector = "body > div";
          var result = Array.from(CaptureHelperHandler.selectNodes(doc, selector));
          assert.deepEqual(result, [
            doc.querySelector('#parent-prev'),
            doc.querySelector('#parent'),
            doc.querySelector('#parent-next'),
          ]);
        });
      });

      context("when passing a falsy selector", function () {
        for (const selector of [undefined, null, false, ""]) {
          it(`should return original refNode when passing ${JSON.stringify(selector)}`, function () {
            var doc = makeTestDoc();
            var refNode = doc.querySelector('#target');
            var result = CaptureHelperHandler.selectNodes(refNode, selector);
            assert.deepEqual(result, [refNode]);
          });
        }
      });
    });

    describe("#runCommand()", function () {
      function makeTestDoc() {
        return createDocFixture({code: `\
<div id="target">target</div>
<div id="target2">target2</div>`});
      }

      function makeTestDocNs() {
        return createDocFixture({
          name: 'body',
          children: [
            {name: 'a', attrs: [['id', 'target'], ['href', 'https://example.org/', NS_XLINK]], value: 'target'},
            '\n',
            {name: 'a', attrs: [['id', 'target2'], ['xlink:href', 'https://example.org/']], value: 'target2'},
          ],
        });
      }

      it ('should call the corresponding handler with rootNode and arguments', function () {
        var stub = sinon.stub(console, 'debug');
        var spy = sinon.spy(CaptureHelperHandler.prototype, 'cmd_if');

        var helper = new CaptureHelperHandler();
        var doc = makeTestDoc();
        var command = ["if", true, 1, 0];
        helper.runCommand(command, doc);

        sinon.assert.notCalled(stub);
        sinon.assert.calledOnceWithExactly(spy, doc, true, 1, 0);
      });

      it ('should show debug info for commands prefixed with `*` when `debugging` is truthy', function () {
        var stub = sinon.stub(console, 'debug');
        var spy = sinon.spy(CaptureHelperHandler.prototype, 'cmd_if');

        var helper = new CaptureHelperHandler();
        helper.debugging = true;
        var doc = makeTestDoc();
        var command = ["*if", true, 1, 0];
        helper.runCommand(command, doc);

        sinon.assert.calledTwice(stub);
        sinon.assert.calledOnceWithExactly(spy, doc, true, 1, 0);
      });

      it ('should not show debug info for commands prefixed with `*` when `debugging` is falsy', function () {
        var stub = sinon.stub(console, 'debug');
        var spy = sinon.spy(CaptureHelperHandler.prototype, 'cmd_if');

        var helper = new CaptureHelperHandler();
        var doc = makeTestDoc();
        var command = ["*if", true, 1, 0];
        helper.runCommand(command, doc);

        sinon.assert.notCalled(stub);
        sinon.assert.calledOnceWithExactly(spy, doc, true, 1, 0);
      });

      it ('should resolve the command name argument', function () {
        var stub = sinon.stub(console, 'debug');
        var spyResolve = sinon.spy(CaptureHelperHandler.prototype, 'resolve');
        var spy = sinon.spy(CaptureHelperHandler.prototype, 'cmd_if');

        var helper = new CaptureHelperHandler();
        helper.debugging = true;
        var doc = makeTestDoc();
        var command = [["concat", "*", "i", "f"], true, 1, 0];
        helper.runCommand(command, doc);

        sinon.assert.calledWithExactly(spyResolve, ["concat", "*", "i", "f"], doc);
        sinon.assert.calledTwice(stub);
        sinon.assert.calledOnceWithExactly(spy, doc, true, 1, 0);
      });

      context("cmd_if", function () {
        it("should return argument 3 when argument 2 is truthy", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["if", true, 1, 0];
          assert.strictEqual(helper.runCommand(command, doc), 1);

          var command = ["if", 1, 1, 0];
          assert.strictEqual(helper.runCommand(command, doc), 1);

          var command = ["if", "yes", 1, 0];
          assert.strictEqual(helper.runCommand(command, doc), 1);

          var command = ["if", {}, 1, 0];
          assert.strictEqual(helper.runCommand(command, doc), 1);

          var command = ["if", [], 1, 0];
          assert.strictEqual(helper.runCommand(command, doc), 1);
        });

        it("should return argument 4 when the argument 2 is falsy", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["if", false, 1, 0];
          assert.strictEqual(helper.runCommand(command, doc), 0);

          var command = ["if", 0, 1, 0];
          assert.strictEqual(helper.runCommand(command, doc), 0);

          var command = ["if", "", 1, 0];
          assert.strictEqual(helper.runCommand(command, doc), 0);

          var command = ["if", null, 1, 0];
          assert.strictEqual(helper.runCommand(command, doc), 0);
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["if", ["concat", "foo"], ["get_text", {css: "#target"}], ["get_text", {css: "#target2"}]];
          assert.strictEqual(helper.runCommand(command, doc), "target");

          var command = ["if", ["concat", ""], ["get_text", {css: "#target"}], ["get_text", {css: "#target2"}]];
          assert.strictEqual(helper.runCommand(command, doc), "target2");
        });
      });

      context("cmd_equal", function () {
        it("should return equality test result of argument 2 and 3", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["equal", "foo", "foo"];
          assert.strictEqual(helper.runCommand(command, doc), true);

          var command = ["equal", "foo", "bar"];
          assert.strictEqual(helper.runCommand(command, doc), false);

          var command = ["equal", "100", 100];
          assert.strictEqual(helper.runCommand(command, doc), true);
        });

        it("should return strict equality test result of argument 2 and 3 if argument 4 is truthy", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["equal", "foo", "foo", true];
          assert.strictEqual(helper.runCommand(command, doc), true);

          var command = ["equal", "foo", "bar", true];
          assert.strictEqual(helper.runCommand(command, doc), false);

          var command = ["equal", "100", 100, true];
          assert.strictEqual(helper.runCommand(command, doc), false);
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["equal", ["concat", "100"], ["if", true, 100], ["if", true, true]];
          assert.strictEqual(helper.runCommand(command, doc), false);
        });
      });

      context("cmd_and", function () {
        it("should return first falsy or last value", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["and", true];
          assert.strictEqual(helper.runCommand(command, doc), true);

          var command = ["and", true, 1];
          assert.strictEqual(helper.runCommand(command, doc), 1);

          var command = ["and", true, 1, "foo"];
          assert.strictEqual(helper.runCommand(command, doc), "foo");

          var command = ["and", true, 1, "foo", {}];
          assert.deepEqual(helper.runCommand(command, doc), {});

          var command = ["and", false, 1, "foo", {}];
          assert.strictEqual(helper.runCommand(command, doc), false);

          var command = ["and", true, 0, "foo", {}];
          assert.strictEqual(helper.runCommand(command, doc), 0);

          var command = ["and", true, 1, "", {}];
          assert.strictEqual(helper.runCommand(command, doc), "");

          var command = ["and", true, 1, "foo", null];
          assert.strictEqual(helper.runCommand(command, doc), null);
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["and", ["get_text", {css: "#target"}], ["get_text", {css: "#target2"}]];
          assert.strictEqual(helper.runCommand(command, doc), "target2");
        });
      });

      context("cmd_or", function () {
        it("should return first truthy or last value", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["or", true, 1, "foo", {}];
          assert.strictEqual(helper.runCommand(command, doc), true);

          var command = ["or", false, 1, "foo", {}];
          assert.strictEqual(helper.runCommand(command, doc), 1);

          var command = ["or", false, 0, "foo", {}];
          assert.strictEqual(helper.runCommand(command, doc), "foo");

          var command = ["or", false, 0, "", {}];
          assert.deepEqual(helper.runCommand(command, doc), {});

          var command = ["or", false];
          assert.strictEqual(helper.runCommand(command, doc), false);

          var command = ["or", false, 0];
          assert.strictEqual(helper.runCommand(command, doc), 0);

          var command = ["or", false, 0, ""];
          assert.strictEqual(helper.runCommand(command, doc), "");

          var command = ["or", false, 0, "", null];
          assert.strictEqual(helper.runCommand(command, doc), null);
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["or", ["get_text", {css: "#target"}], ["get_text", {css: "#target2"}]];
          assert.strictEqual(helper.runCommand(command, doc), "target");
        });
      });

      context("cmd_concat", function () {
        it("should return the concatenated string of the arguments", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["concat", "foo"];
          assert.strictEqual(helper.runCommand(command, doc), "foo");

          var command = ["concat", "foo", "bar"];
          assert.strictEqual(helper.runCommand(command, doc), "foobar");

          var command = ["concat", "foo", "bar", "baz"];
          assert.strictEqual(helper.runCommand(command, doc), "foobarbaz");
        });

        it('should coerce truthy non-string value to string', function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["concat", "foo", "bar", 1];
          assert.strictEqual(helper.runCommand(command, doc), "foobar1");

          var command = ["concat", "foo", "bar", {}];
          assert.strictEqual(helper.runCommand(command, doc), "foobar[object Object]");
        });

        it('should treat falsy value as empty string', function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["concat", "foo", null, false, 0];
          assert.strictEqual(helper.runCommand(command, doc), "foo");
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["concat", ["get_text", {css: "#target"}], ["get_text", {css: "#target2"}]];
          assert.strictEqual(helper.runCommand(command, doc), "targettarget2");
        });
      });

      context("cmd_slice", function () {
        it("should the sliced string", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["slice", "0123456", 1];
          assert.strictEqual(helper.runCommand(command, doc), "123456");

          var command = ["slice", "0123456", 1, 4];
          assert.strictEqual(helper.runCommand(command, doc), "123");

          var command = ["slice", "0123456", 1, 100];
          assert.strictEqual(helper.runCommand(command, doc), "123456");

          var command = ["slice", "0123456", -2];
          assert.strictEqual(helper.runCommand(command, doc), "56");

          var command = ["slice", "0123456", 0, -2];
          assert.strictEqual(helper.runCommand(command, doc), "01234");
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["slice", ["get_text", {css: "#target"}], ["if", true, 1], ["if", true, -1]];
          assert.strictEqual(helper.runCommand(command, doc), "arge");
        });
      });

      context("cmd_upper", function () {
        it("should return the upper cased string", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["upper", "123ABCabc中文"];
          assert.strictEqual(helper.runCommand(command, doc), "123ABCABC中文");
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["upper", ["get_text", {css: "#target"}]];
          assert.strictEqual(helper.runCommand(command, doc), "TARGET");
        });
      });

      context("cmd_lower", function () {
        it("should return the lower cased string", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["lower", "123ABCabc中文"];
          assert.strictEqual(helper.runCommand(command, doc), "123abcabc中文");
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["lower", ["get_text", {css: "#target"}]];
          assert.strictEqual(helper.runCommand(command, doc), "target");
        });
      });

      context("cmd_encode_uri", function () {
        it("should return the URI-encoded string", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["encode_uri", " ;,/?#:@&=+$中"];
          assert.strictEqual(helper.runCommand(command, doc), '%20%3B%2C%2F%3F%23%3A%40%26%3D%2B%24%E4%B8%AD');

          var command = ["encode_uri", " ;,/?#:@&=+$中", " ;,/?#:@&=+$"];
          assert.strictEqual(helper.runCommand(command, doc), ' ;,/?#:@&=+$%E4%B8%AD');
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["encode_uri", ["concat", " ;,/?#:@&=+$中"], ["concat", " ;,/?#:@&=+$"]];
          assert.strictEqual(helper.runCommand(command, doc), ' ;,/?#:@&=+$%E4%B8%AD');
        });
      });

      context("cmd_decode_uri", function () {
        it("should return the URI-decoded string", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["decode_uri", "%20%3B%2C%2F%3F%23%3A%40%26%3D%2B%24%E4%B8%AD"];
          assert.strictEqual(helper.runCommand(command, doc), ' ;,/?#:@&=+$中');
        });

        it("return original string if failed to decode", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["decode_uri", "%E4"];
          assert.strictEqual(helper.runCommand(command, doc), '%E4');
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["decode_uri", ["concat", "%20%3B%2C%2F%3F%23%3A%40%26%3D%2B%24%E4%B8%AD"]];
          assert.strictEqual(helper.runCommand(command, doc), ' ;,/?#:@&=+$中');
        });
      });

      context("cmd_add", function () {
        it("should return the summed value of the arguments", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["add", 100];
          assert.strictEqual(helper.runCommand(command, doc), 100);

          var command = ["add", 100, 10];
          assert.strictEqual(helper.runCommand(command, doc), 110);

          var command = ["add", 100, 10, 1];
          assert.strictEqual(helper.runCommand(command, doc), 111);
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["add", ["if", true, 100], ["if", true, 10], ["if", true, 1]];
          assert.strictEqual(helper.runCommand(command, doc), 111);
        });
      });

      context("cmd_subtract", function () {
        it("should return the subtracted value of argument 2 with others", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["subtract", 100];
          assert.strictEqual(helper.runCommand(command, doc), 100);

          var command = ["subtract", 100, 10];
          assert.strictEqual(helper.runCommand(command, doc), 90);

          var command = ["subtract", 100, 10, 1];
          assert.strictEqual(helper.runCommand(command, doc), 89);
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["subtract", ["if", true, 100], ["if", true, 10], ["if", true, 1]];
          assert.strictEqual(helper.runCommand(command, doc), 89);
        });
      });

      context("cmd_multiply", function () {
        it("should return the multiplied value of the arguments", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["multiply", 100];
          assert.strictEqual(helper.runCommand(command, doc), 100);

          var command = ["multiply", 100, 10];
          assert.strictEqual(helper.runCommand(command, doc), 1000);

          var command = ["multiply", 100, 10, 2];
          assert.strictEqual(helper.runCommand(command, doc), 2000);
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["multiply", ["if", true, 100], ["if", true, 10], ["if", true, 2]];
          assert.strictEqual(helper.runCommand(command, doc), 2000);
        });
      });

      context("cmd_divide", function () {
        it("should return the divided value of argument 2 with others", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["divide", 100];
          assert.strictEqual(helper.runCommand(command, doc), 100);

          var command = ["divide", 100, 10];
          assert.strictEqual(helper.runCommand(command, doc), 10);

          var command = ["divide", 100, 10, 2];
          assert.strictEqual(helper.runCommand(command, doc), 5);

          var command = ["divide", 5, 2];
          assert.strictEqual(helper.runCommand(command, doc), 2.5);
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["divide", ["if", true, 100], ["if", true, 10], ["if", true, 2]];
          assert.strictEqual(helper.runCommand(command, doc), 5);
        });
      });

      context("cmd_mod", function () {
        it("should return the modulo value of argument 2 with others", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["mod", 12];
          assert.strictEqual(helper.runCommand(command, doc), 12);

          var command = ["mod", 12, 10];
          assert.strictEqual(helper.runCommand(command, doc), 2);

          var command = ["mod", 12, 6];
          assert.strictEqual(helper.runCommand(command, doc), 0);

          var command = ["mod", 12, 8, 3];
          assert.strictEqual(helper.runCommand(command, doc), 1);
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["mod", ["if", true, 12], ["if", true, 8], ["if", true, 3]];
          assert.strictEqual(helper.runCommand(command, doc), 1);
        });
      });

      context("cmd_power", function () {
        it("should return the powered value of argument 2 with others", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["power", 2];
          assert.strictEqual(helper.runCommand(command, doc), 2);

          var command = ["power", 2, 3];
          assert.strictEqual(helper.runCommand(command, doc), 8);

          var command = ["power", 2, 3, 2];
          assert.strictEqual(helper.runCommand(command, doc), 64);
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["power", ["if", true, 2], ["if", true, 3], ["if", true, 2]];
          assert.strictEqual(helper.runCommand(command, doc), 64);
        });
      });

      context("cmd_for", function () {
        it("should run passed commands sequentially", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["for", ["if", true, {css: "div"}],
            ["attr", null, "class", ["get_attr", null, "id"]],
            ["attr", null, "id", null],
          ];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<div class="target">target</div>
<div class="target2">target2</div>`);
        });
      });

      context("cmd_match", function () {
        it("should return whether argument 2 string matches argument 3 RegExp", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["match", "text", "/TEXT/i"];
          assert.strictEqual(helper.runCommand(command, doc), true);

          var command = ["match", "text", "/unrelated/"];
          assert.strictEqual(helper.runCommand(command, doc), false);

          var command = ["match", "text", "/(te)(xt)/"];
          assert.strictEqual(helper.runCommand(command, doc), true);
        });

        it("should return the indexed capture group if argument 4 is an integer", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["match", "text", "/(te)(xt)/", 0];
          assert.strictEqual(helper.runCommand(command, doc), "text");

          var command = ["match", "text", "/(te)(xt)/", 1];
          assert.strictEqual(helper.runCommand(command, doc), "te");

          var command = ["match", "text", "/(te)(xt)/", 5];
          assert.strictEqual(helper.runCommand(command, doc), undefined);

          var command = ["match", "text", "/(te)(xt)123/", 1];
          assert.strictEqual(helper.runCommand(command, doc), null);
        });

        it("should return the named capture group if argument 4 is a string", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["match", "text", "/(?<g>te)xt/", "g"];
          assert.strictEqual(helper.runCommand(command, doc), "te");

          var command = ["match", "text", "/(?<g>te)xt/", "nonexist"];
          assert.strictEqual(helper.runCommand(command, doc), undefined);

          var command = ["match", "text", "/(?<g>te)xt123/", "g"];
          assert.strictEqual(helper.runCommand(command, doc), null);
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["match", ["concat", "text"], ["concat", "/text/"], ["if", true, 0]];
          assert.strictEqual(helper.runCommand(command, doc), "text");
        });
      });

      context("cmd_replace", function () {
        it("should return the replaced string", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["replace", "text content", "/(text) (content)/", "modified: $2, $1"];
          assert.strictEqual(helper.runCommand(command, doc), 'modified: content, text');
        });

        it("should return an empty string if argument 3 is omitted", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["replace", "text content", "/(text) (content)/"];
          assert.strictEqual(helper.runCommand(command, doc), "");
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["replace", ["concat", "text content"], ["concat", "/(text) (content)/"], ["concat", "modified: $2, $1"]];
          assert.strictEqual(helper.runCommand(command, doc), 'modified: content, text');
        });
      });

      context("cmd_has_node", function () {
        it("should return whether at least one node is selected", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["has_node", {css: "#target"}];
          assert.strictEqual(helper.runCommand(command, doc), true);

          var command = ["has_node", {css: "#nonexist"}];
          assert.strictEqual(helper.runCommand(command, doc), false);
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["has_node", ["if", true, {css: "#target"}]];
          assert.strictEqual(helper.runCommand(command, doc), true);
        });
      });

      context("cmd_has_attr", function () {
        it("should return whether the first selected node has the attribute", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDocNs();

          var command = ["has_attr", {css: "#target"}, "href"];
          assert.strictEqual(helper.runCommand(command, doc), true);

          var command = ["has_attr", {css: "#target"}, "xlink:href"];
          assert.strictEqual(helper.runCommand(command, doc), false);

          var command = ["has_attr", {css: "#target2"}, "xlink:href"];
          assert.strictEqual(helper.runCommand(command, doc), true);
        });

        it("should return whether the first selected node has the namespaced attribute when argument 4 is provided", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDocNs();

          var command = ["has_attr", {css: "#target"}, "href", null];
          assert.strictEqual(helper.runCommand(command, doc), false);

          var command = ["has_attr", {css: "#target"}, "href", NS_XLINK];
          assert.strictEqual(helper.runCommand(command, doc), true);

          var command = ["has_attr", {css: "#target2"}, "href", NS_XLINK];
          assert.strictEqual(helper.runCommand(command, doc), false);
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDocNs();

          var command = ["has_attr", ["if", true, {css: "#target"}], ["concat", "href"], ["concat", NS_XLINK]];
          assert.strictEqual(helper.runCommand(command, doc), true);
        });
      });

      context("cmd_get_html", function () {
        function makeTestDoc() {
          return createDocFixture({code: `\
<div><b>elem1</b></div>
<div><b>elem2</b></div>`});
        }

        it("should return the innerHTML of the first selected node", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["get_html", {css: "div"}];
          assert.strictEqual(helper.runCommand(command, doc), "<b>elem1</b>");
        });

        it("should return the outerHTML of the first selected node if argument 3 is truthy", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["get_html", {css: "div"}, true];
          assert.strictEqual(helper.runCommand(command, doc), "<div><b>elem1</b></div>");
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["get_html", ["if", true, {css: "div"}], ["if", true, true]];
          assert.strictEqual(helper.runCommand(command, doc), "<div><b>elem1</b></div>");
        });
      });

      context("cmd_get_text", function () {
        function makeTestDoc() {
          return createDocFixture({code: `\
<div><b>elem1-1</b><b>elem1-2</b></div>
<div><b>elem2-1</b><b>elem2-2</b></div>`});
        }

        it("should return the text content of the first selected node", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["get_text", {css: "div"}];
          assert.strictEqual(helper.runCommand(command, doc), "elem1-1elem1-2");
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["get_text", ["if", true, {css: "div"}]];
          assert.strictEqual(helper.runCommand(command, doc), "elem1-1elem1-2");
        });
      });

      context("cmd_get_attr", function () {
        it("should return the attribute of the first selected node", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDocNs();

          var command = ["get_attr", {css: "#target"}, "href"];
          assert.strictEqual(helper.runCommand(command, doc), 'https://example.org/');

          var command = ["get_attr", {css: "#target"}, "xlink:href"];
          assert.strictEqual(helper.runCommand(command, doc), null);

          var command = ["get_attr", {css: "#target2"}, "href"];
          assert.strictEqual(helper.runCommand(command, doc), null);

          var command = ["get_attr", {css: "#target2"}, "xlink:href"];
          assert.strictEqual(helper.runCommand(command, doc), 'https://example.org/');
        });

        it("should return the namespaced attribute of the first selected node when argument 4 is provided", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDocNs();

          var command = ["get_attr", {css: "#target"}, "href", NS_XLINK];
          assert.strictEqual(helper.runCommand(command, doc), 'https://example.org/');
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDocNs();

          var command = ["get_attr", ["if", true, {css: "#target"}], ["concat", "href"], ["concat", NS_XLINK]];
          assert.strictEqual(helper.runCommand(command, doc), 'https://example.org/');
        });
      });

      context("cmd_get_css", function () {
        function makeTestDoc() {
          return createDocFixture({code: `\
<div style="color: green;"></div>
<div style="color: yellow !important;"></div>`});
        }

        it("should return the CSS property of the first selected node", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["get_css", {css: "div"}, "color"];
          assert.strictEqual(helper.runCommand(command, doc), "green");
        });

        it("should return the CSS priority of the first selected node if argument 4 is truthy", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["get_css", {css: "div"}, "color", true];
          assert.strictEqual(helper.runCommand(command, doc), "");

          var command = ["get_css", {css: "div:last-of-type"}, "color", true];
          assert.strictEqual(helper.runCommand(command, doc), "important");
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["get_css", ["if", true, {css: "div"}], ["concat", "color"], ["if", true, true]];
          assert.strictEqual(helper.runCommand(command, doc), "");
        });
      });

      context("cmd_remove", function () {
        function makeTestDoc() {
          return createDocFixture({code: `\
<div><b>elem1</b></div>
<div><b>elem2</b></div>`});
        }

        it("should remove the selected nodes", function () {
          var helper = new CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["remove", {css: "b"}];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<div></div>
<div></div>`);
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["remove", ["if", true, {css: "b"}]];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<div></div>
<div></div>`);
        });
      });

      context("cmd_unwrap", function () {
        function makeTestDoc() {
          return createDocFixture({code: `\
<div><b>elem1</b></div>
<div><b>elem2</b></div>`});
        }

        it("should remove the selected nodes while keeping their descendants", function () {
          var helper = new CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["unwrap", {css: "div"}];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<b>elem1</b>
<b>elem2</b>`);
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["unwrap", ["if", true, {css: "div"}]];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<b>elem1</b>
<b>elem2</b>`);
        });
      });

      context("cmd_isolate", function () {
        function makeTestDoc() {
          return createDocFixture({code: `\
<html>
<head>
<meta charset="UTF-8">
</head>
<body>
<section>
<article>
<p>other content</p>
<p class="target"><b>content</b></p>
<p>other content</p>
<p class="target"><b>content</b></p>
<p>other content</p>
</article>
</section>
</body>
</html>`});
        }

        it("should remove nodes other than the selected nodes and ancestors", function () {
          var helper = new CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["isolate", {css: ".target"}];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.documentElement.innerHTML.trim(), `\
<head>
<meta charset="UTF-8">
</head>
<body>\
<section>\
<article>\
<p class="target"><b>content</b></p>\
<p class="target"><b>content</b></p>\
</article>\
</section>\
</body>`);
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["isolate", ["if", true, {css: ".target"}]];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.documentElement.innerHTML.trim(), `\
<head>
<meta charset="UTF-8">
</head>
<body>\
<section>\
<article>\
<p class="target"><b>content</b></p>\
<p class="target"><b>content</b></p>\
</article>\
</section>\
</body>`);
        });
      });

      context("cmd_html", function () {
        function makeTestDoc() {
          return createDocFixture({code: `\
<div><b>elem1</b></div>
<div><b>elem2</b></div>`});
        }

        it("should set innerHTML for the selected nodes", function () {
          var helper = new CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["html", {css: "div"}, "<em>text</em>"];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<div><em>text</em></div>
<div><em>text</em></div>`);
        });

        it("should set outerHTML for the selected nodes if aregument 4 is truthy", function () {
          var helper = new CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["html", {css: "div"}, "<em>text</em>", true];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<em>text</em>
<em>text</em>`);
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["html", ["if", true, {css: "div"}], ["concat", ["get_html", null, true], "<em>text</em>"], ["if", true, true]];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<div><b>elem1</b></div><em>text</em>
<div><b>elem2</b></div><em>text</em>`);
        });
      });

      context("cmd_text", function () {
        function makeTestDoc() {
          return createDocFixture({code: `\
<div>text1</div>
<div>text2</div>`});
        }

        it("should set text content for the selected nodes", function () {
          var helper = new CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["text", {css: "div"}, "<em>text</em>"];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          var elems = doc.querySelectorAll('div');
          assert.strictEqual(elems[0].textContent, '<em>text</em>');
          assert.strictEqual(elems[1].textContent, '<em>text</em>');
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["text", ["if", true, {css: "div"}], ["concat", ["get_text"], "<em>text</em>"]];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          var elems = doc.querySelectorAll('div');
          assert.strictEqual(elems[0].textContent, 'text1<em>text</em>');
          assert.strictEqual(elems[1].textContent, 'text2<em>text</em>');
        });
      });

      context("cmd_tag", function () {
        it("should replace the element with a new one having the specified name", function () {
          var helper = new CaptureHelperHandler();

          var doc = createDocFixture({code: '<svg><a id="myid" xlink:href="foo" ns1:ns2:attr="val"><text>t1</text><text>t2</text></a></svg>'});
          var command = ["tag", {css: "a"}, "section"];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), '<svg><section id="myid" xlink:href="foo" ns1:ns2:attr="val"><text>t1</text><text>t2</text></section></svg>');
          assert.strictEqual(doc.querySelector('section').getAttributeNS(NS_XLINK, 'href'), 'foo');
        });

        it("should replace the element with a new one having the specified name and namespace", function () {
          var helper = new CaptureHelperHandler();

          var doc = createDocFixture({code: '<svg><a id="myid" xlink:href="foo" ns1:ns2:attr="val"><text>t1</text><text>t2</text></a></svg>'});
          var command = ["tag", {css: "a"}, "use", NS_SVG];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), '<svg><use id="myid" xlink:href="foo" ns1:ns2:attr="val"><text>t1</text><text>t2</text></use></svg>');
          assert.strictEqual(doc.querySelector('use').namespaceURI, NS_SVG);
          assert.strictEqual(doc.querySelector('use').getAttributeNS(NS_XLINK, 'href'), 'foo');
        });

        it("should safely skip a non-element node", function () {
          var helper = new CaptureHelperHandler();

          var doc = createDocFixture({name: 'body', value: '123'});
          var command = ["tag", {xpath: ".//text()"}, "section"];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML, '123');
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["tag", ["if", true, {css: "div"}], ["concat", "foreignObject"], ["concat", NS_SVG]];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<foreignObject id="target">target</foreignObject>
<foreignObject id="target2">target2</foreignObject>`);
          assert.strictEqual(doc.querySelector('foreignObject').namespaceURI, NS_SVG);
        });
      });

      context("cmd_attr", function () {
        function makeTestDoc() {
          return createDocFixture({code: `\
<img data-src="image1.jpg">
<img data-src="image2.jpg">`});
        }

        context('when passing (name, value)', function () {
          it("should set the named attribute with the value when value is a string", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["attr", {css: "img"}, "data-src", "myimage.jpg"];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<img data-src="myimage.jpg">
<img data-src="myimage.jpg">`);

            var doc = makeTestDoc();
            var command = ["attr", {css: "img"}, "foo:bar:src", "myimage.jpg"];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<img data-src="image1.jpg" foo:bar:src="myimage.jpg">
<img data-src="image2.jpg" foo:bar:src="myimage.jpg">`);
          });

          it("should remove the named attribute when value is null", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["attr", {css: "img"}, "data-src", null];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<img>
<img>`);
          });

          it("should set the namespaced attribute with the value when value is a string and argument 4 is provided", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDocNs();
            var command = ["attr", {css: "a"}, "src", "123", NS_XLINK];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<a id="target" xlink:href="https://example.org/" xlink:src="123">target</a>
<a id="target2" xlink:href="https://example.org/" xlink:src="123">target2</a>`);
            assert.strictEqual(doc.querySelector('a').getAttributeNS(NS_XLINK, 'src'), '123');
          });

          it("should remove the namespaced attribute when value is null and argument 4 is provided", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDocNs();
            var command = ["attr", {css: "#target"}, "href", null, NS_XLINK];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<a id="target">target</a>
<a id="target2" xlink:href="https://example.org/">target2</a>`);
          });

          it("should resolve parameter commands", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["attr", ["if", true, {css: "img"}], ["concat", "src"], ["get_attr", null, "data-src"], ["concat", NS_XLINK]];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<img data-src="image1.jpg" xlink:src="image1.jpg">
<img data-src="image2.jpg" xlink:src="image2.jpg">`);
            assert.strictEqual(doc.querySelector('img').getAttributeNS(NS_XLINK, 'src'), 'image1.jpg');
          });
        });

        context('when passing an Object', function () {
          it("should set the attributes", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["attr", {css: "img"}, {
              "src": "myimage.jpg",
              "data-src": null,
              "data-extra": "extra-value",
            }];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<img src="myimage.jpg" data-extra="extra-value">
<img src="myimage.jpg" data-extra="extra-value">`);
          });

          it("should resolve parameter commands", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["attr", ["if", true, {css: "img"}], ["if", true, {
              "src": "myimage.jpg",
              "data-src": null,
              "data-extra": "extra-value",
            }]];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<img src="myimage.jpg" data-extra="extra-value">
<img src="myimage.jpg" data-extra="extra-value">`);

            var doc = makeTestDoc();
            var command = ["attr", {css: "img"}, {
              "src": ["get_attr", null, "data-src"],
              "data-src": ["if", true, null],
              "data-extra": ["concat", "extra-value"],
            }];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<img src="image1.jpg" data-extra="extra-value">
<img src="image2.jpg" data-extra="extra-value">`);
          });
        });

        context('when passing an Array', function () {
          it("should set the attributes", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["attr", {css: "img"}, [
              ["src", "myimage.jpg"],
              ["data-src", null],
              ["foo:bar:src", "extra-value"],
            ]];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<img src="myimage.jpg" foo:bar:src="extra-value">
<img src="myimage.jpg" foo:bar:src="extra-value">`);
          });

          it("should set the attributes with namespace if provided", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDocNs();
            var command = ["attr", {css: "a"}, [
              ["id", null, null],
              ["href", null, NS_XLINK],
              ["class", "cls", null],
              ["src", 'http://example.com/', NS_XLINK],
            ]];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<a class="cls" xlink:src="http://example.com/">target</a>
<a xlink:href="https://example.org/" class="cls" xlink:src="http://example.com/">target2</a>`);
            assert.strictEqual(doc.querySelector('a').getAttributeNS(NS_XLINK, 'src'), 'http://example.com/');
          });

          it("should resolve parameter commands", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["attr", ["if", true, {css: "img"}], ["if", true, [
              ["src", "myimage.jpg"],
              ["data-src", null],
              ["data-extra", "extra-value"],
            ]]];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<img src="myimage.jpg" data-extra="extra-value">
<img src="myimage.jpg" data-extra="extra-value">`);

            var doc = makeTestDoc();
            var command = ["attr", {css: "img"}, [
              [["concat", "src"], ["get_attr", null, "data-src"]],
              [["concat", "data-src"], ["if", true, null]],
              [["concat", "data-extra"], ["concat", "extra-value"]],
            ]];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<img src="image1.jpg" data-extra="extra-value">
<img src="image2.jpg" data-extra="extra-value">`);

            var doc = makeTestDocNs();
            var command = ["attr", {css: "a"}, [
              [["concat", "href"], ["if", true, null], ["concat", NS_XLINK]],
              [["concat", "ns1:", "ns2:", "foo"], ["concat", "bar"]],
            ]];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<a id="target" ns1:ns2:foo="bar">target</a>
<a id="target2" xlink:href="https://example.org/" ns1:ns2:foo="bar">target2</a>`);
          });
        });
      });

      context("cmd_css", function () {
        function makeTestDoc() {
          return createDocFixture({code: `\
<div style="color: green;"></div>
<div style="color: yellow;"></div>`});
        }

        context('when passing (name, value, [priority])', function () {
          it("should set the named CSS property with the value when value is a string", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["css", {css: "div"}, "color", "red"];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div style="color: red;"></div>
<div style="color: red;"></div>`);

            var doc = makeTestDoc();
            var command = ["css", {css: "div"}, "display", "inline"];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div style="color: green; display: inline;"></div>
<div style="color: yellow; display: inline;"></div>`);
          });

          it("should remove the named CSS property when value is null", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["css", {css: "div"}, "color", null];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div style=""></div>
<div style=""></div>`);
          });

          it("should set the CSS property with priority when provided", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["css", {css: "div"}, "color", "red", "important"];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div style="color: red !important;"></div>
<div style="color: red !important;"></div>`);
          });

          it("should resolve parameter commands", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["css", ["if", true, {css: "div"}], ["concat", "color"], ["get_css", null, "color"], ["concat", "important"]];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div style="color: green !important;"></div>
<div style="color: yellow !important;"></div>`);
          });
        });

        context('when passing an Object', function () {
          it("should set CSS properties", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["css", {css: "div"}, {
              "color": null,
              "display": "inline",
            }];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div style="display: inline;"></div>
<div style="display: inline;"></div>`);
          });

          it("should resolve parameter commands", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["css", ["if", true, {css: "div"}], ["if", true, {
              "color": null,
              "display": "inline",
            }]];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div style="display: inline;"></div>
<div style="display: inline;"></div>`);

            var doc = makeTestDoc();
            var command = ["css", {css: "div"}, {
              "background-color": ["get_css", null, "color"],
              "color": ["if", true, null],
            }];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div style="background-color: green;"></div>
<div style="background-color: yellow;"></div>`);
          });
        });

        context('when passing an Array', function () {
          it("should set CSS properties", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["css", {css: "div"}, [
              ["color", null],
              ["display", "inline"],
              ["font-family", "monospace", "important"],
            ]];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div style="display: inline; font-family: monospace !important;"></div>
<div style="display: inline; font-family: monospace !important;"></div>`);
          });

          it("should resolve parameter commands", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["css", ["if", true, {css: "div"}], ["if", true, [
              ["color", null],
              ["display", "inline"],
              ["font-family", "monospace", "important"],
            ]]];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div style="display: inline; font-family: monospace !important;"></div>
<div style="display: inline; font-family: monospace !important;"></div>`);

            var doc = makeTestDoc();
            var command = ["css", {css: "div"}, [
              [["concat", "background-color"], ["get_css", null, "color"], ["concat", "important"]],
              [["concat", "color"], ["if", true, null]],
            ]];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div style="background-color: green !important;"></div>
<div style="background-color: yellow !important;"></div>`);
          });
        });
      });

      context("cmd_insert", function () {
        function makeTestDoc() {
          return createDocFixture({code: `\
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div></div>
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div></div>`});
        }

        function makeTestDocSimple() {
          return createDocFixture({code: `<div></div>`});
        }

        context('when argument 3 is a string', function () {
          it('should insert before the selected node when argument 3 is "before"', function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["insert", {"css": ".target"}, "insertedText", "before"];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
insertedText<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div></div>
insertedText<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div></div>`);
          });

          it('should insert after the selected node when argument 3 is "after"', function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["insert", {"css": ".target"}, "insertedText", "after"];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div></div>insertedText
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div></div>insertedText`);
          });

          it('should replace the selected node when argument 3 is "replace"', function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["insert", {"css": ".target"}, "insertedText", "replace"];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
insertedText
insertedText`);
          });

          it('should insert at the position defined by argument 4 of the selected node when argument 3 is "insert"', function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["insert", {"css": ".target"}, "insertedText", "insert", 0];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div class="target">insertedText<div id="child-1"></div><div id="child-2"></div><div id="child-3"></div></div>
<div class="target">insertedText<div id="child-1"></div><div id="child-2"></div><div id="child-3"></div></div>`);

            var doc = makeTestDoc();
            var command = ["insert", {"css": ".target"}, "insertedText", "insert", 1];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div class="target"><div id="child-1"></div>insertedText<div id="child-2"></div><div id="child-3"></div></div>
<div class="target"><div id="child-1"></div>insertedText<div id="child-2"></div><div id="child-3"></div></div>`);

            var doc = makeTestDoc();
            var command = ["insert", {"css": ".target"}, "insertedText", "insert", 100];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div>insertedText</div>
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div>insertedText</div>`);

            var doc = makeTestDoc();
            var command = ["insert", {"css": ".target"}, "insertedText", "insert"];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div>insertedText</div>
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div>insertedText</div>`);
          });

          it('should append to the selected node when argument 3 is "append"', function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["insert", {"css": ".target"}, "insertedText", "append"];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div>insertedText</div>
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div>insertedText</div>`);
          });

          it("should append to the selected node when argument 3 is omitted", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["insert", {"css": ".target"}, "insertedText"];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div>insertedText</div>
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div>insertedText</div>`);

            var doc = makeTestDoc();
            var command = ["insert", {"css": ".target"}, "insertedText", "!unknown"];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div>insertedText</div>
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div>insertedText</div>`);
          });
        });

        context('when argument 3 is an Object (virtual DOM)', function () {
          it("should insert the generated nodes", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["insert", {"css": ".target"}, {
              "name": "b",
              "attrs": [["data-attr1", "value1"], ["data-attr2", "value2"]],
              "children": [
                "text",
                {
                  "name": "i",
                  "attrs": {
                    "data-a1": "v1",
                  },
                  "value": "elem-child",
                },
                {
                  "name": "u",
                  "attrs": {
                    "data-a1": "v1",
                  },
                  "value": "elem-child",
                  "children": ["elem-child-child"],
                },
                {
                  "name": "#comment",
                  "value": "safe <-- comment --> text",
                },
                {
                  "name": "#text",
                  "value": "text-child",
                },
              ],
            }];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div>\
<b data-attr1="value1" data-attr2="value2">text<i data-a1="v1">elem-child</i><u data-a1="v1">elem-child</u><!--safe <-\u200B- comment -\u200B-> text-->text-child</b>\
</div>
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div>\
<b data-attr1="value1" data-attr2="value2">text<i data-a1="v1">elem-child</i><u data-a1="v1">elem-child</u><!--safe <-\u200B- comment -\u200B-> text-->text-child</b>\
</div>`);
          });

          it("should insert CDATA section", function () {
            var helper = new CaptureHelperHandler();

            var doc = createDocFixture({type: 'xhtml'});
            var command = ["insert", {"css": "body"}, {
              "name": "#cdata-section",
              "value": "data",
            }];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.documentElement.outerHTML.trim(), `\
<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body><![CDATA[data]]></body></html>`);
          });

          it("should insert text node if CDATA contains invalid chars", function () {
            var helper = new CaptureHelperHandler();

            var doc = createDocFixture({type: 'xhtml'});
            var command = ["insert", {"css": "body"}, {
              "name": "#cdata-section",
              "value": "no ]]> text",
            }];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.documentElement.outerHTML.trim(), `\
<html xmlns="http://www.w3.org/1999/xhtml"><head></head><body>no ]]&gt; text</body></html>`);
          });

          it("should insert the generated nodes with namespaced element and attributes", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["insert", {"css": ".target"}, {
              "name": "svg",
              "ns": NS_SVG,
              "children": [
                {
                  "name": "a",
                  "ns": NS_SVG,
                  "attrs": [
                    ["href", "http://example.com/", NS_XLINK],
                  ],
                  "value": "dummy",
                },
              ],
            }];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div><svg><a xlink:href="http://example.com/">dummy</a></svg></div>
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div><svg><a xlink:href="http://example.com/">dummy</a></svg></div>`);
            assert.strictEqual(doc.querySelector('svg').namespaceURI, NS_SVG);
            assert.strictEqual(doc.querySelector('a').getAttributeNS(NS_XLINK, 'href'), 'http://example.com/');
          });
        });

        context('when argument 3 is an Object (selector)', function () {
          it("should insert the selected nodes", function () {
            var helper = new CaptureHelperHandler();

            var doc = makeTestDoc();
            var command = ["insert", {"css": "#child-1"}, {
              "base": "nextSibling",
            }];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div class="target"><div id="child-1"><div id="child-2"></div></div><div id="child-3"></div></div>
<div class="target"><div id="child-1"><div id="child-2"></div></div><div id="child-3"></div></div>`);

            var doc = makeTestDoc();
            var command = ["insert", {"css": "#child-1"}, {
              "base": "parent",
              "css": "div:not(#child-1)",
            }];
            assert.strictEqual(helper.runCommand(command, doc), undefined);
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div class="target"><div id="child-1"><div id="child-2"></div><div id="child-3"></div></div></div>
<div class="target"><div id="child-1"><div id="child-2"></div><div id="child-3"></div></div></div>`);
          });
        });

        it("should resolve parameter commands", function () {
          var helper = new CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["insert", ["if", true, {"css": ".target"}], ["if", true, "insertedText"], ["concat", "insert"], ["if", true, 1]];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<div class="target"><div id="child-1"></div>insertedText<div id="child-2"></div><div id="child-3"></div></div>
<div class="target"><div id="child-1"></div>insertedText<div id="child-2"></div><div id="child-3"></div></div>`);

          var doc = makeTestDocSimple();
          var command = ["insert", {"css": "div"}, {
            "name": ["concat", "#text"],
            "value": ["concat", "myvalue"],
          }];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `<div>myvalue</div>`);

          var doc = makeTestDocSimple();
          var command = ["insert", {"css": "div"}, {
            "name": ["concat", "#comment"],
            "value": ["concat", "myvalue"],
          }];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `<div><!--myvalue--></div>`);

          var doc = makeTestDocSimple();
          var command = ["insert", {"css": "div"}, {
            "name": ["concat", "b"],
            "value": ["concat", "myvalue"],
            "attrs": [[["concat", "id"], ["concat", "myid"]], [["concat", "class"], ["concat", "myclass"]]],
          }];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `<div><b id="myid" class="myclass">myvalue</b></div>`);

          var doc = makeTestDocSimple();
          var command = ["insert", {"css": "div"}, {
            "name": ["concat", "b"],
            "attrs": {
              "id": ["concat", "myid"],
              "class": ["concat", "myclass"],
            },
            "children": [
              ["concat", "first"],
              {
                "name": ["concat", "a"],
                "value": ["concat", "myvalue"],
                "attrs": {
                  "href": ["concat", "mylink"],
                },
              },
              ["concat", "last"],
            ],
          }];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `<div><b id="myid" class="myclass">first<a href="mylink">myvalue</a>last</b></div>`);
        });
      });
    });

    describe("#run()", function () {
      function makeTestDoc() {
        return createDocFixture({name: 'body', children: [
          {name: 'div', class: ['exclude1']},
          {name: 'div', class: ['exclude2']},
          {name: 'div', class: ['exclude3']},
        ]});
      }

      it("should skip helpers with truthy `disabled` property", function () {
        var spy = sinon.spy(CaptureHelperHandler.prototype, 'runCommand');

        var doc = makeTestDoc();
        var helpers = [
          {
            commands: [
              ["remove", ".exclude1"],
            ],
          },
          {
            disabled: true,
            commands: [
              ["remove", ".exclude2"],
            ],
          },
          {
            commands: [
              ["remove", ".exclude3"],
            ],
          },
        ];
        var helper = new CaptureHelperHandler({
          helpers,
          rootNode: doc,
          docUrl: 'http://example.com/',
        });
        assert.deepEqual(helper.run(), {errors: []});
        assert.strictEqual(doc.body.innerHTML, `<div class="exclude2"></div>`);

        sinon.assert.calledWithExactly(spy.getCall(0), ['remove', '.exclude1'], doc);
        sinon.assert.calledWithExactly(spy.getCall(1), ['remove', '.exclude3'], doc);
        assert.isNull(spy.getCall(2));
      });

      it("should skip helpers whose `pattern` does not match document URL", function () {
        var spy = sinon.spy(CaptureHelperHandler.prototype, 'runCommand');

        var doc = makeTestDoc();
        var helpers = [
          {
            commands: [
              ["remove", ".exclude1"],
            ],
          },
          {
            pattern: /^$/,
            commands: [
              ["remove", ".exclude2"],
            ],
          },
          {
            pattern: new RegExp(`^http://example\\.com`),
            commands: [
              ["remove", ".exclude3"],
            ],
          },
        ];
        var helper = new CaptureHelperHandler({
          helpers,
          rootNode: doc,
          docUrl: 'http://example.com/',
        });
        assert.deepEqual(helper.run(), {errors: []});
        assert.strictEqual(doc.body.innerHTML, `<div class="exclude2"></div>`);

        sinon.assert.calledWithExactly(spy.getCall(0), ['remove', '.exclude1'], doc);
        sinon.assert.calledWithExactly(spy.getCall(1), ['remove', '.exclude3'], doc);
        assert.isNull(spy.getCall(2));
      });

      it("should call `runCommand` with `debugging` = true for helpers with truthy `debug` property", async function () {
        sinon.stub(console, 'debug');

        var doc = makeTestDoc();
        var helpers = [
          {
            commands: [
              ["remove", ".exclude1"],
            ],
          },
          {
            debug: true,
            commands: [
              ["remove", ".exclude2-1"],
              ["remove", ".exclude2-2"],
            ],
          },
          {
            commands: [
              ["remove", ".exclude3"],
            ],
          },
        ];

        var fn = function () {
          var helper = new CaptureHelperHandler({
            helpers,
            rootNode: doc,
            docUrl: 'http://example.com/',
          });
          assert.deepEqual(helper.run(), {errors: []});
        };

        var tester = function ([command, rootNode], {func}) {
          if (helpers[1].commands.includes(command)) {
            assert.isTrue(this.debugging);
          } else {
            assert.isFalse(this.debugging);
          }
          return func.call(this, command, rootNode);
        };

        var stub = await runControlledTest(CaptureHelperHandler.prototype, 'runCommand', fn, tester);
        sinon.assert.called(stub);
      });
    });
  });
});
