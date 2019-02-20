var config;
var messagePort;
var localhost;
var wsbBaseUrl;
var testTotal = 0;
var testPass = 0;

async function init() {
  let config1;
  let config2;
  try {
    const url = chrome.runtime.getURL('config.json');
    config1 = JSON.parse((await xhr({url, responseType: 'text'})).response); 
  } catch (ex) {
    // pass
  }
  try {
    const url = chrome.runtime.getURL('config.local.json');
    config2 = JSON.parse((await xhr({url, responseType: 'text'})).response); 
  } catch (ex) {
    // pass
  }
  config = Object.assign({}, config1, config2);

  messagePort = chrome.runtime.connect(config["wsb_extension_id"], {name: config["wsb_message_port_name"]});
  localhost = `http://localhost${config["server_port"] === 80 ? "" : ":" + config["server_port"]}`;
  wsbBaseUrl = `${(await invoke('getBaseUrl')).url}`;
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function openTab(createProperties) {
  const tab = await browser.tabs.create(createProperties);
  return new Promise((resolve, reject) => {
    const listener = (tabId, changeInfo, t) => {
      if (!(tabId === tab.id && changeInfo.status === 'complete')) { return; }
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.tabs.onRemoved.removeListener(listener2);
      resolve(t);
    };
    const listener2 = (tabId, removeInfo) => {
      if (!(tabId === tab.id)) { return; }
      chrome.tabs.onUpdated.removeListener(listener);
      chrome.tabs.onRemoved.removeListener(listener2);
      reject({message: `Tab removed before loading complete.`});
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.onRemoved.addListener(listener2);
  });
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
        wsbBaseUrl,
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
 *     - {string} params.url
 *     - {Object} params.options
 */
async function capture(params) {
  const id = getUuid();

  const [pageTab, capturerTab] = await Promise.all([
    openTab({
      url: params.url,
      active: false,
    }),
    openTab({
      url: `${wsbBaseUrl}capturer/capturer.html?mid=${id}`,
      active: false,
    }),
  ]);

  // wait for the capturer init to complete
  // so that the message can be received
  await delay(50);

  const result = await invoke('relayMessage', {
    cmd: "capturer.captureTab",
    args: Object.assign({tabId: pageTab.id, settings: {missionId: id}}, params),
  });

  await Promise.all([
    browser.tabs.remove(pageTab.id),
    browser.tabs.remove(capturerTab.id),
  ]);

  const blob = new Blob([byteStringToArrayBuffer(result.data)], {type: result.type});
  return blob;
}

/**
 * @param {Object} params
 *     - {string} params.url
 *     - {Object} params.options
 */
async function captureHeadless(params) {
  const id = getUuid();

  const capturerTab = await openTab({
    url: `${wsbBaseUrl}capturer/capturer.html?mid=${id}`,
    active: false,
  });

  // wait for the capturer init to complete
  // so that the message can be received
  await delay(50);

  const result = await invoke('relayMessage', {
    cmd: "capturer.captureHeadless",
    args: Object.assign({settings: {missionId: id}}, params),
  });

  await browser.tabs.remove(capturerTab.id);

  const blob = new Blob([byteStringToArrayBuffer(result.data)], {type: result.type});
  return blob;
}

async function invoke(cmd, args) {
  return new Promise((resolve, reject) => {
    const id = getUuid();
    const message = {id, cmd, args};
    const listener = (message, port) => {
      if (message.id !== id) { return; }
      port.onMessage.removeListener(listener);
      if (message.error) {
        reject(message.error);
      } else {
        resolve(message.response);
      }
    };
    messagePort.onMessage.addListener(listener);
    messagePort.postMessage(message);
  });
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
        let statusText = xhr.statusText || scrapbook.httpStatusText[xhr.status];
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
    await fn();
    testPass += 1;
    log(`pass`);
    log(`\n`);
  } catch(ex) {
    console.error(ex);
    error(`fail`);
    log(`\n`);
  }
}

async function showTestResult() {
  const reportMethod = (testPass === testTotal) ? log : error;
  reportMethod(`Tests pass/total: ${testPass}/${testTotal}`);
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
