/********************************************************************
 *
 * The content script for capture functionality
 *
 * @require {Object} scrapbook
 *******************************************************************/

capturer.getFrameContent = function (frameElement, timeId, settings, options, callback) {
  var channel = new MessageChannel();
  var timeout = setTimeout(() => {
    callback(undefined);
    delete channel;
  }, 1000);
  frameElement.contentWindow.postMessage({
    extension: chrome.runtime.id,
    cmd: "capturer.captureDocumentOrFile",
    timeId: timeId,
    settings: settings,
    options: options
  }, "*", [channel.port2]);
  channel.port1.onmessage = (event) => {
    var message = event.data;
    if (message.extension !== chrome.runtime.id) { return; }
    if (message.timeId !== timeId) { return; }
    isDebug && console.debug("channel receive", event);
    
    if (message.cmd === "capturer.captureDocumentOrFile.start") {
      clearTimeout(timeout);
    } else if (message.cmd === "capturer.captureDocumentOrFile.complete") {
      callback(message.response);
      delete channel;
    }
  };
};

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

// isDebug && console.debug("loading content.js", frameUrl);
