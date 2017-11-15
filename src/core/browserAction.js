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

  const visitLink = function (url, target = null) {
    const a = visitLink.anchor = visitLink.anchor || document.createElement('a');
    a.href = url;
    if (target) { a.target = target; }
    document.body.appendChild(a);
    a.click();
    a.remove();
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
      } else {
        generateActionButtonForTabs(document.getElementById("captureTab"), (tab) => {
          capturer.invoke("captureTab", {tab, mode: "document"});
        });
      }
    });

    document.getElementById("captureTabSource").addEventListener('click', () => {
      if (!currentTab) {
        capturer.invoke("captureActiveTab", {mode: "source"});
      } else {
        generateActionButtonForTabs(document.getElementById("captureTabSource"), (tab) => {
          capturer.invoke("captureTab", {tab, mode: "source"});
        });
      }
    });

    document.getElementById("captureTabBookmark").addEventListener('click', () => {
      if (!currentTab) {
        capturer.invoke("captureActiveTab", {mode: "bookmark"});
      } else {
        generateActionButtonForTabs(document.getElementById("captureTabBookmark"), (tab) => {
          capturer.invoke("captureTab", {tab, mode: "bookmark"});
        });
      }
    });

    document.getElementById("captureAllTabs").addEventListener('click', () => {
      capturer.invoke("captureAllTabs", {mode: "document"});
    });

    document.getElementById("openViewer").addEventListener('click', () => {
      visitLink(chrome.runtime.getURL("viewer/load.html"), (!currentTab ? '_blank' : ''));
    });

    document.getElementById("openIndexer").addEventListener('click', () => {
      visitLink(chrome.runtime.getURL("indexer/load.html"), (!currentTab ? 'browseraction' : ''));
    });

    document.getElementById("openOptions").addEventListener('click', () => {
      visitLink(chrome.runtime.getURL("core/options.html"), (!currentTab ? 'browseraction' : ''));
    });
  });
});
