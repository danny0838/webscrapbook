var config;
var messagePort;
var localhost;
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
  document.body.innerHTML = "";
}

async function capture(params) {
  const result = await invoke('capture', params);
  const blob = new Blob([byteStringToArrayBuffer(result.data)], {type: result.type});
  return blob;
}

async function captureHeadless(params) {
  const result = await invoke('captureHeadless', params);
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
  log(`Done.`);
}

function log(msg) {
  document.body.appendChild(document.createTextNode(msg));
}

function error(msg) {
  const elem = document.createElement('span');
  elem.classList.add('error');
  elem.textContent = msg;
  document.body.appendChild(elem);
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
