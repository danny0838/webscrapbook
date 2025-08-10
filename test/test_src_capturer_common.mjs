(function (global, factory) {
  if (typeof exports === "object" && typeof module === "object") {
    // CommonJS
    module.exports = factory(
      require('./lib/unittest'),
      require('./shared/capturer/common'),
    );
  } else if (typeof define === "function" && define.amd) {
    // AMD
    define(
      ['./lib/unittest', './shared/capturer/common'],
      factory,
    );
  } else {
    // Browser globals
    global = typeof globalThis !== "undefined" ? globalThis : global || self;
    factory(
      global.unittest,
      global.capturer,
    );
  }
}(this, function (unittest, capturer) {

'use strict';

const {MochaQuery: $, assert, userAgent, getRulesFromCssText, cssRegex} = unittest;

const $describe = $(describe);
const $it = $(it);

const r = String.raw;

describe('capturer/common.js', function () {
  describe('capturer.getRedirectedUrl', function () {
    it("use the redirected URL hash if it exists", function () {
      assert.strictEqual(
        capturer.getRedirectedUrl("http://example.com/page#", ""),
        "http://example.com/page#",
      );
      assert.strictEqual(
        capturer.getRedirectedUrl("http://example.com/page?id=123#", ""),
        "http://example.com/page?id=123#",
      );
      assert.strictEqual(
        capturer.getRedirectedUrl("http://example.com/page#", "#frag"),
        "http://example.com/page#",
      );
      assert.strictEqual(
        capturer.getRedirectedUrl("http://example.com/page?id=123#", "#frag"),
        "http://example.com/page?id=123#",
      );
      assert.strictEqual(
        capturer.getRedirectedUrl("http://example.com/page#foo", ""),
        "http://example.com/page#foo",
      );
      assert.strictEqual(
        capturer.getRedirectedUrl("http://example.com/page?id=123#foo", ""),
        "http://example.com/page?id=123#foo",
      );
      assert.strictEqual(
        capturer.getRedirectedUrl("http://example.com/page#foo", "#frag"),
        "http://example.com/page#foo",
      );
      assert.strictEqual(
        capturer.getRedirectedUrl("http://example.com/page?id=123#foo", "#frag"),
        "http://example.com/page?id=123#foo",
      );
    });

    it("use the original URL hash if the redirected URL has no hash", function () {
      assert.strictEqual(
        capturer.getRedirectedUrl("http://example.com/page", ""),
        "http://example.com/page",
      );
      assert.strictEqual(
        capturer.getRedirectedUrl("http://example.com/page?id=123", ""),
        "http://example.com/page?id=123",
      );
      assert.strictEqual(
        capturer.getRedirectedUrl("http://example.com/page", "#"),
        "http://example.com/page#",
      );
      assert.strictEqual(
        capturer.getRedirectedUrl("http://example.com/page?id=123", "#"),
        "http://example.com/page?id=123#",
      );
      assert.strictEqual(
        capturer.getRedirectedUrl("http://example.com/page", "#frag"),
        "http://example.com/page#frag",
      );
      assert.strictEqual(
        capturer.getRedirectedUrl("http://example.com/page?id=123", "#frag"),
        "http://example.com/page?id=123#frag",
      );
    });

    it("don't include hash for data URL", function () {
      assert.strictEqual(
        capturer.getRedirectedUrl("data:text/html,foo#", ""),
        "data:text/html,foo",
      );
      assert.strictEqual(
        capturer.getRedirectedUrl("data:text/html,foo#", "#frag"),
        "data:text/html,foo",
      );
      assert.strictEqual(
        capturer.getRedirectedUrl("data:text/html,foo", ""),
        "data:text/html,foo",
      );
      assert.strictEqual(
        capturer.getRedirectedUrl("data:text/html,foo", "#frag"),
        "data:text/html,foo",
      );
    });
  });

  describe('capturer.resolveRelativeUrl', function () {
    it("resolve a relative URL using the base URL", function () {
      assert.strictEqual(
        capturer.resolveRelativeUrl("mypage.html", "http://example.com/"),
        "http://example.com/mypage.html",
      );
      assert.strictEqual(
        capturer.resolveRelativeUrl("mypage.html?id=123", "http://example.com/"),
        "http://example.com/mypage.html?id=123",
      );
      assert.strictEqual(
        capturer.resolveRelativeUrl("mypage.html?id=123#frag", "http://example.com/"),
        "http://example.com/mypage.html?id=123#frag",
      );
      assert.strictEqual(
        capturer.resolveRelativeUrl("?id=123", "http://example.com/"),
        "http://example.com/?id=123",
      );
      assert.strictEqual(
        capturer.resolveRelativeUrl("?", "http://example.com/"),
        "http://example.com/?",
      );
    });

    it("don't resolve an empty URL", function () {
      assert.strictEqual(
        capturer.resolveRelativeUrl("", "http://example.com/"),
        "",
      );
    });

    it("don't resolve a pure hash URL", function () {
      assert.strictEqual(
        capturer.resolveRelativeUrl("#hash", "http://example.com/"),
        "#hash",
      );
      assert.strictEqual(
        capturer.resolveRelativeUrl("#", "http://example.com/"),
        "#",
      );
    });
  });

  describe('capturer.isAboutUrl', function () {
    it("true for exactly about:srcdoc", function () {
      assert.strictEqual(
        capturer.isAboutUrl("about:srcdoc"),
        true,
      );
      assert.strictEqual(
        capturer.isAboutUrl("about:srcdoc/subdir"),
        false,
      );
      assert.strictEqual(
        capturer.isAboutUrl("about:srcdoc?"),
        false,
      );
      assert.strictEqual(
        capturer.isAboutUrl("about:srcdoc?id=123"),
        false,
      );
      assert.strictEqual(
        capturer.isAboutUrl("about:srcdoc#"),
        false,
      );
      assert.strictEqual(
        capturer.isAboutUrl("about:srcdoc#frag"),
        false,
      );
    });

    it("true for about:blank", function () {
      assert.strictEqual(
        capturer.isAboutUrl("about:blank"),
        true,
      );
      assert.strictEqual(
        capturer.isAboutUrl("about:blank/subdir"),
        false,
      );
      assert.strictEqual(
        capturer.isAboutUrl("about:blank?"),
        true,
      );
      assert.strictEqual(
        capturer.isAboutUrl("about:blank?id=123"),
        true,
      );
      assert.strictEqual(
        capturer.isAboutUrl("about:blank#"),
        true,
      );
      assert.strictEqual(
        capturer.isAboutUrl("about:blank#frag"),
        true,
      );
    });

    it("false for other URLs", function () {
      assert.strictEqual(
        capturer.isAboutUrl("about:invalid"),
        false,
      );
      assert.strictEqual(
        capturer.isAboutUrl("about:newtab"),
        false,
      );
      assert.strictEqual(
        capturer.isAboutUrl("http://example.com/page"),
        false,
      );
      assert.strictEqual(
        capturer.isAboutUrl("https://example.com/page"),
        false,
      );
      assert.strictEqual(
        capturer.isAboutUrl("ws://example.com/page"),
        false,
      );
      assert.strictEqual(
        capturer.isAboutUrl("wss://example.com/page"),
        false,
      );
      assert.strictEqual(
        capturer.isAboutUrl("file:///foo/bar"),
        false,
      );
      assert.strictEqual(
        capturer.isAboutUrl("data:text/html,foo"),
        false,
      );
    });
  });

  describe('capturer.getErrorUrl', function () {
    const optionsBasic = {};
    const optionsLinkUnsavedUri = {"capture.linkUnsavedUri": true};

    it("rewrite http:, https:, file:, and about:", function () {
      assert.strictEqual(
        capturer.getErrorUrl("http://example.com/?id=123#456", optionsBasic),
        "urn:scrapbook:download:error:http://example.com/?id=123#456",
      );
      assert.strictEqual(
        capturer.getErrorUrl("https://example.com/?id=123#456", optionsBasic),
        "urn:scrapbook:download:error:https://example.com/?id=123#456",
      );
      assert.strictEqual(
        capturer.getErrorUrl("file:///foo/bar", optionsBasic),
        "urn:scrapbook:download:error:file:///foo/bar",
      );
      assert.strictEqual(
        capturer.getErrorUrl("about:blank", optionsBasic),
        "urn:scrapbook:download:error:about:blank",
      );
      assert.strictEqual(
        capturer.getErrorUrl("about:srcdoc", optionsBasic),
        "urn:scrapbook:download:error:about:srcdoc",
      );
    });

    it("strip details for data: and blob:", function () {
      assert.strictEqual(
        capturer.getErrorUrl("data:text/css,foo", optionsBasic),
        "urn:scrapbook:download:error:data:",
      );
      assert.strictEqual(
        capturer.getErrorUrl("blob:https://example.com/58eead10-e54d-4b72-9ae4-150381dcb68c", optionsBasic),
        "urn:scrapbook:download:error:blob:",
      );
    });

    it("don't rewrite other protocols", function () {
      assert.strictEqual(
        capturer.getErrorUrl("ftp://example.com/file.png", optionsBasic),
        "ftp://example.com/file.png",
      );
      assert.strictEqual(
        capturer.getErrorUrl("ws://example.com/?id=123", optionsBasic),
        "ws://example.com/?id=123",
      );
      assert.strictEqual(
        capturer.getErrorUrl("wss://example.com/?id=123", optionsBasic),
        "wss://example.com/?id=123",
      );
      assert.strictEqual(
        capturer.getErrorUrl("urn:scrapbook:download:error:http://example.com", optionsBasic),
        "urn:scrapbook:download:error:http://example.com",
      );
    });

    it("don't rewrite if capture.linkUnsavedUri is truthy", function () {
      assert.strictEqual(
        capturer.getErrorUrl("http://example.com/?id=123#456", optionsLinkUnsavedUri),
        "http://example.com/?id=123#456",
      );
      assert.strictEqual(
        capturer.getErrorUrl("https://example.com/?id=123#456", optionsLinkUnsavedUri),
        "https://example.com/?id=123#456",
      );
      assert.strictEqual(
        capturer.getErrorUrl("file:///foo/bar", optionsLinkUnsavedUri),
        "file:///foo/bar",
      );
      assert.strictEqual(
        capturer.getErrorUrl("about:blank", optionsLinkUnsavedUri),
        "about:blank",
      );
      assert.strictEqual(
        capturer.getErrorUrl("about:srcdoc", optionsLinkUnsavedUri),
        "about:srcdoc",
      );

      assert.strictEqual(
        capturer.getErrorUrl("data:text/css,foo", optionsLinkUnsavedUri),
        "data:text/css,foo",
      );
      assert.strictEqual(
        capturer.getErrorUrl("blob:https://example.com/58eead10-e54d-4b72-9ae4-150381dcb68c", optionsLinkUnsavedUri),
        "blob:https://example.com/58eead10-e54d-4b72-9ae4-150381dcb68c",
      );
    });
  });

  describe('capturer.CssSelectorTokenizer', function () {
    describe('capturer.CssSelectorTokenizer.run', function () {
      const tokenizer = new capturer.CssSelectorTokenizer();

      it('basic selectors', function () {
        assert.deepEqual(tokenizer.run(''), []);
        assert.deepEqual(tokenizer.run('body'), [
          {type: 'name', value: 'body', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('*'), [
          {type: 'operator', value: '*', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('#my-id'), [
          {type: 'operator', value: '#', depth: 0},
          {type: 'name', value: 'my-id', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('.my-class'), [
          {type: 'operator', value: '.', depth: 0},
          {type: 'name', value: 'my-class', depth: 0},
        ]);

        // escaped string
        assert.deepEqual(tokenizer.run(r`#\*`), [
          {type: 'operator', value: '#', depth: 0},
          {type: 'name', value: r`\*`, depth: 0},
        ]);

        assert.deepEqual(tokenizer.run(r`.my\.class\4E00 \20000 \10FFFF x`), [
          {type: 'operator', value: '.', depth: 0},
          {type: 'name', value: r`my\.class\4E00 \20000 \10FFFF x`, depth: 0},
        ]);
      });

      it('attribute selector ([attr="..."])', function () {
        // attr only
        assert.deepEqual(tokenizer.run('[myattr]'), [
          {type: 'selector', value: '[myattr]', depth: 0},
        ]);

        // attr and value
        assert.deepEqual(tokenizer.run('[myattr=myvalue]'), [
          {type: 'selector', value: '[myattr=myvalue]', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('[myattr~=myvalue]'), [
          {type: 'selector', value: '[myattr~=myvalue]', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('[myattr|=myvalue]'), [
          {type: 'selector', value: '[myattr|=myvalue]', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('[myattr^=myvalue]'), [
          {type: 'selector', value: '[myattr^=myvalue]', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('[myattr$=myvalue]'), [
          {type: 'selector', value: '[myattr$=myvalue]', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('[myattr*=myvalue]'), [
          {type: 'selector', value: '[myattr*=myvalue]', depth: 0},
        ]);

        // attr and value with modifier
        assert.deepEqual(tokenizer.run('[myattr=myvalue i]'), [
          {type: 'selector', value: '[myattr=myvalue i]', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('[myattr=myvalue s]'), [
          {type: 'selector', value: '[myattr=myvalue s]', depth: 0},
        ]);

        // quoted value
        assert.deepEqual(tokenizer.run('[myattr="my complex value"]'), [
          {type: 'selector', value: '[myattr="my complex value"]', depth: 0},
        ]);

        // quoted value with escaping
        assert.deepEqual(tokenizer.run(r`[myattr=" my escaped\value and \"quoted\" ones "]`), [
          {type: 'selector', value: r`[myattr=" my escaped\value and \"quoted\" ones "]`, depth: 0},
        ]);

        // quoted value with modifier
        assert.deepEqual(tokenizer.run('[myattr="my complex value" i]'), [
          {type: 'selector', value: '[myattr="my complex value" i]', depth: 0},
        ]);

        // combine with other selectors
        assert.deepEqual(tokenizer.run('div [myattr]'), [
          {type: 'name', value: 'div', depth: 0},
          {type: 'operator', value: ' ', depth: 0},
          {type: 'selector', value: '[myattr]', depth: 0},
        ]);
      });

      it('descendant combinator (" ")', function () {
        assert.deepEqual(tokenizer.run('div span'), [
          {type: 'name', value: 'div', depth: 0},
          {type: 'operator', value: ' ', depth: 0},
          {type: 'name', value: 'span', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('div    span'), [
          {type: 'name', value: 'div', depth: 0},
          {type: 'operator', value: ' ', depth: 0},
          {type: 'operator', value: ' ', depth: 0},
          {type: 'operator', value: ' ', depth: 0},
          {type: 'operator', value: ' ', depth: 0},
          {type: 'name', value: 'span', depth: 0},
        ]);

        assert.deepEqual(tokenizer.run('div\tspan'), [
          {type: 'name', value: 'div', depth: 0},
          {type: 'operator', value: '\t', depth: 0},
          {type: 'name', value: 'span', depth: 0},
        ]);

        assert.deepEqual(tokenizer.run('div \t span'), [
          {type: 'name', value: 'div', depth: 0},
          {type: 'operator', value: ' ', depth: 0},
          {type: 'operator', value: '\t', depth: 0},
          {type: 'operator', value: ' ', depth: 0},
          {type: 'name', value: 'span', depth: 0},
        ]);

        // non-ascii white space is a name rather than a combinator
        assert.deepEqual(tokenizer.run('div　span'), [
          {type: 'name', value: 'div　span', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('.my-class　span'), [
          {type: 'operator', value: '.', depth: 0},
          {type: 'name', value: 'my-class　span', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('div 　 span'), [
          {type: 'name', value: 'div', depth: 0},
          {type: 'operator', value: ' ', depth: 0},
          {type: 'name', value: '　', depth: 0},
          {type: 'operator', value: ' ', depth: 0},
          {type: 'name', value: 'span', depth: 0},
        ]);
      });

      it('other combinators', function () {
        assert.deepEqual(tokenizer.run('div > span'), [
          {type: 'name', value: 'div', depth: 0},
          {type: 'operator', value: ' ', depth: 0},
          {type: 'operator', value: '>', depth: 0},
          {type: 'operator', value: ' ', depth: 0},
          {type: 'name', value: 'span', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('div + span'), [
          {type: 'name', value: 'div', depth: 0},
          {type: 'operator', value: ' ', depth: 0},
          {type: 'operator', value: '+', depth: 0},
          {type: 'operator', value: ' ', depth: 0},
          {type: 'name', value: 'span', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('div ~ span'), [
          {type: 'name', value: 'div', depth: 0},
          {type: 'operator', value: ' ', depth: 0},
          {type: 'operator', value: '~', depth: 0},
          {type: 'operator', value: ' ', depth: 0},
          {type: 'name', value: 'span', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('div || span'), [
          {type: 'name', value: 'div', depth: 0},
          {type: 'operator', value: ' ', depth: 0},
          {type: 'operator', value: '||', depth: 0},
          {type: 'operator', value: ' ', depth: 0},
          {type: 'name', value: 'span', depth: 0},
        ]);
      });

      it('pseudo-class', function () {
        // simple
        assert.deepEqual(tokenizer.run(':root'), [
          {type: 'operator', value: ':', depth: 0},
          {type: 'name', value: 'root', depth: 0},
        ]);

        // vander prefix
        assert.deepEqual(tokenizer.run(':-webkit-autofill'), [
          {type: 'operator', value: ':', depth: 0},
          {type: 'name', value: '-webkit-autofill', depth: 0},
        ]);

        // chained
        assert.deepEqual(tokenizer.run('a:hover:visited'), [
          {type: 'name', value: 'a', depth: 0},
          {type: 'operator', value: ':', depth: 0},
          {type: 'name', value: 'hover', depth: 0},
          {type: 'operator', value: ':', depth: 0},
          {type: 'name', value: 'visited', depth: 0},
        ]);

        // parenthesized
        assert.deepEqual(tokenizer.run('td:nth-child(-n + 3)'), [
          {type: 'name', value: 'td', depth: 0},
          {type: 'operator', value: ':', depth: 0},
          {type: 'name', value: 'nth-child', depth: 0},
          {type: 'operator', value: '(', depth: 0},
          {type: 'name', value: '-n', depth: 1},
          {type: 'operator', value: ' ', depth: 1},
          {type: 'operator', value: '+', depth: 1},
          {type: 'operator', value: ' ', depth: 1},
          {type: 'name', value: '3', depth: 1},
          {type: 'operator', value: ')', depth: 0},
        ]);

        // recursive
        assert.deepEqual(tokenizer.run('a:not([href])'), [
          {type: 'name', value: 'a', depth: 0},
          {type: 'operator', value: ':', depth: 0},
          {type: 'name', value: 'not', depth: 0},
          {type: 'operator', value: '(', depth: 0},
          {type: 'selector', value: '[href]', depth: 1},
          {type: 'operator', value: ')', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('p:is(#id1, :is(#id2))'), [
          {type: 'name', value: 'p', depth: 0},
          {type: 'operator', value: ':', depth: 0},
          {type: 'name', value: 'is', depth: 0},
          {type: 'operator', value: '(', depth: 0},
          {type: 'operator', value: '#', depth: 1},
          {type: 'name', value: 'id1', depth: 1},
          {type: 'operator', value: ',', depth: 1},
          {type: 'operator', value: ' ', depth: 1},
          {type: 'operator', value: ':', depth: 1},
          {type: 'name', value: 'is', depth: 1},
          {type: 'operator', value: '(', depth: 1},
          {type: 'operator', value: '#', depth: 2},
          {type: 'name', value: 'id2', depth: 2},
          {type: 'operator', value: ')', depth: 1},
          {type: 'operator', value: ')', depth: 0},
        ]);
      });

      it('pseudo-element', function () {
        // simple
        assert.deepEqual(tokenizer.run('p::before'), [
          {type: 'name', value: 'p', depth: 0},
          {type: 'operator', value: '::', depth: 0},
          {type: 'name', value: 'before', depth: 0},
        ]);

        // recursive
        assert.deepEqual(tokenizer.run('p::slotted(*)'), [
          {type: 'name', value: 'p', depth: 0},
          {type: 'operator', value: '::', depth: 0},
          {type: 'name', value: 'slotted', depth: 0},
          {type: 'operator', value: '(', depth: 0},
          {type: 'operator', value: '*', depth: 1},
          {type: 'operator', value: ')', depth: 0},
        ]);
      });

      it('namespaced type selector', function () {
        assert.deepEqual(tokenizer.run('|a'), [
          {type: 'operator', value: '|', depth: 0},
          {type: 'name', value: 'a', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('svg|a'), [
          {type: 'name', value: 'svg', depth: 0},
          {type: 'operator', value: '|', depth: 0},
          {type: 'name', value: 'a', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('*|a'), [
          {type: 'operator', value: '*', depth: 0},
          {type: 'operator', value: '|', depth: 0},
          {type: 'name', value: 'a', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('svg|*'), [
          {type: 'name', value: 'svg', depth: 0},
          {type: 'operator', value: '|', depth: 0},
          {type: 'operator', value: '*', depth: 0},
        ]);
      });

      it('namespaced attribute selector', function () {
        assert.deepEqual(tokenizer.run('[|attr]'), [
          {type: 'selector', value: '[|attr]', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('[svg|attr]'), [
          {type: 'selector', value: '[svg|attr]', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('[*|attr]'), [
          {type: 'selector', value: '[*|attr]', depth: 0},
        ]);

        assert.deepEqual(tokenizer.run('[*|attr=value]'), [
          {type: 'selector', value: '[*|attr=value]', depth: 0},
        ]);
        assert.deepEqual(tokenizer.run('[*|attr="value"]'), [
          {type: 'selector', value: '[*|attr="value"]', depth: 0},
        ]);
      });
    });

    describe('capturer.CssSelectorTokenizer.tokensToString', function () {
      const tokenizer = new capturer.CssSelectorTokenizer();

      it('basic', function () {
        assert.deepEqual(tokenizer.tokensToString([
          {type: 'name', value: 'div', depth: 0},
          {type: 'operator', value: ' ', depth: 0},
          {type: 'name', value: 'span', depth: 0},
        ]), 'div span');
      });
    });
  });

  describe('capturer.DocumentCssHandler', function () {
    $describe.skipIf($.noBrowser)('capturer.DocumentCssHandler.getSelectorText', function () {
      const getSelectorText = (...args) => {
        return capturer.DocumentCssHandler.getSelectorText(...args);
      };

      it('basic', function () {
        var rules = getRulesFromCssText(`div, span { background-color: lime; }`);
        assert.strictEqual(getSelectorText(rules[0]), 'div, span');
      });

      $it.skipIf($.noNestingCss)('prepend :is() wrapped parent selector text for a nested rule', function () {
        var rules = getRulesFromCssText(`\
div, span {
  a {
    b {}
  }
}`);
        assert.strictEqual(getSelectorText(rules[0]), 'div, span');
        assert.strictEqual(getSelectorText(rules[0].cssRules[0]), ':is(div, span) a');
        assert.strictEqual(getSelectorText(rules[0].cssRules[0].cssRules[0]), ':is(:is(div, span) a) b');
      });

      $it.skipIf($.noNestingCss)('prepend parent selector for all top-level selector list items', function () {
        var rules = getRulesFromCssText(`\
div {
  a, area {
    b, strong {}
  }
}`);
        // extra spaces may be inserted, but the semantic should not change
        var regex = cssRegex`:is(div) a, :is(div) area`;
        assert(getSelectorText(rules[0].cssRules[0]).match(regex));
        var regex = cssRegex`:is(:is(div) a, :is(div) area) b, :is(:is(div) a, :is(div) area) strong`;
        assert(getSelectorText(rules[0].cssRules[0].cssRules[0]).match(regex));
      });

      $it.skipIf($.noNestingCss)('replace "&" with :is() wrapped parent selector text for a nested rule', function () {
        var rules = getRulesFromCssText(`\
div, span {
  & .case1 {}
  &.case2 {}
  .case3 & {}
  .case4& {}
  & .case5 & & {}
}`);
        assert.strictEqual(getSelectorText(rules[0]), 'div, span');
        assert.strictEqual(getSelectorText(rules[0].cssRules[0]), ':is(div, span) .case1');
        assert.strictEqual(getSelectorText(rules[0].cssRules[1]), ':is(div, span).case2');
        assert.strictEqual(getSelectorText(rules[0].cssRules[2]), '.case3 :is(div, span)');
        assert.strictEqual(getSelectorText(rules[0].cssRules[3]), '.case4:is(div, span)');
        assert.strictEqual(getSelectorText(rules[0].cssRules[4]), ':is(div, span) .case5 :is(div, span) :is(div, span)');
      });

      $it.skipIf($.noNestingCss)('prepend parent selector for top-level selector list items without "&"', function () {
        var rules = getRulesFromCssText(`\
div {
  & .case1, .case2 {}
  & .case1, & .case2 {}
  .case1, .case2 & {}
}`);
        // extra spaces may be inserted, but the semantic should not change
        var regex = cssRegex`:is(div) .case1, :is(div) .case2`;
        assert(getSelectorText(rules[0].cssRules[0]).match(regex));
        var regex = cssRegex`:is(div) .case1, :is(div) .case2`;
        assert(getSelectorText(rules[0].cssRules[1]).match(regex));
        var regex = cssRegex`:is(div) .case1, .case2 :is(div)`;
        assert(getSelectorText(rules[0].cssRules[2]).match(regex));

        // don't recurse into a non-top-level select list
        var rules = getRulesFromCssText(`\
div {
  & :is(.case1, .case2) {}
  :is(& .case1, .case2) {}
  :is(.case1 &, .case2) {}
  :is(.case1, & .case2) {}
  :is(.case1, .case2 &) {}
}`);
        assert.strictEqual(getSelectorText(rules[0].cssRules[0]), ':is(div) :is(.case1, .case2)');
        assert.strictEqual(getSelectorText(rules[0].cssRules[1]), ':is(:is(div) .case1, .case2)');
        assert.strictEqual(getSelectorText(rules[0].cssRules[2]), ':is(.case1 :is(div), .case2)');
        assert.strictEqual(getSelectorText(rules[0].cssRules[3]), ':is(.case1, :is(div) .case2)');
        assert.strictEqual(getSelectorText(rules[0].cssRules[4]), ':is(.case1, .case2 :is(div))');
      });

      $it.skipIf($.noNestingCss)('imply parent selector for a relative selector even if "&" exists', function () {
        var rules = getRulesFromCssText(`\
ul {
  > li &, + li &, ~ li & {}
}`);
        // Some browsers (e.g. Firefox 124) auto-prepend the implied "&" and parse the sub-rule as: "& > li &, & + li &, & ~ li &"
        // while some browsers (e.g. Chromium 122) don't and parse as original "> li &, + li &, ~ li &".
        var regex = cssRegex`:is(ul) > li :is(ul), :is(ul) + li :is(ul), :is(ul) ~ li :is(ul)`;
        assert(getSelectorText(rules[0].cssRules[0]).match(regex));

        // should work for other ASCII white spaces
        var rules = getRulesFromCssText(`\
ul {
  >\tli\t&,\t+\tli\t&,\t~\tli\t&\t{}
}`);
        var regex = cssRegex`:is(ul) > li :is(ul), :is(ul) + li :is(ul), :is(ul) ~ li :is(ul)`;
        assert(getSelectorText(rules[0].cssRules[0]).match(regex));
      });

      $it.skipIf($.noNestingCss).skipIf($.noColumnCombinator)('imply parent selector for a starting column combinator even if "&" exists', function () {
        var rules = getRulesFromCssText(`\
.colcls {
  || td & {}
}`);
        var regex = cssRegex`:is(.colcls) || td :is(.colcls)`;
        assert(getSelectorText(rules[0].cssRules[0]).match(regex));
      });

      $it.skipIf($.noNestingCss)('escaped "&" should not be rewritten', function () {
        var rules = getRulesFromCssText(r`blockquote { .my\&class {} }`);
        assert.strictEqual(getSelectorText(rules[0].cssRules[0]), r`:is(blockquote) .my\&class`);
      });

      $it.skipIf($.noNestingCss)('"&" in [attr=""] should not be rewritten', function () {
        var rules = getRulesFromCssText(r`blockquote { [myattr="a & b"] {} }`);
        assert.strictEqual(getSelectorText(rules[0].cssRules[0]), r`:is(blockquote) [myattr="a & b"]`);
      });
    });

    describe('capturer.DocumentCssHandler.getSelectorVerifier', function () {
      const getSelectorVerifier = (...args) => {
        return capturer.DocumentCssHandler.getSelectorVerifier(...args);
      };

      const testGetSelectorVerifier = (selector1, selector2, validate = true) => {
        if (validate && typeof document !== 'undefined' && document.querySelector) {
          try {
            selector1 && document.querySelector(selector1);
          } catch {
            throw new Error(`Invalid testing CSS selector: ${selector1}`);
          }
          try {
            selector2 && document.querySelector(selector2);
          } catch {
            throw new Error(`Invalid control CSS selector: ${selector2}`);
          }
        }
        assert.strictEqual(getSelectorVerifier(selector1), selector2);
      };

      it('general selectors', function () {
        testGetSelectorVerifier('*', '*');
        testGetSelectorVerifier('div#id, span.class', 'div#id, span.class');
        testGetSelectorVerifier('& body', '& body', false);
      });

      it('common pseudo-classes', function () {
        testGetSelectorVerifier('a:hover', 'a');
        testGetSelectorVerifier('a:active', 'a');
        testGetSelectorVerifier('a:link', 'a');
        testGetSelectorVerifier('a:visited', 'a');

        testGetSelectorVerifier('div:empty', 'div');

        testGetSelectorVerifier('form :enabled', 'form *');
        testGetSelectorVerifier('form :disabled', 'form *');

        testGetSelectorVerifier('form:focus', 'form');
        testGetSelectorVerifier('form:focus-within', 'form');

        testGetSelectorVerifier('input:checked', 'input');
        testGetSelectorVerifier('input:indeterminate', 'input');

        testGetSelectorVerifier('input:required', 'input');
        testGetSelectorVerifier('input:optional', 'input');

        testGetSelectorVerifier('input:valid', 'input');
        testGetSelectorVerifier('input:invalid', 'input');

        testGetSelectorVerifier('input:in-range', 'input');
        testGetSelectorVerifier('input:out-of-range', 'input');

        testGetSelectorVerifier(':lang(en) > q', '* > q');
        testGetSelectorVerifier(':dir(ltr)', '*', false);

        testGetSelectorVerifier('a:not([href]):not([target])', 'a');
      });

      it('common pseudo-elements', function () {
        testGetSelectorVerifier('a::before', 'a');
        testGetSelectorVerifier('a::after', 'a');
        testGetSelectorVerifier('p::first-line', 'p');
        testGetSelectorVerifier('input::placeholder', 'input');
        testGetSelectorVerifier('::slotted(span)', '*');
        testGetSelectorVerifier('custom-element::part(tab)', 'custom-element', false);
        testGetSelectorVerifier('#nonexist::part(elem)', '#nonexist', false);
      });

      it('combined pseudo-classes/elements', function () {
        testGetSelectorVerifier('a:hover::before', 'a');
      });

      it('pseudo-classes that are not guaranteed to work after rewritten', function () {
        testGetSelectorVerifier(':host', '');
        testGetSelectorVerifier(':host > div', '');
        testGetSelectorVerifier(':host(.class)', '');
        testGetSelectorVerifier(':host(.class) > div', '');
        testGetSelectorVerifier(':host-context(.class)', '', false);
        testGetSelectorVerifier(':host-context(.class) > div', '', false);
      });

      it('allowed pseudo-classes', function () {
        testGetSelectorVerifier(':root', ':root');
        testGetSelectorVerifier(':scope', ':scope');
        testGetSelectorVerifier(':scope > body > div', ':scope > body > div');
        testGetSelectorVerifier(':is(div, span)', ':is(div, span)', false);
        testGetSelectorVerifier(':where(div, span)', ':where(div, span)', false);
        testGetSelectorVerifier('h1:has(+ h2, + h3, + h4)', 'h1:has(+ h2, + h3, + h4)', false);

        testGetSelectorVerifier('p:first-child', 'p:first-child');
        testGetSelectorVerifier('p:last-child', 'p:last-child');
        testGetSelectorVerifier('div:first-of-type', 'div:first-of-type');
        testGetSelectorVerifier('div:last-of-type', 'div:last-of-type');
        testGetSelectorVerifier('li:only-child', 'li:only-child');
        testGetSelectorVerifier('li:only-of-type', 'li:only-of-type');
        testGetSelectorVerifier('li:nth-child(even)', 'li:nth-child(even)');
        testGetSelectorVerifier('li:nth-last-child(2)', 'li:nth-last-child(2)');
        testGetSelectorVerifier('li:nth-of-type(3n + 1)', 'li:nth-of-type(3n + 1)');
        testGetSelectorVerifier('li:nth-last-of-type(3)', 'li:nth-last-of-type(3)');
      });

      it('(...) inside an allowed pseudo should be recursively rewritten', function () {
        testGetSelectorVerifier(':is(:hover, a:active)', ':is(*, a)', false);
        testGetSelectorVerifier(':is(:is(:link, :visited), button:active)', ':is(:is(*, *), button)', false);
      });

      it('namespace for type selector should be removed', function () {
        testGetSelectorVerifier('svg|a span', 'a span', false);
        testGetSelectorVerifier('*|a span', 'a span');
        testGetSelectorVerifier('|a span', 'a span');
        testGetSelectorVerifier('svg|* span', '* span', false);
        testGetSelectorVerifier('*|* span', '* span');
        testGetSelectorVerifier('|* span', '* span');

        testGetSelectorVerifier('p svg|a', 'p a', false);
        testGetSelectorVerifier('p *|a', 'p a');
        testGetSelectorVerifier('p |a', 'p a');
        testGetSelectorVerifier('p svg|*', 'p *', false);
        testGetSelectorVerifier('p *|*', 'p *');
        testGetSelectorVerifier('p |*', 'p *');
      });

      it('namespace for attribute selector should be *', function () {
        testGetSelectorVerifier('[attr]', '[*|attr]');
        testGetSelectorVerifier('[attr=value]', '[*|attr=value]');
        testGetSelectorVerifier('[attr="value"]', '[*|attr="value"]');

        testGetSelectorVerifier('[|attr]', '[*|attr]');
        testGetSelectorVerifier('[|attr=value]', '[*|attr=value]');
        testGetSelectorVerifier('[|attr="value"]', '[*|attr="value"]');

        testGetSelectorVerifier('[svg|attr]', '[*|attr]', false);
        testGetSelectorVerifier('[svg|attr=value]', '[*|attr=value]', false);
        testGetSelectorVerifier('[svg|attr="value"]', '[*|attr="value"]', false);

        testGetSelectorVerifier('[*|attr]', '[*|attr]');
        testGetSelectorVerifier('[*|attr=value]', '[*|attr=value]');
        testGetSelectorVerifier('[*|attr="value"]', '[*|attr="value"]');

        testGetSelectorVerifier('[svg|attr="value" i]', '[*|attr="value" i]', false);

        // be ware of the |= operator
        testGetSelectorVerifier('[attr|="value"]', '[*|attr|="value"]');
        testGetSelectorVerifier('[svg|attr|="value"]', '[*|attr|="value"]', false);
      });

      it('column combinator should not be treated as namespace', function () {
        testGetSelectorVerifier('col||td', 'col||td', false);
        testGetSelectorVerifier('col || td', 'col || td', false);
      });
    });

    $describe.skipIf($.noBrowser)('capturer.DocumentCssHandler.getRulesFromCssText', function () {
      const getRulesFromCssText = (...args) => {
        return capturer.DocumentCssHandler.getRulesFromCssText(...args);
      };

      it('basic', function () {
        var rules = getRulesFromCssText(`\
@media screen and (min-width: 300px), print {
  body {
    font-size: 1.5em;
    line-height: 2em;
  }
}`);

        assert.instanceOf(rules[0], CSSMediaRule);
        assert.strictEqual(rules[0].media[0], 'screen and (min-width: 300px)');
        assert.strictEqual(rules[0].media[1], 'print');

        assert.instanceOf(rules[0].cssRules[0], CSSStyleRule);
        assert.strictEqual(rules[0].cssRules[0].selectorText, 'body');
        assert.strictEqual(rules[0].cssRules[0].style.getPropertyValue('font-size'), '1.5em');
        assert.strictEqual(rules[0].cssRules[0].style.getPropertyValue('line-height'), '2em');
      });

      it('browser syntax check/tidy for whitespaces and comments', function () {
        // space between operators are added
        var rules = getRulesFromCssText(`body>div{color:red;}`);
        assert.strictEqual(rules[0].cssText, `body > div { color: red; }`);

        var rules = getRulesFromCssText(`p{}`);
        assert.strictEqual(rules[0].cssText, `p { }`);

        // extra spaces are removed
        var rules = getRulesFromCssText(`   body    div    {  color  :   red  ;  }  `);
        assert.strictEqual(rules[0].cssText, `body div { color: red; }`);

        var rules = getRulesFromCssText(`[  myattr  ] { }`);
        assert.strictEqual(rules[0].selectorText, `[myattr]`);

        var rules = getRulesFromCssText(`[  myattr  =  myvalue  ] { }`);
        assert.strictEqual(rules[0].selectorText, `[myattr="myvalue"]`);

        var rules = getRulesFromCssText(`[  myattr  =  " myvalue "  ] { }`);
        assert.strictEqual(rules[0].selectorText, `[myattr=" myvalue "]`);

        var rules = getRulesFromCssText(`:not( div ) { }`);
        assert.strictEqual(rules[0].selectorText, `:not(div)`);

        // comments are removed (in the same way of spaces)
        var rules = getRulesFromCssText(`/* comment */ body > div { color: red; }`);
        assert.strictEqual(rules[0].cssText, `body > div { color: red; }`);

        var rules = getRulesFromCssText(`body /* comment */ > div { color: red; }`);
        assert.strictEqual(rules[0].cssText, `body > div { color: red; }`);

        var rules = getRulesFromCssText(`body > /* comment */ div { color: red; }`);
        assert.strictEqual(rules[0].cssText, `body > div { color: red; }`);

        var rules = getRulesFromCssText(`body > div /* comment */ { color: red; }`);
        assert.strictEqual(rules[0].cssText, `body > div { color: red; }`);

        var rules = getRulesFromCssText(`body > div { /* comment */ color: red; }`);
        assert.strictEqual(rules[0].cssText, `body > div { color: red; }`);

        var rules = getRulesFromCssText(`body > div { color /* comment */ : red; }`);
        assert.strictEqual(rules[0].cssText, `body > div { color: red; }`);

        var rules = getRulesFromCssText(`body > div { color : /* comment */ red; }`);
        assert.strictEqual(rules[0].cssText, `body > div { color: red; }`);

        var rules = getRulesFromCssText(`body > div { color : red /* comment */; }`);
        assert.strictEqual(rules[0].cssText, `body > div { color: red; }`);

        var rules = getRulesFromCssText(`body > div { color : red; /* comment */ }`);
        assert.strictEqual(rules[0].cssText, `body > div { color: red; }`);

        var rules = getRulesFromCssText(`body > div { color : red; } /* comment */`);
        assert.strictEqual(rules[0].cssText, `body > div { color: red; }`);

        var rules = getRulesFromCssText(`[ /* comment */ myattr="myvalue"] { }`);
        assert.strictEqual(rules[0].cssText, `[myattr="myvalue"] { }`);

        var rules = getRulesFromCssText(`[myattr /* comment */ ="myvalue"] { }`);
        assert.strictEqual(rules[0].cssText, `[myattr="myvalue"] { }`);

        var rules = getRulesFromCssText(`[myattr= /* comment */ "myvalue"] { }`);
        assert.strictEqual(rules[0].cssText, `[myattr="myvalue"] { }`);

        var rules = getRulesFromCssText(`[myattr="myvalue" /* comment */ ] { }`);
        assert.strictEqual(rules[0].cssText, `[myattr="myvalue"] { }`);

        var rules = getRulesFromCssText(`:not( /* comment */ div) { }`);
        assert.strictEqual(rules[0].cssText, `:not(div) { }`);

        var rules = getRulesFromCssText(`:not(div /* comment */ ) { }`);
        assert.strictEqual(rules[0].cssText, `:not(div) { }`);

        // unpaired comments are removed
        var rules = getRulesFromCssText(`body > div { color: red; } /* comment`);
        assert.strictEqual(rules[0].cssText, `body > div { color: red; }`);

        // space/comment around the namespace separator is not allowed
        var rules = getRulesFromCssText(`svg | a { }`);
        assert.strictEqual(rules[0], undefined);

        // space/comment between pseudo-class/element name and parenthesis is not allowed
        var rules = getRulesFromCssText(`:not (p) { }`);
        assert.strictEqual(rules[0], undefined);

        var rules = getRulesFromCssText(`::slotted (p) { }`);
        assert.strictEqual(rules[0], undefined);

        // space/comment between function name and parenthesis is not allowed
        var rules = getRulesFromCssText(`p { background-image: url (image.jpg); }`);
        assert.strictEqual(rules[0].cssText, `p { }`);

        var rules = getRulesFromCssText(`p::after { content: attr (id); }`);
        assert.strictEqual(rules[0].cssText, `p::after { }`);

        var rules = getRulesFromCssText(`p { color: var (--my-var); }`);
        assert.strictEqual(rules[0].cssText, `p { }`);

        // comment inside a function is not allowed in some cases
        var rules = getRulesFromCssText(`p { background-image: url(/* comment */"image.jpg"); }`);
        assert.strictEqual(rules[0].cssText, `p { }`);

        var rules = getRulesFromCssText(`p { background-image: url(image.jpg/* comment */); }`);
        assert.strictEqual(rules[0].cssText, `p { }`);

        // space/comment inside a function is allowed in some cases
        var rules = getRulesFromCssText(`p { background-image: url("image.jpg"  ); }`);
        assert.strictEqual(rules[0].cssText, `p { background-image: url("image.jpg"); }`);

        var rules = getRulesFromCssText(`p { background-image: url("image.jpg"/* comment */); }`);
        assert.strictEqual(rules[0].cssText, `p { background-image: url("image.jpg"); }`);

        // Chrome >= 13x: keeps original spaces
        // var rules = getRulesFromCssText(`p::after { content: attr(  id  ); }`);
        // assert.strictEqual(rules[0].cssText, `p::after { content: attr(id); }`);
      });

      it('browser syntax check/tidy for escaping', function () {
        // chars allowed for an ident are unescaped
        var rules = getRulesFromCssText(r`.my\-c\la\s\s { }`);
        assert.strictEqual(rules[0].cssText, `.my-class { }`);

        // escaping a newline in an ident is not allowed
        var rules = getRulesFromCssText(r`.my\
class { }`);
        assert.strictEqual(rules[0], undefined);
      });

      it('browser syntax check/tidy for quoting', function () {
        // double quotes and backslashes are escaped
        var rules = getRulesFromCssText(r`[a=\"my\"attr\\value] { }`);
        assert.strictEqual(rules[0].selectorText, r`[a="\"my\"attr\\value"]`);

        var rules = getRulesFromCssText(r`[a='"my" attr\\value'] { }`);
        assert.strictEqual(rules[0].selectorText, r`[a="\"my\" attr\\value"]`);

        // null, surrogate, and code > 0x10FFFF are replaced with 0xFFFD
        var rules = getRulesFromCssText(r`[myattr=\0 \D800 \DFFF \110000] { }`);
        assert.strictEqual(rules[0].selectorText, `[myattr="\uFFFD\uFFFD\uFFFD\uFFFD"]`);

        // ASCII control chars (0x01~0x1F, 0x7F) are hex-escaped with lower case and space
        var rules = getRulesFromCssText(r`[myattr=\1\2\3\4\5\6\7\8\9\A\B\C\D\E\F] { }`);
        assert.strictEqual(rules[0].selectorText, r`[myattr="\1 \2 \3 \4 \5 \6 \7 \8 \9 \a \b \c \d \e \f "]`);

        var rules = getRulesFromCssText(r`[myattr=\10\11\12\13\14\15\16\17\18\19\1A\1B\1C\1D\1E\1F\7F] { }`);
        assert.strictEqual(rules[0].selectorText, r`[myattr="\10 \11 \12 \13 \14 \15 \16 \17 \18 \19 \1a \1b \1c \1d \1e \1f \7f "]`);

        // other ASCII symbols are unescaped
        var rules = getRulesFromCssText(r`[myattr=\20\21\22\23\24\25\26\27\28\29\2A\2B\2C\2D\2E\2F] { }`);
        assert.strictEqual(rules[0].selectorText, r`[myattr=" !\"#$%&'()*+,-./"]`);

        var rules = getRulesFromCssText(r`[myattr=\3A\3B\3C\3D\3E\3F\40\5B\5D\5E\5F\7B\7C\7D\7E] { }`);
        assert.strictEqual(rules[0].selectorText, r`[myattr=":;<=>?@[]^_{|}~"]`);

        // Unicode chars are unescaped
        var rules = getRulesFromCssText(r`[myattr=\80\81\9E\9F] { }`);
        assert.strictEqual(rules[0].selectorText, `[myattr="\x80\x81\x9E\x9F"]`);

        var rules = getRulesFromCssText(r`[myattr="\3000 \4E00 \20000 \100000"] { }`);
        assert.strictEqual(rules[0].selectorText, `[myattr="\u3000\u4E00\u{20000}\u{100000}"]`);

        // newline in a string is not allowed (closed as a bad string)
        var rules = getRulesFromCssText(r`p::after { content: "abc
123"; }`);
        assert.strictEqual(rules[0].cssText, `p::after { }`);

        var rules = getRulesFromCssText(r`p::after { content: "abc
; color: red; }`);
        assert.strictEqual(rules[0].cssText, `p::after { color: red; }`);

        // escaped newline in a string is stripped
        var rules = getRulesFromCssText(r`p::after { content: "abc\
123"; }`);
        assert.strictEqual(rules[0].cssText, `p::after { content: "abc123"; }`);
      });

      it('browser syntax check/tidy for attribute selector', function () {
        // value is double quoted
        var rules = getRulesFromCssText(`[myattr=myvalue] { }`);
        assert.strictEqual(rules[0].selectorText, `[myattr="myvalue"]`);

        var rules = getRulesFromCssText(`[myattr='my value'] { }`);
        assert.strictEqual(rules[0].selectorText, `[myattr="my value"]`);

        // name with quotes is not allowed
        var rules = getRulesFromCssText(`["myattr"] { }`);
        assert.strictEqual(rules[0], undefined);

        // value with mixed literal and quotes is not allowed
        var rules = getRulesFromCssText(`[myattr=my"quoted"value] { }`);
        assert.strictEqual(rules[0], undefined);

        // value with non-escaped operator is not allowed
        var rules = getRulesFromCssText(`[myattr=@namespace] { }`);
        assert.strictEqual(rules[0], undefined);

        var rules = getRulesFromCssText(`[myattr=div{color:red}] { }`);
        assert.strictEqual(rules[0], undefined);

        var rules = getRulesFromCssText(`[myattr=var(--my-var)] { }`);
        assert.strictEqual(rules[0], undefined);

        var rules = getRulesFromCssText(`[myattr=my|value] { }`);
        assert.strictEqual(rules[0], undefined);

        var rules = getRulesFromCssText(`[myattr=foo=bar] { }`);
        assert.strictEqual(rules[0], undefined);

        var rules = getRulesFromCssText(`[myattr=xlink:href] { }`);
        assert.strictEqual(rules[0], undefined);
      });

      it('browser syntax check/tidy for declaration', function () {
        // semicolon after a declaration is added
        var rules = getRulesFromCssText(`body { color: red }`);
        assert.strictEqual(rules[0].cssText, `body { color: red; }`);

        // property value is double quoted
        var rules = getRulesFromCssText(`p::after { content: 'my value'; }`);
        assert.strictEqual(rules[0].cssText, `p::after { content: "my value"; }`);

        // !important with space after "!"
        var rules = getRulesFromCssText(`body { color: red ! important; }`);
        assert.strictEqual(rules[0].cssText, `body { color: red !important; }`);

        // !important with no space before "!"
        var rules = getRulesFromCssText(`body { color: red!important; }`);
        assert.strictEqual(rules[0].cssText, `body { color: red !important; }`);
      });

      $(it).xfailIf(
        userAgent.is('chromium') && userAgent.major < 113,
        'var(...) is tidied in Chromium < 113',
      )('browser syntax check/tidy for var()', function () {
        var rules = getRulesFromCssText(`p { color: var(  --myvar ); }`);
        assert.strictEqual(rules[0].cssText, `p { color: var(  --myvar ); }`);

        var rules = getRulesFromCssText(`p { color: var(/* comment */--myvar); }`);
        assert.strictEqual(rules[0].cssText, `p { color: var(/* comment */--myvar); }`);

        var rules = getRulesFromCssText(`p { color: var(--myvar/* comment */); }`);
        assert.strictEqual(rules[0].cssText, `p { color: var(--myvar/* comment */); }`);
      });
    });
  });

  $describe.skipIf($.noBrowser)('capturer.CaptureHelperHandler', function () {
    function makeHtmlDocument(html) {
      return new DOMParser().parseFromString(html, 'text/html');
    }

    describe("capturer.CaptureHelperHandler.getOverwritingOptions", function () {
      it("do not include capture helper related options", function () {
        var options = capturer.CaptureHelperHandler.getOverwritingOptions(
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

      it("merge options in last-win manner", function () {
        var options = capturer.CaptureHelperHandler.getOverwritingOptions(
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

      it("skip helpers with truthy disabled property", function () {
        var options = capturer.CaptureHelperHandler.getOverwritingOptions(
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

      it("skip helpers whose pattern do not match document URL", function () {
        var options = capturer.CaptureHelperHandler.getOverwritingOptions(
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

      it("return empty object if docUrl is falsy", function () {
        var options = capturer.CaptureHelperHandler.getOverwritingOptions(
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

    describe("capturer.CaptureHelperHandler.parseRegexStr", function () {
      it("basic", function () {
        var {source, flags} = capturer.CaptureHelperHandler.parseRegexStr(`/abc/def/`);
        assert.deepEqual({source, flags}, {source: r`abc\/def`, flags: ``});

        var {source, flags} = capturer.CaptureHelperHandler.parseRegexStr(`/abc/def/imguy`);
        assert.deepEqual({source, flags}, {source: r`abc\/def`, flags: `gimuy`});
      });

      it("return null for an invalid regex string", function () {
        assert.strictEqual(capturer.CaptureHelperHandler.parseRegexStr(`abc/def`), null);
      });
    });

    describe("capturer.CaptureHelperHandler.isCommand", function () {
      it("basic", function () {
        assert.strictEqual(capturer.CaptureHelperHandler.isCommand(["if", true, "yes", "no"]), true);
        assert.strictEqual(capturer.CaptureHelperHandler.isCommand(["if"]), true);

        assert.strictEqual(capturer.CaptureHelperHandler.isCommand(null), false);
        assert.strictEqual(capturer.CaptureHelperHandler.isCommand(0), false);
        assert.strictEqual(capturer.CaptureHelperHandler.isCommand(1), false);
        assert.strictEqual(capturer.CaptureHelperHandler.isCommand(""), false);
        assert.strictEqual(capturer.CaptureHelperHandler.isCommand(`["if", true, "yes", "no"]`), false);
        assert.strictEqual(capturer.CaptureHelperHandler.isCommand([]), false);
        assert.strictEqual(capturer.CaptureHelperHandler.isCommand([1, 2, 3]), false);
        assert.strictEqual(capturer.CaptureHelperHandler.isCommand({}), false);
      });
    });

    describe("capturer.CaptureHelperHandler.selectNodes", function () {
      function makeTestDoc() {
        return makeHtmlDocument(`\
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
</body>`);
      }

      function removeElems(elems) {
        for (const elem of elems) {
          elem.remove();
        }
      }

      describe("Object", function () {
        it(".css", function () {
          var doc = makeTestDoc();
          var selector = {css: "div"};
          removeElems(capturer.CaptureHelperHandler.selectNodes(doc, selector));
          assert.strictEqual(doc.body.innerHTML.trim(), ``);
        });

        it(".xpath", function () {
          var doc = makeTestDoc();
          var selector = {xpath: "//div"};
          removeElems(capturer.CaptureHelperHandler.selectNodes(doc, selector));
          assert.strictEqual(doc.body.innerHTML.trim(), ``);
        });

        describe(".base", function () {
          it("self", function () {
            var doc = makeTestDoc();
            var selector = "self";
            var refNode = doc.querySelector('#target');
            var result = capturer.CaptureHelperHandler.selectNodes(refNode, selector);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0], refNode);
          });

          it("root", function () {
            var doc = makeTestDoc();
            var selector = "root";
            var refNode = doc.querySelector('#target');
            var result = capturer.CaptureHelperHandler.selectNodes(refNode, selector);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0], doc);
          });

          it("parent", function () {
            var doc = makeTestDoc();
            var selector = {base: "parent"};
            var refNode = doc.querySelector('#target');
            var result = capturer.CaptureHelperHandler.selectNodes(refNode, selector);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0], refNode.parentNode);
          });

          it("previousSibling", function () {
            var doc = makeTestDoc();
            var selector = {base: "previousSibling"};
            var refNode = doc.querySelector('#target');
            var result = capturer.CaptureHelperHandler.selectNodes(refNode, selector);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0], refNode.previousSibling);
          });

          it("nextSibling", function () {
            var doc = makeTestDoc();
            var selector = {base: "nextSibling"};
            var refNode = doc.querySelector('#target');
            var result = capturer.CaptureHelperHandler.selectNodes(refNode, selector);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0], refNode.nextSibling);
          });

          it("firstChild", function () {
            var doc = makeTestDoc();
            var selector = {base: "firstChild"};
            var refNode = doc.querySelector('#target');
            var result = capturer.CaptureHelperHandler.selectNodes(refNode, selector);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0], refNode.firstChild);
          });

          it("lastChild", function () {
            var doc = makeTestDoc();
            var selector = {base: "lastChild"};
            var refNode = doc.querySelector('#target');
            var result = capturer.CaptureHelperHandler.selectNodes(refNode, selector);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0], refNode.lastChild);
          });

          it("previousElementSibling", function () {
            var doc = makeTestDoc();
            var selector = {base: "previousElementSibling"};
            var refNode = doc.querySelector('#target');
            var result = capturer.CaptureHelperHandler.selectNodes(refNode, selector);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0], refNode.previousElementSibling);
          });

          it("nextElementSibling", function () {
            var doc = makeTestDoc();
            var selector = {base: "nextElementSibling"};
            var refNode = doc.querySelector('#target');
            var result = capturer.CaptureHelperHandler.selectNodes(refNode, selector);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0], refNode.nextElementSibling);
          });

          it("firstElementChild", function () {
            var doc = makeTestDoc();
            var selector = {base: "firstElementChild"};
            var refNode = doc.querySelector('#target');
            var result = capturer.CaptureHelperHandler.selectNodes(refNode, selector);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0], refNode.firstElementChild);
          });

          it("lastElementChild", function () {
            var doc = makeTestDoc();
            var selector = {base: "lastElementChild"};
            var refNode = doc.querySelector('#target');
            var result = capturer.CaptureHelperHandler.selectNodes(refNode, selector);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0], refNode.lastElementChild);
          });

          it('chaining', function () {
            var doc = makeTestDoc();
            var selector = {base: "firstChild.nextSibling.nextSibling.nextSibling"};
            var refNode = doc.querySelector('#target');
            var result = capturer.CaptureHelperHandler.selectNodes(refNode, selector);
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0], refNode.firstChild.nextSibling.nextSibling.nextSibling);
          });

          it('with selector', function () {
            var doc = makeTestDoc();
            var selector = {base: "parent", css: "div"};
            removeElems(capturer.CaptureHelperHandler.selectNodes(doc.querySelector('#target'), selector));
            assert.strictEqual(doc.body.innerHTML.trim(), `\
<div id="parent-prev"></div>
<div id="parent">
  
  
  
</div>
<div id="parent-next"></div>`);
          });
        });
      });

      describe("string", function () {
        it('valid base should be treated as {base: ...}', function () {
          var doc = makeTestDoc();
          var selector = "parent";
          var refNode = doc.querySelector('#target');
          var result = capturer.CaptureHelperHandler.selectNodes(refNode, selector);
          assert.strictEqual(result.length, 1);
          assert.strictEqual(result[0], refNode.parentNode);

          var doc = makeTestDoc();
          var selector = "parent.firstChild.nextSibling";
          var refNode = doc.querySelector('#target');
          var result = capturer.CaptureHelperHandler.selectNodes(refNode, selector);
          assert.strictEqual(result.length, 1);
          assert.strictEqual(result[0], refNode.parentNode.firstChild.nextSibling);
        });

        it('non-valid base should be treated as {css: ...}', function () {
          var doc = makeTestDoc();
          var selector = "div";
          removeElems(capturer.CaptureHelperHandler.selectNodes(doc, selector));
          assert.strictEqual(doc.body.innerHTML.trim(), ``);

          var doc = makeTestDoc();
          var selector = "body > div";
          removeElems(capturer.CaptureHelperHandler.selectNodes(doc, selector));
          assert.strictEqual(doc.body.innerHTML.trim(), ``);
        });
      });

      describe("falsy", function () {
        it("undefined", function () {
          var doc = makeTestDoc();
          var selector;
          var refNode = doc.querySelector('#target');
          var result = capturer.CaptureHelperHandler.selectNodes(refNode, selector);
          assert.strictEqual(result.length, 1);
          assert.strictEqual(result[0], refNode);
        });

        it("null", function () {
          var doc = makeTestDoc();
          var selector = null;
          var refNode = doc.querySelector('#target');
          var result = capturer.CaptureHelperHandler.selectNodes(refNode, selector);
          assert.strictEqual(result.length, 1);
          assert.strictEqual(result[0], refNode);
        });

        it("empty string", function () {
          var doc = makeTestDoc();
          var selector = "";
          var refNode = doc.querySelector('#target');
          var result = capturer.CaptureHelperHandler.selectNodes(refNode, selector);
          assert.strictEqual(result.length, 1);
          assert.strictEqual(result[0], refNode);
        });
      });
    });

    describe("capturer.CaptureHelperHandler.runCommand", function () {
      function makeTestDoc() {
        return makeHtmlDocument(`\
<div id="target">target</div>
<div id="target2">target2</div>`);
      }

      describe("cmd_if", function () {
        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();
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

          var command = ["if", false, 1, 0];
          assert.strictEqual(helper.runCommand(command, doc), 0);

          var command = ["if", 0, 1, 0];
          assert.strictEqual(helper.runCommand(command, doc), 0);

          var command = ["if", "", 1, 0];
          assert.strictEqual(helper.runCommand(command, doc), 0);

          var command = ["if", null, 1, 0];
          assert.strictEqual(helper.runCommand(command, doc), 0);
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["if", ["concat", "foo"], ["get_text", {css: "#target"}], ["get_text", {css: "#target2"}]];
          assert.strictEqual(helper.runCommand(command, doc), "target");

          var command = ["if", ["concat", ""], ["get_text", {css: "#target"}], ["get_text", {css: "#target2"}]];
          assert.strictEqual(helper.runCommand(command, doc), "target2");
        });
      });

      describe("cmd_equal", function () {
        it("equality", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["equal", "foo", "foo"];
          assert.strictEqual(helper.runCommand(command, doc), true);

          var command = ["equal", "foo", "bar"];
          assert.strictEqual(helper.runCommand(command, doc), false);

          var command = ["equal", "100", 100];
          assert.strictEqual(helper.runCommand(command, doc), true);
        });

        it("strict equality", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["equal", "foo", "foo", true];
          assert.strictEqual(helper.runCommand(command, doc), true);

          var command = ["equal", "foo", "bar", true];
          assert.strictEqual(helper.runCommand(command, doc), false);

          var command = ["equal", "100", 100, true];
          assert.strictEqual(helper.runCommand(command, doc), false);
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["equal", ["concat", "100"], ["if", true, 100], ["if", true, true]];
          assert.strictEqual(helper.runCommand(command, doc), false);
        });
      });

      describe("cmd_and", function () {
        it("return first falsy or last value", function () {
          var helper = new capturer.CaptureHelperHandler();
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

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["and", ["get_text", {css: "#target"}], ["get_text", {css: "#target2"}]];
          assert.strictEqual(helper.runCommand(command, doc), "target2");
        });
      });

      describe("cmd_or", function () {
        it("return first truthy or last value", function () {
          var helper = new capturer.CaptureHelperHandler();
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

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["or", ["get_text", {css: "#target"}], ["get_text", {css: "#target2"}]];
          assert.strictEqual(helper.runCommand(command, doc), "target");
        });
      });

      describe("cmd_concat", function () {
        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["concat", "foo"];
          assert.strictEqual(helper.runCommand(command, doc), "foo");

          var command = ["concat", "foo", "bar"];
          assert.strictEqual(helper.runCommand(command, doc), "foobar");

          var command = ["concat", "foo", "bar", "baz"];
          assert.strictEqual(helper.runCommand(command, doc), "foobarbaz");
        });

        it('coerce truthy non-string value to string', function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["concat", "foo", "bar", 1];
          assert.strictEqual(helper.runCommand(command, doc), "foobar1");

          var command = ["concat", "foo", "bar", {}];
          assert.strictEqual(helper.runCommand(command, doc), "foobar[object Object]");
        });

        it('treat falsy value as empty string', function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["concat", "foo", null, false, 0];
          assert.strictEqual(helper.runCommand(command, doc), "foo");
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["concat", ["get_text", {css: "#target"}], ["get_text", {css: "#target2"}]];
          assert.strictEqual(helper.runCommand(command, doc), "targettarget2");
        });
      });

      describe("cmd_slice", function () {
        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();
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

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["slice", ["get_text", {css: "#target"}], ["if", true, 1], ["if", true, -1]];
          assert.strictEqual(helper.runCommand(command, doc), "arge");
        });
      });

      describe("cmd_upper", function () {
        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["upper", "123ABCabc中文"];
          assert.strictEqual(helper.runCommand(command, doc), "123ABCABC中文");
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["upper", ["get_text", {css: "#target"}]];
          assert.strictEqual(helper.runCommand(command, doc), "TARGET");
        });
      });

      describe("cmd_lower", function () {
        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["lower", "123ABCabc中文"];
          assert.strictEqual(helper.runCommand(command, doc), "123abcabc中文");
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["lower", ["get_text", {css: "#target"}]];
          assert.strictEqual(helper.runCommand(command, doc), "target");
        });
      });

      describe("cmd_encode_uri", function () {
        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["encode_uri", " ;,/?#:@&=+$中"];
          assert.strictEqual(helper.runCommand(command, doc), '%20%3B%2C%2F%3F%23%3A%40%26%3D%2B%24%E4%B8%AD');

          var command = ["encode_uri", " ;,/?#:@&=+$中", " ;,/?#:@&=+$"];
          assert.strictEqual(helper.runCommand(command, doc), ' ;,/?#:@&=+$%E4%B8%AD');
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["encode_uri", ["concat", " ;,/?#:@&=+$中"], ["concat", " ;,/?#:@&=+$"]];
          assert.strictEqual(helper.runCommand(command, doc), ' ;,/?#:@&=+$%E4%B8%AD');
        });
      });

      describe("cmd_decode_uri", function () {
        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["decode_uri", "%20%3B%2C%2F%3F%23%3A%40%26%3D%2B%24%E4%B8%AD"];
          assert.strictEqual(helper.runCommand(command, doc), ' ;,/?#:@&=+$中');
        });

        it("return original string if failed to decode", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["decode_uri", "%E4"];
          assert.strictEqual(helper.runCommand(command, doc), '%E4');
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["decode_uri", ["concat", "%20%3B%2C%2F%3F%23%3A%40%26%3D%2B%24%E4%B8%AD"]];
          assert.strictEqual(helper.runCommand(command, doc), ' ;,/?#:@&=+$中');
        });
      });

      describe("cmd_add", function () {
        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["add", 100];
          assert.strictEqual(helper.runCommand(command, doc), 100);

          var command = ["add", 100, 10];
          assert.strictEqual(helper.runCommand(command, doc), 110);

          var command = ["add", 100, 10, 1];
          assert.strictEqual(helper.runCommand(command, doc), 111);
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["add", ["if", true, 100], ["if", true, 10], ["if", true, 1]];
          assert.strictEqual(helper.runCommand(command, doc), 111);
        });
      });

      describe("cmd_subtract", function () {
        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["subtract", 100];
          assert.strictEqual(helper.runCommand(command, doc), 100);

          var command = ["subtract", 100, 10];
          assert.strictEqual(helper.runCommand(command, doc), 90);

          var command = ["subtract", 100, 10, 1];
          assert.strictEqual(helper.runCommand(command, doc), 89);
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["subtract", ["if", true, 100], ["if", true, 10], ["if", true, 1]];
          assert.strictEqual(helper.runCommand(command, doc), 89);
        });
      });

      describe("cmd_multiply", function () {
        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["multiply", 100];
          assert.strictEqual(helper.runCommand(command, doc), 100);

          var command = ["multiply", 100, 10];
          assert.strictEqual(helper.runCommand(command, doc), 1000);

          var command = ["multiply", 100, 10, 2];
          assert.strictEqual(helper.runCommand(command, doc), 2000);
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["multiply", ["if", true, 100], ["if", true, 10], ["if", true, 2]];
          assert.strictEqual(helper.runCommand(command, doc), 2000);
        });
      });

      describe("cmd_divide", function () {
        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();
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

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["divide", ["if", true, 100], ["if", true, 10], ["if", true, 2]];
          assert.strictEqual(helper.runCommand(command, doc), 5);
        });
      });

      describe("cmd_mod", function () {
        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();
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

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["mod", ["if", true, 12], ["if", true, 8], ["if", true, 3]];
          assert.strictEqual(helper.runCommand(command, doc), 1);
        });
      });

      describe("cmd_power", function () {
        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["power", 2];
          assert.strictEqual(helper.runCommand(command, doc), 2);

          var command = ["power", 2, 3];
          assert.strictEqual(helper.runCommand(command, doc), 8);

          var command = ["power", 2, 3, 2];
          assert.strictEqual(helper.runCommand(command, doc), 64);
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["power", ["if", true, 2], ["if", true, 3], ["if", true, 2]];
          assert.strictEqual(helper.runCommand(command, doc), 64);
        });
      });

      describe("cmd_for", function () {
        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();
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

      describe("cmd_match", function () {
        it("boolean", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["match", "text", "/TEXT/i"];
          assert.strictEqual(helper.runCommand(command, doc), true);

          var command = ["match", "text", "/unrelated/"];
          assert.strictEqual(helper.runCommand(command, doc), false);

          var command = ["match", "text", "/(te)(xt)/"];
          assert.strictEqual(helper.runCommand(command, doc), true);
        });

        it("indexed capture group", function () {
          var helper = new capturer.CaptureHelperHandler();
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

        it("named capture group", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["match", "text", "/(?<g>te)xt/", "g"];
          assert.strictEqual(helper.runCommand(command, doc), "te");

          var command = ["match", "text", "/(?<g>te)xt/", "nonexist"];
          assert.strictEqual(helper.runCommand(command, doc), undefined);

          var command = ["match", "text", "/(?<g>te)xt123/", "g"];
          assert.strictEqual(helper.runCommand(command, doc), null);
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["match", ["concat", "text"], ["concat", "/text/"], ["if", true, 0]];
          assert.strictEqual(helper.runCommand(command, doc), "text");
        });
      });

      describe("cmd_replace", function () {
        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["replace", "text content", "/(text) (content)/", "modified: $2, $1"];
          assert.strictEqual(helper.runCommand(command, doc), 'modified: content, text');
        });

        it("treat missing replacement as an empty string", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["replace", "text content", "/(text) (content)/"];
          assert.strictEqual(helper.runCommand(command, doc), "");
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["replace", ["concat", "text content"], ["concat", "/(text) (content)/"], ["concat", "modified: $2, $1"]];
          assert.strictEqual(helper.runCommand(command, doc), 'modified: content, text');
        });
      });

      describe("cmd_has_node", function () {
        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["has_node", {css: "#target"}];
          assert.strictEqual(helper.runCommand(command, doc), true);

          var command = ["has_node", {css: "#nonexist"}];
          assert.strictEqual(helper.runCommand(command, doc), false);
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["has_node", ["if", true, {css: "#target"}]];
          assert.strictEqual(helper.runCommand(command, doc), true);
        });
      });

      describe("cmd_has_attr", function () {
        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["has_attr", {css: "#target"}, "id"];
          assert.strictEqual(helper.runCommand(command, doc), true);

          var command = ["has_attr", {css: "#target"}, "class"];
          assert.strictEqual(helper.runCommand(command, doc), false);
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["has_attr", ["if", true, {css: "#target"}], ["concat", "id"]];
          assert.strictEqual(helper.runCommand(command, doc), true);
        });
      });

      describe("cmd_get_html", function () {
        function makeTestDoc() {
          return makeHtmlDocument(`\
<div><b>elem1</b></div>
<div><b>elem2</b></div>`);
        }

        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["get_html", {css: "div"}];
          assert.strictEqual(helper.runCommand(command, doc), "<b>elem1</b>");

          var command = ["get_html", {css: "div"}, true];
          assert.strictEqual(helper.runCommand(command, doc), "<div><b>elem1</b></div>");
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["get_html", ["if", true, {css: "div"}], ["if", true, true]];
          assert.strictEqual(helper.runCommand(command, doc), "<div><b>elem1</b></div>");
        });
      });

      describe("cmd_get_text", function () {
        function makeTestDoc() {
          return makeHtmlDocument(`\
<div><b>elem1-1</b><b>elem1-2</b></div>
<div><b>elem2-1</b><b>elem2-2</b></div>`);
        }

        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["get_text", {css: "div"}];
          assert.strictEqual(helper.runCommand(command, doc), "elem1-1elem1-2");
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["get_text", ["if", true, {css: "div"}]];
          assert.strictEqual(helper.runCommand(command, doc), "elem1-1elem1-2");
        });
      });

      describe("cmd_get_attr", function () {
        function makeTestDoc() {
          return makeHtmlDocument(`\
<img data-src="image1.jpg">
<img data-src="image2.jpg">`);
        }

        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["get_attr", {css: "img"}, "data-src"];
          assert.strictEqual(helper.runCommand(command, doc), "image1.jpg");
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["get_attr", ["if", true, {css: "img"}], ["concat", "data-src"]];
          assert.strictEqual(helper.runCommand(command, doc), "image1.jpg");
        });
      });

      describe("cmd_get_css", function () {
        function makeTestDoc() {
          return makeHtmlDocument(`\
<div style="color: green;"></div>
<div style="color: yellow !important;"></div>`);
        }

        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["get_css", {css: "div"}, "color"];
          assert.strictEqual(helper.runCommand(command, doc), "green");

          var command = ["get_css", {css: "div"}, "color", true];
          assert.strictEqual(helper.runCommand(command, doc), "");

          var command = ["get_css", {css: "div:last-of-type"}, "color", true];
          assert.strictEqual(helper.runCommand(command, doc), "important");
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();
          var doc = makeTestDoc();

          var command = ["get_css", ["if", true, {css: "div"}], ["concat", "color"], ["if", true, true]];
          assert.strictEqual(helper.runCommand(command, doc), "");
        });
      });

      describe("cmd_remove", function () {
        function makeTestDoc() {
          return makeHtmlDocument(`\
<div><b>elem1</b></div>
<div><b>elem2</b></div>`);
        }

        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["remove", {css: "b"}];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<div></div>
<div></div>`);
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["remove", ["if", true, {css: "b"}]];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<div></div>
<div></div>`);
        });
      });

      describe("cmd_unwrap", function () {
        function makeTestDoc() {
          return makeHtmlDocument(`\
<div><b>elem1</b></div>
<div><b>elem2</b></div>`);
        }

        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["unwrap", {css: "div"}];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<b>elem1</b>
<b>elem2</b>`);
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["unwrap", ["if", true, {css: "div"}]];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<b>elem1</b>
<b>elem2</b>`);
        });
      });

      describe("cmd_isolate", function () {
        function makeTestDoc() {
          return makeHtmlDocument(`\
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
</html>`);
        }

        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();

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

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();

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

      describe("cmd_html", function () {
        function makeTestDoc() {
          return makeHtmlDocument(`\
<div><b>elem1</b></div>
<div><b>elem2</b></div>`);
        }

        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["html", {css: "div"}, "<em>text</em>"];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<div><em>text</em></div>
<div><em>text</em></div>`);

          var doc = makeTestDoc();
          var command = ["html", {css: "div"}, "<em>text</em>", true];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<em>text</em>
<em>text</em>`);
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["html", ["if", true, {css: "div"}], ["concat", ["get_html", null, true], "<em>text</em>"], ["if", true, true]];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<div><b>elem1</b></div><em>text</em>
<div><b>elem2</b></div><em>text</em>`);
        });
      });

      describe("cmd_text", function () {
        function makeTestDoc() {
          return makeHtmlDocument(`\
<div>text1</div>
<div>text2</div>`);
        }

        it("basic", function () {
          var helper = new capturer.CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["text", {css: "div"}, "<em>text</em>"];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          var elems = doc.querySelectorAll('div');
          assert.strictEqual(elems[0].textContent, '<em>text</em>');
          assert.strictEqual(elems[1].textContent, '<em>text</em>');
        });

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["text", ["if", true, {css: "div"}], ["concat", ["get_text"], "<em>text</em>"]];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          var elems = doc.querySelectorAll('div');
          assert.strictEqual(elems[0].textContent, 'text1<em>text</em>');
          assert.strictEqual(elems[1].textContent, 'text2<em>text</em>');
        });
      });

      describe("cmd_attr", function () {
        function makeTestDoc() {
          return makeHtmlDocument(`\
<img data-src="image1.jpg">
<img data-src="image2.jpg">`);
        }

        it("name, value", function () {
          var helper = new capturer.CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["attr", {css: "img"}, "data-src", "myimage.jpg"];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<img data-src="myimage.jpg">
<img data-src="myimage.jpg">`);

          var doc = makeTestDoc();
          var command = ["attr", {css: "img"}, "src", "myimage.jpg"];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<img data-src="image1.jpg" src="myimage.jpg">
<img data-src="image2.jpg" src="myimage.jpg">`);
        });

        it("name, value (null)", function () {
          var helper = new capturer.CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["attr", {css: "img"}, "data-src", null];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<img>
<img>`);
        });

        it("name, value (resolve parameter commands)", function () {
          var helper = new capturer.CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["attr", ["if", true, {css: "img"}], ["concat", "src"], ["get_attr", null, "data-src"]];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<img data-src="image1.jpg" src="image1.jpg">
<img data-src="image2.jpg" src="image2.jpg">`);
        });

        it("Object", function () {
          var helper = new capturer.CaptureHelperHandler();

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

        it("Object (resolve parameter commands)", function () {
          var helper = new capturer.CaptureHelperHandler();

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

        it("Array", function () {
          var helper = new capturer.CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["attr", {css: "img"}, [
            ["src", "myimage.jpg"],
            ["data-src", null],
            ["data-extra", "extra-value"],
          ]];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<img src="myimage.jpg" data-extra="extra-value">
<img src="myimage.jpg" data-extra="extra-value">`);
        });

        it("Array (resolve parameter commands)", function () {
          var helper = new capturer.CaptureHelperHandler();

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
        });
      });

      describe("cmd_css", function () {
        function makeTestDoc() {
          return makeHtmlDocument(`\
<div style="color: green;"></div>
<div style="color: yellow;"></div>`);
        }

        it("name, value", function () {
          var helper = new capturer.CaptureHelperHandler();

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

        it("name, value (null)", function () {
          var helper = new capturer.CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["css", {css: "div"}, "color", null];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<div style=""></div>
<div style=""></div>`);
        });

        it("name, value, priority", function () {
          var helper = new capturer.CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["css", {css: "div"}, "color", "red", "important"];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<div style="color: red !important;"></div>
<div style="color: red !important;"></div>`);
        });

        it("name, value, priority (resolve parameter commands)", function () {
          var helper = new capturer.CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["css", ["if", true, {css: "div"}], ["concat", "color"], ["get_css", null, "color"], ["concat", "important"]];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<div style="color: green !important;"></div>
<div style="color: yellow !important;"></div>`);
        });

        it("Object", function () {
          var helper = new capturer.CaptureHelperHandler();

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

        it("Object (resolve parameter commands)", function () {
          var helper = new capturer.CaptureHelperHandler();

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

        it("Array", function () {
          var helper = new capturer.CaptureHelperHandler();

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

        it("Array (resolve parameter commands)", function () {
          var helper = new capturer.CaptureHelperHandler();

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

      describe("cmd_insert", function () {
        function makeTestDoc() {
          return makeHtmlDocument(`\
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div></div>
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div></div>`);
        }

        function makeTestDocSimple() {
          return makeHtmlDocument(`<div></div>`);
        }

        it("mode = before", function () {
          var helper = new capturer.CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["insert", {"css": ".target"}, "insertedText", "before"];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
insertedText<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div></div>
insertedText<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div></div>`);
        });

        it("mode = after", function () {
          var helper = new capturer.CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["insert", {"css": ".target"}, "insertedText", "after"];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div></div>insertedText
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div></div>insertedText`);
        });

        it("mode = replace", function () {
          var helper = new capturer.CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["insert", {"css": ".target"}, "insertedText", "replace"];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
insertedText
insertedText`);
        });

        it("mode = insert", function () {
          var helper = new capturer.CaptureHelperHandler();

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

        it("mode = append", function () {
          var helper = new capturer.CaptureHelperHandler();

          var doc = makeTestDoc();
          var command = ["insert", {"css": ".target"}, "insertedText", "append"];
          assert.strictEqual(helper.runCommand(command, doc), undefined);
          assert.strictEqual(doc.body.innerHTML.trim(), `\
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div>insertedText</div>
<div class="target"><div id="child-1"></div><div id="child-2"></div><div id="child-3"></div>insertedText</div>`);
        });

        it("mode missing or unknown (append by default)", function () {
          var helper = new capturer.CaptureHelperHandler();

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

        it("nodeData as Object (virtual DOM)", function () {
          var helper = new capturer.CaptureHelperHandler();

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

        it("nodeData as Object (selector)", function () {
          var helper = new capturer.CaptureHelperHandler();

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

        it("resolve parameter commands", function () {
          var helper = new capturer.CaptureHelperHandler();

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

    describe("capturer.CaptureHelperHandler.run", function () {
      it("skip helpers with disabled property", function () {
        var doc = makeHtmlDocument(`\
<div class="exclude1"></div>
<div class="exclude2"></div>
<div class="exclude3"></div>`);
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
        var helper = new capturer.CaptureHelperHandler({
          helpers,
          rootNode: doc,
        });
        assert.deepEqual(helper.run(), {errors: []});
        assert.strictEqual(doc.body.innerHTML.trim(), `<div class="exclude2"></div>`);
      });

      it("skip helpers whose pattern does not match document URL", function () {
        var doc = makeHtmlDocument(`\
<div class="exclude1"></div>
<div class="exclude2"></div>
<div class="exclude3"></div>`);
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
        var helper = new capturer.CaptureHelperHandler({
          helpers,
          rootNode: doc,
          docUrl: 'http://example.com',
        });
        assert.deepEqual(helper.run(), {errors: []});
        assert.strictEqual(doc.body.innerHTML.trim(), `<div class="exclude2"></div>`);
      });
    });
  });
});

}));
