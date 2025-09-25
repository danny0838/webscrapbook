chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  const {cmd: msgCmd, args: msgArgs} = message;
  switch (msgCmd) {
    case "ping": {
      sendResponse(true);
      return true;
    }
    case "sendExternalMessage": {
      const id = sender.id;
      const [{cmd, args}] = msgArgs;
      chrome.runtime.sendMessage(id, {cmd, args}, sendResponse);
      return true;
    }
  }
  sendResponse(undefined);
  return false;
});
