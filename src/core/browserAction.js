/********************************************************************
 *
 * Script for browserAction.html
 *
 * @require {Object} scrapbook
 *******************************************************************/

document.addEventListener('DOMContentLoaded', () => {
  // load languages
  scrapbook.loadLanguages(document);

  var generateActionButtonForTabs = function (base, action) {
    let selector = base.nextSibling;
    if (selector && selector.nodeType === 1) {
      while (selector.firstChild) { selector.firstChild.remove(); }
    } else {
      selector = document.createElement("div");
      base.parentNode.insertBefore(selector, base.nextSibling);
    }
    chrome.extension.isAllowedFileSchemeAccess((isAllowedAccess) => {
      let urlMatch = ["http://*/*", "https://*/*", "ftp://*/*"];
      if (isAllowedAccess) { urlMatch.push("file://*"); }
      chrome.tabs.query({
        currentWindow: true,
        url: urlMatch
      }, (tabs) => {
        tabs.forEach((tab) => {
          let elem = document.createElement("div");
          elem.classList.add("button");
          elem.classList.add("sub");
          elem.textContent = (tab.index + 1) + ": " + tab.title;
          elem.addEventListener('click', (event) => {
            event.preventDefault;
            event.stopPropagation;
            action(tab);
            selector.remove();
          });
          selector.appendChild(elem);
        });
      });
    });
  };

  chrome.tabs.getCurrent((currentTab) => {
    document.getElementById("captureTab").addEventListener('click', () => {
      if (!currentTab) {
        // browserAction.html is a prompt diaglog
        var win = chrome.extension.getBackgroundPage();
        win.capturer.captureActiveTab();
        window.close();
      } else {
        // browserAction.html is in a tab (or Firefox Android)
        generateActionButtonForTabs(document.getElementById("captureTab"), (tab) => {
          var win = chrome.extension.getBackgroundPage();
          win.capturer.captureTab(tab);
        });
      }
    });

    document.getElementById("captureTabSource").addEventListener('click', () => {
      if (!currentTab) {
        // browserAction.html is a prompt diaglog
        var win = chrome.extension.getBackgroundPage();
        win.capturer.captureActiveTabSource();
        window.close();
      } else {
        // browserAction.html is in a tab (or Firefox Android)
        generateActionButtonForTabs(document.getElementById("captureTabSource"), (tab) => {
          var win = chrome.extension.getBackgroundPage();
          win.capturer.captureTabSource(tab);
        });
      }
    });

    document.getElementById("captureTabBookmark").addEventListener('click', () => {
      if (!currentTab) {
        // browserAction.html is a prompt diaglog
        var win = chrome.extension.getBackgroundPage();
        win.capturer.captureActiveTabBookmark();
        window.close();
      } else {
        // browserAction.html is in a tab (or Firefox Android)
        generateActionButtonForTabs(document.getElementById("captureTabBookmark"), (tab) => {
          var win = chrome.extension.getBackgroundPage();
          win.capturer.captureTabBookmark(tab);
        });
      }
    });

    document.getElementById("captureAllTabs").addEventListener('click', () => {
      var win = chrome.extension.getBackgroundPage();
      win.capturer.captureAllTabs();
      if (!currentTab) {
        // browserAction.html is a prompt diaglog
        window.close();
      }
    });

    document.getElementById("openViewer").addEventListener('click', () => {
      if (!currentTab) {
        // browserAction.html is a prompt diaglog
        chrome.tabs.create({url: chrome.runtime.getURL("viewer/viewer.html"), active: true}, () => {});
        window.close();
      } else {
        // browserAction.html is in a tab (or Firefox Android)
        document.location = chrome.runtime.getURL("viewer/viewer.html");
      }
    });

    document.getElementById("openOptions").addEventListener('click', () => {
      if (!currentTab) {
        // browserAction.html is a prompt diaglog
        chrome.tabs.create({url: chrome.runtime.getURL("core/options.html"), active: true}, () => {});
        window.close();
      } else {
        // browserAction.html is in a tab (or Firefox Android)
        document.location = chrome.runtime.getURL("core/options.html");
      }
    });
  });
});
