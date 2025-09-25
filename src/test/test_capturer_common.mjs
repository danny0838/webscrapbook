import {MochaQuery as $, assert} from "./unittest.mjs";

import {BaseCapturer} from "./shared/capturer/common.mjs";

describe('capturer/common.mjs', function () {
  describe('BaseCapturer', function () {
    const capturer = new BaseCapturer();

    describe('#getRedirectedUrl()', function () {
      it("should use the redirected URL hash if it exists", function () {
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

      it("should use the original URL hash if the redirected URL has no hash", function () {
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

      it("should not include hash for data URL", function () {
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

    describe('#resolveRelativeUrl()', function () {
      it("should resolve a relative URL using the base URL", function () {
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

      it("should not resolve an empty URL", function () {
        assert.strictEqual(
          capturer.resolveRelativeUrl("", "http://example.com/"),
          "",
        );
      });

      it("should not resolve a pure hash URL", function () {
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

    describe('#isAboutUrl()', function () {
      it("should return true for exactly about:srcdoc", function () {
        assert.isTrue(capturer.isAboutUrl("about:srcdoc"));
        assert.isFalse(capturer.isAboutUrl("about:srcdoc/subdir"));
        assert.isFalse(capturer.isAboutUrl("about:srcdoc?"));
        assert.isFalse(capturer.isAboutUrl("about:srcdoc?id=123"));
        assert.isFalse(capturer.isAboutUrl("about:srcdoc#"));
        assert.isFalse(capturer.isAboutUrl("about:srcdoc#frag"));
      });

      it("should return true for about:blank (may contain search or hash)", function () {
        assert.isTrue(capturer.isAboutUrl("about:blank"));
        assert.isFalse(capturer.isAboutUrl("about:blank/subdir"));
        assert.isTrue(capturer.isAboutUrl("about:blank?"));
        assert.isTrue(capturer.isAboutUrl("about:blank?id=123"));
        assert.isTrue(capturer.isAboutUrl("about:blank#"));
        assert.isTrue(capturer.isAboutUrl("about:blank#frag"));
      });

      it("should return false for other URLs", function () {
        assert.isFalse(capturer.isAboutUrl("about:invalid"));
        assert.isFalse(capturer.isAboutUrl("about:newtab"));
        assert.isFalse(capturer.isAboutUrl("http://example.com/page"));
        assert.isFalse(capturer.isAboutUrl("https://example.com/page"));
        assert.isFalse(capturer.isAboutUrl("ws://example.com/page"));
        assert.isFalse(capturer.isAboutUrl("wss://example.com/page"));
        assert.isFalse(capturer.isAboutUrl("file:///foo/bar"));
        assert.isFalse(capturer.isAboutUrl("data:text/html,foo"));
        assert.isFalse(capturer.isAboutUrl("blob:https://example.com/58eead10-e54d-4b72-9ae4-150381dcb68c"));
      });
    });

    describe('#getErrorUrl()', function () {
      const optionsBasic = {};
      const optionsLinkUnsavedUri = {"capture.linkUnsavedUri": true};

      it("should rewrite http:, https:, file:, and about:", function () {
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

      it("should strip details for data: and blob:", function () {
        assert.strictEqual(
          capturer.getErrorUrl("data:text/css,foo", optionsBasic),
          "urn:scrapbook:download:error:data:",
        );
        assert.strictEqual(
          capturer.getErrorUrl("blob:https://example.com/58eead10-e54d-4b72-9ae4-150381dcb68c", optionsBasic),
          "urn:scrapbook:download:error:blob:",
        );
      });

      it("should not rewrite other protocols", function () {
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

      it("should not rewrite if `capture.linkUnsavedUri` is truthy", function () {
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
  });
});
