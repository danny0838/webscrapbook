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

/**
 * Simple assertion that outputs the error to the console for later tracing.
 */
function assert(condition, message) {
  if (condition) { return; }
  const err = new Error(message || "Assertion failed");
  console.error(err);
  throw err;
}

function itSkip(reason) {
  return (title, callback) => {
    const t = `${title} - skipped${reason ? ' (' + reason + ')' : ''}`;
    xit(t, callback);
  };
}

function itSkipIf(cond, reason) {
  if (!cond) {
    return it;
  }
  return itSkip(reason);
}

function itSkipIfNoMultipleSelection(reason = 'multiple selection not supported') {
  const sel = document.getSelection();

  const origCount = sel.rangeCount;
  if (origCount > 1) {
    return it;
  }

  const origRanges = [];
  for (let i = 0; i < origCount; i++) {
    origRanges.push(sel.getRangeAt(i));
  }

  const dummyTextNode = document.createTextNode('dummy');
  try {
    document.body.appendChild(dummyTextNode);

    let range = document.createRange();
    range.setStart(dummyTextNode, 0);
    range.setEnd(dummyTextNode, 1);
    sel.addRange(range);

    range = document.createRange();
    range.setStart(dummyTextNode, 2);
    range.setEnd(dummyTextNode, 3);
    sel.addRange(range);

    if (sel.rangeCount <= 1) {
      return itSkip(reason);
    }
  } finally {
    sel.removeAllRanges();
    for (let i = 0; i < origCount; i++) {
      sel.addRange(origRanges[i]);
    }
    dummyTextNode.remove();
  }

  return it;
}

function itSkipIfNoAdoptedStylesheet(reason = 'Document.adoptedStyleSheets not supported') {
  // Document.adoptedStyleSheets is not supported by Firefox < 101.
  if (!document.adoptedStyleSheets) {
    return itSkip(reason);
  }
  return it;
}

function itSkipIfNoNestingCss(reason = 'CSS nesting not supported') {
  // CSS nesting selector is supported in Firefox >= 117 and Chromium >= 120.
  try {
    // Chrome 109/110 gets null for the querySelector
    if (!document.querySelector('&')) {
      throw new Error('bad support');
    }
  } catch (ex) {
    return itSkip(reason);
  }
  return it;
}

function itSkipIfNoIsPseudo(reason = ':is() CSS pseudo-class not supported') {
  // :is() CSS pseudo-class is supported in Firefox >= 78 and Chromium >= 88.
  try {
    document.querySelector(':is()');
  } catch (ex) {
    return itSkip(reason);
  }
  return it;
}

function itSkipIfNoHostContextPseudo(reason = ':host-context() CSS pseudo-class not supported') {
  // :host-context() not suported in some browsers (e.g. Firefox)
  try {
    document.querySelector(':host-context(*)');
  } catch (ex) {
    return itSkip(reason);
  }
  return it;
}

function itSkipIfNoAtCounterStyle(reason = '@counter-style CSS rule not supported') {
  const d = document.implementation.createHTMLDocument();
  const style = d.head.appendChild(d.createElement('style'));
  style.textContent = '@counter-style my { symbols: "1"; }';
  if (!style.sheet.cssRules.length) {
    return itSkip(reason);
  }
  return it;
}

function itSkipIfNoAtLayer(reason = '@layer CSS rule not supported') {
  const d = document.implementation.createHTMLDocument();
  const style = d.head.appendChild(d.createElement('style'));
  style.textContent = '@layer mylayer;';
  if (!style.sheet.cssRules.length) {
    return itSkip(reason);
  }
  return it;
}

function itXfail(reason) {
  return (title, callback) => {
    const titleRewritten = `${title} - expected failure${reason ? ' (' + reason + ')' : ''}`;
    const callbackRewritten = async function (...args) {
      try {
        await callback.call(this, ...args);
      } catch (ex) {
        return;
      }
      throw new Error('unexpected success');
    };
    callbackRewritten.toString = () => callback.toString();
    it(titleRewritten, callbackRewritten);
  };
}

function itXfailIf(cond, reason) {
  if (!cond) {
    return it;
  }
  return itXfail(reason);
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
  });

  // expose to global scope
  Object.assign(globalThis, {
    baseOptions,
    RDF,
    MAF,

    assert,
    itSkip,
    itSkipIf,
    itSkipIfNoMultipleSelection,
    itSkipIfNoAdoptedStylesheet,
    itSkipIfNoNestingCss,
    itSkipIfNoIsPseudo,
    itSkipIfNoHostContextPseudo,
    itSkipIfNoAtCounterStyle,
    itSkipIfNoAtLayer,
    itXfail,
    itXfailIf,

    localhost: suite.localhost,
    localhost2: suite.localhost2,
    capture: suite.capture.bind(suite),
    captureHeadless: suite.captureHeadless.bind(suite),
    openTestTab: suite.openTestTab.bind(suite),
  });

  // import all tests
  await import('./test_auto.js');
  await import('./test_manual.js');

  mocha.run();
})();
