'use strict';

/******************************************************************************
 * Configs
 *****************************************************************************/

const baseOptions = {
  "capture.saveTo": "memory",
  "capture.saveAs": "zip",
  "capture.saveAsciiFilename": false,
  "capture.saveOverwrite": false,
  "capture.saveFileAsHtml": false,
  "capture.saveDataUriAsFile": true,
  "capture.saveDataUriAsSrcdoc": true,
  "capture.saveResourcesSequentially": false,
  "capture.resourceSizeLimit": null,
  "capture.image": "save",
  "capture.imageBackground": "save",
  "capture.favicon": "save",
  "capture.faviconAttrs": "",
  "capture.canvas": "save",
  "capture.audio": "save",
  "capture.video": "save",
  "capture.embed": "save",
  "capture.object": "save",
  "capture.applet": "save",
  "capture.frame": "save",
  "capture.frameRename": true,
  "capture.font": "save",
  "capture.style": "save",
  "capture.styleInline": "save",
  "capture.rewriteCss": "url",
  "capture.mergeCssResources": false,
  "capture.script": "save",
  "capture.noscript": "save",
  "capture.contentSecurityPolicy": "remove",
  "capture.preload": "remove",
  "capture.prefetch": "remove",
  "capture.base": "blank",
  "capture.formStatus": "keep",
  "capture.shadowDom": "save",
  "capture.removeHidden": "none",
  "capture.linkUnsavedUri": false,
  "capture.downLink.file.mode": "none",
  "capture.downLink.file.extFilter": "",
  "capture.downLink.doc.depth": null,
  "capture.downLink.doc.delay": null,
  "capture.downLink.doc.mode": "source",
  "capture.downLink.doc.urlFilter": "",
  "capture.downLink.urlFilter": "",
  "capture.downLink.urlExtra": "",
  "capture.referrerPolicy": "",
  "capture.referrerSpoofSource": false,
  "capture.recordDocumentMeta": true,
  "capture.recordRewrites": false,
  "capture.insertInfoBar": false,
  "capture.helpersEnabled": false,
  "capture.helpers": "",
  "capture.remoteTabDelay": null,
  "capture.deleteErasedOnCapture": false,
  "capture.deleteErasedOnSave": false,
};

const RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
const MAF = "http://maf.mozdev.org/metadata/rdf#";


/******************************************************************************
 * Helpers
 *****************************************************************************/

function assert(condition, message) {
  if (condition) { return; }
  throw new Error(message || "Assertion failed");
}

class TestSkipError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TestSkipError';
  }
}

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
      this.error(`Unable to connect to local server "${localhost}". Make sure the server has been started and the port is not occupied by another application.`);
      throw ex;
    }

    try {
      await xhr({url: localhost2, responseType: 'text'});
    } catch (ex) {
      this.error(`Unable to connect to local server "${localhost2}". Make sure the server has been started and the port is not occupied by another application.`);
      throw ex;
    }

    try {
      if (!await browser.runtime.sendMessage(config["wsb_extension_id"], {cmd: "ping"})) {
        throw new Error('ping failure');
      }
    } catch (ex) {
      this.error(`Unable to connect to the WebScrapBook extension with ID "${config["wsb_extension_id"]}". Make sure the extension is installed and its ID is correctly configured.`);
      throw ex;
    }
  }

  get wrapper() {
    const value = document.getElementsByTagName('pre')[0];
    Object.defineProperty(this, 'wrapper', {value});
    return value;
  }

  async runTests(prefixes = ['test_']) {
    this.testTotal = 0;
    this.testPass = 0;
    this.testSkipped = 0;

    const tests = Object.keys(globalThis).filter(x => prefixes.some(p => x.startsWith(p)));
    for (const t of tests) {
      await this.runTest(globalThis[t]);
    }

    const reportMethod = (this.testPass === this.testTotal) ? 'log' : 'error';
    const skippedMsg = this.testSkipped ? ` (skipped=${this.testSkipped})` : '';
    const reportMsg = `Tests pass/total: ${this.testPass}/${this.testTotal}${skippedMsg}`;
    this[reportMethod](reportMsg);
    this.log(`\n`);
  }

  async runAutomatedTests() {
    await this.runTests(this.config["automated_tests"]);
  }

  async runManualTests() {
    await this.runTests(this.config["manual_tests"]);
  }

  async runTest(fn) {
    this.testTotal += 1;
    this.log(`Testing: ${fn.name}... `);
    try {
      // pass
      await fn();
      this.testPass += 1;
      this.log(`pass`);
      this.log(`\n`);
    } catch(ex) {
      if (ex.name === 'TestSkipError') {
        // skipped
        this.testSkipped += 1;
        this.testTotal -= 1;
        const msg = ex.message ? ` (${ex.message})` : '';
        this.log(`skipped${msg}`);
        this.log(`\n`);
        return;
      }

      // fail
      console.error(ex);
      this.error(`fail`);
      this.log(`\n`);
    }
  }

  log(msg) {
    this.wrapper.appendChild(document.createTextNode(msg));
  }

  error(msg) {
    const elem = document.createElement('span');
    elem.classList.add('error');
    elem.textContent = msg;
    this.wrapper.appendChild(elem);
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
      throw new Error('Manual test does not pass');
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

    const blob = new Blob(result.data.map(x => byteStringToArrayBuffer(x)), {type: result.type});
    return blob;
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

async function main() {
  async function loadScript(src) {
    const p = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return p;
  }

  const mode = new URL(location.href).searchParams.get('m');

  let time = Date.now();
  const suite = new TestSuite();
  await suite.init();
  await loadScript('./test_auto.js');
  await loadScript('./test_manual.js');

  // export methods/properties to global scope
  Object.assign(globalThis, {
    localhost: suite.localhost,
    localhost2: suite.localhost2,
    capture: suite.capture.bind(suite),
    captureHeadless: suite.captureHeadless.bind(suite),
    openTestTab: suite.openTestTab.bind(suite),
  });

  if (mode == 1 || !mode) {
    await suite.log(`Starting automated tests...\n`);
    await suite.runAutomatedTests();
    suite.log(`\n`);
  }

  if (mode == 2 || !mode) {
    await suite.log(`Starting manual tests...\n`);
    await suite.runManualTests();
    suite.log(`\n`);
  }

  suite.log(`Done in ${(Date.now() - time) / 1000} seconds.`);
}

main();
