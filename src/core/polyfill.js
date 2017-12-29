/********************************************************************
 *
 * Shared polyfills.
 *
 * @public {Object} browser
 *******************************************************************/

/* polyfill for browser API in Chrome */
if (typeof browser === "undefined" && typeof chrome !== "undefined") {
  var browser = window.browser = {
    downloads: {
      download(...args) {
        return new Promise((resolve, reject) => {
          chrome.downloads.download(...args, (result) => {
            if (!chrome.runtime.lastError) { resolve(result); }
            else { reject(chrome.runtime.lastError); }
          });
        });
      },

      erase(...args) {
        return new Promise((resolve, reject) => {
          chrome.downloads.erase(...args, (result) => {
            if (!chrome.runtime.lastError) { resolve(result); }
            else { reject(chrome.runtime.lastError); }
          });
        });
      },

      search(...args) {
        return new Promise((resolve, reject) => {
          chrome.downloads.search(...args, (result) => {
            if (!chrome.runtime.lastError) { resolve(result); }
            else { reject(chrome.runtime.lastError); }
          });
        });
      },
    },

    extension: {
      isAllowedFileSchemeAccess(...args) {
        return new Promise((resolve, reject) => {
          chrome.extension.isAllowedFileSchemeAccess(...args, (result) => {
            if (!chrome.runtime.lastError) { resolve(result); }
            else { reject(chrome.runtime.lastError); }
          });
        });
      },
    },

    runtime: {
      sendMessage(...args) {
        return new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(...args, (result) => {
            if (!chrome.runtime.lastError) { resolve(result); }
            else { reject(chrome.runtime.lastError); }
          });
        });
      },
    },

    storage: {
      local: {
        get(...args) {
          return new Promise((resolve, reject) => {
            chrome.storage.local.get(...args, (result) => {
              if (!chrome.runtime.lastError) { resolve(result); }
              else { reject(chrome.runtime.lastError); }
            });
          });
        },

        set(...args) {
          return new Promise((resolve, reject) => {
            chrome.storage.local.set(...args, (result) => {
              if (!chrome.runtime.lastError) { resolve(result); }
              else { reject(chrome.runtime.lastError); }
            });
          });
        },

        remove(...args) {
          return new Promise((resolve, reject) => {
            chrome.storage.local.remove(...args, (result) => {
              if (!chrome.runtime.lastError) { resolve(result); }
              else { reject(chrome.runtime.lastError); }
            });
          });
        },
      },

      sync: {
        get(...args) {
          return new Promise((resolve, reject) => {
            chrome.storage.sync.get(...args, (result) => {
              if (!chrome.runtime.lastError) { resolve(result); }
              else { reject(chrome.runtime.lastError); }
            });
          });
        },

        set(...args) {
          return new Promise((resolve, reject) => {
            chrome.storage.sync.set(...args, (result) => {
              if (!chrome.runtime.lastError) { resolve(result); }
              else { reject(chrome.runtime.lastError); }
            });
          });
        },

        remove(...args) {
          return new Promise((resolve, reject) => {
            chrome.storage.sync.remove(...args, (result) => {
              if (!chrome.runtime.lastError) { resolve(result); }
              else { reject(chrome.runtime.lastError); }
            });
          });
        },
      },
    },
    
    tabs: {
      create(...args) {
        return new Promise((resolve, reject) => {
          chrome.tabs.create(...args, (result) => {
            if (!chrome.runtime.lastError) { resolve(result); }
            else { reject(chrome.runtime.lastError); }
          });
        });
      },

      executeScript(...args) {
        return new Promise((resolve, reject) => {
          chrome.tabs.executeScript(...args, (result) => {
            if (!chrome.runtime.lastError) { resolve(result); }
            else { reject(chrome.runtime.lastError); }
          });
        });
      },

      get(...args) {
        return new Promise((resolve, reject) => {
          chrome.tabs.get(...args, (result) => {
            if (!chrome.runtime.lastError) { resolve(result); }
            else { reject(chrome.runtime.lastError); }
          });
        });
      },

      getCurrent(...args) {
        return new Promise((resolve, reject) => {
          chrome.tabs.getCurrent(...args, (result) => {
            if (!chrome.runtime.lastError) { resolve(result); }
            else { reject(chrome.runtime.lastError); }
          });
        });
      },

      query(...args) {
        return new Promise((resolve, reject) => {
          chrome.tabs.query(...args, (result) => {
            if (!chrome.runtime.lastError) { resolve(result); }
            else { reject(chrome.runtime.lastError); }
          });
        });
      },

      remove(...args) {
        return new Promise((resolve, reject) => {
          chrome.tabs.remove(...args, (result) => {
            if (!chrome.runtime.lastError) { resolve(result); }
            else { reject(chrome.runtime.lastError); }
          });
        });
      },

      sendMessage(...args) {
        return new Promise((resolve, reject) => {
          chrome.tabs.sendMessage(...args, (result) => {
            if (!chrome.runtime.lastError) { resolve(result); }
            else { reject(chrome.runtime.lastError); }
          });
        });
      },
    },

    webNavigation: {
      getFrame(...args) {
        return new Promise((resolve, reject) => {
          chrome.webNavigation.getFrame(...args, (result) => {
            if (!chrome.runtime.lastError) { resolve(result); }
            else { reject(chrome.runtime.lastError); }
          });
        });
      },

      getAllFrames(...args) {
        return new Promise((resolve, reject) => {
          chrome.webNavigation.getAllFrames(...args, (result) => {
            if (!chrome.runtime.lastError) { resolve(result); }
            else { reject(chrome.runtime.lastError); }
          });
        });
      },
    },

    windows: {
      create(...args) {
        return new Promise((resolve, reject) => {
          chrome.windows.create(...args, (result) => {
            if (!chrome.runtime.lastError) { resolve(result); }
            else { reject(chrome.runtime.lastError); }
          });
        });
      },
      getCurrent(...args) {
        return new Promise((resolve, reject) => {
          chrome.windows.getCurrent(...args, (result) => {
            if (!chrome.runtime.lastError) { resolve(result); }
            else { reject(chrome.runtime.lastError); }
          });
        });
      },
      remove(...args) {
        return new Promise((resolve, reject) => {
          chrome.windows.remove(...args, (result) => {
            if (!chrome.runtime.lastError) { resolve(result); }
            else { reject(chrome.runtime.lastError); }
          });
        });
      },
    },
  };
}
