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
        for (const tab of await scrapbook.getContentTabs()) {
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
        }
      });
    };

    const onCaptureCommandClick = async (event, params) => {
      const tabs = targetTab ? 
          await scrapbook.getHighlightedTabs() : 
          [await selectTabFromDom(event.currentTarget)];
      return await scrapbook.invokeCapture(
        tabs.map(tab => (Object.assign({
          tabId: tab.id,
        }, params)))
      );
    };

    const onCaptureCommandDragStart = function (event, params) {
      event.dataTransfer.setData(
        'application/scrapbook.capturetabs+json',
        JSON.stringify(Object.assign({
          tabId: targetTab.id,
        }, params)),
      );
      event.dataTransfer.setData(
        'text/plain',
        targetTab.id,
      );

      // a delay is required or the dragging will be ended immediately
      setTimeout(() => {
        document.documentElement.classList.add('dragged-within');
      }, 0);
    };

    const onCaptureCommandDragEnd = function (event) {
      document.documentElement.classList.remove('dragged-within');
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

      document.getElementById("captureTab").addEventListener('dragstart', (event) => {
        onCaptureCommandDragStart(event);
      });
      document.getElementById("captureTab").addEventListener('dragend', onCaptureCommandDragEnd);

      document.getElementById("captureTabSource").addEventListener('dragstart', (event) => {
        onCaptureCommandDragStart(event, {
          mode: "source",
        });
      });
      document.getElementById("captureTabSource").addEventListener('dragend', onCaptureCommandDragEnd);

      document.getElementById("captureTabBookmark").addEventListener('dragstart', (event) => {
        onCaptureCommandDragStart(event, {
          mode: "bookmark",
        });
      });
      document.getElementById("captureTabBookmark").addEventListener('dragend', onCaptureCommandDragEnd);

      document.getElementById("captureTabAs").addEventListener('dragstart', (event) => {
        onCaptureCommandDragStart(event, {
          captureAs: true,
        });
      });
      document.getElementById("captureTabAs").addEventListener('dragend', onCaptureCommandDragEnd);
    }

    document.getElementById("captureTab").addEventListener('click', async (event) => {
      onCaptureCommandClick(event);
    });

    document.getElementById("captureTabSource").addEventListener('click', async (event) => {
      onCaptureCommandClick(event, {
        mode: "source",
      });
    });

    document.getElementById("captureTabBookmark").addEventListener('click', async (event) => {
      onCaptureCommandClick(event, {
        mode: "bookmark",
      });
    });

    document.getElementById("captureTabAs").addEventListener('click', async (event) => {
      const tabs = targetTab ? 
          await scrapbook.getHighlightedTabs() : 
          [await selectTabFromDom(event.currentTarget)];
      return await scrapbook.invokeCaptureAs({
        tasks: tabs.map(tab => ({
          tabId: tab.id,
          title: tab.title,
        })),
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
      const tab = targetTab || await selectTabFromDom(event.currentTarget);
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
      const tab = targetTab || await selectTabFromDom(event.currentTarget);
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
          [await selectTabFromDom(event.currentTarget)];
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
