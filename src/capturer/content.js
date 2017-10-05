/********************************************************************
 *
 * The content script for capture functionality
 *
 * @require {boolean} isDebug
 * @require {Object} scrapbook
 * @require {Object} capturer
 *******************************************************************/

window.addEventListener("message", (event) => {
  const message = event.data;
  if (message.extension !== chrome.runtime.id) { return; }
  isDebug && console.debug(message.cmd, "frame window receive", message.args);

  if (message.cmd.slice(0, 9) == "capturer.") {
    let fn = capturer[message.cmd.slice(9)];
    if (fn) {
      event.ports[0].postMessage({
        extension: chrome.runtime.id,
        uid: message.uid,
        cmd: message.cmd + ".start"
      });
      fn(message.args).then((response) => {
        event.ports[0].postMessage({
          extension: chrome.runtime.id,
          uid: message.uid,
          cmd: message.cmd + ".complete",
          response: response
        });
      });
    }
  }
}, false);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  isDebug && console.debug(message.cmd, "receive", message.args);

  if (message.cmd.slice(0, 9) == "capturer.") {
    let fn = capturer[message.cmd.slice(9)];
    if (fn) {
      fn(message.args).then((response) => {
        sendResponse(response);
      });
      return true; // async response
    }
  }
});


true; // return value of executeScript
