'use strict';

var config;
var localhost;
var localhost2;
var testTotal = 0;
var testPass = 0;
var testSkipped = 0;

class TestSkipError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TestSkipError';
  }
}

var userAgent = (() => {
    const ua = navigator.userAgent;
    const manifest = browser.runtime.getManifest();
    const soup = new Set(['webext']);
    const flavor = {
      major: 0,
      soup: soup,
      is: (value) => soup.has(value),
    };

    // Whether this is a dev build.
    if (/^\d+\.\d+\.\d+\D/.test(browser.runtime.getManifest().version)) {
      soup.add('devbuild');
    }

    if (/\bMobile\b/.test(ua)) {
      soup.add('mobile');
    }

    // Synchronous -- order of tests is important
    let match;
    if ((match = /\bFirefox\/(\d+)/.exec(ua)) !== null) {
      flavor.major = parseInt(match[1], 10) || 0;
      soup.add('mozilla').add('firefox');
    } else if ((match = /\bEdge\/(\d+)/.exec(ua)) !== null) {
      flavor.major = parseInt(match[1], 10) || 0;
      soup.add('microsoft').add('edge');
    } else if ((match = /\bOPR\/(\d+)/.exec(ua)) !== null) {
      const reEx = /\bChrom(?:e|ium)\/([\d.]+)/;
      if (reEx.test(ua)) { match = reEx.exec(ua); }
      flavor.major = parseInt(match[1], 10) || 0;
      soup.add('opera').add('chromium');
    } else if ((match = /\bChromium\/(\d+)/.exec(ua)) !== null) {
      flavor.major = parseInt(match[1], 10) || 0;
      soup.add('chromium');
    } else if ((match = /\bChrome\/(\d+)/.exec(ua)) !== null) {
      flavor.major = parseInt(match[1], 10) || 0;
      soup.add('google').add('chromium');
    } else if ((match = /\bSafari\/(\d+)/.exec(ua)) !== null) {
      flavor.major = parseInt(match[1], 10) || 0;
      soup.add('apple').add('safari');
    }
    if (manifest.browser_specific_settings && manifest.browser_specific_settings.gecko) {
      soup.add('gecko');
    }
    return flavor;
})();

async function init() {
  let config1;
  let config2;
  try {
    const url = browser.runtime.getURL('config.json');
    config1 = JSON.parse((await xhr({url, responseType: 'text'})).response); 
  } catch (ex) {
    // pass
  }
  try {
    const url = browser.runtime.getURL('config.local.json');
    config2 = JSON.parse((await xhr({url, responseType: 'text'})).response); 
  } catch (ex) {
    // pass
  }
  config = Object.assign({}, config1, config2);

  localhost = `http://localhost${config["server_port"] === 80 ? "" : ":" + config["server_port"]}`;
  localhost2 = `http://localhost${config["server_port2"] === 80 ? "" : ":" + config["server_port2"]}`;

  try {
    await xhr({url: localhost, responseType: 'text'});
  } catch (ex) {
    error(`Unable to connect to local server "${localhost}". Make sure the server has been started and the port is not occupied by another application.`);
    throw ex;
  }

  try {
    await xhr({url: localhost2, responseType: 'text'});
  } catch (ex) {
    error(`Unable to connect to local server "${localhost2}". Make sure the server has been started and the port is not occupied by another application.`);
    throw ex;
  }

  try {
    if (!await browser.runtime.sendMessage(config["wsb_extension_id"], {cmd: "ping"})) {
      throw new Error('ping failure');
    }
  } catch (ex) {
    error(`Unable to connect to the WebScrapBook extension with ID "${config["wsb_extension_id"]}". Make sure the extension is installed and its ID is correctly configured.`);
    throw ex;
  }
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function waitTabLoading(tab) {
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

async function openTab(createProperties) {
  const tab = await browser.tabs.create(createProperties);
  return await waitTabLoading(tab);
}

async function openCapturerTab(url) {
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
  if (userAgent.is('gecko')) {
    delete params.focused;
  }

  const win = await browser.windows.create(params);
  const tab = win.tabs[0];
  return await waitTabLoading(tab);
}

/**
 * Open a tab with connection for test.
 *
 * @param {func} handler - Return a boolean indicating the test pass or not.
 */
async function openTestTab(createProperties, handler) {
  const tab = await openTab(createProperties);
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
async function capture(params, options = {}) {
  const {headless = false, delay: delayTime} = options;
  const pageTab = !headless && await openCapturerTab(params.url);

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
  if (userAgent.is('gecko')) {
    delete windowCreateData.focused;
  }

  const args = {
    taskInfo: {
      tasks: [!headless ? Object.assign({tabId: pageTab.id}, params) : params],
    },
    windowCreateData,
    waitForResponse: true,
  };

  const response = await browser.runtime.sendMessage(config["wsb_extension_id"], {
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
async function captureHeadless(params, options = {}) {
  return await capture(
    Object.assign({mode: "source"}, params),
    Object.assign(options, {headless: true}),
  );
}

function readFileAsArrayBuffer(blob) {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = resolve;
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  }).then((event) => {
    return event.target.result;
  });
}

async function readFileAsText(blob, charset = "UTF-8") {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = resolve;
    reader.onerror = reject;
    reader.readAsText(blob, charset);
  }).then((event) => {
    return event.target.result;
  });
}

async function readFileAsDataURL(blob) {
  return new Promise((resolve, reject) => {
    let reader = new FileReader();
    reader.onload = resolve;
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  }).then((event) => {
    return event.target.result;
  });
}

async function readFileAsDocument(blob) {
  return xhr({
    url: URL.createObjectURL(blob),
    responseType: "document",
  }).then((xhr) => {
    return xhr.response;
  });
}

async function xhr(params = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    if (params.onreadystatechange) {
      xhr.onreadystatechange = function (event) {
        params.onreadystatechange(xhr);
      };
    }

    xhr.onload = function (event) {
      if (xhr.status == 200 || xhr.status == 0) {
        // we only care about real loading success
        resolve(xhr);
      } else {
        // treat "404 Not found" or so as error
        let statusText = xhr.statusText;
        statusText = xhr.status + (statusText ? " " + statusText : "");
        reject(new Error(statusText));
      }
    };

    xhr.onabort = function (event) {
      // resolve with no param
      resolve();
    };

    xhr.onerror = function (event) {
      // No additional useful information can be get from the event object.
      reject(new Error("Network request failed."));
    };

    xhr.ontimeout = function (event) {
      reject(new Error("Request timeout."));
    };

    xhr.responseType = params.responseType;
    xhr.open("GET", params.url, true);

    if (params.timeout) { xhr.timeout = params.timeout; }

    xhr.send();
  });
}

