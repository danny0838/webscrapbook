/******************************************************************************
 * Utilities for test suite extension.
 *
 * Copyright Danny Lin 2025
 * Distributed under the MIT License
 * https://opensource.org/licenses/MIT
 *****************************************************************************/

import {
  DEFAULT_OPTIONS,
  userAgent, delay, filepathParts,
} from "../utils/common.mjs";
import {deserializeObject} from "../utils/cache.mjs";
import {Capturer} from "../capturer/capturer.mjs";
import {server as _server} from "../scrapbook/server.mjs";

let config;
let backend;
let localhost;
let localhost2;

/**
 * Mocked Capturer that saves files internally and adds to the `data` property
 * of each result.
 */
class TestCapturerBase extends Capturer {
  __savedData = new Map();

  __bindSavedData(result) {
    const {timeId} = result;
    const data = this.__savedData.get(timeId);
    if (data !== undefined) {
      result.data = data;
    }
    return result;
  }

  async run(taskInfo) {
    const results = await super.run(taskInfo);
    for (const result of results) {
      this.__bindSavedData(result);
    }
    return results;
  }

  async getAvailableSaveFilename({filename}) {
    return filepathParts(filename)[1];
  }

  async _saveMainDocumentBlob(blob, {timeId, filename, targetDir}) {
    this.__savedData.set(timeId, blob);
    return {filename, targetDir};
  }

  async _saveMainDocumentEntries(entries, {timeId, filename, targetDir}) {
    const map = new Map();
    this.__savedData.set(timeId, map);
    for (const [filename, _sourceUrl, blob] of entries) {
      map.set(filename, blob);
    }
    return {filename, targetDir};
  }
}

class TestCapturerSimpleRaw extends TestCapturerBase {
  async run(taskInfo) {
    const [result] = await super.run(taskInfo);
    return result;
  }
}

class TestCapturerSimple extends TestCapturerBase {
  async run(taskInfo) {
    const [result] = await super.run(taskInfo);

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.data;
  }
}

class TestCapturerGeneral extends TestCapturerBase {
  async captureGeneral({options, useDiskCache = false, ...params}) {
    options = {...DEFAULT_OPTIONS, ...options};
    return this.__bindSavedData(await super.captureGeneral({options, useDiskCache, ...params}));
  }
}

class TestCapturerOffline extends TestCapturerGeneral {
  /**
   * @callback TestCapturerOfflineMapper
   * @param {string} url
   * @return {Object|boolean} The response data object. Or true to return
   *   normal fetch response. Or null or undefined to return a 404 error.
   */

  /**
   * @param {Map|Object|TestCapturerOfflineMapper} [mapper]
   */
  constructor(mapper) {
    super();
    if (typeof mapper === 'function') {
      this.__fetchMapper = mapper;
    } else if (mapper instanceof Map) {
      this.__fetchMapper = url => mapper.get(url);
    } else if (typeof mapper === 'object') {
      this.__fetchMapper = url => mapper[url];
    }
  }

  async _fetch(params) {
    const {sourceUrlMain, response} = params;

    const mapper = this.__fetchMapper;
    if (mapper) {
      const res = mapper(sourceUrlMain) ?? {
        status: 404,
        error: {
          name: 'HttpError',
          message: '404 Not Found',
        },
      };
      if (res === true) {
        return super._fetch(params);
      }
      return Object.assign(response, {
        status: 200,
      }, res);
    }

    return Object.assign(response, {
      status: 200,
      blob: new Blob([], {type: 'application/octet-stream'}),
    });
  }
}

/**
 * Stub out `XMLHttpRequest` for offline testing.
 */
