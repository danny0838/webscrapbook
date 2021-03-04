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

    await scrapbook.loadOptions();

    const selectTabFromDom = async function (baseElem) {
      let selector = baseElem.nextSibling;
      if (selector && selector.className === "selector") {
        while (selector.firstChild) { selector.firstChild.remove(); }
      } else {
        selector = document.createElement("div");
        selector.className = "selector";
        baseElem.parentNode.insertBefore(selector, baseElem.nextSibling);
      }
      return await new Promise(async (resolve, reject) => {
        (await scrapbook.getContentTabs()).forEach((tab) => {
          const elem = document.createElement("button");
          elem.className = "sub";
          elem.textContent = (tab.index + 1) + ": " + tab.title;
          elem.addEventListener('click', (event) => {
            event.preventDefault;
            event.stopPropagation;
            resolve(tab);
            selector.remove();
          });
          selector.appendChild(elem);
        });
      });
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

    // show commands as configured
    for (const [option, shown] of Object.entries(scrapbook.getOptions("ui.toolbar"))) {
      const id = option[15].toLowerCase() + option.slice(16);
      const elem = document.getElementById(id);
      elem.hidden = !shown;
    }

    // disable backend server related options if not configured
    if (!scrapbook.hasServer()) {
      document.getElementById("searchCaptures").disabled = true;
      document.getElementById("openScrapBook").disabled = true;
    }

    // disable tab-specific commands if active tab is not a valid content page
    if (targetTab) {
      const allowFileAccess = await browser.extension.isAllowedFileSchemeAccess();
      if (!scrapbook.isContentPage(targetTab.url, allowFileAccess)) {
        document.getElementById("captureTab").disabled = true;
        document.getElementById("captureTabSource").disabled = true;
        document.getElementById("captureTabBookmark").disabled = true;
        document.getElementById("captureTabAs").disabled = true;
        document.getElementById("batchCaptureLinks").disabled = true;
        document.getElementById("editTab").disabled = true;
        document.getElementById("searchCaptures").disabled = true;
      }
    }

    document.getElementById("captureTab").addEventListener('click', async (event) => {
      const tabs = targetTab ? 
          await scrapbook.getHighlightedTabs() : 
          [await selectTabFromDom(document.getElementById("captureTab"))];
      return await scrapbook.invokeCapture(
        tabs.map(tab => ({
          tabId: tab.id,
        }))
      );
    });

    document.getElementById("captureTabSource").addEventListener('click', async (event) => {
      const tabs = targetTab ? 
          await scrapbook.getHighlightedTabs() : 
          [await selectTabFromDom(document.getElementById("captureTabSource"))];
      return await scrapbook.invokeCapture(
        tabs.map(tab => ({
          tabId: tab.id,
          mode: "source",
        }))
      );
    });

    document.getElementById("captureTabBookmark").addEventListener('click', async (event) => {
      const tabs = targetTab ? 
          await scrapbook.getHighlightedTabs() : 
          [await selectTabFromDom(document.getElementById("captureTabBookmark"))];
      return await scrapbook.invokeCapture(
        tabs.map(tab => ({
          tabId: tab.id,
          mode: "bookmark",
        }))
      );
    });

    document.getElementById("captureTabAs").addEventListener('click', async (event) => {
      const tabs = targetTab ? 
          await scrapbook.getHighlightedTabs() : 
          [await selectTabFromDom(document.getElementById("captureTabAs"))];
      return await scrapbook.invokeBatchCapture({
        taskInfo: {
          tasks: tabs.map(tab => ({
            tabId: tab.id,
            title: tab.title,
          })),
          mode: "",
          bookId: (await scrapbook.cache.get({table: "scrapbookServer", key: "currentScrapbook"}, 'storage')) || "",
          parentId: "root",
          delay: null,
          options: scrapbook.getOptions("capture"),
        },
        customTitle: true,
        useJson: true,
      });
    });

    document.getElementById("batchCapture").addEventListener('click', async (event) => {
      const tabs = await scrapbook.getContentTabs();
      return await scrapbook.invokeBatchCapture({
        taskInfo: {
          tasks: tabs.map(tab => ({
            tabId: tab.id,
            title: tab.title,
          })),
        },
      });
    });

    document.getElementById("batchCaptureLinks").addEventListener('click', async (event) => {
      const tab = targetTab || await selectTabFromDom(document.getElementById("batchCaptureLinks"));
      return scrapbook.initContentScripts(tab.id)
        .then(() => {
          return scrapbook.invokeContentScript({
            tabId: tab.id,
            frameId: 0,
            cmd: "capturer.retrieveSelectedLinks",
          });
        })
        .then((tasks) => {
          return scrapbook.invokeBatchCapture({taskInfo: {tasks}});
        });
    });

    document.getElementById("editTab").addEventListener('click', async (event) => {
      const tab = targetTab || await selectTabFromDom(document.getElementById("editTab"));
      await scrapbook.editTab({
        tabId: tab.id,
        force: true,
      });
      if (!targetTab || !isPrompt) {
        return browser.tabs.update(tab.id, {
          active: true,
        });
      }
    });

    document.getElementById("searchCaptures").addEventListener('click', async (event) => {
      const tabs = targetTab ? 
          await scrapbook.getHighlightedTabs() : 
          [await selectTabFromDom(document.getElementById("searchCaptures"))];
      return await scrapbook.searchCaptures({
        tabs,
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

    document.getElementById("openOptions").addEventListener('click', async (event) => {
      return await scrapbook.visitLink({
        url: browser.runtime.getURL("core/options.html"),
        newTab: !!targetTab,
        singleton: true,
      });
    });
  });

}));