async function test(fn) {
  testTotal += 1;
  log(`Testing: ${fn.name}... `);
  try {
    // pass
    await fn();
    testPass += 1;
    log(`pass`);
    log(`\n`);
  } catch(ex) {
    if (ex.name === 'TestSkipError') {
      // skipped
      testSkipped += 1;
      testTotal -= 1;
      const msg = ex.message ? ` (${ex.message})` : '';
      log(`skipped${msg}`);
      log(`\n`);
      return;
    }

    // fail
    console.error(ex);
    error(`fail`);
    log(`\n`);
  }
}

async function showTestResult() {
  const reportMethod = (testPass === testTotal) ? log : error;
  const skippedMsg = testSkipped ? ` (skipped=${testSkipped})` : '';
  reportMethod(`Tests pass/total: ${testPass}/${testTotal}${skippedMsg}`);
  log(`\n`);
}

function log(msg) {
  document.getElementsByTagName('pre')[0].appendChild(document.createTextNode(msg));
}

function error(msg) {
  const elem = document.createElement('span');
  elem.classList.add('error');
  elem.textContent = msg;
  document.getElementsByTagName('pre')[0].appendChild(elem);
}

function assert(condition, message) {
  if (!condition) {
    message = message || "Assertion failed";
    throw new Error(message);
  }
}

function sha1(data, type) {
  let shaObj = new jsSHA("SHA-1", type);
  shaObj.update(data);
  return shaObj.getHash("HEX");
}

function getToken(url, role) {
  let token = `${url}\t${role}`;
  token = sha1(token, "TEXT");
  return token;
}

function getUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    let r = Math.random()*16|0, v = (c == 'x') ? r : (r&0x3|0x8);
    return v.toString(16);
  });
}

function byteStringToArrayBuffer(bstr) {
  let n = bstr.length, u8ar = new Uint8Array(n);
  while (n--) { u8ar[n] = bstr.charCodeAt(n); }
  return u8ar.buffer;
}

async function getRulesFromCssText(cssText) {
  const d = document.implementation.createHTMLDocument('');
  const styleElem = d.createElement('style');
  styleElem.textContent = cssText;
  d.head.appendChild(styleElem);

  await delay(0);

  return styleElem.sheet.cssRules;
}

function escapeRegExp(str) {
  // Don't escape "-" as it causes an error for a RegExp with unicode flag.
  // Escaping "-" allows the result be embedded in a character class.
  // Escaping "/" allows the result be embedded in a JS regex literal.
  const regex = /[/\\^$*+?.|()[\]{}]/g;
  const fn = window.escapeRegExp = (str) => {
    return str.replace(regex, "\\$&");
  };
  return fn(str);
}

/**
 * A RegExp with raw string.
 *
 * This is similar to /.../ but allows "/".
 *
 * Usage:
 *     regex`^text/html$` === /^text\/html$/
 */
function regex(strings, ...args) {
  const results = [strings.raw[0]];
  args.forEach((arg, i) => {
    results.push(String(arg));
    results.push(strings.raw[i + 1]);
  });
  return new RegExp(results.join(''));
}

/**
 * A RegExp with literal string and optional interpolated RegExp source fragments.
 *
 * Usage:
 *     rawRegex`${'^'}(function () {${'.+'}})()${'$'}` === /^\(function \(\) \{.+\}\)\(\)$/
 */
function rawRegex(strings, ...args) {
  const results = [escapeRegExp(strings.raw[0])];
  args.forEach((arg, i) => {
    if (arg instanceof RegExp) {
      results.push(arg.source);
    } else {
      results.push(String(arg));
    }
    results.push(escapeRegExp(strings.raw[i + 1]));
  });
  return new RegExp(results.join(''));
}

/**
 * A RegExp with raw CSS string with permissive spacing and optional
 * interpolated RegExp source fragments.
 *
 * Usage:
 *     cssRegex`body { background: ${/\w+/} }` === /body\s*\{\s*background:\s*\w+\s*\}/
 */
function cssRegex(strings, ...args) {
  const permissiveSpacing = (s) => s.split(/\s+/).map(s => escapeRegExp(s)).join('\\s*');
  const results = [permissiveSpacing(strings.raw[0])];
  args.forEach((arg, i) => {
    if (arg instanceof RegExp) {
      results.push(arg.source);
    } else {
      results.push(String(arg));
    }
    results.push(permissiveSpacing(strings.raw[i + 1]));
  });
  return new RegExp(results.join(''));
}
