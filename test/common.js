var config;
var localhost;
var localhost2;
var wsbBaseUrl;
var testTotal = 0;
var testPass = 0;

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
    const response = await browser.runtime.sendMessage(config["wsb_extension_id"], {cmd: 'getBaseUrl'});
    wsbBaseUrl = response.url;
  } catch (ex) {
    error(`Unable to invoke WebScrapBook extension. Make sure it's installed and its extension ID is correctly set in config.local.json.`);
    throw ex;
  }
}

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function openTab(createProperties) {
  const tab = await browser.tabs.create(createProperties);
  return new Promise((resolve, reject) => {
    const listener = (tabId, changeInfo, t) => {
      if (!(tabId === tab.id && changeInfo.status === 'complete')) { return; }
      browser.tabs.onUpdated.removeListener(listener);
      browser.tabs.onRemoved.removeListener(listener2);
      resolve(t);
    };
    const listener2 = (tabId, removeInfo) => {
      if (!(tabId === tab.id)) { return; }
      browser.tabs.onUpdated.removeListener(listener);
      browser.tabs.onRemoved.removeListener(listener2);
      reject({message: `Tab removed before loading complete.`});
    };
    browser.tabs.onUpdated.addListener(listener);
    browser.tabs.onRemoved.addListener(listener2);
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

  const result = await new Promise(async (resolve, reject) => {
    const port = browser.runtime.connect(config["wsb_extension_id"], {name: id});
    const onDisconnect = () => {
      reject(new Error(`Page tab disconnected.`));
    };
    port.onDisconnect.addListener(onDisconnect);

    try {
      await new Promise((resolve, reject) => {
        const onMessage = (message) => {
          if (message.cmd === 'capturerReady') {
            port.onMessage.removeListener(onMessage);
            resolve();
          }
        };
        port.onMessage.addListener(onMessage);
      });

      const response = await new Promise((resolve, reject) => {
        const onMessage = (message) => {
          if (message.cmd === 'captureResponse') {
            port.onMessage.removeListener(onMessage);
            const response = message.args;
            if (response.error) {
              reject(response.error);
            } else {
              resolve(response);
            }
          }
        };
        port.onMessage.addListener(onMessage);
        port.postMessage({
          cmd: "capturer.captureTab",
          args: Object.assign({tabId: pageTab.id}, params),
        });
      });

      resolve(response);
    } catch (ex) {
      reject(ex);
    }

    port.onDisconnect.removeListener(onDisconnect);
    port.disconnect();
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

  const result = await new Promise(async (resolve, reject) => {
    const port = browser.runtime.connect(config["wsb_extension_id"], {name: id});
    const onDisconnect = () => {
      reject(new Error(`Page tab disconnected.`));
    };
    port.onDisconnect.addListener(onDisconnect);

    try {
      await new Promise((resolve, reject) => {
        const onMessage = (message) => {
          if (message.cmd === 'capturerReady') {
            port.onMessage.removeListener(onMessage);
            resolve();
          }
        };
        port.onMessage.addListener(onMessage);
      });

      const response = await new Promise((resolve, reject) => {
        const onMessage = (message) => {
          if (message.cmd === 'captureResponse') {
            port.onMessage.removeListener(onMessage);
            const response = message.args;
            if (response.error) {
              reject(response.error);
            } else {
              resolve(response);
            }
          }
        };
        port.onMessage.addListener(onMessage);
        port.postMessage({
          cmd: "capturer.captureHeadless",
          args: params,
        });
      });

      resolve(response);
    } catch (ex) {
      reject(ex);
    }

    port.onDisconnect.removeListener(onDisconnect);
    port.disconnect();
  });

  await browser.tabs.remove(capturerTab.id);

  const blob = new Blob([byteStringToArrayBuffer(result.data)], {type: result.type});
  return blob;
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
