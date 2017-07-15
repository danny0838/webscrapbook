/********************************************************************
 *
 * Script for browserAction.html
 *
 *******************************************************************/

document.addEventListener('DOMContentLoaded', () => {
  // load languages
  scrapbook.loadLanguages(document);

  document.getElementById("captureTab").addEventListener('click', () => {
    chrome.tabs.getCurrent((tab) => {
      if (!tab) {
        // browserAction.html is a prompt diaglog
        var win = chrome.extension.getBackgroundPage();
        win.capturer.captureActiveTab();
        window.close();
      } else {
        // browserAction.html is in a tab (or Firefox Android)
        let base = document.getElementById("captureTab");
        let selector = base.nextSibling;
        if (selector && selector.nodeType === 1) {
          while (selector.firstChild) { selector.firstChild.remove(); }
        } else {
          selector = document.createElement("div");
          base.parentNode.insertBefore(selector, base.nextSibling);
        }
        chrome.tabs.query({
          windowId: chrome.windows ? chrome.windows.WINDOW_ID_CURRENT : undefined,
          url: ["http://*/*", "https://*/*", "file://*"]
        }, (tabs) => {
          tabs.forEach((tab) => {
            let elem = document.createElement("div");
            elem.classList.add("button");
            elem.classList.add("sub");
            elem.textContent = (tab.index + 1) + ": " + tab.title;
            elem.addEventListener('click', (event) => {
              event.preventDefault;
              event.stopPropagation;
              var win = chrome.extension.getBackgroundPage();
              win.capturer.captureTab(tab);
              selector.remove();
            });
            selector.appendChild(elem);
          });
        });
      }
    });
  });

  document.getElementById("captureTabSource").addEventListener('click', () => {
    chrome.tabs.getCurrent((tab) => {
      if (!tab) {
        // browserAction.html is a prompt diaglog
        var win = chrome.extension.getBackgroundPage();
        win.capturer.captureActiveTabSource();
        window.close();
      } else {
        // browserAction.html is in a tab (or Firefox Android)
        let base = document.getElementById("captureTabSource");
        let selector = base.nextSibling;
        if (selector && selector.nodeType === 1) {
          while (selector.firstChild) { selector.firstChild.remove(); }
        } else {
          selector = document.createElement("div");
          base.parentNode.insertBefore(selector, base.nextSibling);
        }
        chrome.tabs.query({
          windowId: chrome.windows ? chrome.windows.WINDOW_ID_CURRENT : undefined,
          url: ["http://*/*", "https://*/*", "file://*"]
        }, (tabs) => {
          tabs.forEach((tab) => {
            let elem = document.createElement("div");
            elem.classList.add("button");
            elem.classList.add("sub");
            elem.textContent = (tab.index + 1) + ": " + tab.title;
            elem.addEventListener('click', (event) => {
              event.preventDefault;
              event.stopPropagation;
              var win = chrome.extension.getBackgroundPage();
              win.capturer.captureTabSource(tab);
              selector.remove();
            });
            selector.appendChild(elem);
          });
        });
      }
    });
  });

  document.getElementById("captureAllTabs").addEventListener('click', () => {
    var win = chrome.extension.getBackgroundPage();
    win.capturer.captureAllTabs();
    chrome.tabs.getCurrent((tab) => {
      if (!tab) {
        // browserAction.html is a prompt diaglog
        window.close();
      }
    });
  });

  document.getElementById("openOptions").addEventListener('click', () => {
    chrome.tabs.getCurrent((tab) => {
      if (!tab) {
        // browserAction.html is a prompt diaglog
        window.open(chrome.runtime.getURL("core/options.html"));
        window.close();
      } else {
        // browserAction.html is in a tab (or Firefox Android)
        document.location = chrome.runtime.getURL("core/options.html");
      }
    });
  });
});
