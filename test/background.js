chrome.browserAction.onClicked.addListener(() => {
  const url = chrome.runtime.getURL("test.html");
  chrome.tabs.create({url});
});
