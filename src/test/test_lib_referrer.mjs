import {MochaQuery as $, assert} from "./unittest.mjs";

import {Referrer} from "../lib/referrer.mjs";

const $it = $(it);

describe('lib/referrer.js', function () {
  describe('Referrer', function () {
    describe('#toString()', function () {
      it('should return the referrer URL string', function () {
        // no-referrer
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "https://example.com:8000/otherpage",
          "no-referrer",
          false,
        ).toString(), "");
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "https://mozilla.org",
          "no-referrer",
          false,
        ).toString(), "");
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "http://example.com:8000/page",
          "no-referrer",
          false,
        ).toString(), "");

        // origin
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "https://example.com:8000/otherpage",
          "origin",
          false,
        ).toString(), "https://example.com:8000/");
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "https://mozilla.org",
          "origin",
          false,
        ).toString(), "https://example.com:8000/");
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "http://example.com:8000/page",
          "origin",
          false,
        ).toString(), "https://example.com:8000/");

        // unsafe-url
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "https://example.com:8000/otherpage",
          "unsafe-url",
          false,
        ).toString(), "https://example.com:8000/page?search=1");
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "https://mozilla.org",
          "unsafe-url",
          false,
        ).toString(), "https://example.com:8000/page?search=1");
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "http://example.com:8000/page",
          "unsafe-url",
          false,
        ).toString(), "https://example.com:8000/page?search=1");

        // origin-when-cross-origin
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "https://example.com:8000/otherpage",
          "origin-when-cross-origin",
          false,
        ).toString(), "https://example.com:8000/page?search=1");
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "https://mozilla.org",
          "origin-when-cross-origin",
          false,
        ).toString(), "https://example.com:8000/");
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "http://example.com:8000/page",
          "origin-when-cross-origin",
          false,
        ).toString(), "https://example.com:8000/");

        // same-origin
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "https://example.com:8000/otherpage",
          "same-origin",
          false,
        ).toString(), "https://example.com:8000/page?search=1");
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "https://mozilla.org",
          "same-origin",
          false,
        ).toString(), "");
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "http://example.com:8000/page",
          "same-origin",
          false,
        ).toString(), "");

        // no-referrer-when-downgrade
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "https://example.com:8000/otherpage",
          "no-referrer-when-downgrade",
          false,
        ).toString(), "https://example.com:8000/page?search=1");
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "https://mozilla.org",
          "no-referrer-when-downgrade",
          false,
        ).toString(), "https://example.com:8000/page?search=1");
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "http://example.com:8000/page",
          "no-referrer-when-downgrade",
          false,
        ).toString(), "");

        // strict-origin
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "https://example.com:8000/otherpage",
          "strict-origin",
          false,
        ).toString(), "https://example.com:8000/");
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "https://mozilla.org",
          "strict-origin",
          false,
        ).toString(), "https://example.com:8000/");
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "http://example.com:8000/page",
          "strict-origin",
          false,
        ).toString(), "");

        // strict-origin-when-cross-origin
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "https://example.com:8000/otherpage",
          "strict-origin-when-cross-origin",
          false,
        ).toString(), "https://example.com:8000/page?search=1");
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "https://mozilla.org",
          "strict-origin-when-cross-origin",
          false,
        ).toString(), "https://example.com:8000/");
        assert.strictEqual(new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "http://example.com:8000/page",
          "strict-origin-when-cross-origin",
          false,
        ).toString(), "");
      });

      it('should take target as source when `spoof` is truthy', function () {
        assert.strictEqual(new Referrer(
          "https://mozilla.org",
          "https://user:pw@example.com:8000/page?search=1#frag",
          "strict-origin-when-cross-origin",
          true,
        ).toString(), "https://example.com:8000/page?search=1");
        assert.strictEqual(new Referrer(
          "https://mozilla.org",
          "https://user:pw@example.com:8000/page?search=1#frag",
          "strict-origin",
          true,
        ).toString(), "https://example.com:8000/");
      });

      it('should return "" if source URL is empty or invalid', function () {
        assert.strictEqual(new Referrer(
          "",
          "https://example.com/",
        ).toString(), "");
        assert.strictEqual(new Referrer(
          "/relative-url",
          "https://example.com/",
        ).toString(), "");
        assert.strictEqual(new Referrer(
          "https://exa[mple.com/",
          "https://example.com/",
        ).toString(), "");
      });

      it('should return "" if target URL is empty or invalid', function () {
        assert.strictEqual(new Referrer(
          "https://example.com/",
          "",
        ).toString(), "");
        assert.strictEqual(new Referrer(
          "https://example.com/",
          "/relative-url",
        ).toString(), "");
        assert.strictEqual(new Referrer(
          "https://example.com/",
          "https://exa[mple.com/",
        ).toString(), "");
      });
    });

    describe('#source (getter)', function () {
      it('should return the source URL object', function () {
        var source = new Referrer(
          "https://user:pw@example.com:8000/page?search=1#frag",
          "https://example.com/otherpage",
        ).source;
        assert.strictEqual(source.href, "https://user:pw@example.com:8000/page?search=1#frag");
      });

      it('should return null for an invalid source URL', function () {
        var source = new Referrer(
          "https://exa[mple.com/",
          "https://example.com/otherpage",
        ).source;
        assert.isNull(source);
      });

      it('should return the target URL object if `spoof` is truthy', function () {
        var source = new Referrer(
          "https://example.com/page",
          "https://user:pw@example.com:8000/otherpage?search=1#frag",
          "",
          true,
        ).source;
        assert.strictEqual(source.href, "https://user:pw@example.com:8000/otherpage?search=1#frag");
      });
    });

    describe('#target (getter)', function () {
      it('should return the target URL object', function () {
        var target = new Referrer(
          "https://example.com/page",
          "https://user:pw@example.com:8000/otherpage?search=1#frag",
        ).target;
        assert.strictEqual(target.href, "https://user:pw@example.com:8000/otherpage?search=1#frag");
      });

      it('should return null for an invalid target URL', function () {
        var target = new Referrer(
          "https://example.com/page",
          "https://exa[mple.com/",
        ).target;
        assert.isNull(target);
      });
    });

    describe('#isSameOrigin (getter)', function () {
      it('should return true if source and target have same origin', function () {
        assert.strictEqual(new Referrer(
          "https://example.com/page",
          "https://example.com/otherpage",
        ).isSameOrigin, true);
      });

      it('should return false if source and target have different origin', function () {
        assert.strictEqual(new Referrer(
          "https://example.com/page",
          "https://example.com:8000/otherpage",
        ).isSameOrigin, false);
        assert.strictEqual(new Referrer(
          "https://example.com/page",
          "https://sub.example.com/otherpage",
        ).isSameOrigin, false);
        assert.strictEqual(new Referrer(
          "https://example.com/page",
          "http://sub.example.com/otherpage",
        ).isSameOrigin, false);
        assert.strictEqual(new Referrer(
          "file:///var/www/page",
          "file:///var/www/otherpage",
        ).isSameOrigin, false);
        assert.strictEqual(new Referrer(
          "data:text/plain,abc123",
          "data:text/plain,def456",
        ).isSameOrigin, false);
      });
    });

    describe('#isDownGrade (getter)', function () {
      it('should return true for HTTPS to HTTP', function () {
        assert.strictEqual(new Referrer(
          "https://example.com/page",
          "https://example.com/otherpage",
        ).isDownGrade, false);
        assert.strictEqual(new Referrer(
          "https://example.com/page",
          "https://mozilla.org",
        ).isDownGrade, false);
        assert.strictEqual(new Referrer(
          "https://example.com/page",
          "http://example.com/page",
        ).isDownGrade, true);
      });

      it('should return false for HTTP', function () {
        assert.strictEqual(new Referrer(
          "http://example.com/page",
          "http://example.com/otherpage",
        ).isDownGrade, false);
        assert.strictEqual(new Referrer(
          "http://example.com/page",
          "http://mozilla.org",
        ).isDownGrade, false);
        assert.strictEqual(new Referrer(
          "http://example.com/page",
          "https://example.com/page",
        ).isDownGrade, false);
      });

      it('should return false for HTTPS to a potentially trustworthy URL', function () {
        assert.strictEqual(new Referrer(
          "https://example.com/page",
          "http://localhost/page",
        ).isDownGrade, false);
        assert.strictEqual(new Referrer(
          "https://example.com/page",
          "http://127.0.0.1/page",
        ).isDownGrade, false);
        assert.strictEqual(new Referrer(
          "https://example.com/page",
          "http://127.255.255.254/page",
        ).isDownGrade, false);
        assert.strictEqual(new Referrer(
          "https://example.com/page",
          "http://[::1]/page",
        ).isDownGrade, false);
        assert.strictEqual(new Referrer(
          "https://example.com/page",
          "file:///vars/www/page",
        ).isDownGrade, false);
        assert.strictEqual(new Referrer(
          "https://example.com/page",
          "data:text/plain,abc123",
        ).isDownGrade, false);
        assert.strictEqual(new Referrer(
          "https://example.com/page",
          "about:blank",
        ).isDownGrade, false);
        assert.strictEqual(new Referrer(
          "https://example.com/page",
          "about:srcdoc",
        ).isDownGrade, false);
      });
    });

    describe('.extensionProtocols (getter)', function () {
      $it.skipIf($.noExtensionBrowser)('should return browser extension protocol (globalThis.browser)', function () {
        const protocol = new URL(browser.runtime.getURL('')).protocol;
        assert.deepEqual(Referrer.extensionProtocols, [protocol]);
      });

      $it.skipIf($.noExtensionChrome)('should return browser extension protocol (globalThis.chrome)', function () {
        const protocol = new URL(chrome.runtime.getURL('')).protocol;
        assert.deepEqual(Referrer.extensionProtocols, [protocol]);
      });
    });

    describe('.trustworthyProtocols (getter)', function () {
      it('should return trustworthy protocols', function () {
        assert.includeMembers(Referrer.trustworthyProtocols, ['https:', 'wss:', 'data:', 'file:']);
      });

      $it.skipIf($.noExtensionBrowser)('should include browser extension protocol (globalThis.browser)', function () {
        const protocol = new URL(browser.runtime.getURL('')).protocol;
        assert.includeMembers(Referrer.trustworthyProtocols, [protocol]);
      });

      $it.skipIf($.noExtensionChrome)('should include browser extension protocol (globalThis.chrome)', function () {
        const protocol = new URL(chrome.runtime.getURL('')).protocol;
        assert.includeMembers(Referrer.trustworthyProtocols, [protocol]);
      });
    });
  });
});
