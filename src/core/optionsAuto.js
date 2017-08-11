/********************************************************************
 *
 * Loads and updates options automatically
 *
 * @require {Object} scrapbook
 *******************************************************************/

scrapbook.loadOptions();

chrome.storage.onChanged.addListener((changes, areaName) => {
  for (let key in changes) {
    scrapbook.options[key] = changes[key].newValue;
  }
});
