/********************************************************************
 *
 * The content script for capture functionality
 *
 * @require {boolean} isDebug
 * @require {Object} scrapbook
 * @require {Object} capturer
 *******************************************************************/

((window, document, browser) => {

window.addEventListener("message", (event) => {
  const message = event.data;
  if (message.extension !== browser.runtime.id) { return; }
  isDebug && console.debug(message.cmd, "frame window receive", message.args);

  if (message.cmd.slice(0, 9) == "capturer.") {
    let fn = capturer[message.cmd.slice(9)];
    if (fn) {
      event.ports[0].postMessage({
        extension: browser.runtime.id,
        uid: message.uid,
        cmd: message.cmd + ".start"
      });
      fn(message.args).then((response) => {
        event.ports[0].postMessage({
          extension: browser.runtime.id,
          uid: message.uid,
          cmd: message.cmd + ".complete",
          response,
        });
      });
    }
  }
}, false);

browser.runtime.onMessage.addListener((message, sender) => {
  isDebug && console.debug(message.cmd, "receive", message.args);

  if (message.cmd.slice(0, 9) == "capturer.") {
    let fn = capturer[message.cmd.slice(9)];
    if (fn) {
      return fn(message.args);
    }
  }
});

})(this, this.document, this.browser);