function stubXhr(sandbox, responser = {}) {
  const requestData = {headers: new Map()};
  let aborted = false;
  let stubReadyState;
  sandbox.stub(XMLHttpRequest.prototype, 'setRequestHeader').callsFake(function (header, value) {
    requestData.headers.set(header.toLowerCase(), value);
  });
  sandbox.stub(XMLHttpRequest.prototype, 'open').callsFake(function (method, url, _isAsync, user, password) {
    Object.assign(requestData, {method, url, user, password});
    aborted = false;
    stubReadyState = sandbox.stub(XMLHttpRequest.prototype, 'readyState').value(1);
    this.dispatchEvent(new Event('readystatechange'));
  });
  sandbox.stub(XMLHttpRequest.prototype, 'send').callsFake(async function (body) {
    Object.assign(requestData, {body});

    const responseData = (typeof responser === 'function') ?
      await responser.call(this, requestData) :
      responser;

    const {url = requestData.url, status = 200, statusText = 'OK', headers: _headers = {}, response} = responseData;
    const headers = new Map(Object.entries(_headers).map(([key, value]) => [key.toLowerCase(), value]));
    sandbox.stub(XMLHttpRequest.prototype, 'responseURL').value(url);
    sandbox.stub(XMLHttpRequest.prototype, 'status').value(status);
    sandbox.stub(XMLHttpRequest.prototype, 'statusText').value(statusText);
    sandbox.stub(XMLHttpRequest.prototype, 'getResponseHeader').value(name => headers.get(name.toLowerCase()));
    sandbox.stub(XMLHttpRequest.prototype, 'getAllResponseHeaders').value([...headers.entries()].join('\r\n'));

    await delay(0);
    if (aborted) { return; }
    stubReadyState.restore();
    stubReadyState = sandbox.stub(XMLHttpRequest.prototype, 'readyState').value(2);
    this.dispatchEvent(new Event('readystatechange'));

    await delay(0);
    if (aborted) { return; }
    stubReadyState.restore();
    stubReadyState = sandbox.stub(XMLHttpRequest.prototype, 'readyState').value(3);
    this.dispatchEvent(new Event('readystatechange'));

    await delay(0);
    if (aborted) { return; }
    stubReadyState.restore();
    stubReadyState = sandbox.stub(XMLHttpRequest.prototype, 'readyState').value(4);
    sandbox.stub(XMLHttpRequest.prototype, 'response').value(response);
    this.dispatchEvent(new Event('readystatechange'));
    this.dispatchEvent(new Event('load'));
  });
  sandbox.stub(XMLHttpRequest.prototype, 'abort').callsFake(function () {
    aborted = true;
    this.dispatchEvent(new Event('abort'));
  });
}

/**
 * Stub out `server` for offline testing.
 */
function stubServer(sandbox, {server = _server, bookId = '', books = {'': {config: {}}}} = {}) {
  sandbox.stub(server, 'init');
  sandbox.stub(server, 'bookId').value(bookId);
  sandbox.stub(server, 'books').value(books);
}

async function init() {
  const config1 = await (async () => {
    try {
      const url = browser.runtime.getURL('test/config.json');
      return await fetch(url).then(r => r.json());
    } catch (ex) {
      // pass
    }
  })();
  const config2 = await (async () => {
    try {
      const url = browser.runtime.getURL('test/config.local.json');
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
  const id = config["extension_id"];
  try {
    if (!await browser.runtime.sendMessage(id, {cmd: "ping"})) {
      throw new Error('ping failure');
    }
  } catch (ex) {
    console.error(ex);
    throw new Error(`Unable to connect to the test extension with ID "${id}". Make sure the extension is installed and its ID is correctly configured.`);
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
      const {cmd, args} = message;
      if (cmd === 'result') {
        resolve(args[0]);
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
 * @param {Object} [options.cls]
 */
async function capture(params, options = {}) {
  const {headless = false, delay: delayTime, cls = TestCapturerSimple} = options;
  const pageTab = !headless && await openPageTab(params.url);

  if (typeof delayTime === 'number') {
    await delay(delayTime);
  }

  const taskInfo = {
    tasks: [
      headless ? params : Object.assign({
        tabId: pageTab.id,
        url: pageTab.url,
      }, params),
    ],
  };

  const capturer = new cls();
  const result = await capturer.run(taskInfo);

  !headless && await browser.tabs.remove(pageTab.id);

  return result;
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
  TestCapturerBase,
  TestCapturerSimpleRaw,
  TestCapturerSimple,
  TestCapturerGeneral,
  TestCapturerOffline,
  stubXhr,
  stubServer,
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
