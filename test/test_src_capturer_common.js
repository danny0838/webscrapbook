(function (global, factory) {
  if (typeof exports === "object" && typeof module === "object") {
    // CommonJS
    module.exports = factory(
      require('./lib/unittest'),
      require('./t/common'),
      require('./shared/capturer/common'),
    );
  } else if (typeof define === "function" && define.amd) {
    // AMD
    define(
      ['./lib/unittest', './t/common', './shared/capturer/common'],
      factory,
    );
  } else {
    // Browser globals
    global = typeof globalThis !== "undefined" ? globalThis : global || self;
    factory(
      global.unittest,
      global.utils,
      global.capturer,
    );
  }
}(this, function (unittest, utils, capturer) {

'use strict';

const {MochaQuery: $, assert, assertEqual, assertThrows} = unittest;
const $it = $(it);
const {userAgent, getRulesFromCssText, cssRegex} = utils;

describe('capturer/common.js', function () {

  describe('capturer.getRedirectedUrl', function () {

    it("use the redirected URL hash if it exists", function () {
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page#", ""),
        "http://example.com/page#",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page?id=123#", ""),
        "http://example.com/page?id=123#",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page#", "#frag"),
        "http://example.com/page#",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page?id=123#", "#frag"),
        "http://example.com/page?id=123#",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page#foo", ""),
        "http://example.com/page#foo",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page?id=123#foo", ""),
        "http://example.com/page?id=123#foo",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page#foo", "#frag"),
        "http://example.com/page#foo",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page?id=123#foo", "#frag"),
        "http://example.com/page?id=123#foo",
      );
    });

    it("use the original URL hash if the redirected URL has no hash", function () {
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page", ""),
        "http://example.com/page",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page?id=123", ""),
        "http://example.com/page?id=123",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page", "#"),
        "http://example.com/page#",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page?id=123", "#"),
        "http://example.com/page?id=123#",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page", "#frag"),
        "http://example.com/page#frag",
      );
      assertEqual(
        capturer.getRedirectedUrl("http://example.com/page?id=123", "#frag"),
        "http://example.com/page?id=123#frag",
      );
    });

    it("don't include hash for data URL", function () {
      assertEqual(
        capturer.getRedirectedUrl("data:text/html,foo#", ""),
        "data:text/html,foo",
      );
      assertEqual(
        capturer.getRedirectedUrl("data:text/html,foo#", "#frag"),
        "data:text/html,foo",
      );
      assertEqual(
        capturer.getRedirectedUrl("data:text/html,foo", ""),
        "data:text/html,foo",
      );
      assertEqual(
        capturer.getRedirectedUrl("data:text/html,foo", "#frag"),
        "data:text/html,foo",
      );
    });

  });

  describe('capturer.resolveRelativeUrl', function () {

    it("resolve a relative URL using the base URL", function () {
      assertEqual(
        capturer.resolveRelativeUrl("mypage.html", "http://example.com/"),
        "http://example.com/mypage.html",
      );
      assertEqual(
        capturer.resolveRelativeUrl("mypage.html?id=123", "http://example.com/"),
        "http://example.com/mypage.html?id=123",
      );
      assertEqual(
        capturer.resolveRelativeUrl("mypage.html?id=123#frag", "http://example.com/"),
        "http://example.com/mypage.html?id=123#frag",
      );
      assertEqual(
        capturer.resolveRelativeUrl("?id=123", "http://example.com/"),
        "http://example.com/?id=123",
      );
      assertEqual(
        capturer.resolveRelativeUrl("?", "http://example.com/"),
        "http://example.com/?",
      );
    });

    it("don't resolve an empty URL", function () {
      assertEqual(
        capturer.resolveRelativeUrl("", "http://example.com/"),
        "",
      );
    });

    it("don't resolve a pure hash URL", function () {
      assertEqual(
        capturer.resolveRelativeUrl("#hash", "http://example.com/"),
        "#hash",
      );
      assertEqual(
        capturer.resolveRelativeUrl("#", "http://example.com/"),
        "#",
      );
    });

  });

  describe('capturer.isAboutUrl', function () {

    it("true for exactly about:srcdoc", function () {
      assertEqual(
        capturer.isAboutUrl("about:srcdoc"),
        true,
      );
      assertEqual(
        capturer.isAboutUrl("about:srcdoc/subdir"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("about:srcdoc?"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("about:srcdoc?id=123"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("about:srcdoc#"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("about:srcdoc#frag"),
        false,
      );
    });

    it("true for about:blank", function () {
      assertEqual(
        capturer.isAboutUrl("about:blank"),
        true,
      );
      assertEqual(
        capturer.isAboutUrl("about:blank/subdir"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("about:blank?"),
        true,
      );
      assertEqual(
        capturer.isAboutUrl("about:blank?id=123"),
        true,
      );
      assertEqual(
        capturer.isAboutUrl("about:blank#"),
        true,
      );
      assertEqual(
        capturer.isAboutUrl("about:blank#frag"),
        true,
      );
    });

    it("false for other URLs", function () {
      assertEqual(
        capturer.isAboutUrl("about:invalid"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("about:newtab"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("http://example.com/page"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("https://example.com/page"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("ws://example.com/page"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("wss://example.com/page"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("file:///foo/bar"),
        false,
      );
      assertEqual(
        capturer.isAboutUrl("data:text/html,foo"),
        false,
      );
    });

  });

  describe('capturer.getErrorUrl', function () {
    const optionsBasic = {};
    const optionsLinkUnsavedUri = {"capture.linkUnsavedUri": true};

    it("rewrite http:, https:, file:, and about:", function () {
      assertEqual(
        capturer.getErrorUrl("http://example.com/?id=123#456", optionsBasic),
        "urn:scrapbook:download:error:http://example.com/?id=123#456",
      );
      assertEqual(
        capturer.getErrorUrl("https://example.com/?id=123#456", optionsBasic),
        "urn:scrapbook:download:error:https://example.com/?id=123#456",
      );
      assertEqual(
        capturer.getErrorUrl("file:///foo/bar", optionsBasic),
        "urn:scrapbook:download:error:file:///foo/bar",
      );
      assertEqual(
        capturer.getErrorUrl("about:blank", optionsBasic),
        "urn:scrapbook:download:error:about:blank",
      );
      assertEqual(
        capturer.getErrorUrl("about:srcdoc", optionsBasic),
        "urn:scrapbook:download:error:about:srcdoc",
      );
    });

    it("strip details for data: and blob:", function () {
      assertEqual(
        capturer.getErrorUrl("data:text/css,foo", optionsBasic),
        "urn:scrapbook:download:error:data:",
      );
      assertEqual(
        capturer.getErrorUrl("blob:https://example.com/58eead10-e54d-4b72-9ae4-150381dcb68c", optionsBasic),
        "urn:scrapbook:download:error:blob:",
      );
    });

    it("don't rewrite other protocols", function () {
      assertEqual(
        capturer.getErrorUrl("ftp://example.com/file.png", optionsBasic),
        "ftp://example.com/file.png",
      );
      assertEqual(
        capturer.getErrorUrl("ws://example.com/?id=123", optionsBasic),
        "ws://example.com/?id=123",
      );
      assertEqual(
        capturer.getErrorUrl("wss://example.com/?id=123", optionsBasic),
        "wss://example.com/?id=123",
      );
      assertEqual(
        capturer.getErrorUrl("urn:scrapbook:download:error:http://example.com", optionsBasic),
        "urn:scrapbook:download:error:http://example.com",
      );
    });

    it("don't rewrite if capture.linkUnsavedUri is truthy", function () {
      assertEqual(
        capturer.getErrorUrl("http://example.com/?id=123#456", optionsLinkUnsavedUri),
        "http://example.com/?id=123#456",
      );
      assertEqual(
        capturer.getErrorUrl("https://example.com/?id=123#456", optionsLinkUnsavedUri),
        "https://example.com/?id=123#456",
      );
      assertEqual(
        capturer.getErrorUrl("file:///foo/bar", optionsLinkUnsavedUri),
        "file:///foo/bar",
      );
      assertEqual(
        capturer.getErrorUrl("about:blank", optionsLinkUnsavedUri),
        "about:blank",
      );
      assertEqual(
        capturer.getErrorUrl("about:srcdoc", optionsLinkUnsavedUri),
        "about:srcdoc",
      );

      assertEqual(
        capturer.getErrorUrl("data:text/css,foo", optionsLinkUnsavedUri),
        "data:text/css,foo",
      );
      assertEqual(
        capturer.getErrorUrl("blob:https://example.com/58eead10-e54d-4b72-9ae4-150381dcb68c", optionsLinkUnsavedUri),
        "blob:https://example.com/58eead10-e54d-4b72-9ae4-150381dcb68c",
      );
    });

  });

  describe('capturer.CssSelectorTokenizer.run', function () {
    const tokenizer = new capturer.CssSelectorTokenizer();

    it('basic selectors', function () {
      assertEqual(tokenizer.run(''), []);
      assertEqual(tokenizer.run('body'), [
        {type: 'name', value: 'body', depth: 0},
      ]);
      assertEqual(tokenizer.run('*'), [
        {type: 'operator', value: '*', depth: 0},
      ]);
      assertEqual(tokenizer.run('#my-id'), [
        {type: 'operator', value: '#', depth: 0},
        {type: 'name', value: 'my-id', depth: 0},
      ]);
      assertEqual(tokenizer.run('.my-class'), [
        {type: 'operator', value: '.', depth: 0},
        {type: 'name', value: 'my-class', depth: 0},
      ]);

      // escaped string
      assertEqual(tokenizer.run(String.raw`#\*`), [
        {type: 'operator', value: '#', depth: 0},
        {type: 'name', value: String.raw`\*`, depth: 0},
      ]);

      assertEqual(tokenizer.run(String.raw`.my\.class\4E00 \20000 \10FFFF x`), [
        {type: 'operator', value: '.', depth: 0},
        {type: 'name', value: String.raw`my\.class\4E00 \20000 \10FFFF x`, depth: 0},
      ]);
    });

    it('attribute selector ([attr="..."])', function () {
      // attr only
      assertEqual(tokenizer.run('[myattr]'), [
        {type: 'selector', value: '[myattr]', depth: 0},
      ]);

      // attr and value
      assertEqual(tokenizer.run('[myattr=myvalue]'), [
        {type: 'selector', value: '[myattr=myvalue]', depth: 0},
      ]);
      assertEqual(tokenizer.run('[myattr~=myvalue]'), [
        {type: 'selector', value: '[myattr~=myvalue]', depth: 0},
      ]);
      assertEqual(tokenizer.run('[myattr|=myvalue]'), [
        {type: 'selector', value: '[myattr|=myvalue]', depth: 0},
      ]);
      assertEqual(tokenizer.run('[myattr^=myvalue]'), [
        {type: 'selector', value: '[myattr^=myvalue]', depth: 0},
      ]);
      assertEqual(tokenizer.run('[myattr$=myvalue]'), [
        {type: 'selector', value: '[myattr$=myvalue]', depth: 0},
      ]);
      assertEqual(tokenizer.run('[myattr*=myvalue]'), [
        {type: 'selector', value: '[myattr*=myvalue]', depth: 0},
      ]);

      // attr and value with modifier
      assertEqual(tokenizer.run('[myattr=myvalue i]'), [
        {type: 'selector', value: '[myattr=myvalue i]', depth: 0},
      ]);
      assertEqual(tokenizer.run('[myattr=myvalue s]'), [
        {type: 'selector', value: '[myattr=myvalue s]', depth: 0},
      ]);

      // quoted value
      assertEqual(tokenizer.run('[myattr="my complex value"]'), [
        {type: 'selector', value: '[myattr="my complex value"]', depth: 0},
      ]);

      // quoted value with escaping
      assertEqual(tokenizer.run(String.raw`[myattr=" my escaped\value and \"quoted\" ones "]`), [
        {type: 'selector', value: String.raw`[myattr=" my escaped\value and \"quoted\" ones "]`, depth: 0},
      ]);

      // quoted value with modifier
      assertEqual(tokenizer.run('[myattr="my complex value" i]'), [
        {type: 'selector', value: '[myattr="my complex value" i]', depth: 0},
      ]);

      // combine with other selectors
      assertEqual(tokenizer.run('div [myattr]'), [
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'selector', value: '[myattr]', depth: 0},
      ]);
    });

    it('descendant combinator (" ")', function () {
      assertEqual(tokenizer.run('div span'), [
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'name', value: 'span', depth: 0},
      ]);
      assertEqual(tokenizer.run('div    span'), [
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'name', value: 'span', depth: 0},
      ]);

      assertEqual(tokenizer.run('div\tspan'), [
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: '\t', depth: 0},
        {type: 'name', value: 'span', depth: 0},
      ]);

      assertEqual(tokenizer.run('div \t span'), [
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'operator', value: '\t', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'name', value: 'span', depth: 0},
      ]);

      // non-ascii white space is a name rather than a combinator
      assertEqual(tokenizer.run('div　span'), [
        {type: 'name', value: 'div　span', depth: 0},
      ]);
      assertEqual(tokenizer.run('.my-class　span'), [
        {type: 'operator', value: '.', depth: 0},
        {type: 'name', value: 'my-class　span', depth: 0},
      ]);
      assertEqual(tokenizer.run('div 　 span'), [
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'name', value: '　', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'name', value: 'span', depth: 0},
      ]);
    });

    it('other combinators', function () {
      assertEqual(tokenizer.run('div > span'), [
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'operator', value: '>', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'name', value: 'span', depth: 0},
      ]);
      assertEqual(tokenizer.run('div + span'), [
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'operator', value: '+', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'name', value: 'span', depth: 0},
      ]);
      assertEqual(tokenizer.run('div ~ span'), [
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'operator', value: '~', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'name', value: 'span', depth: 0},
      ]);
      assertEqual(tokenizer.run('div || span'), [
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'operator', value: '||', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'name', value: 'span', depth: 0},
      ]);
    });

    it('pseudo-class', function () {
      // simple
      assertEqual(tokenizer.run(':root'), [
        {type: 'operator', value: ':', depth: 0},
        {type: 'name', value: 'root', depth: 0},
      ]);

      // vander prefix
      assertEqual(tokenizer.run(':-webkit-autofill'), [
        {type: 'operator', value: ':', depth: 0},
        {type: 'name', value: '-webkit-autofill', depth: 0},
      ]);

      // chained
      assertEqual(tokenizer.run('a:hover:visited'), [
        {type: 'name', value: 'a', depth: 0},
        {type: 'operator', value: ':', depth: 0},
        {type: 'name', value: 'hover', depth: 0},
        {type: 'operator', value: ':', depth: 0},
        {type: 'name', value: 'visited', depth: 0},
      ]);

      // parenthesized
      assertEqual(tokenizer.run('td:nth-child(-n + 3)'), [
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
      assertEqual(tokenizer.run('a:not([href])'), [
        {type: 'name', value: 'a', depth: 0},
        {type: 'operator', value: ':', depth: 0},
        {type: 'name', value: 'not', depth: 0},
        {type: 'operator', value: '(', depth: 0},
        {type: 'selector', value: '[href]', depth: 1},
        {type: 'operator', value: ')', depth: 0},
      ]);
      assertEqual(tokenizer.run('p:is(#id1, :is(#id2))'), [
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
      assertEqual(tokenizer.run('p::before'), [
        {type: 'name', value: 'p', depth: 0},
        {type: 'operator', value: '::', depth: 0},
        {type: 'name', value: 'before', depth: 0},
      ]);

      // recursive
      assertEqual(tokenizer.run('p::slotted(*)'), [
        {type: 'name', value: 'p', depth: 0},
        {type: 'operator', value: '::', depth: 0},
        {type: 'name', value: 'slotted', depth: 0},
        {type: 'operator', value: '(', depth: 0},
        {type: 'operator', value: '*', depth: 1},
        {type: 'operator', value: ')', depth: 0},
      ]);
    });

    it('namespaced type selector', function () {
      assertEqual(tokenizer.run('|a'), [
        {type: 'operator', value: '|', depth: 0},
        {type: 'name', value: 'a', depth: 0},
      ]);
      assertEqual(tokenizer.run('svg|a'), [
        {type: 'name', value: 'svg', depth: 0},
        {type: 'operator', value: '|', depth: 0},
        {type: 'name', value: 'a', depth: 0},
      ]);
      assertEqual(tokenizer.run('*|a'), [
        {type: 'operator', value: '*', depth: 0},
        {type: 'operator', value: '|', depth: 0},
        {type: 'name', value: 'a', depth: 0},
      ]);
      assertEqual(tokenizer.run('svg|*'), [
        {type: 'name', value: 'svg', depth: 0},
        {type: 'operator', value: '|', depth: 0},
        {type: 'operator', value: '*', depth: 0},
      ]);
    });

    it('namespaced attribute selector', function () {
      assertEqual(tokenizer.run('[|attr]'), [
        {type: 'selector', value: '[|attr]', depth: 0},
      ]);
      assertEqual(tokenizer.run('[svg|attr]'), [
        {type: 'selector', value: '[svg|attr]', depth: 0},
      ]);
      assertEqual(tokenizer.run('[*|attr]'), [
        {type: 'selector', value: '[*|attr]', depth: 0},
      ]);

      assertEqual(tokenizer.run('[*|attr=value]'), [
        {type: 'selector', value: '[*|attr=value]', depth: 0},
      ]);
      assertEqual(tokenizer.run('[*|attr="value"]'), [
        {type: 'selector', value: '[*|attr="value"]', depth: 0},
      ]);
    });

  });

  describe('capturer.CssSelectorTokenizer.tokensToString', function () {
    const tokenizer = new capturer.CssSelectorTokenizer();

    it('basic', function () {
      assertEqual(tokenizer.tokensToString([
        {type: 'name', value: 'div', depth: 0},
        {type: 'operator', value: ' ', depth: 0},
        {type: 'name', value: 'span', depth: 0},
      ]), 'div span');
    });

  });

  describe('capturer.DocumentCssHandler.getSelectorText', function () {
    const getSelectorText = capturer.DocumentCssHandler.getSelectorText;

    it('basic', function () {
      var rules = getRulesFromCssText(`div, span { background-color: lime; }`);
      assertEqual(getSelectorText(rules[0]), 'div, span');
    });

    $it.skipIf($.noNestingCss)('prepend :is() wrapped parent selector text for a nested rule', function () {
      var rules = getRulesFromCssText(`\
div, span {
  a {
    b {}
  }
}`);
      assertEqual(getSelectorText(rules[0]), 'div, span');
      assertEqual(getSelectorText(rules[0].cssRules[0]), ':is(div, span) a');
      assertEqual(getSelectorText(rules[0].cssRules[0].cssRules[0]), ':is(:is(div, span) a) b');
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
      assertEqual(getSelectorText(rules[0]), 'div, span');
      assertEqual(getSelectorText(rules[0].cssRules[0]), ':is(div, span) .case1');
      assertEqual(getSelectorText(rules[0].cssRules[1]), ':is(div, span).case2');
      assertEqual(getSelectorText(rules[0].cssRules[2]), '.case3 :is(div, span)');
      assertEqual(getSelectorText(rules[0].cssRules[3]), '.case4:is(div, span)');
      assertEqual(getSelectorText(rules[0].cssRules[4]), ':is(div, span) .case5 :is(div, span) :is(div, span)');
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
      assertEqual(getSelectorText(rules[0].cssRules[0]), ':is(div) :is(.case1, .case2)');
      assertEqual(getSelectorText(rules[0].cssRules[1]), ':is(:is(div) .case1, .case2)');
      assertEqual(getSelectorText(rules[0].cssRules[2]), ':is(.case1 :is(div), .case2)');
      assertEqual(getSelectorText(rules[0].cssRules[3]), ':is(.case1, :is(div) .case2)');
      assertEqual(getSelectorText(rules[0].cssRules[4]), ':is(.case1, .case2 :is(div))');
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
      var rules = getRulesFromCssText(String.raw`blockquote { .my\&class {} }`);
      assertEqual(getSelectorText(rules[0].cssRules[0]), String.raw`:is(blockquote) .my\&class`);
    });

    $it.skipIf($.noNestingCss)('"&" in [attr=""] should not be rewritten', function () {
      var rules = getRulesFromCssText(String.raw`blockquote { [myattr="a & b"] {} }`);
      assertEqual(getSelectorText(rules[0].cssRules[0]), String.raw`:is(blockquote) [myattr="a & b"]`);
    });

  });

  describe('capturer.DocumentCssHandler.getVerifyingSelector', function () {
    const getVerifyingSelector = capturer.DocumentCssHandler.getVerifyingSelector;

    const testGetVerifyingSelector = (selector1, selector2, validate = true) => {
      if (validate) {
        try {
          selector1 && document.querySelector(selector1);
        } catch (ex) {
          throw new Error(`Invalid testing CSS selector: ${selector1}`);
        }
        try {
          selector2 && document.querySelector(selector2);
        } catch (ex) {
          throw new Error(`Invalid control CSS selector: ${selector2}`);
        }
      }
      assertEqual(getVerifyingSelector(selector1), selector2);
    };

    it('basic', function () {
      // general selectors
      testGetVerifyingSelector('*', '*');
      testGetVerifyingSelector('div#id, span.class', 'div#id, span.class');
      testGetVerifyingSelector('& body', '& body', false);

      // common pseudo-classes
      testGetVerifyingSelector('a:hover', 'a');
      testGetVerifyingSelector('a:active', 'a');
      testGetVerifyingSelector('a:link', 'a');
      testGetVerifyingSelector('a:visited', 'a');

      testGetVerifyingSelector('div:empty', 'div');

      testGetVerifyingSelector('form :enabled', 'form *');
      testGetVerifyingSelector('form :disabled', 'form *');

      testGetVerifyingSelector('form:focus', 'form');
      testGetVerifyingSelector('form:focus-within', 'form');

      testGetVerifyingSelector('input:checked', 'input');
      testGetVerifyingSelector('input:indeterminate', 'input');

      testGetVerifyingSelector('input:required', 'input');
      testGetVerifyingSelector('input:optional', 'input');

      testGetVerifyingSelector('input:valid', 'input');
      testGetVerifyingSelector('input:invalid', 'input');

      testGetVerifyingSelector('input:in-range', 'input');
      testGetVerifyingSelector('input:out-of-range', 'input');

      testGetVerifyingSelector(':lang(en) > q', '* > q');
      testGetVerifyingSelector(':dir(ltr)', '*', false);

      testGetVerifyingSelector('a:not([href]):not([target])', 'a');

      // common pseudo-elements
      testGetVerifyingSelector('a::before', 'a');
      testGetVerifyingSelector('a::after', 'a');
      testGetVerifyingSelector('p::first-line', 'p');
      testGetVerifyingSelector('input::placeholder', 'input');
      testGetVerifyingSelector('::slotted(span)', '*');
      testGetVerifyingSelector('tabbed-custom-element::part(tab)', 'tabbed-custom-element', false);

      // combined pseudo-classes/elements
      testGetVerifyingSelector('a:hover::before', 'a');

      // pseudo-elements that are not guaranteed to work after rewritten
      testGetVerifyingSelector(':host', '');
      testGetVerifyingSelector(':host > div', '');
      testGetVerifyingSelector(':host(.class)', '');
      testGetVerifyingSelector(':host(.class) > div', '');
      testGetVerifyingSelector(':host-context(.class)', '', false);
      testGetVerifyingSelector(':host-context(.class) > div', '', false);

      // allowed pseudo-classes
      testGetVerifyingSelector(':root', ':root');
      testGetVerifyingSelector(':scope', ':scope');
      testGetVerifyingSelector(':scope > body > div', ':scope > body > div');
      testGetVerifyingSelector(':is(div, span)', ':is(div, span)', false);
      testGetVerifyingSelector(':where(div, span)', ':where(div, span)', false);
      testGetVerifyingSelector('h1:has(+ h2, + h3, + h4)', 'h1:has(+ h2, + h3, + h4)', false);

      testGetVerifyingSelector('p:first-child', 'p:first-child');
      testGetVerifyingSelector('p:last-child', 'p:last-child');
      testGetVerifyingSelector('div:first-of-type', 'div:first-of-type');
      testGetVerifyingSelector('div:last-of-type', 'div:last-of-type');
      testGetVerifyingSelector('li:only-child', 'li:only-child');
      testGetVerifyingSelector('li:only-of-type', 'li:only-of-type');
      testGetVerifyingSelector('li:nth-child(even)', 'li:nth-child(even)');
      testGetVerifyingSelector('li:nth-last-child(2)', 'li:nth-last-child(2)');
      testGetVerifyingSelector('li:nth-of-type(3n + 1)', 'li:nth-of-type(3n + 1)');
      testGetVerifyingSelector('li:nth-last-of-type(3)', 'li:nth-last-of-type(3)');

      // (...) inside an allowed pseudo-class should be recursively rewritten
      testGetVerifyingSelector(':is(:hover, a:active)', ':is(*, a)', false);
      testGetVerifyingSelector(':is(:is(:link, :visited), button:active)', ':is(:is(*, *), button)', false);

      // namespace for type selector should be removed
      testGetVerifyingSelector('svg|a span', 'a span', false);
      testGetVerifyingSelector('*|a span', 'a span');
      testGetVerifyingSelector('|a span', 'a span');
      testGetVerifyingSelector('svg|* span', '* span', false);
      testGetVerifyingSelector('*|* span', '* span');
      testGetVerifyingSelector('|* span', '* span');

      // namespace for attribute selector should be *
      testGetVerifyingSelector('[attr]', '[*|attr]');
      testGetVerifyingSelector('[attr=value]', '[*|attr=value]');
      testGetVerifyingSelector('[attr="value"]', '[*|attr="value"]');

      testGetVerifyingSelector('[|attr]', '[*|attr]');
      testGetVerifyingSelector('[|attr=value]', '[*|attr=value]');
      testGetVerifyingSelector('[|attr="value"]', '[*|attr="value"]');

      testGetVerifyingSelector('[svg|attr]', '[*|attr]', false);
      testGetVerifyingSelector('[svg|attr=value]', '[*|attr=value]', false);
      testGetVerifyingSelector('[svg|attr="value"]', '[*|attr="value"]', false);

      testGetVerifyingSelector('[*|attr]', '[*|attr]');
      testGetVerifyingSelector('[*|attr=value]', '[*|attr=value]');
      testGetVerifyingSelector('[*|attr="value"]', '[*|attr="value"]');

      testGetVerifyingSelector('[svg|attr="value" i]', '[*|attr="value" i]', false);

      // column combinator should not be treated as namespace
      testGetVerifyingSelector('col||td', 'col||td', false);
      testGetVerifyingSelector('col || td', 'col || td', false);
    });

  });

  describe('capturer.DocumentCssHandler.getRulesFromCssText', function () {
    const getRulesFromCssText = capturer.DocumentCssHandler.getRulesFromCssText;

    it('basic', function () {
      var rules = getRulesFromCssText(`\
@media screen and (min-width: 300px), print {
  body {
    font-size: 1.5em;
    line-height: 2em;
  }
}`);

      assert(rules[0] instanceof CSSMediaRule);
      assertEqual(rules[0].media[0], 'screen and (min-width: 300px)');
      assertEqual(rules[0].media[1], 'print');

      assert(rules[0].cssRules[0] instanceof CSSStyleRule);
      assertEqual(rules[0].cssRules[0].selectorText, 'body');
      assertEqual(rules[0].cssRules[0].style.getPropertyValue('font-size'), '1.5em');
      assertEqual(rules[0].cssRules[0].style.getPropertyValue('line-height'), '2em');
    });

    it('common browser syntax check', function () {
      // attribute selector: name with quotes is not allowed
      var rules = getRulesFromCssText(`["myattr"] { }`);
      assertEqual(rules[0], undefined);

      // attribute selector: value with mixed literal and quotes is not allowed
      var rules = getRulesFromCssText(`[myattr=my"quoted"value] { }`);
      assertEqual(rules[0], undefined);

      // attribute selector: value with non-escaped operator is not allowed
      var rules = getRulesFromCssText(`[myattr=@namespace] { }`);
      assertEqual(rules[0], undefined);

      var rules = getRulesFromCssText(`[myattr=div{color:red}] { }`);
      assertEqual(rules[0], undefined);

      var rules = getRulesFromCssText(`[myattr=var(--my-var)] { }`);
      assertEqual(rules[0], undefined);

      var rules = getRulesFromCssText(`[myattr=my|value] { }`);
      assertEqual(rules[0], undefined);

      var rules = getRulesFromCssText(`[myattr=foo=bar] { }`);
      assertEqual(rules[0], undefined);

      var rules = getRulesFromCssText(`[myattr=xlink:href] { }`);
      assertEqual(rules[0], undefined);

      // space/comment around the namespace separator is not allowed
      var rules = getRulesFromCssText(`svg | a { }`);
      assertEqual(rules[0], undefined);

      // space/comment between pseudo-class/element name and parenthesis is not allowed
      var rules = getRulesFromCssText(`:not (p) { }`);
      assertEqual(rules[0], undefined);

      var rules = getRulesFromCssText(`::slotted (p) { }`);
      assertEqual(rules[0], undefined);

      // space/comment between function name and parenthesis is not allowed
      var rules = getRulesFromCssText(`p { background-image: url (image.jpg); }`);
      assertEqual(rules[0].cssText, `p { }`);

      var rules = getRulesFromCssText(`p::after { content: attr (id); }`);
      assertEqual(rules[0].cssText, `p::after { }`);

      var rules = getRulesFromCssText(`p { color: var (--my-var); }`);
      assertEqual(rules[0].cssText, `p { }`);

      // comment inside a function is not allowed in some cases
      var rules = getRulesFromCssText(`p { background-image: url(/* comment */"image.jpg"); }`);
      assertEqual(rules[0].cssText, `p { }`);

      var rules = getRulesFromCssText(`p { background-image: url(image.jpg/* comment */); }`);
      assertEqual(rules[0].cssText, `p { }`);

      // space/comment inside a function is allowed in some cases
      var rules = getRulesFromCssText(`p { background-image: url("image.jpg"  ); }`);
      assertEqual(rules[0].cssText, `p { background-image: url("image.jpg"); }`);

      var rules = getRulesFromCssText(`p { background-image: url("image.jpg"/* comment */); }`);
      assertEqual(rules[0].cssText, `p { background-image: url("image.jpg"); }`);

      var rules = getRulesFromCssText(`p::after { content: attr(  id  ); }`);
      assertEqual(rules[0].cssText, `p::after { content: attr(id); }`);
    });

    $(it).xfailIf(
      userAgent.is('chromium') && userAgent.major < 101,
      'var(...) is tidied in Chromium < 101 (possibly upper?)',
    )('browser syntax check/tidy for var()', function () {
      var rules = getRulesFromCssText(`p { color: var(  --myvar ); }`);
      assertEqual(rules[0].cssText, `p { color: var(  --myvar ); }`);

      var rules = getRulesFromCssText(`p { color: var(/* comment */--myvar); }`);
      assertEqual(rules[0].cssText, `p { color: var(/* comment */--myvar); }`);

      var rules = getRulesFromCssText(`p { color: var(--myvar/* comment */); }`);
      assertEqual(rules[0].cssText, `p { color: var(--myvar/* comment */); }`);
    });

    it('common browser tidy', function () {
      // semicolon after rule is added
      var rules = getRulesFromCssText(`body { color: red }`);
      assertEqual(rules[0].cssText, `body { color: red; }`);

      // space between operators are added
      var rules = getRulesFromCssText(`body>div{color:red;}`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`p{}`);
      assertEqual(rules[0].cssText, `p { }`);

      // extra spaces are removed
      var rules = getRulesFromCssText(`   body    div    {  color  :   red  ;  }  `);
      assertEqual(rules[0].cssText, `body div { color: red; }`);

      var rules = getRulesFromCssText(`[  myattr  ] { }`);
      assertEqual(rules[0].selectorText, `[myattr]`);

      var rules = getRulesFromCssText(`[  myattr  =  myvalue  ] { }`);
      assertEqual(rules[0].selectorText, `[myattr="myvalue"]`);

      var rules = getRulesFromCssText(`[  myattr  =  " myvalue "  ] { }`);
      assertEqual(rules[0].selectorText, `[myattr=" myvalue "]`);

      var rules = getRulesFromCssText(`:not( div ) { }`);
      assertEqual(rules[0].selectorText, `:not(div)`);

      // comments are removed (in the same way of spaces)
      var rules = getRulesFromCssText(`/* comment */ body > div { color: red; }`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`body /* comment */ > div { color: red; }`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`body > /* comment */ div { color: red; }`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`body > div /* comment */ { color: red; }`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`body > div { /* comment */ color: red; }`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`body > div { color /* comment */ : red; }`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`body > div { color : /* comment */ red; }`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`body > div { color : red /* comment */; }`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`body > div { color : red; /* comment */ }`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`body > div { color : red; } /* comment */`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      var rules = getRulesFromCssText(`[ /* comment */ myattr="myvalue"] { }`);
      assertEqual(rules[0].cssText, `[myattr="myvalue"] { }`);

      var rules = getRulesFromCssText(`[myattr /* comment */ ="myvalue"] { }`);
      assertEqual(rules[0].cssText, `[myattr="myvalue"] { }`);

      var rules = getRulesFromCssText(`[myattr= /* comment */ "myvalue"] { }`);
      assertEqual(rules[0].cssText, `[myattr="myvalue"] { }`);

      var rules = getRulesFromCssText(`[myattr="myvalue" /* comment */ ] { }`);
      assertEqual(rules[0].cssText, `[myattr="myvalue"] { }`);

      var rules = getRulesFromCssText(`:not( /* comment */ div) { }`);
      assertEqual(rules[0].cssText, `:not(div) { }`);

      var rules = getRulesFromCssText(`:not(div /* comment */ ) { }`);
      assertEqual(rules[0].cssText, `:not(div) { }`);

      // unpaired comments are removed
      var rules = getRulesFromCssText(`body > div { color: red; } /* comment`);
      assertEqual(rules[0].cssText, `body > div { color: red; }`);

      // attribute selector: value is double quoted
      var rules = getRulesFromCssText(`[myattr=myvalue] { }`);
      assertEqual(rules[0].selectorText, `[myattr="myvalue"]`);

      var rules = getRulesFromCssText(`[myattr='my value'] { }`);
      assertEqual(rules[0].selectorText, `[myattr="my value"]`);

      // property value is double quoted
      var rules = getRulesFromCssText(`p::after { content: 'my value'; }`);
      assertEqual(rules[0].cssText, `p::after { content: "my value"; }`);

      // quoting: double quotes and backslashes are escaped
      var rules = getRulesFromCssText(String.raw`[a=\"my\"attr\\value] { }`);
      assertEqual(rules[0].selectorText, String.raw`[a="\"my\"attr\\value"]`);

      var rules = getRulesFromCssText(String.raw`[a='"my" attr\\value'] { }`);
      assertEqual(rules[0].selectorText, String.raw`[a="\"my\" attr\\value"]`);

      // quoting: ASCII control chars (0x01~0x19) are hex-escaped with lower case and space
      var rules = getRulesFromCssText(String.raw`[myattr=\1\2\3\4\5\6\7\8\9\A\B\C\D\E\F] { }`);
      assertEqual(rules[0].selectorText, String.raw`[myattr="\1 \2 \3 \4 \5 \6 \7 \8 \9 \a \b \c \d \e \f "]`);

      var rules = getRulesFromCssText(String.raw`[myattr=\10\11\12\13\14\15\16\17\18\19\7F] { }`);
      assertEqual(rules[0].selectorText, String.raw`[myattr="\10 \11 \12 \13 \14 \15 \16 \17 \18 \19 \7f "]`);

      // quoting: other ASCII symbols are unescaped
      var rules = getRulesFromCssText(String.raw`[myattr=\20\21\22\23\24\25\26\27\28\29\2A\2B\2C\2D\2E\2F] { }`);
      assertEqual(rules[0].selectorText, String.raw`[myattr=" !\"#$%&'()*+,-./"]`);

      var rules = getRulesFromCssText(String.raw`[myattr=\3A\3B\3C\3D\3E\3F\40\5B\5D\5E\5F\7B\7C\7D\7E] { }`);
      assertEqual(rules[0].selectorText, String.raw`[myattr=":;<=>?@[]^_{|}~"]`);

      // quoting: Unicode chars are unescaped
      var rules = getRulesFromCssText(String.raw`[myattr=\80\81\9E\9F] { }`);
      assertEqual(rules[0].selectorText, `[myattr="\x80\x81\x9E\x9F"]`);

      var rules = getRulesFromCssText(String.raw`[myattr="\3000 \4E00 \20000 \100000"] { }`);
      assertEqual(rules[0].selectorText, `[myattr="\u3000\u4E00\u{20000}\u{100000}"]`);
    });

  });

});

}));
