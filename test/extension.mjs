/******************************************************************************
 * Utilities for test suite extension.
 *
 * Copyright Danny Lin 2025
 * Distributed under the MIT License
 * https://opensource.org/licenses/MIT
 *****************************************************************************/

import {userAgent, delay, deserializeObject} from "./shared/utils/common.mjs";

let config;
let backend;
let localhost;
let localhost2;

async function init() {
  const config1 = await (async () => {
    try {
      const url = browser.runtime.getURL('config.json');
      return await fetch(url).then(r => r.json());
    } catch (ex) {
      // pass
    }
  })();
  const config2 = await (async () => {
    try {
      const url = browser.runtime.getURL('config.local.json');
      return await fetch(url).then(r => r.json());
    } catch (ex) {
      // pass
    }
  })();

  config = Object.assign({}, config1, config2);
  backend = `http://localhost${config["backend_port"] === 80 ? "" : ":" + config["backend_port"]}`;
  localhost = `http://localhost${config["server_port"] === 80 ? "" : ":" + config["server_port"]}`;
  localhost2 = `http://localhost${config["server_port2"] === 80 ? "" : ":" + config["server_port2"]}`;
}

async function checkBackendServer() {
  try {
    await backendRequest({
      query: {a: 'config', f: 'json'},
    }).then(r => r.json());
  } catch (ex) {
    console.error(ex);
    throw new Error(`Unable to connect to backend server "${backend}". Make sure PyWebScrapBook module has been installed, the server has been started, and the port is not occupied by another application.`);
  }
}

async function checkTestServer() {
  try {
    await fetch(localhost);
  } catch (ex) {
    console.error(ex);
    throw new Error(`Unable to connect to local server "${localhost}". Make sure the server has been started and the port is not occupied by another application.`);
  }

  try {
    await fetch(localhost2);
  } catch (ex) {
    console.error(ex);
    throw new Error(`Unable to connect to local server "${localhost2}". Make sure the server has been started and the port is not occupied by another application.`);
  }
}

async function checkExtension() {
  const id = config["wsb_extension_id"];
  try {
    if (!await browser.runtime.sendMessage(id, {cmd: "ping"})) {
      throw new Error('ping failure');
    }
  } catch (ex) {
    console.error(ex);
    throw new Error(`Unable to connect to the WebScrapBook extension with ID "${id}". Make sure the extension is installed and its ID is correctly configured.`);
  }
}

async function waitTabLoading(tab) {
  const {promise, resolve, reject} = Promise.withResolvers();
  const listener = (tabId, changeInfo, t) => {
    if (!(tabId === tab.id && changeInfo.status === 'complete')) { return; }
    resolve(t);
  };
  const listener2 = (tabId, removeInfo) => {
    if (!(tabId === tab.id)) { return; }
    reject(new Error('Tab removed before loading complete.'));
  };
  try {
    browser.tabs.onUpdated.addListener(listener);
    browser.tabs.onRemoved.addListener(listener2);
    return await promise;
  } finally {
    browser.tabs.onUpdated.removeListener(listener);
    browser.tabs.onRemoved.removeListener(listener2);
  }
}

async function openTab(createProperties) {
  const tab = await browser.tabs.create(createProperties);
  return await waitTabLoading(tab);
}

async function openPageTab(url) {
  const params = {
    url,

    incognito: (await browser.windows.getCurrent()).incognito,

    // Firefox < 86: `focused` in `windows.create()` causes an error.
    // Firefox >= 86: ignores `focused` in `windows.create()`.
    ...(!(userAgent.is('firefox') && userAgent.major < 86) && {focused: false}),

    type: "popup",
    width: 50,
    height: 50,

    // Firefox < 109: ignores `top` and `left` in `windows.create()`.
    top: window.screen.availHeight - 50,
    left: window.screen.availWidth - 50,
  };

  const win = await browser.windows.create(params);
  const tab = win.tabs[0];
  return await waitTabLoading(tab);
}

/**
 * @callback openTestTabHandlerResolver
 * @param {boolean} pass - whether the test passes
 */

/**
 * @callback openTestTabHandler
 * @param {Object} message
 * @param {Port} port
 * @param {openTestTabHandlerResolver} resolve
 */

/**
 * Open a tab with connection for test.
 *
 * @param {openTestTabHandler} [handler]
 */
