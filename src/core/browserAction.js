/********************************************************************
 *
 * Script for browserAction.html
 *
 * @require {Object} scrapbook
 *******************************************************************/

document.addEventListener('DOMContentLoaded', () => {
  // load languages
  scrapbook.loadLanguages(document);

  const generateActionButtonForTabs = function (base, action) {
    let selector = base.nextSibling;
    if (selector && selector.nodeType === 1) {
      while (selector.firstChild) { selector.firstChild.remove(); }
    } else {
      selector = document.createElement("div");
      base.parentNode.insertBefore(selector, base.nextSibling);
    }
    capturer.getContentTabs().then((tabs) => {
      tabs.forEach((tab) => {
        let elem = document.createElement("button");
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
  };

  chrome.tabs.getCurrent((currentTab) => {
    // currentTab === undefined => browserAction.html is a prompt diaglog;
    //     else browserAction.html is in a tab (or Firefox Android)
    if (!currentTab) {
      // clear badge
      capturer.invoke("browserActionSetError", {action: "reset"});

      // disable capture options if active tab is not a valid content page
      browser.tabs.query({active: true, currentWindow: true}).then((tabs) => {
        let activeTab = tabs[0];
        return browser.extension.isAllowedFileSchemeAccess().then((isAllowedFileSchemeAccess) => {
          if (!scrapbook.isContentPage(activeTab.url, isAllowedFileSchemeAccess)) {
            document.getElementById("captureTab").disabled = true;
            document.getElementById("captureTabSource").disabled = true;
            document.getElementById("captureTabBookmark").disabled = true;
          }
        });
      });
    }

    document.getElementById("captureTab").addEventListener('click', () => {
      if (!currentTab) {
        capturer.invoke("captureActiveTab", {mode: "document"});
        window.close();
      } else {
        generateActionButtonForTabs(document.getElementById("captureTab"), (tab) => {
          capturer.invoke("captureTab", {tab: tab, mode: "document"});
        });
      }
    });

    document.getElementById("captureTabSource").addEventListener('click', () => {
      if (!currentTab) {
        capturer.invoke("captureActiveTab", {mode: "source"});
        window.close();
      } else {
        generateActionButtonForTabs(document.getElementById("captureTabSource"), (tab) => {
          capturer.invoke("captureTab", {tab: tab, mode: "source"});
        });
      }
    });

    document.getElementById("captureTabBookmark").addEventListener('click', () => {
      if (!currentTab) {
        capturer.invoke("captureActiveTab", {mode: "bookmark"});
        window.close();
      } else {
        generateActionButtonForTabs(document.getElementById("captureTabBookmark"), (tab) => {
          capturer.invoke("captureTab", {tab: tab, mode: "bookmark"});
        });
      }
    });

    document.getElementById("captureAllTabs").addEventListener('click', () => {
      capturer.invoke("captureAllTabs", {mode: "document"});
      if (!currentTab) {
        window.close();
      }
    });

    document.getElementById("openViewer").addEventListener('click', () => {
      if (!currentTab) {
        chrome.tabs.create({url: chrome.runtime.getURL("viewer/viewer.html"), active: true}, () => {});
        window.close();
      } else {
        document.location = chrome.runtime.getURL("viewer/viewer.html");
      }
    });

    document.getElementById("openOptions").addEventListener('click', () => {
      if (!currentTab) {
        chrome.tabs.create({url: chrome.runtime.getURL("core/options.html"), active: true}, () => {});
        window.close();
      } else {
        document.location = chrome.runtime.getURL("core/options.html");
      }
    });
  });
});
