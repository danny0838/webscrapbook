/******************************************************************************
 *
 * Script for options.html
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

  const OPTION_PREFIX = "opt_";

  const defaultOptions = JSON.parse(JSON.stringify(scrapbook.options));

  async function initDefaultOptions() {
    const options = await scrapbook.loadOptions();
    for (const id in options) {
      setOptionToDocument(id, options[id]);
    }
  }

  function getOptionFromDocument(id) {
    const elem = document.getElementById(OPTION_PREFIX + id);
    if (!elem) { return; }

    if (elem.matches('input[type="checkbox"]')) {
      return elem.checked;
    } else if (elem.matches('input[type="number"]')) {
      return elem.validity.valid && elem.value !== "" ? elem.valueAsNumber : null;
    } else {
      return elem.value;
    }
  }

  function setOptionToDocument(id, value, includeHidden) {
    let elem = document.getElementById(OPTION_PREFIX + id);

    // If the given option is not in the form, create a hidden element to allow
    // reseting hidden values or do some hacking.
    if (!elem) {
      if (!includeHidden) { return; }

      const wrapper = document.getElementById('options');
      if (typeof value === 'string') {
        elem = document.createElement('input');
        elem.type = 'text';
        elem.value = value;
      } else if (typeof value === 'boolean') {
        elem = document.createElement('input');
        elem.type = 'checkbox';
        elem.checked = value;
      } else if (typeof value === 'number') {
        elem = document.createElement('input');
        elem.type = 'number';
        elem.value = value;
      } else if (value === null) {
        // null is only used for an unset number
        elem = document.createElement('input');
        elem.type = 'number';
      }
      elem.id = OPTION_PREFIX + id;
      elem.hidden = true;
      wrapper.appendChild(elem);
    }

    if (elem.matches('input[type="checkbox"]')) {
      elem.checked = !!value;
    } else {
      elem.value = value;

      // If the given value is not included in the options,
      // generate a hidden option element for it, so that
      // importing hacking value is allowed.
      if (elem.matches('select') && elem.value != value) {
        const c = elem.appendChild(document.createElement('option'));
        c.hidden = true;
        c.value = c.textContent = value;
        elem.value = value;
      }
    }
  }

  function resetOptions(file) {
    for (const id in defaultOptions) {
      setOptionToDocument(id, defaultOptions[id], true);
    }
  }

  function exportOptions() {
    const blob = new Blob([JSON.stringify(scrapbook.options, null, 2)], {type: "application/json"});
    const filename = `webscrapbook.options.${scrapbook.dateToId().slice(0, 8)}.json`;

    if (scrapbook.userAgent.is('gecko')) {
      // Firefox has a bug that the screen turns unresponsive
      // when an addon page is redirected to a blob URL.
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1420419
      //
      // Workaround by creating the anchor in an iframe.
      const iDoc = document.getElementById('downloader').contentDocument;
      const a = iDoc.createElement('a');
      a.download = filename;
      a.href = URL.createObjectURL(blob);
      iDoc.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }

    const elem = document.createElement('a');
    elem.download = filename;
    elem.href = URL.createObjectURL(blob);
    document.body.appendChild(elem);
    elem.click();
    elem.remove();
  }

  async function importOptions(file) {
    document.getElementById("import-input").value = null;

    try {
      const data = JSON.parse(await scrapbook.readFileAsText(file));
      const options = Object.assign(scrapbook.options, data);
      scrapbook.options = options;
      await scrapbook.saveOptions();
      for (const id in options) {
        setOptionToDocument(id, options[id], true);
      }
      alert(scrapbook.lang("OptionsImportSuccess"));
    } catch (ex) {
      alert(scrapbook.lang("ErrorImportOptions", [ex.message]));
    }
  }

  async function closeWindow() {
    const tab = await browser.tabs.getCurrent();
    if (!tab) {
      // options.html is a prompt diaglog
      window.close();
    } else if (tab.url.startsWith(browser.runtime.getURL(""))) {
      // options.html is in a tab (or Firefox Android)
      // close the tab
      return await browser.tabs.remove(tab.id);
    } else {
      // options.html is embedded in about:addon in Firefox
      // do not close the tab
    }
  }

  function getDetailStatusKey() {
      return {table: "optionDetailStatus"};
  }

  async function loadDetailStatus() {
    const status = await scrapbook.cache.get(getDetailStatusKey(), 'storage');
    if (!status) { return; }

    for (const id in status) {
      const elem = document.getElementById(id);
      if (elem) {
        elem.open = status[id];
      }
    }
  }

  async function saveDetailStatus() {
    const status = {};
    for (const elem of document.querySelectorAll('details')) {
      status[elem.id] = elem.open;
    }
    await scrapbook.cache.set(getDetailStatusKey(), status, 'storage');
  }

  function verifyHelpers() {
    const json = document.getElementById("opt_capture.helpers").value;

    if (json) {
      try {
        JSON.parse(json);
      } catch (ex) {
        if (confirm(scrapbook.lang("OptionCaptureHelpersError", [ex.message]))) {
          return false;
        }
      }
    }

    return true;
  }

  function verifyDownLinkFilters(rules) {
    const checkRule = (rules) => {
      rules.split(/(?:\n|\r\n?)/).forEach(function (srcLine, index) {
        let line = srcLine.trim();
        if (!line || line.startsWith("#")) { return; }

        // pass non-RegExp
        if (!/^\/(.*)\/([a-z]*)$/.test(line)) { return; }

        try {
          new RegExp(`^(?:${RegExp.$1})$`, RegExp.$2);
        } catch (ex) {
          line = scrapbook.lang("OptionCaptureDownLinkFilterErrorLine", [index + 1, srcLine]);
          errors.push(line);
        }
      });
    };

    var errors = [];
    checkRule(document.getElementById("opt_capture.downLink.extFilter").value);
    if (errors.length) {
      if (confirm(scrapbook.lang("OptionCaptureDownLinkExtFilterError", [errors.join('\n\n')]))) {
        return false;
      }
    }

    var errors = [];
    checkRule(document.getElementById("opt_capture.downLink.urlFilter").value);
    if (errors.length) {
      if (confirm(scrapbook.lang("OptionCaptureDownLinkUrlFilterError", [errors.join('\n\n')]))) {
        return false;
      }
    }

    return true;
  }

  function refreshForm() {
    renewCaptureSaveToDetails();
    renewCaptureSaveAsDetails();
    renewCaptureDownLinkDetails();
  }

  function renewCaptureSaveToDetails() {
    const mode = document.getElementById("opt_capture.saveTo").value;

    Array.prototype.forEach.call(document.querySelectorAll('.captureScrapbookFolder'), (elem) => {
      elem.hidden = mode !== 'folder';
    });

    {
      const elem = document.getElementById('opt_capture.saveAs');
      elem.querySelector('[value="folder"]').disabled = mode === 'file';
      if (elem.value === 'folder' && mode === 'file') {
        elem.value = 'zip';
      }
    }
  }

  function renewCaptureSaveAsDetails() {
    const mode = document.getElementById("opt_capture.saveAs").value;

    Array.prototype.forEach.call(document.querySelectorAll('.captureMergeCssResources'), (elem) => {
      elem.hidden = mode !== 'singleHtml';
    });
    Array.prototype.forEach.call(document.querySelectorAll('.captureSaveDataUriAsFile'), (elem) => {
      elem.hidden = mode === 'singleHtml';
    });
  }

  function verifySavePath(event) {
    const elem = event.target;
    if (elem.value) {
      // make sure it's a valid path for browser.downloads.download
      elem.value = elem.value.split(/[\\\/]/).map(x => scrapbook.validateFilename(x)).join('/');
    } else {
      // reset value to placeholder
      elem.value = elem.placeholder;
    }
  }

  function renewCaptureDownLinkDetails() {
    const mode = document.getElementById("opt_capture.downLink.mode").value;

    Array.prototype.forEach.call(document.querySelectorAll('.captureDownLinkDetails'), (elem) => {
      elem.hidden = mode === 'none';
    });
  }

  async function openIndexer() {
    const u = new URL(browser.runtime.getURL("scrapbook/cache.html"));
    const params = u.searchParams;
    if (getOptionFromDocument('indexer.fulltextCache')) {
      params.append('fulltext', 1);
    }
    if (getOptionFromDocument('indexer.fulltextCacheFrameAsPageContent')) {
      params.append('inclusive_frames', 1);
    }
    if (getOptionFromDocument('indexer.fulltextCacheRecreate')) {
      params.append('recreate', 1);
    }
    if (getOptionFromDocument('indexer.createStaticSite')) {
      params.append('static_site', 1);
    }
    if (getOptionFromDocument('indexer.createStaticIndex')) {
      params.append('static_index', 1);
    }
    if (getOptionFromDocument('indexer.createRssFeed')) {
      const rssRoot = getOptionFromDocument('indexer.createRssFeedBase') ||
          getOptionFromDocument('server.url');
      params.append('rss_root', rssRoot);
      params.append('rss_item_count', getOptionFromDocument('indexer.createRssFeedCount'));
    }
    if (!getOptionFromDocument('indexer.makeBackup')) {
      params.append('no_backup', 1);
    }

    return await scrapbook.visitLink({
      url: u.href,
      newTab: true,
      singleton: true,
    });
  }

  async function openChecker() {
    const u = new URL(browser.runtime.getURL("scrapbook/check.html"));
    const params = u.searchParams;
    if (getOptionFromDocument('checker.resolveInvalidId')) {
      params.append('resolve_invalid_id', 1);
    }
    if (getOptionFromDocument('checker.resolveMissingIndex')) {
      params.append('resolve_missing_index', 1);
    }
    if (getOptionFromDocument('checker.resolveMissingIndexFile')) {
      params.append('resolve_missing_index_file', 1);
    }
    if (getOptionFromDocument('checker.resolveMissingDate')) {
      params.append('resolve_missing_date', 1);
    }
    if (getOptionFromDocument('checker.resolveOlderMtime')) {
      params.append('resolve_older_mtime', 1);
    }
    if (getOptionFromDocument('checker.resolveTocUnreachable')) {
      params.append('resolve_toc_unreachable', 1);
    }
    if (getOptionFromDocument('checker.resolveTocInvalid')) {
      params.append('resolve_toc_invalid', 1);
    }
    if (getOptionFromDocument('checker.resolveTocEmptySubtree')) {
      params.append('resolve_toc_empty_subtree', 1);
    }
    if (getOptionFromDocument('checker.resolveUnindexedFiles')) {
      params.append('resolve_unindexed_files', 1);
    }
    if (getOptionFromDocument('checker.resolveAbsoluteIcon')) {
      params.append('resolve_absolute_icon', 1);
    }
    if (getOptionFromDocument('checker.resolveUnusedIcon')) {
      params.append('resolve_unused_icon', 1);
    }
    if (!getOptionFromDocument('checker.makeBackup')) {
      params.append('no_backup', 1);
    }

    return await scrapbook.visitLink({
      url: u.href,
      newTab: true,
      singleton: true,
    });
  }

  function onToggleTooltip(elem) {
    if (!onToggleTooltip.tooltipMap) {
      onToggleTooltip.tooltipMap = new WeakMap();
    }
    const tooltipMap = onToggleTooltip.tooltipMap;

    let tooltip = tooltipMap.get(elem);
    if (tooltip) {
      tooltip.remove();
      tooltipMap.set(elem, null);
    } else {
      tooltip = elem.parentNode.insertBefore(document.createElement("div"), elem.nextSibling);
      tooltip.className = "tooltip";
      tooltip.textContent = elem.getAttribute("data-tooltip");
      tooltipMap.set(elem, tooltip);
    }
  }

  window.addEventListener("DOMContentLoaded", async (event) => {
    // load languages
    scrapbook.loadLanguages(document);
    document.getElementById("optionServerUrlTooltip").setAttribute('data-tooltip', scrapbook.lang('OptionServerUrlTooltip', [scrapbook.BACKEND_MIN_VERSION]));

    // disable unsupported options
    // Hiding these options will get following elements shown bad since
    // :first-child doesn't apply to them.
    if (!browser.browserAction.setBadgeText) {
      document.getElementById('opt_scrapbook.notifyPageCaptured').disabled = true;
    }

    // load default options
    await initDefaultOptions();
    refreshForm();

    // load detail status
    await loadDetailStatus();

    // event handlers
    document.getElementById("opt_capture.saveTo").addEventListener("change", renewCaptureSaveToDetails);

    document.getElementById("opt_capture.saveAs").addEventListener("change", renewCaptureSaveAsDetails);

    document.getElementById("opt_capture.saveFolder").addEventListener("change", verifySavePath);

    document.getElementById("opt_capture.saveFilename").addEventListener("change", verifySavePath);

    document.getElementById("opt_capture.downLink.mode").addEventListener("change", renewCaptureDownLinkDetails);

    document.getElementById("options").addEventListener("submit", async (event) => {
      event.preventDefault();

      // verify the form
      if (!verifyHelpers()) {
        return;
      }
      if (!verifyDownLinkFilters()) {
        return;
      }

      // save options
      for (const id in scrapbook.options) {
        // Overwrite only keys with a defined value so that
        // keys not listed in the options page are not nullified.
        // In Chromium, storageArea.set({key: undefined}) does not store to key.
        // In Firefox, storageArea.set({key: undefined}) stores null to key.
        const value = getOptionFromDocument(id);
        if (typeof value !== "undefined") {
          scrapbook.options[id] = value;
        }
      }
      await scrapbook.saveOptions();
      return closeWindow();
    });

    document.getElementById("openIndexer").addEventListener("click", (event) => {
      event.preventDefault();
      openIndexer();
    });

    document.getElementById("openChecker").addEventListener("click", (event) => {
      event.preventDefault();
      openChecker();
    });

    document.getElementById("reset").addEventListener("click", (event) => {
      event.preventDefault();
      resetOptions();
      refreshForm();
    });

    document.getElementById("export").addEventListener("click", (event) => {
      event.preventDefault();
      exportOptions();
    });

    document.getElementById("import").addEventListener("click", (event) => {
      event.preventDefault();
      document.getElementById("import-input").click();
    });

    document.getElementById("import-input").addEventListener("change", async (event) => {
      event.preventDefault();
      const file = event.target.files[0];
      await importOptions(file);
      refreshForm();
    });

    for (const elem of document.querySelectorAll('details')) {
      elem.addEventListener("toggle", (event) => {
        saveDetailStatus();
      });
    }

    for (const elem of document.querySelectorAll('a[data-tooltip]')) {
      elem.addEventListener("click", (event) => {
        event.preventDefault();
        const elem = event.currentTarget;
        onToggleTooltip(elem);
      });
    }
  });

}));

