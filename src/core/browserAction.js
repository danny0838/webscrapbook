/******************************************************************************
 *
 * Script for browserAction.html
 *
 * @require {Object} scrapbook
 *****************************************************************************/

document.addEventListener('DOMContentLoaded', async () => {
  // load languages
  scrapbook.loadLanguages(document);

  /**
   * Query for highlighted ("selected") tabs
   */
  const getHighlightedTabs = async function () {
    const allowFileAccess = await browser.extension.isAllowedFileSchemeAccess();
    // Querying for {highlighted:true} doesn't get highlighted tabs in some
    // Firefox version (e.g. 55), so we query for all tabs and filter them
    // afterwards.
    const tabs = await browser.tabs.query({
      currentWindow: true,
    });
    const target = tabs
      .filter(t => (
        scrapbook.isContentPage(t.url, allowFileAccess) &&
        // Select active and highlighted tabs.
        //
        // Normally active tabs are always highlighted, but in some browsers
        // (e.g. Opera 58) Tab.highlighted = false, so check for active tabs
        // explictly as a fallback.
        //
        // Firefox for Android < 54 does not support Tab.highlighted. Treat
        // undefined as true.
        (t.active || t.highlighted !== false)
      ))
      .map(t => t.id)
      .join(',');
    return target;
  };

  const generateActionButtonForTabs = async function (baseElem, action) {
    let selector = baseElem.nextSibling;
    if (selector && selector.className === "selector") {
      while (selector.firstChild) { selector.firstChild.remove(); }
    } else {
      selector = document.createElement("div");
      selector.className = "selector";
      baseElem.parentNode.insertBefore(selector, baseElem.nextSibling);
    }
    (await capturer.getContentTabs()).forEach((tab) => {
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

  const visitLink = async function (url, newTab) {
    if (!newTab) {
      return await browser.tabs.update({url});
    } else {
      return await browser.tabs.create({url});
    }
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
    }
  }

  document.getElementById("captureTab").addEventListener('click', async (event) => {
    if (targetTab) {
      const target = await getHighlightedTabs();
      return await capturer.invokeCapture({target});
    } else {
      await generateActionButtonForTabs(
        document.getElementById("captureTab"),
        async (tab) => {
          const target = tab.id;
          return await capturer.invokeCapture({target});
        });
    }
  });

  document.getElementById("captureTabSource").addEventListener('click', async (event) => {
    const mode = 'source';
    if (targetTab) {
      const target = await getHighlightedTabs();
      return await capturer.invokeCapture({target, mode});
    } else {
      await generateActionButtonForTabs(
        document.getElementById("captureTabSource"),
        async (tab) => {
          const target = tab.id;
          return await capturer.invokeCapture({target, mode});
        });
    }
  });

  document.getElementById("captureTabBookmark").addEventListener('click', async (event) => {
    const mode = 'bookmark';
    if (targetTab) {
      const target = await getHighlightedTabs();
      return await capturer.invokeCapture({target, mode});
    } else {
      await generateActionButtonForTabs(
        document.getElementById("captureTabBookmark"),
        async (tab) => {
          const target = tab.id;
          return await capturer.invokeCapture({target, mode});
        });
    }
  });

  document.getElementById("captureAllTabs").addEventListener('click', async (event) => {
    const tabs = await capturer.getContentTabs();
    const target = tabs.map(t => t.id).join(',');
    return await capturer.invokeCapture({target});
  });

  document.getElementById("openScrapBook").addEventListener('click', async (event) => {
    const url = browser.runtime.getURL("scrapbook/main.html");

    if (browser.sidebarAction) {
      // MDN: You can only call this function from inside the handler for a user action.
      await browser.sidebarAction.open();
    } else if (browser.windows) {
      const currentWindow = await browser.windows.getCurrent({windowTypes: ['normal']});

      const sideWindow = (await browser.windows.getAll({
        windowTypes: ['popup'],
        populate: true,
      })).filter(w => w.tabs[0].url.startsWith(url))[0];

      // calculate the desired position of the main and sidebar windows
      const screenWidth = window.screen.availWidth;
      const screenHeight = window.screen.availHeight;
      const left = 0;
      const top = 0;
      const width = Math.max(Math.floor(screenWidth / 5 - 1), 200);
      const height = screenHeight - 1;
      const mainLeft = Math.max(width + 1, currentWindow.left);
      const mainTop = Math.max(0, currentWindow.top);
      const mainWidth = Math.min(screenWidth - width - 1, currentWindow.width);
      const mainHeight = Math.min(screenHeight - 1, currentWindow.height);

      if (sideWindow) {
        await browser.windows.update(sideWindow.id, {
          left,
          top,
          width,
          height,
          drawAttention: true,
        });
      } else {
        await browser.windows.create({
          url,
          left,
          top,
          width,
          height,
          type: 'popup',
        });
      }

      const axis = {};
      if (mainLeft !== currentWindow.left) { axis.left = mainLeft; }
      if (mainTop !== currentWindow.top) { axis.top = mainTop; }
      if (mainWidth !== currentWindow.width) { axis.width = mainWidth; }
      if (mainHeight !== currentWindow.height) { axis.height = mainHeight; }

      await browser.windows.update(currentWindow.id, axis);
    } else {
      // Firefox Android does not support windows
      await visitLink(url, !!targetTab);
    }
  });

  document.getElementById("openViewer").addEventListener('click', async (event) => {
    await visitLink(browser.runtime.getURL("viewer/load.html"), !!targetTab);
  });

  document.getElementById("openIndexer").addEventListener('click', async (event) => {
    await visitLink(browser.runtime.getURL("indexer/load.html"), !!targetTab);
  });

  document.getElementById("openOptions").addEventListener('click', async (event) => {
    await visitLink(browser.runtime.getURL("core/options.html"), !!targetTab);
  });

  /**
   * Asynchronous tasks
   */
  if (!scrapbook.isOptionsSynced) {
    await scrapbook.loadOptions();
  }

  // allow this only when server is configured
  if (scrapbook.hasServer()) {
    document.getElementById("openScrapBook").disabled = false;
  }
});
