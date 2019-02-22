/********************************************************************
 *
 * Script for browserAction.html
 *
 * @require {Object} scrapbook
 *******************************************************************/

document.addEventListener('DOMContentLoaded', async () => {
  // load languages
  scrapbook.loadLanguages(document);

  const getHighlightedTabs = async function () {
    const tabs = await browser.tabs.query({
      highlighted: true, discarded: false, currentWindow: true,
    });
    const ct = await capturer.getContentTabs();
    const ctSet = new Set(ct.map(t => t.id));
    const target = tabs
      .map(t => t.id)
      .filter(t => ctSet.has(t))
      .join(',');
    return target;
  };

  const generateActionButtonForTabs = async function (base, action) {
    let selector = base.nextSibling;
    if (selector && selector.nodeType === 1) {
      while (selector.firstChild) { selector.firstChild.remove(); }
    } else {
      selector = document.createElement("div");
      base.parentNode.insertBefore(selector, base.nextSibling);
    }
    (await capturer.getContentTabs()).forEach((tab) => {
      const elem = document.createElement("button");
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
  };

  const visitLink = function (url, target = null) {
    const a = visitLink.anchor = visitLink.anchor || document.createElement('a');
    a.href = url;
    if (target) { a.target = target; }
    document.body.appendChild(a);
    a.click();
    a.remove();
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
    const isAllowedFileSchemeAccess = await browser.extension.isAllowedFileSchemeAccess();
    if (!scrapbook.isContentPage(targetTab.url, isAllowedFileSchemeAccess)) {
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
      const tab = await generateActionButtonForTabs(
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
      const tab = await generateActionButtonForTabs(
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
      const tab = await generateActionButtonForTabs(
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

  document.getElementById("openViewer").addEventListener('click', (event) => {
    visitLink(chrome.runtime.getURL("viewer/load.html"), (isPrompt ? '_blank' : ''));
  });

  document.getElementById("openIndexer").addEventListener('click', (event) => {
    visitLink(chrome.runtime.getURL("indexer/load.html"), (isPrompt ? '_blank' : ''));
  });

  document.getElementById("openOptions").addEventListener('click', (event) => {
    visitLink(chrome.runtime.getURL("core/options.html"), (isPrompt ? 'browseraction' : ''));
  });
});
