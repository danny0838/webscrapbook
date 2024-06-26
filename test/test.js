(function (global, factory) {
  global = typeof globalThis !== "undefined" ? globalThis : global || self;
  if (typeof exports === "object" && typeof module === "object") {
    // CommonJS
    module.exports = factory(
      global,
      require('./lib/mocha'),
      require('./lib/unittest'),
      require('./t/common'),
    );
  } else if (typeof define === "function" && define.amd) {
    // AMD
    require(
      ['./lib/mocha', './lib/unittest', './t/common'],
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
      global.utils,
    );
  }
}(this, function (global, mocha, unittest, utils) {

'use strict';

const {byteStringToArrayBuffer, escapeRegExp} = unittest;
const {userAgent, delay, xhr, readFileAsDocument} = utils;


/******************************************************************************
 * Helpers
 *****************************************************************************/

class TestSuite {
  async init() {
    const config1 = await (async () => {
      try {
        const url = browser.runtime.getURL('config.json');
        return JSON.parse((await xhr({url, responseType: 'text'})).response);
      } catch (ex) {
        // pass
      }
    })();
    const config2 = await (async () => {
      try {
        const url = browser.runtime.getURL('config.local.json');
        return JSON.parse((await xhr({url, responseType: 'text'})).response);
      } catch (ex) {
        // pass
      }
    })();

    const config = this.config = Object.assign({}, config1, config2);
    const localhost = this.localhost = `http://localhost${config["server_port"] === 80 ? "" : ":" + config["server_port"]}`;
    const localhost2 = this.localhost2 = `http://localhost${config["server_port2"] === 80 ? "" : ":" + config["server_port2"]}`;

    try {
      await xhr({url: localhost, responseType: 'text'});
    } catch (ex) {
      console.error(ex);
      throw new Error(`Unable to connect to local server "${localhost}". Make sure the server has been started and the port is not occupied by another application.`);
    }

    try {
      await xhr({url: localhost2, responseType: 'text'});
    } catch (ex) {
      console.error(ex);
      throw new Error(`Unable to connect to local server "${localhost2}". Make sure the server has been started and the port is not occupied by another application.`);
    }

    try {
      if (!await browser.runtime.sendMessage(config["wsb_extension_id"], {cmd: "ping"})) {
        throw new Error('ping failure');
      }
    } catch (ex) {
      console.error(ex);
      throw new Error(`Unable to connect to the WebScrapBook extension with ID "${config["wsb_extension_id"]}". Make sure the extension is installed and its ID is correctly configured.`);
    }
  }

  async waitTabLoading(tab) {
    const listener = (tabId, changeInfo, t) => {
      if (!(tabId === tab.id && changeInfo.status === 'complete')) { return; }
      resolver(t);
    };
    const listener2 = (tabId, removeInfo) => {
      if (!(tabId === tab.id)) { return; }
      rejecter(new Error('Tab removed before loading complete.'));
    };
    let resolver, rejecter;
    const promise = new Promise((resolve, reject) => {
      resolver = resolve;
      rejecter = reject;
    });
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
      focused: false,
      type: "popup",
      width: 50,
      height: 50,
      top: window.screen.availHeight - 50,
      left: window.screen.availWidth - 50,
    };

    // Firefox does not support focused in windows.create().
    // Firefox ignores top and left in windows.create().
    if (userAgent.is('firefox')) {
      delete params.focused;
    }

    const win = await browser.windows.create(params);
    const tab = win.tabs[0];
    return await this.waitTabLoading(tab);
  }

  /**
   * Open a tab with connection for test.
   *
   * @param {func} handler - Return a boolean indicating the test pass or not.
   */
  async openTestTab(createProperties, handler) {
    const {config, localhost} = this;
    const tab = await this.openTab(createProperties);
    const port = browser.tabs.connect(tab.id, {name: 'test'});
    const result = await new Promise((resolve, reject) => {
      const onMessage = (message, port) => {
        handler(message, port, resolve);
      };
      const onDisconnect = (port) => {
        reject(new Error('Port disconnected.'));
      };
      port.onMessage.addListener(onMessage);
      port.onDisconnect.addListener(onDisconnect);
      port.postMessage({
        cmd: 'loadEnv',
        args: {
          config,
          localhost,
        },
      });
    });
    await browser.tabs.remove(tab.id);
    if (!result) {
      throw new Error('Manual test failed');
    }
    return true;
  }

  /**
   * @param {Object} params
   * @param {string} params.url
   * @param {string} params.mode
   * @param {Object} params.options
   * @param {Object} options
   * @param {boolean} options.headless
   * @param {float} options.delay
   */
  async capture(params, options = {}) {
    const {headless = false, delay: delayTime} = options;
    const pageTab = !headless && await this.openPageTab(params.url);

    if (typeof delayTime === 'number') {
      await delay(delayTime);
    }

    const windowCreateData = {
      focused: false,
      type: "popup",
      width: 50,
      height: 50,
      top: window.screen.availHeight - 50,
      left: window.screen.availWidth - 50,
    };

    // Firefox does not support focused in windows.create().
    // Firefox ignores top and left in windows.create().
    if (userAgent.is('firefox')) {
      delete windowCreateData.focused;
    }

    const args = {
      taskInfo: {
        tasks: [!headless ? Object.assign({tabId: pageTab.id}, params) : params],
      },
      windowCreateData,
      waitForResponse: true,
    };

    const response = await browser.runtime.sendMessage(this.config["wsb_extension_id"], {
      cmd: "invokeCaptureEx",
      args,
    });

    const result = response.results[0];
    await browser.tabs.remove(response.tab.id);
    !headless && await browser.tabs.remove(pageTab.id);

    if (result.error) {
      return result;
    }

    if (result instanceof Blob) {
      return result;
    }

    return new Blob(result.data.map(x => byteStringToArrayBuffer(x)), {type: result.type});
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
}


/******************************************************************************
 * Main
 *****************************************************************************/

// Top-level await is available only in Chromium >=89 and Firefox >= 89
(async () => {
  const suite = new TestSuite();
  try {
    await suite.init();
  } catch (ex) {
    /* fail out with a dummy mocha */
    mocha.setup('bdd');

    // prevent options be overwritten by URL params
    mocha.options = new Proxy(mocha.options, {
      set() { return true; },
    });

    before(() => { throw ex; });
    it('root');  // require a test for before to be run
    mocha.run();
    return;
  }

  // initialize mocha and expose global methods such as describe(), it()
  mocha.setup({
    ui: 'bdd',
    checkLeaks: true,
    timeout: 0,
    slow: 10000,
    grep: (() => {
      const query = new URL(location.href).searchParams;
      if (!query.get('grep') && !query.get('fgrep')) {
        const tests = suite.config["tests"];
        if (Array.isArray(tests)) {
          return tests.map(t => escapeRegExp(t)).join('|');
        }
        return tests;
      }
      return void(0);
    })(),
    noHighlighting: true,
  });

  // expose to global scope
  Object.assign(global, {
    localhost: suite.localhost,
    localhost2: suite.localhost2,
    capture: suite.capture.bind(suite),
    captureHeadless: suite.captureHeadless.bind(suite),
    openTestTab: suite.openTestTab.bind(suite),
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
