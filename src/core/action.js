/******************************************************************************
 * Script for browserAction.html
 *
 * @requires scrapbook
 *****************************************************************************/

(function (global, factory) {
  // Browser globals
  factory(
    global.isDebug,
    global.scrapbook,
  );
}(this, function (isDebug, scrapbook) {

'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  async function selectTabFromDom(baseElem) {
    let selector = baseElem.nextSibling;
    if (selector?.className === "selector") {
      while (selector.firstChild) { selector.firstChild.remove(); }
    } else {
      selector = document.createElement("div");
      selector.className = "selector";
      baseElem.parentNode.insertBefore(selector, baseElem.nextSibling);
    }
    const tabs = await scrapbook.getContentTabs();
    return await new Promise((resolve, reject) => {
      for (const tab of tabs) {
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
  }

  /**
   * @typedef {Object} captureCommandParams
   * @property {string} cmd
   * @property {string} [mode]
   * @property {boolean} [forAllTabs]
   */

  /**
   * @param {MouseEvent} event
   * @param {captureCommandParams} params
   */
  async function onCaptureCommandClick(event, params) {
    const tabs = params.forAllTabs ? await scrapbook.getContentTabs() :
        targetTab ? await scrapbook.getHighlightedTabs() :
        [await selectTabFromDom(event.currentTarget)];
    const mode = event.altKey ? 'bookmark' :
        event.shiftKey ? (params.mode === 'source' ? 'tab' : 'source') :
        params.mode;
    const taskInfo = {
      tasks: tabs.map(tab => ({
        tabId: tab.id,
        url: tab.url,
        title: tab.title,
      })),
      mode,
    };
    switch (params.cmd) {
      case 'capture': {
        event.ctrlKey ? await scrapbook.invokeCaptureAs(taskInfo) : await scrapbook.invokeCaptureEx({taskInfo});
        break;
      }
      case 'captureAs': {
        await scrapbook.invokeCaptureAs(taskInfo);
        break;
      }
      case 'batchCapture': {
        await scrapbook.invokeCaptureBatch(taskInfo);
        break;
      }
      case 'batchCaptureLinks': {
        await scrapbook.invokeCaptureBatchLinks(taskInfo);
        break;
      }
    }
  }

  /**
   * @param {DragEvent} event
   * @param {captureCommandParams} params
   */
  function onCaptureCommandDragStart(event, params) {
    event.dataTransfer.setData(
      'application/scrapbook.command+json',
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
  }

  function onCaptureCommandDragEnd(event) {
    document.documentElement.classList.remove('dragged-within');
  }

  async function autoClose() {
    if (scrapbook.getOption("ui.autoCloseBrowserAction")) {
      if (isPrompt) {
        window.close();
      } else {
        return await browser.tabs.remove(currentTab.id);
      }
    }
  }

  // load languages
  scrapbook.loadLanguages(document);

  await scrapbook.loadOptionsAuto;

  // this browserAction page (browserAction.html)
  const currentTab = await browser.tabs.getCurrent();

  // currentTab === undefined => browserAction.html is a prompt diaglog;
  // otherwise browserAction.html is opened in a tab (e.g. Chromium-based
  // mobile browser, or by visiting URL)
  const isPrompt = !currentTab;

  // the page where the user invokes browserAction
  // activeTab === currentTab if the browserAction page is opened by visiting URL.
  const [activeTab] = await browser.tabs.query({active: true, currentWindow: true});

  // the target tab for the browserAction commands
  const targetTab = (isPrompt || activeTab?.id !== currentTab.id) ? activeTab : undefined;

  const allowFileAccess = await browser.extension.isAllowedFileSchemeAccess();

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

  if (targetTab) {
    // drag-and-drop works only when targetTab exists
    document.getElementById("captureTab").draggable = true;
    document.getElementById("captureTabSource").draggable = true;
    document.getElementById("captureTabBookmark").draggable = true;
    document.getElementById("captureTabAs").draggable = true;
    document.getElementById("batchCapture").draggable = true;
    document.getElementById("batchCaptureLinks").draggable = true;

    // disable tab-specific commands if the active tab is not a valid content page
    // (drag-and-drop will be ignored when the element is disabled)
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
    await onCaptureCommandClick(event, {
      cmd: 'capture',
    });
    autoClose();
  });

  document.getElementById("captureTabSource").addEventListener('click', async (event) => {
    await onCaptureCommandClick(event, {
      cmd: 'capture',
      mode: "source",
    });
    autoClose();
  });

  document.getElementById("captureTabBookmark").addEventListener('click', async (event) => {
    await onCaptureCommandClick(event, {
      cmd: 'capture',
      mode: "bookmark",
    });
    autoClose();
  });

  document.getElementById("captureTabAs").addEventListener('click', async (event) => {
    await onCaptureCommandClick(event, {
      cmd: 'captureAs',
    });
    autoClose();
  });

  document.getElementById("batchCapture").addEventListener('click', async (event) => {
    await onCaptureCommandClick(event, {
      cmd: 'batchCapture',
      forAllTabs: true,
    });
    autoClose();
  });

  document.getElementById("batchCaptureLinks").addEventListener('click', async (event) => {
    await onCaptureCommandClick(event, {
      cmd: 'batchCaptureLinks',
      mode: "source",
    });
    autoClose();
  });

  document.getElementById("editTab").addEventListener('click', async (event) => {
    const tab = targetTab || await selectTabFromDom(event.currentTarget);
    await scrapbook.editTab({
      tabId: tab.id,
      force: true,
    });
    if (!isPrompt) {
      await browser.tabs.update(tab.id, {
        active: true,
      });
    }
    autoClose();
  });

  document.getElementById("searchCaptures").addEventListener('click', async (event) => {
    const tabs = targetTab ?
        await scrapbook.getHighlightedTabs() :
        [await selectTabFromDom(event.currentTarget)];
    await scrapbook.searchCaptures({
      tabs,
      newTab: true,
    });
    autoClose();
  });

  document.getElementById("openScrapBook").addEventListener('click', async (event) => {
    await scrapbook.openScrapBook({newTab: true});
    autoClose();
  });

  document.getElementById("openViewer").addEventListener('click', async (event) => {
    await scrapbook.visitLink({
      url: browser.runtime.getURL("viewer/load.html"),
      newTab: true,
    });
    autoClose();
  });

  document.getElementById("openOptions").addEventListener('click', async (event) => {
    await browser.runtime.openOptionsPage();
    autoClose();
  });

  /* drag and drop */
  document.getElementById("captureTab").addEventListener('dragstart', (event) => {
    onCaptureCommandDragStart(event, {
      cmd: 'capture',
    });
  });
  document.getElementById("captureTab").addEventListener('dragend', onCaptureCommandDragEnd);

  document.getElementById("captureTabSource").addEventListener('dragstart', (event) => {
    onCaptureCommandDragStart(event, {
      cmd: 'capture',
      mode: "source",
    });
  });
  document.getElementById("captureTabSource").addEventListener('dragend', onCaptureCommandDragEnd);

  document.getElementById("captureTabBookmark").addEventListener('dragstart', (event) => {
    onCaptureCommandDragStart(event, {
      cmd: 'capture',
      mode: "bookmark",
    });
  });
  document.getElementById("captureTabBookmark").addEventListener('dragend', onCaptureCommandDragEnd);

  document.getElementById("captureTabAs").addEventListener('dragstart', (event) => {
    onCaptureCommandDragStart(event, {
      cmd: 'captureAs',
    });
  });
  document.getElementById("captureTabAs").addEventListener('dragend', onCaptureCommandDragEnd);

  document.getElementById("batchCapture").addEventListener('dragstart', (event) => {
    onCaptureCommandDragStart(event, {
      cmd: 'batchCapture',
      forAllTabs: true,
    });
  });
  document.getElementById("batchCapture").addEventListener('dragend', onCaptureCommandDragEnd);

  document.getElementById("batchCaptureLinks").addEventListener('dragstart', (event) => {
    onCaptureCommandDragStart(event, {
      cmd: 'batchCaptureLinks',
      mode: "source",
    });
  });
  document.getElementById("batchCaptureLinks").addEventListener('dragend', onCaptureCommandDragEnd);
});

}));