async function openTestTab(createProperties, handler) {
  if (typeof handler === 'undefined') {
    handler = (message, port, resolve) => {
      if (message.cmd == 'result') {
        resolve(message.args.value);
      }
    };
  }

  const tab = await openTab(createProperties);
  const port = browser.tabs.connect(tab.id, {name: 'test'});
  const result = await new Promise((resolve, reject) => {
    port.onMessage.addListener((message, port) => {
      handler(message, port, resolve);
    });
    port.onDisconnect.addListener((port) => {
      reject(new Error('Page disconnected'));
    });
  });
  await browser.tabs.remove(tab.id);
  if (!result) {
    throw new Error('Manual test failed');
  }
}

/**
 * @param {Object} params
 * @param {string} params.url
 * @param {string} [params.mode]
 * @param {Object} [params.options]
 * @param {Object} [options]
 * @param {boolean} [options.headless]
 * @param {float} [options.delay]
 * @param {boolean} [options.rawResponse]
 */
async function capture(params, options = {}) {
  const {headless = false, delay: delayTime, rawResponse = false} = options;
  const pageTab = !headless && await openPageTab(params.url);

  if (typeof delayTime === 'number') {
    await delay(delayTime);
  }

  const args = {
    taskInfo: {
      tasks: [
        headless ? params : Object.assign({
          tabId: pageTab.id,
          title: pageTab.title,
          url: pageTab.url,
        }, params),
      ],
    },
    windowCreateData: {
      incognito: (await browser.windows.getCurrent()).incognito,
      focused: false,
      type: "popup",
      width: 50,
      height: 50,
      top: window.screen.availHeight - 50,
      left: window.screen.availWidth - 50,
    },
    waitForResponse: true,
  };

  const {result: response} = await browser.runtime.sendMessage(config["wsb_extension_id"], {
    cmd: "invokeCaptureEx",
    args,
  });

  const result = response.results[0];
  await browser.tabs.remove(response.tab.id);
  !headless && await browser.tabs.remove(pageTab.id);

  if (rawResponse) {
    return result;
  }

  if (result.error) {
    throw new Error(result.error.message);
  }

  return deserializeObject(result);
}

/**
 * Shortcut for a general headless capture.
 */
async function captureHeadless(params, options = {}) {
  return await capture(
    Object.assign({mode: "source"}, params),
    Object.assign({}, options, {headless: true}),
  );
}

/**
 * @param {Object} params
 * @param {string|URL} [params.url]
 * @param {string|Object|Array|URLSearchParams} [params.query]
 * @param {string} [params.method]
 * @param {Object|Array|Headers} [params.headers]
 * @param {Object|Array|FormData} [params.body]
 * @param {string} [params.credentials]
 * @param {string} [params.cache]
 * @param {boolean} [params.csrfToken]
 */
async function backendRequest({
  url = backend,
  query,
  method,
  headers,
  body,
  credentials = 'include',
  cache = 'no-cache',
  csrfToken = false,
}) {
  if (!method) {
    method = (body || csrfToken) ? 'POST' : 'GET';
  }

  if (!(url instanceof URL)) {
    url = new URL(url);
  }

  if (query) {
    if (!(query instanceof URLSearchParams)) {
      query = new URLSearchParams(query);
    }
    for (const [key, value] of query) {
      url.searchParams.append(key, value);
    }
  }

  if (headers && !(headers instanceof Headers)) {
    headers = new Headers(headers);
  }

  if (body && !(body instanceof FormData)) {
    const b = new FormData();
    for (const [key, value] of Object.entries(body)) {
      if (typeof value !== 'undefined') {
        b.append(key, value);
      }
    }
    body = b;
  }

  if (csrfToken) {
    const token = await fetch(`${backend}?a=token`, {
      method: "POST",
      credentials,
      cache,
    }).then(r => r.text());

    if (!body) {
      body = new FormData();
    }
    body.append('token', token);
  }

  const response = await fetch(url, {
    method,
    headers,
    body,
    credentials,
    cache,
  });

  if (!response.ok) {
    throw new Error(`Bad response: ${response.status} ${response.statusText}`);
  }

  return response;
}

export {
  init,
  config,
  backend,
  localhost,
  localhost2,
  checkBackendServer,
  checkTestServer,
  checkExtension,
  capture,
  captureHeadless,
  openTestTab,
  backendRequest,
};
