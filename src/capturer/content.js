/********************************************************************
 *
 * The content script for capture functionality
 *
 * @require {boolean} isDebug
 * @require {Object} scrapbook
 * @require {Object} capturer
 *******************************************************************/

window.addEventListener("message", (event) => {
  var message = event.data;
  if (message.extension !== chrome.runtime.id) { return; }
  isDebug && console.debug("content window receive", event);

  if (message.cmd === "capturer.captureDocumentOrFile") {
    event.ports[0].postMessage({
      extension: chrome.runtime.id,
      cmd: "capturer.captureDocumentOrFile.start",
      timeId: message.timeId
    });
    capturer.captureDocumentOrFile(document, message.settings, message.options, (response) => {
      event.ports[0].postMessage({
        extension: chrome.runtime.id,
        cmd: "capturer.captureDocumentOrFile.complete",
        timeId: message.timeId,
        response: response
      });
    });
  }
}, false);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  isDebug && console.debug(message.cmd + " receive", message, sender);

  if (message.cmd === "capturer.captureDocumentOrFile") {
    capturer.captureDocumentOrFile(document, message.settings, message.options, (response) => {
      sendResponse(response);
    });
    return true; // async response
  }
});
