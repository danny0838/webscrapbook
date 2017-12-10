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

    document.getElementById("captureTab").addEventListener('click', (event) => {
      if (!currentTab) {
        return browser.tabs.query({active: true, currentWindow: true}).then((tabs) => {
          const target = tabs[0].id;
          return capturer.invokeCapture({target});
        });
      } else {
        generateActionButtonForTabs(document.getElementById("captureTab"), (tab) => {
          const target = tab.id;
          return capturer.invokeCapture({target});
        });
      }
    });

    document.getElementById("captureTabSource").addEventListener('click', (event) => {
      const mode = 'source';
      if (!currentTab) {
        return browser.tabs.query({active: true, currentWindow: true}).then((tabs) => {
          const target = tabs[0].id;
          return capturer.invokeCapture({target, mode});
        });
      } else {
        generateActionButtonForTabs(document.getElementById("captureTabSource"), (tab) => {
          const target = tab.id;
          return capturer.invokeCapture({target, mode});
        });
      }
    });

    document.getElementById("captureTabBookmark").addEventListener('click', (event) => {
      const mode = 'bookmark';
      if (!currentTab) {
        return browser.tabs.query({active: true, currentWindow: true}).then((tabs) => {
          const target = tabs[0].id;
          return capturer.invokeCapture({target, mode});
        });
      } else {
        generateActionButtonForTabs(document.getElementById("captureTabSource"), (tab) => {
          const target = tab.id;
          return capturer.invokeCapture({target, mode});
        });
      }
    });

    document.getElementById("captureFollowingTabs").addEventListener('click', (event) => {
      return browser.tabs.query({active: true, currentWindow: true}).then((tabs) => {
        const index = tabs[0].index;
        return capturer.getContentTabs().then((tabs) => {
          const target = tabs.filter(t => 
            t.index >= index && !t.discarded
          ).map(x => x.id).join(',');
          return capturer.invokeCapture({target});
        });
      });
    });

    document.getElementById("openViewer").addEventListener('click', (event) => {
      visitLink(chrome.runtime.getURL("viewer/load.html"), (!currentTab ? '_blank' : ''));
    });

    document.getElementById("openIndexer").addEventListener('click', (event) => {
      visitLink(chrome.runtime.getURL("indexer/load.html"), (!currentTab ? '_blank' : ''));
    });

    document.getElementById("openOptions").addEventListener('click', (event) => {
      visitLink(chrome.runtime.getURL("core/options.html"), (!currentTab ? 'browseraction' : ''));
    });
  });
});
