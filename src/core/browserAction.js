/******************************************************************************
 *
 * Script for browserAction.html
 *
 * @require {Object} scrapbook
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    window,
    console,
  );
}(this, function (isDebug, browser, scrapbook, window, console) {

  'use strict';

  document.addEventListener('DOMContentLoaded', async () => {
    // load languages
    scrapbook.loadLanguages(document);

    const generateActionButtonForTabs = async function (baseElem, action) {
      let selector = baseElem.nextSibling;
      if (selector && selector.className === "selector") {
        while (selector.firstChild) { selector.firstChild.remove(); }
      } else {
        selector = document.createElement("div");
        selector.className = "selector";
        baseElem.parentNode.insertBefore(selector, baseElem.nextSibling);
      }
      (await scrapbook.getContentTabs()).forEach((tab) => {
        const elem = document.createElement("button");
        elem.className = "sub";
        elem.textContent = (tab.index + 1) + ": " + tab.title;
        elem.addEventListener('click', (event) => {
          event.preventDefault;
          event.stopPropagation;
          action(tab);
          selector.remove();
        });
        selector.appendChild(elem);
      });
      return selector;
    };

    const {isPrompt, activeTab, targetTab} = await (async () => {
      const currentTab = await browser.tabs.getCurrent();
      // currentTab === undefined => browserAction.html is a prompt diaglog;
      // otherwise browserAction.html is opened in a tab (e.g. Firefox Android)
      const isPrompt = !currentTab;

      const tabs = await browser.tabs.query({active: true, currentWindow: true});

      const activeTab = tabs[0];

      // Get a target tab whenever determinable.
      // activeTab is the page where user clicks browserAction on Firefox for Android.
      // activeTab === currentTab if the user visits browserAction page by visiting URL.
      const targetTab = (isPrompt || activeTab && activeTab.id !== currentTab.id)  ? activeTab : undefined;

      return {isPrompt, activeTab, targetTab};
    })();

    if (targetTab) {
      // disable capture options if active tab is not a valid content page
      const allowFileAccess = await browser.extension.isAllowedFileSchemeAccess();
      if (!scrapbook.isContentPage(targetTab.url, allowFileAccess)) {
        document.getElementById("captureTab").disabled = true;
        document.getElementById("captureTabSource").disabled = true;
        document.getElementById("captureTabBookmark").disabled = true;
        document.getElementById("captureAllTabs").disabled = true;
        document.getElementById("editTab").disabled = true;
      }
    }

    document.getElementById("captureTab").addEventListener('click', async (event) => {
      if (!targetTab) {
        return await generateActionButtonForTabs(
          document.getElementById("captureTab"),
          async (tab) => {
            return await scrapbook.invokeCapture([{
              tabId: tab.id,
            }]);
          });
      }

      return await scrapbook.invokeCapture(
        (await scrapbook.getHighlightedTabs()).map(tab => ({
          tabId: tab.id,
        }))
      );
    });

    document.getElementById("captureTabSource").addEventListener('click', async (event) => {
      if (!targetTab) {
        return await generateActionButtonForTabs(
          document.getElementById("captureTabSource"),
          async (tab) => {
            return await scrapbook.invokeCapture([{
              tabId: tab.id,
              mode: "source",
            }]);
          });
      }

      return await scrapbook.invokeCapture(
        (await scrapbook.getHighlightedTabs()).map(tab => ({
          tabId: tab.id,
          mode: "source",
        }))
      );
    });

    document.getElementById("captureTabBookmark").addEventListener('click', async (event) => {
      if (!targetTab) {
        return await generateActionButtonForTabs(
          document.getElementById("captureTabBookmark"),
          async (tab) => {
            return await scrapbook.invokeCapture([{
              tabId: tab.id,
              mode: "bookmark",
            }]);
          });
      }

      return await scrapbook.invokeCapture(
        (await scrapbook.getHighlightedTabs()).map(tab => ({
          tabId: tab.id,
          mode: "bookmark",
        }))
      );
    });

    document.getElementById("captureAllTabs").addEventListener('click', async (event) => {
      const tabs = await scrapbook.getContentTabs();
      return await scrapbook.invokeCapture(
        tabs.map(tab => ({
          tabId: tab.id,
        }))
      );
    });

    document.getElementById("editTab").addEventListener('click', async (event) => {
      if (!targetTab) {
        return await generateActionButtonForTabs(
          document.getElementById("editTab"),
          async (tab) => {
            await scrapbook.editTab({
              tabId: tab.id,
              force: true,
            });
            return await browser.tabs.update(tab.id, {
              active: true,
            });
          });
      }

      return await scrapbook.editTab({
        tabId: targetTab.id,
        force: true,
      }).then(() => {
        if (!isPrompt) {
          return browser.tabs.update(targetTab.id, {
            active: true,
          });
        }
      });
    });

    document.getElementById("batchCapture").addEventListener('click', async (event) => {
      return await scrapbook.visitLink({
        url: browser.runtime.getURL("capturer/batch.html"),
        newTab: !!targetTab,
      });
    });

    document.getElementById("openScrapBook").addEventListener('click', async (event) => {
      return await scrapbook.openScrapBook({newTab: !!targetTab});
    });

    document.getElementById("openViewer").addEventListener('click', async (event) => {
      return await scrapbook.visitLink({
        url: browser.runtime.getURL("viewer/load.html"),
        newTab: !!targetTab,
      });
    });

    document.getElementById("openIndexer").addEventListener('click', async (event) => {
      return await scrapbook.visitLink({
        url: browser.runtime.getURL("indexer/load.html"),
        newTab: !!targetTab,
      });
    });

    document.getElementById("openOptions").addEventListener('click', async (event) => {
      return await scrapbook.visitLink({
        url: browser.runtime.getURL("core/options.html"),
        newTab: !!targetTab,
        singleton: true,
      });
    });
  });

}));
