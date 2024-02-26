describe('Test libraries', function () {

// ref: https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Referrer-Policy
describe('lib/referrer.js', function () {

  describe('Referrer.toString', function () {

    it('basic', function () {
      // no-referrer
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://example.com:8000/otherpage",
        "no-referrer",
        false,
      ).toString() === "");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://mozilla.org",
        "no-referrer",
        false,
      ).toString() === "");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "http://example.com:8000/page",
        "no-referrer",
        false,
      ).toString() === "");

      // origin
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://example.com:8000/otherpage",
        "origin",
        false,
      ).toString() === "https://example.com:8000/");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://mozilla.org",
        "origin",
        false,
      ).toString() === "https://example.com:8000/");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "http://example.com:8000/page",
        "origin",
        false,
      ).toString() === "https://example.com:8000/");

      // unsafe-url
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://example.com:8000/otherpage",
        "unsafe-url",
        false,
      ).toString() === "https://example.com:8000/page?search=1");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://mozilla.org",
        "unsafe-url",
        false,
      ).toString() === "https://example.com:8000/page?search=1");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "http://example.com:8000/page",
        "unsafe-url",
        false,
      ).toString() === "https://example.com:8000/page?search=1");

      // origin-when-cross-origin
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://example.com:8000/otherpage",
        "origin-when-cross-origin",
        false,
      ).toString() === "https://example.com:8000/page?search=1");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://mozilla.org",
        "origin-when-cross-origin",
        false,
      ).toString() === "https://example.com:8000/");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "http://example.com:8000/page",
        "origin-when-cross-origin",
        false,
      ).toString() === "https://example.com:8000/");

      // same-origin
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://example.com:8000/otherpage",
        "same-origin",
        false,
      ).toString() === "https://example.com:8000/page?search=1");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://mozilla.org",
        "same-origin",
        false,
      ).toString() === "");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "http://example.com:8000/page",
        "same-origin",
        false,
      ).toString() === "");

      // no-referrer-when-downgrade
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://example.com:8000/otherpage",
        "no-referrer-when-downgrade",
        false,
      ).toString() === "https://example.com:8000/page?search=1");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://mozilla.org",
        "no-referrer-when-downgrade",
        false,
      ).toString() === "https://example.com:8000/page?search=1");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "http://example.com:8000/page",
        "no-referrer-when-downgrade",
        false,
      ).toString() === "");

      // strict-origin
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://example.com:8000/otherpage",
        "strict-origin",
        false,
      ).toString() === "https://example.com:8000/");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://mozilla.org",
        "strict-origin",
        false,
      ).toString() === "https://example.com:8000/");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "http://example.com:8000/page",
        "strict-origin",
        false,
      ).toString() === "");

      // strict-origin-when-cross-origin
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://example.com:8000/otherpage",
        "strict-origin-when-cross-origin",
        false,
      ).toString() === "https://example.com:8000/page?search=1");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "https://mozilla.org",
        "strict-origin-when-cross-origin",
        false,
      ).toString() === "https://example.com:8000/");
      assert(new Referrer(
        "https://user:pw@example.com:8000/page?search=1#frag",
        "http://example.com:8000/page",
        "strict-origin-when-cross-origin",
        false,
      ).toString() === "");
    });

    it('spoof = true', function () {
      assert(new Referrer(
        "https://mozilla.org",
        "https://user:pw@example.com:8000/page?search=1#frag",
        "strict-origin-when-cross-origin",
        true,
      ).toString() === "https://example.com:8000/page?search=1");
      assert(new Referrer(
        "https://mozilla.org",
        "https://user:pw@example.com:8000/page?search=1#frag",
        "strict-origin",
        true,
      ).toString() === "https://example.com:8000/");
    });

  });

  describe('Referrer.isSameOrigin', function () {

    it('basic', function () {
      assert(new Referrer(
        "https://example.com/page",
        "https://example.com/otherpage",
      ).isSameOrigin === true);
      assert(new Referrer(
        "https://example.com/page",
        "https://example.com:8000/otherpage",
      ).isSameOrigin === false);
      assert(new Referrer(
        "https://example.com/page",
        "https://sub.example.com/otherpage",
      ).isSameOrigin === false);
      assert(new Referrer(
        "https://example.com/page",
        "http://sub.example.com/otherpage",
      ).isSameOrigin === false);
      assert(new Referrer(
        "file:///var/www/page",
        "file:///var/www/otherpage",
      ).isSameOrigin === false);
      assert(new Referrer(
        "data:text/plain,abc123",
        "data:text/plain,def456",
      ).isSameOrigin === false);
    });

  });

  describe('Referrer.isDownGrade', function () {

    it('HTTPS to ...', function () {
      assert(new Referrer(
        "https://example.com/page",
        "https://example.com/otherpage",
      ).isDownGrade === false);
      assert(new Referrer(
        "https://example.com/page",
        "https://mozilla.org",
      ).isDownGrade === false);
      assert(new Referrer(
        "https://example.com/page",
        "http://example.com/page",
      ).isDownGrade === true);
    });

    it('HTTP to anywhere is not a downgrade', function () {
      assert(new Referrer(
        "http://example.com/page",
        "http://example.com/otherpage",
      ).isDownGrade === false);
      assert(new Referrer(
        "http://example.com/page",
        "http://mozilla.org",
      ).isDownGrade === false);
      assert(new Referrer(
        "http://example.com/page",
        "https://example.com/page",
      ).isDownGrade === false);
    });

    it('HTTPS to a potentially trustworthy URL is not a downgrade', function () {
      assert(new Referrer(
        "https://example.com/page",
        "http://localhost/page",
      ).isDownGrade === false);
      assert(new Referrer(
        "https://example.com/page",
        "http://127.0.0.1/page",
      ).isDownGrade === false);
      assert(new Referrer(
        "https://example.com/page",
        "http://127.255.255.254/page",
      ).isDownGrade === false);
      assert(new Referrer(
        "https://example.com/page",
        "http://[::1]/page",
      ).isDownGrade === false);
      assert(new Referrer(
        "https://example.com/page",
        "file:///vars/www/page",
      ).isDownGrade === false);
      assert(new Referrer(
        "https://example.com/page",
        "data:text/plain,abc123",
      ).isDownGrade === false);
      assert(new Referrer(
        "https://example.com/page",
        "about:blank",
      ).isDownGrade === false);
      assert(new Referrer(
        "https://example.com/page",
        "about:srcdoc",
      ).isDownGrade === false);
      assert(new Referrer(
        "https://example.com/page",
        new URL(browser.runtime.getURL('')).href,
      ).isDownGrade === false);
    });

  });

});

});  // Test libraries
