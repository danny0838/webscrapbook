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

describe('Test viewer', function () {

it('test_viewer_validate', async function () {
  return await openTestTab({
    url: `${localhost}/viewer_validate/index.html`,
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
});

it('test_viewer_encoding', async function () {
  return await openTestTab({
    url: `${localhost}/viewer_encoding/index.html`,
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
});

it('test_viewer_attachment', async function () {
  return await openTestTab({
    url: `${localhost}/viewer_attachment/index.html`,
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
});

it('test_viewer_interlink', async function () {
  return await openTestTab({
    url: `${localhost}/viewer_interlink/index.html`,
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
});

it('test_viewer_interlink_frame', async function () {
  return await openTestTab({
    url: `${localhost}/viewer_interlink_frame/index.html`,
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
});

it('test_viewer_interlink_frame_form', async function () {
  return await openTestTab({
    url: `${localhost}/viewer_interlink_frame_form/index.html`,
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
});

it('test_viewer_css_rules', async function () {
  return await openTestTab({
    url: `${localhost}/viewer_css_rules/index.html`,
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
});

it('test_viewer_metaRefresh', async function () {
  return await openTestTab({
    url: `${localhost}/viewer_metaRefresh/index.html`,
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
});

it('test_viewer_archive_in_frame', async function () {
  return await openTestTab({
    url: `${localhost}/viewer_archive_in_frame/index.html`,
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
});

it('test_viewer_csp', async function () {
  return await openTestTab({
    url: `${localhost}/viewer_csp/index.html`,
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
});

});  // Test viewer

});  // Manual tests

}));
