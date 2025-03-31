(function (global, factory) {
  global = typeof globalThis !== "undefined" ? globalThis : global || self;
  if (typeof exports === "object" && typeof module === "object") {
    // CommonJS
    module.exports = factory(
      global,
      require('./lib/mocha'),
      require('./lib/unittest'),
    );
  } else if (typeof define === "function" && define.amd) {
    // AMD
    require(
      ['./lib/mocha', './lib/unittest'],
      (...args) => {
        return factory(global, ...args);
      },
    );
  } else {
    // Browser globals
    factory(
      global,
      global.mocha,
      global.unittest,
    );
  }
}(this, function (global, mocha, unittest) {

'use strict';

const {userAgent, delay, deserializeObject, escapeRegExp} = unittest;


/******************************************************************************
 * Helpers
 *****************************************************************************/

class TestSuite {
  async init() {
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

    const config = this.config = Object.assign({}, config1, config2);
    this.backend = `http://localhost${config["backend_port"] === 80 ? "" : ":" + config["backend_port"]}`;
    this.localhost = `http://localhost${config["server_port"] === 80 ? "" : ":" + config["server_port"]}`;
    this.localhost2 = `http://localhost${config["server_port2"] === 80 ? "" : ":" + config["server_port2"]}`;
  }

  async checkBackendServer() {
    try {
      await this.backendRequest({
        query: {a: 'config', f: 'json'},
      }).then(r => r.json());
    } catch (ex) {
      console.error(ex);
      throw new Error(`Unable to connect to backend server "${backend}". Make sure PyWebScrapBook module has been installed, the server has been started, and the port is not occupied by another application.`);
    }
  }

  async checkTestServer() {
    const {localhost, localhost2} = this;

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

  async checkExtension() {
    const id = this.config["wsb_extension_id"];
    try {
      if (!await browser.runtime.sendMessage(id, {cmd: "ping"})) {
        throw new Error('ping failure');
      }
    } catch (ex) {
      console.error(ex);
      throw new Error(`Unable to connect to the WebScrapBook extension with ID "${id}". Make sure the extension is installed and its ID is correctly configured.`);
    }
  }

  async waitTabLoading(tab) {
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

  async openTab(createProperties) {
    const tab = await browser.tabs.create(createProperties);
    return await this.waitTabLoading(tab);
  }

  async openPageTab(url) {
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
    return await this.waitTabLoading(tab);
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
  async openTestTab(createProperties, handler) {
    if (typeof handler === 'undefined') {
      handler = (message, port, resolve) => {
        if (message.cmd == 'result') {
          resolve(message.args.value);
        }
      };
    }

    const tab = await this.openTab(createProperties);
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
  async capture(params, options = {}) {
    const {headless = false, delay: delayTime, rawResponse = false} = options;
    const pageTab = !headless && await this.openPageTab(params.url);

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

    const response = await browser.runtime.sendMessage(this.config["wsb_extension_id"], {
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
  async captureHeadless(params, options = {}) {
    return await this.capture(
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
  async backendRequest({
    url = this.backend,
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
      const token = await fetch(`${this.backend}?a=token`, {
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
}


/******************************************************************************
 * Main
 *****************************************************************************/

// Top-level await is available only in Chromium >=89 and Firefox >= 89
(async () => {
  const suite = new TestSuite();

  await suite.init();

  // initialize mocha and expose global methods such as describe(), it()
  const query = new URL(location.href).searchParams;
  const grep = query.get('grep');
  const fgrep = query.get('fgrep');
  const dryRun = Boolean(query.get('dryrun')) && !(grep || fgrep);
  if (dryRun) {
    document.title = `(DRY-RUN) ${document.title}`;
  }
  mocha.setup({
    ui: 'bdd',
    checkLeaks: true,
    timeout: 0,
    slow: 10000,
    grep: (() => {
      if (dryRun) {
        return '(?:)';
      }
      if (!(grep || fgrep)) {
        const tests = suite.config["tests"];
        if (Array.isArray(tests)) {
          return tests.map(t => escapeRegExp(t)).join('|');
        }
        return tests;
      }
      return undefined;
    })(),
    ...(dryRun && {dryRun}),
    noHighlighting: true,
  });

  // expose to global scope
  Object.assign(global, {
    backend: suite.backend,
    localhost: suite.localhost,
    localhost2: suite.localhost2,
    checkBackendServer: suite.checkBackendServer.bind(suite),
    checkTestServer: suite.checkTestServer.bind(suite),
    checkExtension: suite.checkExtension.bind(suite),
    capture: suite.capture.bind(suite),
    captureHeadless: suite.captureHeadless.bind(suite),
    openTestTab: suite.openTestTab.bind(suite),
    backendRequest: suite.backendRequest.bind(suite),
  });

  // import all tests
  await import('./test_lib_mime.js');
  await import('./test_lib_referrer.js');
  await import('./test_lib_map-with-default.js');
  await import('./test_lib_strftime.js');
  await import('./test_src_core_common.js');
  await import('./test_src_capturer_common.js');
  await import('./test_capture.js');
  await import('./test_manual.js');

  mocha.run();
})();

}));
