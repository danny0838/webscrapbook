'use strict';

async function test_viewer_validate() {
  return await openTestTab({
    url: browser.runtime.getURL('t/viewer_validate/index.html'),
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
}

async function test_viewer_encoding() {
  return await openTestTab({
    url: browser.runtime.getURL('t/viewer_encoding/index.html'),
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
}

async function test_viewer_attachment() {
  return await openTestTab({
    url: browser.runtime.getURL('t/viewer_attachment/index.html'),
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
}

async function test_viewer_interlink() {
  return await openTestTab({
    url: browser.runtime.getURL('t/viewer_interlink/index.html'),
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
}

async function test_viewer_interlink_frame() {
  return await openTestTab({
    url: browser.runtime.getURL('t/viewer_interlink_frame/index.html'),
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
}

async function test_viewer_interlink_frame_form() {
  return await openTestTab({
    url: browser.runtime.getURL('t/viewer_interlink_frame_form/index.html'),
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
}

async function test_viewer_css_rules() {
  return await openTestTab({
    url: browser.runtime.getURL('t/viewer_css_rules/index.html'),
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
}

async function test_viewer_metaRefresh() {
  return await openTestTab({
    url: browser.runtime.getURL('t/viewer_metaRefresh/index.html'),
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
}

async function test_viewer_archive_in_frame() {
  return await openTestTab({
    url: browser.runtime.getURL('t/viewer_archive_in_frame/index.html'),
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
}

async function test_viewer_csp() {
  return await openTestTab({
    url: browser.runtime.getURL('t/viewer_csp/index.html'),
    active: true,
  }, (message, port, resolve) => {
    if (message.cmd == 'result') {
      resolve(message.args.value);
    }
  });
}
