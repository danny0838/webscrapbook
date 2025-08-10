(function (global, factory) {
  global = typeof globalThis !== "undefined" ? globalThis : global || self;
  if (typeof exports === "object" && typeof module === "object") {
    // CommonJS
    module.exports = factory(global);
  } else if (typeof define === "function" && define.amd) {
    // AMD
    define(() => {
      return factory(global);
    });
  } else {
    // Browser globals
    factory(global);
  }
}(this, function (global) {

'use strict';

describe('Manual tests', function () {
  before(async function () {
    await checkTestServer();
  });

  describe('Test capture', function () {
    it('should be able to handle rather large data', async function () {
      return await openTestTab({
        url: `${localhost}/capturex_huge/index.html`,
        active: true,
      });
    });
  });

  describe('Test viewer', function () {
    it('should view HTZ/MAFF that conforms to the spec', async function () {
      return await openTestTab({
        url: `${localhost}/viewer_validate_good/index.html`,
        active: true,
      });
    });

    it('should error out when HTZ/MAFF does not conform to the spec', async function () {
      return await openTestTab({
        url: `${localhost}/viewer_validate_bad/index.html`,
        active: true,
      });
    });

    it('should handle document charset correctly', async function () {
      return await openTestTab({
        url: `${localhost}/viewer_encoding/index.html`,
        active: true,
      });
    });

    it('should view attachment HTZ/MAFF only when `opt_viewer.viewAttachments`', async function () {
      return await openTestTab({
        url: `${localhost}/viewer_attachment/index.html`,
        active: true,
      });
    });

    it('should ensure links and back/forward button work', async function () {
      return await openTestTab({
        url: `${localhost}/viewer_interlink/index.html`,
        active: true,
      });
    });

    it('should target the correct frame for links', async function () {
      return await openTestTab({
        url: `${localhost}/viewer_interlink_frame/index.html`,
        active: true,
      });
    });

    it('should block form submission', async function () {
      return await openTestTab({
        url: `${localhost}/viewer_interlink_frame_form/index.html`,
        active: true,
      });
    });

    it('should apply CSS rules correctly', async function () {
      return await openTestTab({
        url: `${localhost}/viewer_css_rules/index.html`,
        active: true,
      });
    });

    it('should handle meta refresh (blocked in newer browsers)', async function () {
      return await openTestTab({
        url: `${localhost}/viewer_metaRefresh/index.html`,
        active: true,
      });
    });

    it('should view HTZ/MAFF in frames', async function () {
      return await openTestTab({
        url: `${localhost}/viewer_archive_in_frame/index.html`,
        active: true,
      });
    });

    it('should block scripts', async function () {
      return await openTestTab({
        url: `${localhost}/viewer_csp/index.html`,
        active: true,
      });
    });
  });
});

}));
