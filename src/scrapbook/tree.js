/******************************************************************************
 *
 * Scrapbook tree UI controller, for pages like sidebar.html and manage.html.
 *
 * @require {Object} scrapbook
 * @require {Object} server
 * @public {Object} tree
 *****************************************************************************/

(function (root, factory) {
  // Browser globals
  root.tree = factory(
    root.isDebug,
    root.browser,
    root.scrapbook,
    root.server,
    window,
    document,
    console,
  );
}(this, function (isDebug, browser, scrapbook, server, window, document, console) {

  'use strict';

  const ITEM_TYPE_ICON = {
    '': browser.runtime.getURL('resources/item.png'),
    'folder': browser.runtime.getURL('resources/fclose.png'),
    'file': browser.runtime.getURL('resources/file.png'),
    'image': browser.runtime.getURL('resources/file.png'),
    'note': browser.runtime.getURL('resources/note.png'),
    'postit': browser.runtime.getURL('resources/postit.png'),
  };

  const TOGGLER_ICON = {
    collapsed: browser.runtime.getURL('resources/collapse.png'),
    expanded: browser.runtime.getURL('resources/expand.png'),
  };

  const tree = {
    bookId: null,
    book: null,
    rootId: 'root',
    mode: 'normal',
    sidebarWindowId: null,
    lastDraggedElem: null,
    lastHighlightElem: null,
    commands: {
      async index() {
        if (this.book.config.no_tree) {
          await this.openLink(this.book.dataUrl, true);
          return;
        }

        await this.openLink(this.book.indexUrl, true);
      },

      async exec_book() {
        const target = this.book.topUrl;
        await server.request({
          url: target + '?a=exec',
          method: "GET",
          format: 'json',
        });
      },

      async opentab({itemElems}) {
        for (const elem of itemElems) {
          const id = elem.getAttribute('data-id');
          const item = this.book.meta[id];
          switch (item.type) {
            case 'folder':
            case 'separator': {
              break;
            }
            case 'bookmark': {
              if (item.source) {
                await this.openLink(item.source, true);
              }
              break;
            }
            case 'file':
            default: {
              if (item.index) {
                const target = this.book.dataUrl + scrapbook.escapeFilename(item.index);
                await this.openLink(target, true);
              }
              break;
            }
          }
        }
      },

      async view_text({itemElems}) {
        for (const elem of itemElems) {
          const id = elem.getAttribute('data-id');
          const item = this.book.meta[id];
          if (!item.index) { continue; }

          let target = this.book.dataUrl + scrapbook.escapeFilename(item.index);
          if (target.endsWith('/index.html')) {
            const redirectedTarget = await server.getMetaRefreshTarget(target);
            if (redirectedTarget) {
              target = redirectedTarget;
            }
          }

          const u = new URL(target);
          u.searchParams.set('a', 'source');
          if (item.charset) { u.searchParams.set('e', item.charset); }
          await this.openLink(u.href, true);
        }
      },

      async exec({itemElems}) {
        for (const elem of itemElems) {
          const id = elem.getAttribute('data-id');
          const item = this.book.meta[id];
          if (!item.index) { continue; }

          let target = this.book.dataUrl + scrapbook.escapeFilename(item.index);
          if (target.endsWith('/index.html')) {
            const redirectedTarget = await server.getMetaRefreshTarget(target);
            if (redirectedTarget) {
              target = scrapbook.splitUrlByAnchor(redirectedTarget)[0];
            }
          }

          await server.request({
            url: target + '?a=exec',
            method: "GET",
            format: 'json',
          });
        }
      },

      async browse({itemElems}) {
        for (const elem of itemElems) {
          const id = elem.getAttribute('data-id');
          const item = this.book.meta[id];
          if (!item.index) { continue; }

          let target = this.book.dataUrl + scrapbook.escapeFilename(item.index);
          if (target.endsWith('/index.html')) {
            const redirectedTarget = await server.getMetaRefreshTarget(target);
            if (redirectedTarget) {
              target = scrapbook.splitUrlByAnchor(redirectedTarget)[0];
            }
          }

          await server.request({
            url: target + '?a=browse',
            method: "GET",
            format: 'json',
          });
        }
      },

      async source({itemElems}) {
        for (const elem of itemElems) {
          const id = elem.getAttribute('data-id');
          const item = this.book.meta[id];
          if (item.source) {
            const target = item.source;
            await this.openLink(target, true);
          }
        }
      },

      async manage({itemElems}) {
        const id = itemElems.length ? itemElems[0].getAttribute('data-id') : 'root';
        const urlObj = new URL(browser.runtime.getURL("scrapbook/manage.html"));
        urlObj.searchParams.set('id', this.bookId);
        urlObj.searchParams.set('root', id);
        const target = urlObj.href;
        if (this.mode === 'manage') {
          location.assign(target);
        } else {
          await this.openModalWindow(target);
        }
      },

      async search_in({itemElems}) {
        const urlObj = new URL(browser.runtime.getURL("scrapbook/search.html"));
        urlObj.searchParams.set('id', this.bookId);
        for (const elem of itemElems) {
          const id = elem.getAttribute('data-id');
          urlObj.searchParams.append('root', id);
        }
        const target = urlObj.href;
        await this.openLink(target, true);
      },

      async meta({itemElems}) {
        if (!itemElems.length) { return; }

        const itemElem = itemElems[0];
        const id = itemElem.getAttribute('data-id');
        const item = this.book.meta[id];

        const frag = document.importNode(document.getElementById('tpl-meta').content, true);
        const dialog = frag.children[0];
        scrapbook.loadLanguages(dialog);

        const isRecycle = this.rootId === 'recycle';

        dialog.querySelector('[name="id"]').value = id || "";
        dialog.querySelector('[name="parent"]').value = item.parent || "";
        dialog.querySelector('[name="recycled"]').value = item.recycled ? scrapbook.idToDate(item.recycled).toLocaleString() : "";
        dialog.querySelector('[name="title"]').value = item.title || "";
        dialog.querySelector('[name="index"]').value = item.index || "";
        dialog.querySelector('[name="source"]').value = item.source || "";
        dialog.querySelector('[name="icon"]').value = item.icon || "";
        dialog.querySelector('[name="type"]').value = item.type || "";
        dialog.querySelector('[name="marked"]').checked = item.marked;
        dialog.querySelector('[name="locked"]').checked = item.locked;
        dialog.querySelector('[name="charset"]').value = item.charset || "";
        dialog.querySelector('[name="create"]').value = item.create ? scrapbook.idToDate(item.create).toLocaleString() : "";
        dialog.querySelector('[name="modify"]').value = item.modify ? scrapbook.idToDate(item.modify).toLocaleString() : "";
        dialog.querySelector('[name="comment"]').value = item.comment || "";

        dialog.querySelector('[name="parent"]').parentNode.parentNode.hidden = !(isRecycle);
        dialog.querySelector('[name="recycled"]').parentNode.parentNode.hidden = !(isRecycle);
        dialog.querySelector('[name="index"]').parentNode.parentNode.hidden = ['folder', 'separator'].includes(item.type);
        dialog.querySelector('[name="source"]').parentNode.parentNode.hidden = ['folder', 'separator'].includes(item.type);
        dialog.querySelector('[name="icon"]').parentNode.parentNode.hidden = ['separator'].includes(item.type);
        dialog.querySelector('[name="marked"]').parentNode.parentNode.hidden = ['separator'].includes(item.type);
        dialog.querySelector('[name="locked"]').parentNode.parentNode.hidden = ['folder', 'separator'].includes(item.type);
        dialog.querySelector('[name="charset"]').parentNode.parentNode.hidden = ['folder', 'separator', 'bookmark'].includes(item.type);

        dialog.addEventListener('dialogShow', (event) => {
          dialog.querySelector('[name="title"]').focus();
        });

        if (!await this.showDialog(dialog)) {
          return;
        }

        const dialogData = {
          marked: dialog.querySelector('[name="marked"]').checked,
          locked: dialog.querySelector('[name="locked"]').checked,
          title: dialog.querySelector('[name="title"]').value,
          index: dialog.querySelector('[name="index"]').value,
          source: dialog.querySelector('[name="source"]').value,
          icon: dialog.querySelector('[name="icon"]').value,
          charset: dialog.querySelector('[name="charset"]').value,
          comment: dialog.querySelector('[name="comment"]').value,
        };
        const newItem = this.book.addItem({
          item,
          parentId: null,
        });
        for (const [key, value] of Object.entries(dialogData)) {
          if (value || typeof item[key] !== 'undefined') {
            newItem[key] = value;
          }
        }

        // save meta
        await this.book.transaction({
          mode: 'validate',
          callback: async (book) => {
            await book.saveMeta();
            await book.saveToc();
            await book.loadTreeFiles(true);
          },
        });

        // update DOM
        Array.prototype.filter.call(
          document.getElementById('items').querySelectorAll('[data-id]'),
          x => x.getAttribute('data-id') === id
        ).forEach((itemElem) => {
          const parentItemElem = itemElem.parentNode.parentNode;
          const parentItemId = parentItemElem.getAttribute('data-id');
          const siblingItems = parentItemElem.container.children;
          const index = Array.prototype.indexOf.call(siblingItems, itemElem);

          // the operated item element is missing due to an unexpected reason
          if (index === -1) { return; }

          parentItemElem.container.children[index].remove();
          this.addItem(id, parentItemElem, index);
        });
      },

      async mkfolder({itemElems}) {
        let parentItemId = this.rootId;
        let index = Infinity;

        if (itemElems.length) {
          const itemElem = itemElems[0];
          const itemId = itemElem.getAttribute('data-id');

          const parentItemElem = itemElem.parentNode.parentNode;
          parentItemId = parentItemElem.getAttribute('data-id');
          const siblingItems = parentItemElem.container.children;
          index = Array.prototype.indexOf.call(siblingItems, itemElem) + 1;
        }

        // create new item
        const newItem = this.book.addItem({
          item: {
            "title": scrapbook.lang('ScrapBookNewFolderName'),
            "type": "folder",
          },
          parentId: parentItemId,
          index,
        });

        // save meta and TOC
        await this.book.transaction({
          mode: 'validate',
          callback: async (book) => {
            await book.saveMeta();
            await book.saveToc();
            await book.loadTreeFiles(true);  // update treeLastModified
          },
        });

        // update DOM
        Array.prototype.filter.call(
          document.getElementById('items').querySelectorAll('[data-id]'),
          x => x.getAttribute('data-id') === parentItemId
        ).forEach((parentElem) => {
          if (!(parentElem.parentNode)) { return; }
          this.itemMakeContainer(parentElem);
          if (!parentElem.container.hasAttribute('data-loaded')) { return; }
          this.addItem(newItem.id, parentElem, index);
        });
      },

      async mksep({itemElems}) {
        let parentItemId = this.rootId;
        let index = Infinity;

        if (itemElems.length) {
          const itemElem = itemElems[0];
          const itemId = itemElem.getAttribute('data-id');

          const parentItemElem = itemElem.parentNode.parentNode;
          parentItemId = parentItemElem.getAttribute('data-id');
          const siblingItems = parentItemElem.container.children;
          index = Array.prototype.indexOf.call(siblingItems, itemElem) + 1;
        }

        // create new item
        const newItem = this.book.addItem({
          item: {
            "title": "",
            "type": "separator",
          },
          parentId: parentItemId,
          index,
        });

        // save meta and TOC
        await this.book.transaction({
          mode: 'validate',
          callback: async (book) => {
            await book.saveMeta();
            await book.saveToc();
            await book.loadTreeFiles(true);  // update treeLastModified
          },
        });

        // update DOM
        Array.prototype.filter.call(
          document.getElementById('items').querySelectorAll('[data-id]'),
          x => x.getAttribute('data-id') === parentItemId
        ).forEach((parentElem) => {
          if (!(parentElem.parentNode)) { return; }
          this.itemMakeContainer(parentElem);
          if (!parentElem.container.hasAttribute('data-loaded')) { return; }
          this.addItem(newItem.id, parentElem, index);
        });
      },

      async mknote({itemElems}) {
        let parentItemId = this.rootId;
        let index = Infinity;

        if (itemElems.length) {
          const itemElem = itemElems[0];
          const itemId = itemElem.getAttribute('data-id');

          const parentItemElem = itemElem.parentNode.parentNode;
          parentItemId = parentItemElem.getAttribute('data-id');
          const siblingItems = parentItemElem.container.children;
          index = Array.prototype.indexOf.call(siblingItems, itemElem) + 1;
        }

        let type;
        {
          const frag = document.importNode(document.getElementById('tpl-mknote').content, true);
          const dialog = frag.children[0];
          scrapbook.loadLanguages(dialog);

          dialog.addEventListener('dialogShow', (event) => {
            dialog.querySelector('[name="format"]').focus();
          });

          if (!await this.showDialog(dialog)) {
            return;
          }

          type = dialog['format'].value;
        }

        // create new item
        const newItem = this.book.addItem({
          item: {
            "title": scrapbook.lang('ScrapBookNewNoteName'),
            "type": "note",
          },
          parentId: parentItemId,
          index,
        });

        // create file
        let target;
        let templateText;
        switch (type) {
          case 'html': {
            newItem.index = newItem.id + '/index.html';
            target = this.book.dataUrl + scrapbook.escapeFilename(newItem.index);

            // attempt to load template
            const url = this.book.treeUrl + '/templates/note_template.html';
            try {
              templateText = await server.request({
                url: url + '?a=source',
                method: "GET",
              }).then(r => r.text());
            } catch (ex) {
              // template file not exist, generate default one
              templateText = `<!DOCTYPE html>
<html data-scrapbook-type="note">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title data-scrapbook-elem="title">%NOTE_TITLE%</title>
</head>
<body>%NOTE_TITLE%</body>
</html>
`;
              const blob = new Blob([templateText], {type: "text/html"});
              await server.request({
                url: url + '?a=save',
                method: "POST",
                format: 'json',
                csrfToken: true,
                body: {
                  upload: blob,
                },
              });
            }

            break;
          }

          case 'markdown': {
            newItem.index = newItem.id + '/index.html';
            target = this.book.dataUrl + scrapbook.escapeFilename(newItem.id + '/index.md');

            // attempt to load template
            const url = this.book.treeUrl + '/templates/note_template.md';
            try {
              templateText = await server.request({
                url: url + '?a=source',
                method: "GET",
              }).then(r => r.text());
            } catch (ex) {
              // template file not exist, generate default one
              templateText = `%NOTE_TITLE%`;
              const blob = new Blob([templateText], {type: "text/markdown"});
              await server.request({
                url: url + '?a=save',
                method: "POST",
                format: 'json',
                csrfToken: true,
                body: {
                  upload: blob,
                },
              });
            }

            break;
          }
        }

        // generate content
        const dict = {
          '': '%',
          NOTE_TITLE: newItem.title,
          SCRAPBOOK_DIR: scrapbook.getRelativeUrl(this.book.topUrl, target),
          DATA_DIR: scrapbook.getRelativeUrl(this.book.dataUrl, target),
          TREE_DIR: scrapbook.getRelativeUrl(this.book.treeUrl, target),
          ITEM_DIR: './',
        };
        const content = templateText.replace(/%(\w*)%/gu, (_, key) => {
          return scrapbook.escapeHtml(dict[key] || '');
        });

        const blob = new Blob([content], {type: 'text/plain'});

        // save meta and TOC
        await this.book.transaction({
          mode: 'validate',
          callback: async (book) => {
            await book.saveMeta();
            await book.saveToc();
            await book.loadTreeFiles(true);  // update treeLastModified
          },
        });

        // save data files
        await server.request({
          url: target + '?a=save',
          method: "POST",
          format: 'json',
          csrfToken: true,
          body: {
            upload: blob,
          },
        });

        if (type === 'markdown') {
          const target = this.book.dataUrl + scrapbook.escapeFilename(newItem.id + '/index.html');
          const content = `<!DOCTYPE html>
<html data-scrapbook-type="note">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0;url=index.md">
</head>
<body>
Redirecting to file <a href="index.md">index.md</a>
</body>
</html>`;
          const blob = new Blob([content], {type: 'text/plain'});
          await server.request({
            url: target + '?a=save',
            method: "POST",
            format: 'json',
            csrfToken: true,
            body: {
              upload: blob,
            },
          });
        }

        // update DOM
        Array.prototype.filter.call(
          document.getElementById('items').querySelectorAll('[data-id]'),
          x => x.getAttribute('data-id') === parentItemId
        ).forEach((parentElem) => {
          if (!(parentElem.parentNode)) { return; }
          this.itemMakeContainer(parentElem);
          if (!parentElem.container.hasAttribute('data-loaded')) { return; }
          this.addItem(newItem.id, parentElem, index);
        });

        // open link
        switch (type) {
          case 'html': {
            await this.openLink(target, true);
            break;
          }

          case 'markdown': {
            const u = new URL(browser.runtime.getURL("scrapbook/edit.html"));
            u.searchParams.set('id', newItem.id);
            u.searchParams.set('bookId', this.bookId);
            await this.openLink(u.href, true);
            break;
          }
        }
      },

      async upload({itemElems, files}) {
        let parentItemId = this.rootId;
        let index = Infinity;

        if (itemElems.length) {
          const itemElem = itemElems[0];
          const itemId = itemElem.getAttribute('data-id');

          const parentItemElem = itemElem.parentNode.parentNode;
          parentItemId = parentItemElem.getAttribute('data-id');
          const siblingItems = parentItemElem.container.children;
          index = Array.prototype.indexOf.call(siblingItems, itemElem) + 1;
        }

        await this.uploadItems(files, parentItemId, index);
      },

      async edit({itemElems}) {
        if (!itemElems.length) { return; }

        const id = itemElems[0].getAttribute('data-id');
        const urlObj = new URL(browser.runtime.getURL("scrapbook/edit.html"));
        urlObj.searchParams.set('id', id);
        urlObj.searchParams.set('bookId', this.bookId);
        await this.openLink(urlObj.href, true);
      },

      async move_up({itemElems}) {
        if (!itemElems.length) { return; }

        const itemElem = itemElems[0];
        const itemId = itemElem.getAttribute('data-id');

        const parentItemElem = itemElem.parentNode.parentNode;
        const parentItemId = parentItemElem.getAttribute('data-id');
        const siblingItems = parentItemElem.container.children;
        const index = Array.prototype.indexOf.call(siblingItems, itemElem);

        // the operated item element is missing due to an unexpected reason
        if (index === -1) { return; }

        if (!(index > 0)) { return; }

        // update TOC
        const newIndex = this.book.moveItem({
          id: itemId,
          currentParentId: parentItemId,
          currentIndex: index,
          targetParentId: parentItemId,
          targetIndex: index - 1,
        });

        // update DOM
        Array.prototype.filter.call(
          document.getElementById('items').querySelectorAll('[data-id]'),
          x => x.getAttribute('data-id') === parentItemId
        ).forEach((parentElem) => {
          if (!(parentElem.parentNode && parentElem.container && parentElem.container.hasAttribute('data-loaded'))) { return; }
          const itemElem = parentElem.container.children[index];
          itemElem.parentNode.insertBefore(itemElem, itemElem.previousSibling);
        });

        // upload changes to server
        await this.book.transaction({
          mode: 'validate',
          callback: async (book) => {
            await book.saveToc();
            await book.loadTreeFiles(true);  // update treeLastModified
          },
        });
      },

      async move_down({itemElems}) {
        if (!itemElems.length) { return; }

        const itemElem = itemElems[0];
        const itemId = itemElem.getAttribute('data-id');

        const parentItemElem = itemElem.parentNode.parentNode;
        const parentItemId = parentItemElem.getAttribute('data-id');
        const siblingItems = parentItemElem.container.children;
        const index = Array.prototype.indexOf.call(siblingItems, itemElem);

        // the operated item element is missing due to an unexpected reason
        if (index === -1) { return; }

        if (!(index < siblingItems.length - 1)) { return; }

        // update TOC
        const newIndex = this.book.moveItem({
          id: itemId,
          currentParentId: parentItemId,
          currentIndex: index,
          targetParentId: parentItemId,
          targetIndex: index + 2,
        });

        // update DOM
        Array.prototype.filter.call(
          document.getElementById('items').querySelectorAll('[data-id]'),
          x => x.getAttribute('data-id') === parentItemId
        ).forEach((parentElem) => {
          if (!(parentElem.parentNode && parentElem.container && parentElem.container.hasAttribute('data-loaded'))) { return; }
          const itemElem = parentElem.container.children[index];
          itemElem.parentNode.insertBefore(itemElem, itemElem.nextSibling.nextSibling);
        });

        // upload changes to server
        await this.book.transaction({
          mode: 'validate',
          callback: async (book) => {
            await book.saveToc();
            await book.loadTreeFiles(true);  // update treeLastModified
          },
        });
      },

      async move_into({itemElems}) {
        if (!itemElems.length) { return; }

        let targetId;
        let targetIndex;
        let mode;
        {
          const frag = document.importNode(document.getElementById('tpl-move-into').content, true);
          const dialog = frag.children[0];
          scrapbook.loadLanguages(dialog);

          // disable link mode for recycling bin
          if (this.rootId === 'recycle') {
            dialog.querySelector('[name="mode"][value="link"]').disabled = true;
          }

          dialog.addEventListener('dialogShow', (event) => {
            dialog.querySelector('[name="id"]').focus();
          });
          
          if (!await this.showDialog(dialog)) {
            return;
          }

          targetId = dialog.querySelector('[name="id"]').value;
          targetIndex = parseInt(dialog.querySelector('[name="index"]').value, 10);
          targetIndex = isNaN(targetIndex) ? Infinity : Math.max(targetIndex, 0);
          mode = dialog['mode'].value;
        }

        if (!this.itemIsValidTarget(targetId)) { return; }

        switch (mode) {
          case "link": {
            await this.linkItems(itemElems, targetId, targetIndex);
            break;
          }
          case "move":
          default: {
            await this.moveItems(itemElems, targetId, targetIndex);
            break;
          }
        }
      },

      async recycle({itemElems}) {
        if (!itemElems.length) { return; }

        // Reverse the order to always move an item before its parent so that
        // its parent is in the DOM and gets children updated correctly.
        itemElems = [...itemElems].reverse();

        let targetIndex = Infinity;
        for (const itemElem of itemElems) {
          if (this.isDetached(itemElem)) { continue; }

          const itemId = itemElem.getAttribute('data-id');

          const parentItemElem = itemElem.parentNode.parentNode;
          const parentItemId = parentItemElem.getAttribute('data-id');
          const siblingItems = parentItemElem.container.children;
          const index = Array.prototype.indexOf.call(siblingItems, itemElem);

          // remove this and descendant items from Book
          const newIndex = this.book.recycleItemTree({
            id: itemId,
            currentParentId: parentItemId,
            currentIndex: index,
            targetIndex,
          });

          // update DOM
          Array.prototype.filter.call(
            document.getElementById('items').querySelectorAll('[data-id]'),
            x => x.getAttribute('data-id') === parentItemId
          ).forEach((parentElem) => {
            if (!(parentElem.parentNode && parentElem.container && parentElem.container.hasAttribute('data-loaded'))) { return; }
            const itemElem = parentElem.container.children[index];
            itemElem.remove();
            this.itemReduceContainer(parentElem);
          });

          targetIndex = newIndex;
        }

        // upload changes to server
        await this.book.transaction({
          mode: 'validate',
          callback: async (book) => {
            await book.saveMeta();
            await book.saveToc();
            await book.loadTreeFiles(true);  // update treeLastModified
          },
        });
      },

      async delete({itemElems}) {
        if (!itemElems.length) { return; }

        const removeDataFiles = async (itemIndexFile) => {
          if (!itemIndexFile) { return; }
          const index = itemIndexFile.replace(/\/index.[^.]+$/, '');
          const target = this.book.dataUrl + scrapbook.escapeFilename(index);
          await server.request({
            url: target + '?a=delete',
            method: "POST",
            format: 'json',
            csrfToken: true,
          });
        };

        // Reverse the order to always move an item before its parent so that
        // its parent is in the DOM and gets children updated correctly.
        itemElems = [...itemElems].reverse();

        await this.book.transaction({
          mode: 'validate',
          callback: async (book) => {
            let allRemovedItems = [];
            for (const itemElem of itemElems) {
              if (this.isDetached(itemElem)) { continue; }

              const itemId = itemElem.getAttribute('data-id');

              const parentItemElem = itemElem.parentNode.parentNode;
              const parentItemId = parentItemElem.getAttribute('data-id');
              const siblingItems = parentItemElem.container.children;
              const index = Array.prototype.indexOf.call(siblingItems, itemElem);

              // remove this and descendant items from Book
              const removedItems = this.book.removeItemTree({
                id: itemId,
                parentId: parentItemId,
                index,
              });
              for (const i of removedItems) {
                allRemovedItems.push(i.id);
              }

              // update DOM
              Array.prototype.filter.call(
                document.getElementById('items').querySelectorAll('[data-id]'),
                x => x.getAttribute('data-id') === parentItemId
              ).forEach((parentElem) => {
                if (!(parentElem.parentNode && parentElem.container && parentElem.container.hasAttribute('data-loaded'))) { return; }
                const itemElem = parentElem.container.children[index];
                itemElem.remove();
                this.itemReduceContainer(parentElem);
              });

              // remove data files
              for (const removedItem of removedItems) {
                if (!removedItem.index) { continue; }
                try {
                  await removeDataFiles(removedItem.index);
                } catch (ex) {
                  console.error(ex);
                  this.warn(`Unable to delete '${removedItem.index}': ${ex.message}`);
                }
              }
            }

            // upload changes to server
            if (allRemovedItems.length > 0) {
              await book.saveMeta();
            }
            await book.saveToc();

            if (allRemovedItems.length > 0) {
              // Due to a concern of URL length and performance, skip cache
              // update if too many items are affected. Cache update for
              // deleted items can be safely deferred as deleted items aren't
              // shown in the search result anyway.
              if (allRemovedItems.length <= 20) {
                await server.requestSse({
                  query: {
                    "a": "cache",
                    "book": book.id,
                    "item": allRemovedItems,
                    "no_lock": 1,
                    "fulltext": 1,
                    "inclusive_frames": scrapbook.getOption("indexer.fulltextCacheFrameAsPageContent"),
                  },
                  onMessage(info) {
                    if (['error', 'critical'].includes(info.type)) {
                      this.error(`Error when updating fulltext cache: ${info.msg}`);
                    }
                  },
                });
              }
            }

            await book.loadTreeFiles(true);  // update treeLastModified
          },
        });
      },

      async recover({itemElems}) {
        if (!itemElems.length) { return; }

        // Handle items in order so that the order of recovered items is
        // preserved if they have same parent.
        // If a recycled item A has a child B, B will be removed from the DOM
        // when A is removed, and its moving will be skipped.
        for (const itemElem of itemElems) {
          if (this.isDetached(itemElem)) { continue; }

          const itemId = itemElem.getAttribute('data-id');

          const parentItemElem = itemElem.parentNode.parentNode;
          const parentItemId = parentItemElem.getAttribute('data-id');
          const siblingItems = parentItemElem.container.children;
          const index = Array.prototype.indexOf.call(siblingItems, itemElem);

          let targetId = this.book.meta[itemId].parent || 'root';

          // move to root instead if the original parent no more exists
          if (!(this.book.meta[targetId] || this.book.isSpecialItem(targetId))) {
            targetId = 'root';
          }

          if (targetId !== parentItemId) {
            // update TOC
            const newIndex = this.book.moveItem({
              id: itemId,
              currentParentId: parentItemId,
              currentIndex: index,
              targetParentId: targetId,
              targetIndex: Infinity,
            });

            // remove parent and recycled time record
            delete this.book.meta[itemId].parent;
            delete this.book.meta[itemId].recycled;

            // update DOM
            Array.prototype.filter.call(
              document.getElementById('items').querySelectorAll('[data-id]'),
              x => x.getAttribute('data-id') === parentItemId
            ).forEach((parentElem) => {
              if (!(parentElem.parentNode && parentElem.container && parentElem.container.hasAttribute('data-loaded'))) { return; }
              const itemElem = parentElem.container.children[index];
              itemElem.remove();
              this.itemReduceContainer(parentElem);
            });

            Array.prototype.filter.call(
              document.getElementById('items').querySelectorAll('[data-id]'),
              x => x.getAttribute('data-id') === targetId
            ).forEach((parentElem) => {
              if (!(parentElem.parentNode)) { return; }
              this.itemMakeContainer(parentElem);
              if (!parentElem.container.hasAttribute('data-loaded')) { return; }
              this.addItem(itemId, parentElem, newIndex);
            });
          }
        }

        // upload changes to server
        await this.book.transaction({
          mode: 'validate',
          callback: async (book) => {
            await book.saveMeta();
            await book.saveToc();
            await book.loadTreeFiles(true);  // update treeLastModified
          },
        });
      },

      async view_recycle() {
        const urlObj = new URL(browser.runtime.getURL("scrapbook/manage.html"));
        urlObj.searchParams.set('id', this.bookId);
        urlObj.searchParams.set('root', 'recycle');
        const target = urlObj.href;
        if (this.mode === 'manage') {
          location.assign(target);
        } else {
          await this.openModalWindow(target);
        }
      },
    },

    log(msg) {
      document.getElementById("logger").appendChild(document.createTextNode(msg + '\n'));
    },

    warn(msg) {
      const span = document.createElement('span');
      span.className = 'warn';
      span.appendChild(document.createTextNode(msg + '\n'));
      document.getElementById("logger").appendChild(span);
    },

    error(msg) {
      const span = document.createElement('span');
      span.className = 'error';
      span.appendChild(document.createTextNode(msg + '\n'));
      document.getElementById("logger").appendChild(span);
    },

    enableUi(willEnable) {
      document.getElementById('book').disabled = !willEnable;
      document.getElementById('command').disabled = !willEnable;
      document.getElementById('search').disabled = !(willEnable && !this.book.config.no_tree);
    },

    showBookCommands(willShow = document.getElementById('command-popup-book').hidden, pos = {}) {
      const menuElem = document.getElementById('command-popup-book');

      if (!willShow) {
        menuElem.hidden = true;
        return;
      }

      const isRecycle = this.rootId === 'recycle';

      menuElem.querySelector('button[value="index"]').hidden = false;
      menuElem.querySelector('button[value="exec_book"]').hidden = false;
      menuElem.querySelector('button[value="manage"]').hidden = false;

      menuElem.querySelector('button[value="mkfolder"]').hidden = !(!isRecycle);
      menuElem.querySelector('button[value="mksep"]').hidden = !(!isRecycle);
      menuElem.querySelector('button[value="mknote"]').hidden = !(!isRecycle);
      menuElem.querySelector('button[value="upload"]').hidden = !(!isRecycle);

      menuElem.querySelector('button[value="view_recycle"]').hidden = !(!isRecycle);

      // show/hide each separator if there are shown items around it
      let hasShownItem = false;
      let lastSep = null;
      for (const elem of menuElem.querySelectorAll('button, hr')) {
        if (elem.localName === 'hr') {
          elem.hidden = true;
          if (hasShownItem) { lastSep = elem; }
          hasShownItem = false;
        } else {
          if (!elem.hidden) {
            hasShownItem = true;
            if (lastSep) {
              lastSep.hidden = false;
              lastSep = null;
            }
          }
        }
      }

      // show menu and fix position
      menuElem.style.setProperty('max-width', '95vw');
      menuElem.style.setProperty('max-height', '95vh');
      menuElem.hidden = false;

      const {clientX = 0, clientY = 0} = pos;
      const viewport = scrapbook.getViewport(window);
      const anchorPos = scrapbook.getAnchoredPosition(menuElem, {
        clientX: Math.min(Math.max(clientX, 0), viewport.width - menuElem.offsetWidth),
        clientY: Math.min(Math.max(clientY, 0), viewport.height - menuElem.offsetHeight),
      }, viewport);
      menuElem.style.setProperty('left', anchorPos.left + 'px');
      menuElem.style.setProperty('top', anchorPos.top + 'px');

      menuElem.focus();
    },

    showCommands(willShow = document.getElementById('command-popup').hidden, pos = {}) {
      const menuElem = document.getElementById('command-popup');

      if (!willShow) {
        menuElem.hidden = true;
        return;
      }

      const selectedItemElems = Array.prototype.map.call(
        document.querySelectorAll('#item-root .highlight'),
        x => x.parentNode
      );

      const isRecycle = this.rootId === 'recycle';

      switch (selectedItemElems.length) {
        case 0: {
          menuElem.querySelector('button[value="opentab"]').hidden = true;
          menuElem.querySelector('button[value="view_text"]').hidden = true;
          menuElem.querySelector('button[value="exec"]').hidden = true;
          menuElem.querySelector('button[value="browse"]').hidden = true;
          menuElem.querySelector('button[value="source"]').hidden = true;
          menuElem.querySelector('button[value="manage"]').hidden = false;
          menuElem.querySelector('button[value="search_in"]').hidden = true;

          menuElem.querySelector('button[value="mkfolder"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="mksep"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="mknote"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="upload"]').hidden = !(!isRecycle);

          menuElem.querySelector('button[value="edit"]').hidden = true;
          menuElem.querySelector('button[value="recover"]').hidden = true;
          menuElem.querySelector('button[value="move_up"]').hidden = true;
          menuElem.querySelector('button[value="move_down"]').hidden = true;
          menuElem.querySelector('button[value="move_into"]').hidden = true;
          menuElem.querySelector('button[value="recycle"]').hidden = true;
          menuElem.querySelector('button[value="delete"]').hidden = true;

          menuElem.querySelector('button[value="meta"]').hidden = true;
          break;
        }

        case 1: {
          const item = this.book.meta[selectedItemElems[0].getAttribute('data-id')];

          menuElem.querySelector('button[value="opentab"]').hidden = ['folder', 'separator'].includes(item.type);
          menuElem.querySelector('button[value="view_text"]').hidden = !(item.type === 'file' && item.index);
          menuElem.querySelector('button[value="exec"]').hidden = !(item.type === 'file' && item.index);
          menuElem.querySelector('button[value="browse"]').hidden = !(item.index);
          menuElem.querySelector('button[value="source"]').hidden = !(item.source);
          menuElem.querySelector('button[value="manage"]').hidden = !(!isRecycle && (item.type === 'folder' || this.book.toc[item.id]));
          menuElem.querySelector('button[value="search_in"]').hidden = !(!isRecycle && (item.type === 'folder' || this.book.toc[item.id]));

          menuElem.querySelector('button[value="mkfolder"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="mksep"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="mknote"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="upload"]').hidden = !(!isRecycle);

          menuElem.querySelector('button[value="edit"]').hidden = !(!isRecycle && ['note'].includes(item.type) && item.index);
          menuElem.querySelector('button[value="recover"]').hidden = !(isRecycle);
          menuElem.querySelector('button[value="move_up"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="move_down"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="move_into"]').hidden = false;
          menuElem.querySelector('button[value="recycle"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="delete"]').hidden = !(isRecycle);

          menuElem.querySelector('button[value="meta"]').hidden = false;
          break;
        }

        default: {
          menuElem.querySelector('button[value="opentab"]').hidden = false;
          menuElem.querySelector('button[value="view_text"]').hidden = true;
          menuElem.querySelector('button[value="exec"]').hidden = true;
          menuElem.querySelector('button[value="browse"]').hidden = false;
          menuElem.querySelector('button[value="source"]').hidden = false;
          menuElem.querySelector('button[value="manage"]').hidden = true;
          menuElem.querySelector('button[value="search_in"]').hidden = !(!isRecycle);

          menuElem.querySelector('button[value="mkfolder"]').hidden = true;
          menuElem.querySelector('button[value="mksep"]').hidden = true;
          menuElem.querySelector('button[value="mknote"]').hidden = true;
          menuElem.querySelector('button[value="upload"]').hidden = true;

          menuElem.querySelector('button[value="edit"]').hidden = true;
          menuElem.querySelector('button[value="recover"]').hidden = !(isRecycle);
          menuElem.querySelector('button[value="move_up"]').hidden = true;
          menuElem.querySelector('button[value="move_down"]').hidden = true;
          menuElem.querySelector('button[value="move_into"]').hidden = false;
          menuElem.querySelector('button[value="recycle"]').hidden = !(!isRecycle);
          menuElem.querySelector('button[value="delete"]').hidden = !(isRecycle);

          menuElem.querySelector('button[value="meta"]').hidden = true;
          break;
        }
      }

      // show/hide each separator if there are shown items around it
      let hasShownItem = false;
      let lastSep = null;
      for (const elem of menuElem.querySelectorAll('button, hr')) {
        if (elem.localName === 'hr') {
          elem.hidden = true;
          if (hasShownItem) { lastSep = elem; }
          hasShownItem = false;
        } else {
          if (!elem.hidden) {
            hasShownItem = true;
            if (lastSep) {
              lastSep.hidden = false;
              lastSep = null;
            }
          }
        }
      }

      // show menu and fix position
      menuElem.style.setProperty('max-width', '95vw');
      menuElem.style.setProperty('max-height', '95vh');
      menuElem.hidden = false;

      const {clientX = 0, clientY = 0} = pos;
      const viewport = scrapbook.getViewport(window);
      const anchorPos = scrapbook.getAnchoredPosition(menuElem, {
        clientX: Math.min(Math.max(clientX, 0), viewport.width - menuElem.offsetWidth),
        clientY: Math.min(Math.max(clientY, 0), viewport.height - menuElem.offsetHeight),
      }, viewport);
      menuElem.style.setProperty('left', anchorPos.left + 'px');
      menuElem.style.setProperty('top', anchorPos.top + 'px');

      menuElem.focus();
    },

    /**
     * @param {HTMLElement} elem - the element to be inserted to the dialog.
     *   - Dispatch 'dialogSubmit' event on elem to resolve the Promise with value.
     *   - Listen to 'dialogShow' event for elem to handle initialization.
     */
    async showDialog(elem) {
      const mask = document.getElementById('dialog-mask');
      const wrapper = document.getElementById('dialog-wrapper');
      const cancelElem = elem.querySelector('.cancel');

      const onKeyDown = (event) => {
        // skip if there's a modifier
        if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
          return;
        }

        if (event.code === "Escape" || event.code === "F10") {
          event.preventDefault();
          elem.dispatchEvent(new CustomEvent('dialogSubmit', {detail: null}));
        }
      };

      const onSubmit = (event) => {
        event.preventDefault();
        elem.dispatchEvent(new CustomEvent('dialogSubmit', {detail: true}));
      };

      const onCancel = (event) => {
        event.preventDefault();
        elem.dispatchEvent(new CustomEvent('dialogSubmit', {detail: null}));
      };

      wrapper.innerHTML = '';
      wrapper.appendChild(elem);
      this.enableUi(false);
      mask.hidden = false;

      if (!wrapper.hasAttribute('tabindex')) {
        wrapper.setAttribute('tabindex', -1);
      }
      wrapper.focus();

      window.addEventListener('keydown', onKeyDown, true);
      elem.addEventListener('submit', onSubmit);
      cancelElem.addEventListener('click', onCancel);

      const result = await new Promise((resolve, reject) => {
        elem.addEventListener('dialogSubmit', (event) => {
         resolve(event.detail); 
        });
        elem.dispatchEvent(new CustomEvent('dialogShow', {detail: null}));
      });

      window.removeEventListener('keydown', onKeyDown, true);
      elem.removeEventListener('submit', onSubmit);
      cancelElem.removeEventListener('click', onCancel);

      mask.hidden = true;
      this.enableUi(true);

      return result;
    },
    
    async init() {
      // load config
      await scrapbook.loadOptions();

      if (!scrapbook.hasServer()) {
        this.error(scrapbook.lang('ScrapBookErrorServerNotConfigured'));
        return;
      }

      // load server config
      try {
        await server.init();
      } catch (ex) {
        console.error(ex);
        this.error(scrapbook.lang('ScrapBookErrorServerInit', [ex.message]));
        return;
      }

      // load URL params
      const urlParams = new URL(document.URL).searchParams;
      this.rootId = urlParams.get('root') || this.rootId;

      // load current scrapbook and scrapbooks list
      try {
        let bookId = this.bookId = urlParams.has('id') ? urlParams.get('id') : server.bookId;
        let book = this.book = server.books[bookId];

        if (!book) {
          this.warn(scrapbook.lang('ScrapBookErrorBookNotExist', [bookId]));
          bookId = this.bookId = '';
          book = this.book = server.books[bookId];
          await scrapbook.cache.set({table: "scrapbookServer", key: "currentScrapbook"}, bookId, 'storage');
        }

        // init book select
        if (this.mode === 'normal') {
          const wrapper = document.getElementById('book');
          wrapper.hidden = false;

          for (const key of Object.keys(server.books).sort()) {
            const book = server.books[key];
            const opt = document.createElement('option');
            opt.value = book.id;
            opt.textContent = book.name;
            wrapper.appendChild(opt);
          }
          wrapper.value = bookId;
        }
      } catch (ex) {
        console.error(ex);
        this.error(scrapbook.lang('ScrapBookErrorLoadBooks', [ex.message]));
        return;
      }

      // bind "this" variable for command callbacks functions
      for (const cmd in this.commands) {
        this.commands[cmd] = this.commands[cmd].bind(this);
      }

      await this.refresh(undefined, true);
    },

    async refresh(bookId, keepLogs = false) {
      this.enableUi(false);

      try {
        // reset variables
        if (typeof bookId !== 'undefined' && bookId !== this.bookId) {
          await scrapbook.cache.set({table: "scrapbookServer", key: "currentScrapbook"}, bookId, 'storage');
          this.bookId = bookId;
          this.book = server.books[bookId];
          document.getElementById('book').value = bookId;
        }
        this.lastDraggedElem = null;
        this.lastHighlightElem = null;

        // refresh UI
        if (this.rootId === 'root') {
          document.title = scrapbook.lang('SidebarTitle', [server.config.app.name, this.book.name]);
        } else {
          document.title = scrapbook.lang('SidebarTitleWithRoot', [server.config.app.name, this.book.name, this.rootId])
        }

        const isLocal = server.config.app.is_local;
        const isNoTree = !!this.book.config.no_tree;
        const isRecycle = this.rootId === 'recycle';

        document.getElementById('search').disabled = isNoTree;

        {
          const menuElem = document.getElementById('command-popup-book');
          menuElem.querySelector('button[value="exec_book"]').disabled = !(!isNoTree && isLocal);
          menuElem.querySelector('button[value="manage"]').disabled = isNoTree;

          menuElem.querySelector('button[value="mkfolder"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="mksep"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="mknote"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="upload"]').disabled = !(!isNoTree && !isRecycle);

          menuElem.querySelector('button[value="view_recycle"]').hidden = !(!isRecycle);
        }

        {
          const menuElem = document.getElementById('command-popup');
          menuElem.querySelector('button[value="opentab"]').disabled = isNoTree;
          menuElem.querySelector('button[value="view_text"]').disabled = isNoTree;
          menuElem.querySelector('button[value="exec"]').disabled = !(!isNoTree && isLocal);
          menuElem.querySelector('button[value="browse"]').disabled = !(!isNoTree && isLocal);
          menuElem.querySelector('button[value="source"]').disabled = isNoTree;
          menuElem.querySelector('button[value="manage"]').disabled = isNoTree;
          menuElem.querySelector('button[value="search_in"]').disabled = isNoTree;

          menuElem.querySelector('button[value="mkfolder"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="mksep"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="mknote"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="upload"]').disabled = !(!isNoTree && !isRecycle);

          menuElem.querySelector('button[value="edit"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="recover"]').disabled = !(!isNoTree && isRecycle);
          menuElem.querySelector('button[value="move_up"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="move_down"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="move_into"]').disabled = isNoTree;
          menuElem.querySelector('button[value="move_drag"]').disabled = isNoTree;
          menuElem.querySelector('button[value="recycle"]').disabled = !(!isNoTree && !isRecycle);
          menuElem.querySelector('button[value="delete"]').disabled = !(!isNoTree && isRecycle);

          menuElem.querySelector('button[value="meta"]').disabled = isNoTree;
        }

        if (!keepLogs) {
          document.getElementById('logger').textContent = '';
        }

        // refresh book tree
        if (!isNoTree) {
          await this.book.loadTreeFiles();
          await this.book.loadToc();
          await this.book.loadMeta();

          const rootId = this.rootId;
          if (!this.book.meta[rootId] && !this.book.isSpecialItem(rootId)) {
            throw new Error(`specified root item "${rootId}" does not exist.`);
          }

          const rootElem = document.getElementById('item-root');
          rootElem.setAttribute('data-id', rootId);
          rootElem.textContent = '';
          rootElem.container = document.createElement('ul');
          rootElem.container.classList.add('container');
          rootElem.appendChild(rootElem.container);
          this.toggleItem(rootElem, true);
          await this.loadViewStatus();
        } else {
          const rootElem = document.getElementById('item-root');
          rootElem.textContent = '';
        }
      } catch (ex) {
        console.error(ex);
        this.error(scrapbook.lang('ScrapBookErrorInitTree', [ex.message]));
        return;
      }

      this.enableUi(true);
    },

    getViewStatusKey() {
      return {table: "scrapbookTreeView", bookId: this.bookId};
    },

    async saveViewStatus() {
      const getXpathPos = (elem) => {
        const id = elem.getAttribute('data-id');
        let cur = elem, i = 0;
        while (cur) {
          if (cur.getAttribute('data-id') === id) { i++; }
          cur = cur.previousElementSibling;
        }
        return i;
      };

      const getXpaths = (elem, map) => {
        const path = [];
        let cur = elem;
        while (cur && cur.closest('#item-root')) {
          path.unshift(`*[@data-id=${scrapbook.quoteXPath(cur.getAttribute('data-id'))}][${getXpathPos(cur)}]`);
          cur = cur.parentElement.parentElement;
        }

        for (let i = 0, I = path.length; i < I; ++i) {
          const subpath = path.slice(0, i + 1);
          const sel = './' + subpath.join('/ul/');
          if (!map.has(sel)) {
            map.set(sel, i === I - 1);
          }
        }
      };

      const saveViewStatus = async () => {
        const itemsElem = document.getElementById('items');
        const selects = {};
        const map = new Map();
        Array.prototype.forEach.call(
          itemsElem.querySelectorAll('ul.container:not([hidden])'),
          x => getXpaths(x.parentElement, map)
        );
        for (const [k, v] of map.entries()) {
          selects[k] = v;
        }

        const key = this.getViewStatusKey();
        const data = {
          time: Date.now(),
          selects,
        };

        await scrapbook.cache.set(key, data, this.mode === 'normal' ? 'storage' : 'sessionStorage');
      };
      this.saveViewStatus = saveViewStatus;
      return await saveViewStatus();
    },

    async loadViewStatus() {
      try {
        const key = this.getViewStatusKey();
        const data = await scrapbook.cache.get(key, this.mode === 'normal' ? 'storage' : 'sessionStorage');

        if (!data) { return; }

        const itemsElem = document.getElementById('items');
        for (const [xpath, willOpen] of Object.entries(data.selects)) {
          const elem = document.evaluate(xpath, itemsElem).iterateNext();
          if (!elem) { continue; }
          if (willOpen) { this.toggleItem(elem, true); }
        }
      } catch (ex) {
        console.error(ex);
      }
    },

    /**
     * Check if the element or its ancestor is removed from document DOM
     */
    isDetached(node) {
      return node.getRootNode().nodeType !== 9;
    },

    /**
     * @kind invokable
     */
    async locate({bookId, id, url, root = 'root'}) {
      if (this.mode !== 'normal') { return null; }

      if (url && typeof bookId === 'undefined') {
        bookId = await server.findBookIdFromUrl(url);
      }
      if (typeof bookId !== 'undefined' && bookId !== this.bookId) {
        await this.refresh(bookId);
      }

      let item;
      if (id) {
        item = this.book.meta[id];
      } else if (url) {
        item = await this.book.findItemFromUrl(url);
      }
      if (!item) { return null; }

      const paths = this.book.findItemPaths(item.id, this.rootId);
      if (!paths.length) { return null; }

      // Attempt to find a match from currently visible items; othwise lookup in
      // the whole tree.
      let curElem;
      for (const elem of document.getElementById('item-root').querySelectorAll(`[data-id="${scrapbook.escapeQuotes(item.id)}"]`)) {
        if (elem.offsetParent) {
          curElem = elem;
          break;
        }
      }

      if (!curElem) {
        curElem = document.getElementById('item-root');
        for (let i = 1, I = paths[0].length; i < I; ++i) {
          const {pos} = paths[0][i];
          this.toggleItem(curElem, true);
          curElem = curElem.container.children[pos];
        }
      }

      // locate the item element
      curElem.scrollIntoView();
      this.highlightItem(curElem, true, true);
      this.saveViewStatus();

      return item;
    },

    async openModalWindow(url) {
      if (browser.windows) {
        await browser.windows.create({
          url,
          type: 'popup',
        });
      } else {
        await browser.tabs.create({
          url,
        });
      }
    },

    async openLink(url, newTab) {
      const getLastFocusedWindow = async (windowTypes = ['normal']) => {
        let win;
        try {
          win = await browser.windows.getLastFocused({
            populate: true,
            windowTypes,
          });
          if (!windowTypes.includes(win.type)) {
            // Firefox deprecates windowTypes argument and may get a last focused
            // window of a bad type. Attempt to get another window instead.
            win = (await browser.windows.getAll({
              populate: true,
            })).find(x => windowTypes.includes(x.type));
          }
          if (!win) {
            throw new Error('no last-focused window');
          }
        } catch (ex) {
          // no last-focused window
          return null;
        }
        return win;
      };

      if (newTab) {
        if (typeof newTab === 'string') {
          window.open(url, newTab);
          return;
        }

        if (scrapbook.userAgent.is('gecko') && browser.windows) {
          // Firefox < 60 (?) allows multiple tabs in a popup window,
          // but the user cannot switch between them.
          // Open the newTab in the last-focused window instead.
          if ((await browser.windows.getCurrent()).type !== 'normal') {
            const win = await getLastFocusedWindow();
            if (!win) {
              await browser.windows.create({
                url,
              });
              return;
            }

            await browser.tabs.create({
              windowId: win.id,
              url,
            });
            return;
          }
        }

        // Chromium allows only one tab in a popup window.
        // If the current tab is already in a popup, the newly created tab
        // will be in the most recently focused window, which does not work
        // same as window.getCurrentWindow or window.getLastFocusedWindow.
        const tab = await browser.tabs.create({
          url,
        });
        return;
      }

      if (browser.windows) {
        const win = await getLastFocusedWindow();
        if (!win) {
          await browser.windows.create({
            url,
          });
          return;
        }

        const targetTab = win.tabs.filter(x => x.active)[0];
        if (!targetTab) {
          await browser.tabs.create({
            windowId: win.id,
            url,
          });
          return;
        }

        await browser.tabs.update(targetTab.id, {
          url,
        });
      } else {
        const activeTab = (await browser.tabs.query({
          active: true,
        }))[0];
        if (!activeTab || activeTab.id === (await browser.tabs.getCurrent()).id) {
          await browser.tabs.create({
            url,
          });
          return;
        }

        await browser.tabs.update(activeTab.id, {
          url,
        });
      }
    },

    itemIsValidTarget(itemId) {
      return itemId && (!!this.book.meta[itemId] || this.book.isSpecialItem(itemId));
    },

    itemMakeContainer(elem) {
      if (elem.container) { return; }

      const div = elem.firstChild;

      const toggle = elem.toggle = document.createElement('a');
      toggle.href = '#';
      toggle.className = 'toggle';
      toggle.addEventListener('click', this.onToggleClick.bind(this));
      div.insertBefore(toggle, div.firstChild);

      const toggleImg = document.createElement('img');
      toggleImg.src = TOGGLER_ICON.collapsed;
      toggleImg.alt = '';
      toggle.appendChild(toggleImg);

      const container = elem.container = document.createElement('ul');
      container.className = 'container';
      container.hidden = true;
      elem.appendChild(container);
    },

    itemReduceContainer(elem) {
      if (!elem.container) { return; }
      if (elem.container.hasAttribute('data-loaded') && !elem.container.hasChildNodes()) {
        // remove toggle
        if (elem.toggle && elem.toggle.parentNode) {
          elem.toggle.remove();
        }

        // remove container
        elem.container.remove();
        delete elem.container;
      }
    },

    addItem(id, parent, index = Infinity) {
      const meta = this.book.meta[id];
      if (!meta) {
        return null;
      }

      var elem = document.createElement('li');
      elem.setAttribute('data-id', id);
      if (meta.type) { elem.setAttribute('data-type', meta.type); };
      if (meta.marked) { elem.setAttribute('data-marked', ''); }
      this.itemMakeContainer(parent);

      var div = elem.appendChild(document.createElement('div'));
      div.setAttribute('draggable', true);
      div.addEventListener('click', this.onItemClick.bind(this));
      div.addEventListener('mousedown', this.onItemMiddleClick.bind(this));
      div.addEventListener('contextmenu', this.onItemContextMenu.bind(this));
      div.addEventListener('dragstart', this.onItemDragStart.bind(this));
      div.addEventListener('dragend', this.onItemDragEnd.bind(this));
      div.addEventListener('dragenter', this.onItemDragEnter.bind(this));
      div.addEventListener('dragover', this.onItemDragOver.bind(this));
      div.addEventListener('dragleave', this.onItemDragLeave.bind(this));
      div.addEventListener('drop', this.onItemDrop.bind(this));

      if (meta.type !== 'separator') {
        var a = div.appendChild(document.createElement('a'));
        a.appendChild(document.createTextNode(meta.title || id));
        a.title = (meta.title || id) + (meta.source ? "\n" + meta.source : "") + (meta.comment ? "\n\n" + meta.comment : "");
        if (meta.type !== 'bookmark') {
          if (meta.index) { a.href = this.book.dataUrl + scrapbook.escapeFilename(meta.index); }
        } else {
          if (meta.source) {
            a.href = meta.source;
          } else {
            if (meta.index) { a.href = this.book.dataUrl + scrapbook.escapeFilename(meta.index); }
          }
        }
        if (meta.type === 'folder') { a.addEventListener('onclick', this.onFolderClick.bind(this)); }

        var icon = a.insertBefore(document.createElement('img'), a.firstChild);
        if (meta.icon) {
          icon.src = /^(?:[a-z][a-z0-9+.-]*:|[/])/i.test(meta.icon || "") ? 
              meta.icon : 
              (this.book.dataUrl + scrapbook.escapeFilename(meta.index || "")).replace(/[/][^/]+$/, '/') + meta.icon;
        } else {
          icon.src = ITEM_TYPE_ICON[meta.type] || ITEM_TYPE_ICON[''];
        }
        icon.alt = "";
      } else {
        var line = div.appendChild(document.createElement('fieldset'));
        line.title = (meta.title || "") + (meta.source ? "\n" + meta.source : "") + (meta.comment ? "\n\n" + meta.comment : "");

        var legend = line.appendChild(document.createElement('legend'));
        if (meta.title) {
          legend.appendChild(document.createTextNode('\xA0' + meta.title + '\xA0'));
        }
      }

      var childIdList = this.book.toc[id];
      if (childIdList && childIdList.length) {
        this.itemMakeContainer(elem);
      }

      parent.container.insertBefore(elem, parent.container.children[index]);

      return elem;
    },

    toggleItem(elem, willOpen) {
      const container = elem.container;
      if (!container) { return; }

      if (typeof willOpen === "undefined") {
        willOpen = !!container.hidden;
      }

      // load child nodes if not loaded yet
      if (willOpen && !container.hasAttribute('data-loaded'))  {
        if (this.book.toc[elem.getAttribute('data-id')]) {
          for (const id of this.book.toc[elem.getAttribute('data-id')]) {
            this.addItem(id, elem);
          }
        }
        container.setAttribute('data-loaded', '');
      }

      container.hidden = !willOpen;

      // toggle the toggler (twisty)
      // root item container's previousSibling is undefined
      if (container.previousSibling) {
        container.previousSibling.firstChild.firstChild.src = willOpen ?
        TOGGLER_ICON.expanded :
        TOGGLER_ICON.collapsed;
      }
    },

    getHighlightElem(itemElem) {
      let elem = itemElem.firstChild;
      return elem;
    },

    highlightItem(itemElem,
        willHighlight = !this.getHighlightElem(itemElem).classList.contains("highlight"),
        reselect = true,
        ranged = false) {
      if (willHighlight) {
        if (reselect) {
          if (this.lastHighlightElem) {
            Array.prototype.forEach.call(document.querySelectorAll('#items .highlight'), (elem) => {
              elem.classList.remove("highlight");
            });
          }
          this.getHighlightElem(itemElem).classList.add("highlight");
          this.lastHighlightElem = itemElem;
        } else {
          if (!ranged) {
            this.getHighlightElem(itemElem).classList.add("highlight");
            this.lastHighlightElem = itemElem;
          } else {
            const nodeIterator = document.createNodeIterator(
              document.getElementById('item-root'),
              NodeFilter.SHOW_ELEMENT
            );
            let node, start = false, endItem;
            while (node = nodeIterator.nextNode()) {
              if (node.matches('li[data-id]')) {
                if (!start) {
                  if (node === itemElem) {
                    start = true;
                    endItem = this.lastHighlightElem && this.lastHighlightElem.closest("#items") ? this.lastHighlightElem : itemElem;
                  } else if (node === this.lastHighlightElem) {
                    start = true;
                    endItem = itemElem;
                  }
                }
                if (start) {
                  this.getHighlightElem(node).classList.add("highlight");
                  if (node === endItem) { break; }
                }
              }
            }
            this.lastHighlightElem = itemElem;
          }
        }
      } else {
        if (reselect) {
          if (this.lastHighlightElem) {
            Array.prototype.forEach.call(document.querySelectorAll('#items .highlight'), (elem) => {
              elem.classList.remove("highlight");
            });
            this.lastHighlightElem = null;
          }
        } else {
          if (!ranged) {
            this.getHighlightElem(itemElem).classList.remove("highlight");
            this.lastHighlightElem = itemElem;
          } else {
            const nodeIterator = document.createNodeIterator(
              document.getElementById('item-root'),
              NodeFilter.SHOW_ELEMENT
            );
            let node, start = false, endItem;
            while (node = nodeIterator.nextNode()) {
              if (node.matches('li[data-id]')) {
                if (!start) {
                  if (node === itemElem) {
                    start = true;
                    endItem = this.lastHighlightElem && this.lastHighlightElem.closest("#items") ? this.lastHighlightElem : itemElem;
                  } else if (node === this.lastHighlightElem) {
                    start = true;
                    endItem = itemElem;
                  }
                }
                if (start) {
                  this.getHighlightElem(node).classList.remove("highlight");
                  if (node === endItem) { break; }
                }
              }
            }
            this.lastHighlightElem = itemElem;
          }
        }
      }
    },

    async moveItems(sourceItemElems, targetId, targetIndex) {
      // Reverse the order to always move an item before its parent so that
      // its parent is in the DOM and gets children updated correctly.
      const itemElems = [...sourceItemElems].reverse();

      for (const itemElem of itemElems) {
        if (this.isDetached(itemElem)) { continue; }

        const itemId = itemElem.getAttribute('data-id');

        // forbid moving self to a decendant as it will become non-reachagble
        if (this.book.getReachableItems(itemId).has(targetId)) { continue; }

        const parentItemElem = itemElem.parentNode.parentNode;
        const parentItemId = parentItemElem.getAttribute('data-id');
        const siblingItems = parentItemElem.container.children;
        const index = Array.prototype.indexOf.call(siblingItems, itemElem);

        // update TOC
        const newIndex = this.book.moveItem({
          id: itemId,
          currentParentId: parentItemId,
          currentIndex: index,
          targetParentId: targetId,
          targetIndex,
        });

        // update DOM
        Array.prototype.filter.call(
          document.getElementById('items').querySelectorAll('[data-id]'),
          x => x.getAttribute('data-id') === parentItemId
        ).forEach((parentElem) => {
          if (!(parentElem.parentNode && parentElem.container && parentElem.container.hasAttribute('data-loaded'))) { return; }
          const itemElem = parentElem.container.children[index];
          itemElem.remove();
          this.itemReduceContainer(parentElem);
        });

        Array.prototype.filter.call(
          document.getElementById('items').querySelectorAll('[data-id]'),
          x => x.getAttribute('data-id') === targetId
        ).forEach((parentElem) => {
          if (!(parentElem.parentNode)) { return; }
          this.itemMakeContainer(parentElem);
          if (!parentElem.container.hasAttribute('data-loaded')) { return; }
          this.addItem(itemId, parentElem, newIndex);
        });

        targetIndex = newIndex;
      }

      // upload changes to server
      await this.book.transaction({
        mode: 'validate',
        callback: async (book) => {
          await book.saveToc();
          await book.loadTreeFiles(true);  // update treeLastModified
        },
      });
    },

    async linkItems(sourceItemElems, targetId, targetIndex) {
      for (const itemElem of sourceItemElems) {
        const itemId = itemElem.getAttribute('data-id');

        // update TOC
        const newIndex = this.book.moveItem({
          id: itemId,
          currentParentId: null,
          targetParentId: targetId,
          targetIndex,
        });

        // update DOM
        Array.prototype.filter.call(
          document.getElementById('items').querySelectorAll('[data-id]'),
          x => x.getAttribute('data-id') === targetId
        ).forEach((parentElem) => {
          if (!(parentElem.parentNode)) { return; }
          this.itemMakeContainer(parentElem);
          if (!parentElem.container.hasAttribute('data-loaded')) { return; }
          this.addItem(itemId, parentElem, newIndex);
        });

        targetIndex = newIndex + 1;
      }

      // upload changes to server
      await this.book.transaction({
        mode: 'validate',
        callback: async (book) => {
          await book.saveToc();
          await book.loadTreeFiles(true);  // update treeLastModified
        },
      });
    },

    async uploadItems(files, targetId, targetIndex) {
      await this.book.transaction({
        mode: 'validate',
        callback: async (book) => {
          for (const file of files) {
            try {
              // create new item
              const newItem = this.book.addItem({
                item: {
                  "title": file.name,
                  "type": "file",
                },
                parentId: targetId,
                index: targetIndex,
              });
              newItem.index = newItem.id + '/index.html';

              let filename = file.name;
              if (filename === 'index.html') { filename = 'index-1.html'; }
              filename = scrapbook.validateFilename(filename, scrapbook.getOption("capture.saveAsciiFilename"));

              // upload file
              {
                const target = this.book.dataUrl + scrapbook.escapeFilename(newItem.id + '/' + filename);
                await server.request({
                  url: target + '?a=save',
                  method: "POST",
                  format: 'json',
                  csrfToken: true,
                  body: {
                    upload: file,
                  },
                });
              }

              // upload index.html
              {
                const title = newItem.title;
                const url = scrapbook.escapeFilename(filename);
                const html = `<!DOCTYPE html>
<html data-scrapbook-type="file">
<head>
<meta charset="UTF-8">
<meta http-equiv="refresh" content="0;url=${scrapbook.escapeHtml(url)}">
${title ? '<title>' + scrapbook.escapeHtml(title, false) + '</title>\n' : ''}</head>
<body>
Redirecting to file <a href="${scrapbook.escapeHtml(url)}">${scrapbook.escapeHtml(filename, false)}</a>
</body>
</html>
`;
                const file = new File([html], 'index.html', {type: 'text/html'});
                const target = this.book.dataUrl + scrapbook.escapeFilename(newItem.id + '/index.html');
                await server.request({
                  url: target + '?a=save',
                  method: "POST",
                  format: 'json',
                  csrfToken: true,
                  body: {
                    upload: file,
                  },
                });
              }

              // update DOM
              Array.prototype.filter.call(
                document.getElementById('items').querySelectorAll('[data-id]'),
                x => x.getAttribute('data-id') === targetId
              ).forEach((parentElem) => {
                if (!(parentElem.parentNode)) { return; }
                this.itemMakeContainer(parentElem);
                if (!parentElem.container.hasAttribute('data-loaded')) { return; }
                this.addItem(newItem.id, parentElem, targetIndex);
              });

              targetIndex++;
            } catch (ex) {
              console.error(ex);
              this.warn(`Unable to upload '${file.name}': ${ex.message}`);
            }
          }

          // save meta and TOC
          await book.saveMeta();
          await book.saveToc();
          await book.loadTreeFiles(true);  // update treeLastModified
        },
      });
    },

    onWindowItemDragEnter(event) {
      return this.onItemDragEnter(event, true);
    },

    onWindowItemDragOver(event) {
      return this.onItemDragOver(event, true);
    },

    async onWindowItemDrop(event) {
      return this.onItemDrop(event, true);
    },

    onItemDragStart(event) {
      const itemElem = event.currentTarget.parentNode;
      if (!this.getHighlightElem(itemElem).classList.contains("highlight")) {
        this.highlightItem(event.currentTarget.parentNode, true, true);
      }

      const selectedItemElems = Array.prototype.map.call(
        document.querySelectorAll('#item-root .highlight'),
        x => x.parentNode
      );

      Array.prototype.forEach.call(selectedItemElems, (elem) => {
        elem.classList.add('dragged');
      });

      // Firefox requires at least one data to get dragging work
      event.dataTransfer.setData(
        'text/plain',
        selectedItemElems.map(x => x.getAttribute('data-id')).join('\r\n')
      );

      // prevent mis-intereprated as a regular link
      event.dataTransfer.clearData('text/uri-list');

      event.dataTransfer.effectAllowed = 'all';
      this.lastDraggedElem = selectedItemElems;
    },

    onItemDragEnd(event) {
      if (!this.lastDraggedElem) { return; }

      Array.prototype.forEach.call(this.lastDraggedElem, (elem) => {
        elem.classList.remove('dragged');
      });
      this.lastDraggedElem = null;
    },

    onItemDragEnter(event, wholeWindow = false) {
      if (!wholeWindow) {
        const wrapper = event.currentTarget;
        if (!wrapper.classList.contains('dragover')) {
          wrapper.classList.add('dragover');
        }

        let cur = wrapper.parentNode;
        while (cur && cur.closest('#items')) {
          if (!cur.classList.contains('dragover-within')) {
            cur.classList.add('dragover-within');
          }
          cur = cur.parentNode.parentNode;
        }
      }

      this.onItemDragOver(event, wholeWindow);
    },

    onItemDragOver(event, wholeWindow = false) {
      event.stopPropagation();
      event.preventDefault();

      // disallow when commands disabled
      if (document.querySelector('#command:disabled')) {
        event.dataTransfer.dropEffect = 'none';
        return;
      }

      // disallow when drag disabled
      if (document.querySelector('#command-popup button[value="move_drag"]:disabled')) {
        event.dataTransfer.dropEffect = 'none';
        return;
      }

      // return for non-allowed cases
      if (!(
        (this.lastDraggedElem && !wholeWindow) ||
        (event.dataTransfer.types.includes('Files') && this.rootId !== 'recycle') ||
        (event.dataTransfer.types.includes('text/uri-list') && this.rootId !== 'recycle')
      )) {
        event.dataTransfer.dropEffect = 'none';
        return;
      }

      // update GUI
      if (!wholeWindow) {
        const wrapper = event.currentTarget;
        const wrapperRect = wrapper.getBoundingClientRect();
        const pos = (event.clientY - wrapperRect.top) / wrapperRect.height;

        if (pos < 1/3) {
          if (!wrapper.classList.contains('above')) {
            wrapper.classList.add('above');
          }
          if (wrapper.classList.contains('below')) {
            wrapper.classList.remove('below');
          }
          if (wrapper.classList.contains('within')) {
            wrapper.classList.remove('within');
          }
        } else if (pos > 2/3) {
          if (wrapper.classList.contains('above')) {
            wrapper.classList.remove('above');
          }
          if (!wrapper.classList.contains('below')) {
            wrapper.classList.add('below');
          }
          if (wrapper.classList.contains('within')) {
            wrapper.classList.remove('within');
          }
        } else {
          if (wrapper.classList.contains('above')) {
            wrapper.classList.remove('above');
          }
          if (wrapper.classList.contains('below')) {
            wrapper.classList.remove('below');
          }
          if (!wrapper.classList.contains('within')) {
            wrapper.classList.add('within');
          }
        }
      }

      if (this.lastDraggedElem && !wholeWindow) {
        // determine the drop effect according to modifiers
        if (event.ctrlKey && this.rootId !== 'recycle') {
          event.dataTransfer.dropEffect = 'link';
          document.getElementById('items').classList.remove('moving');
        } else {
          event.dataTransfer.dropEffect = 'move';
          document.getElementById('items').classList.add('moving');
        }
      } else if (event.dataTransfer.types.includes('Files') && this.rootId !== 'recycle') {
        event.dataTransfer.dropEffect = 'copy';
      } else if (event.dataTransfer.types.includes('text/uri-list') && this.rootId !== 'recycle') {
        // determine the drop effect according to modifiers
        if (event.ctrlKey) {
          event.dataTransfer.dropEffect = 'link';
        } else {
          event.dataTransfer.dropEffect = 'copy';
        }
      }
    },

    onItemDragLeave(event) {
      event.stopPropagation();

      const wrapper = event.currentTarget;
      let enteredElem = event.relatedTarget;

      // In Firefox the relatedTarget could be a text node
      if (enteredElem && enteredElem.nodeType !== 1) {
        enteredElem = enteredElem.parentElement;
      }

      // skip when entering another descendant of the same dragover element
      if (enteredElem && enteredElem.closest('.dragover') === wrapper) {
        return;
      }

      wrapper.classList.remove('dragover');
      wrapper.classList.remove('above');
      wrapper.classList.remove('below');
      wrapper.classList.remove('within');

      let cur = wrapper.parentNode;
      while (cur && cur.closest('#items')) {
        cur.classList.remove('dragover-within');
        cur = cur.parentNode.parentNode;
      }
    },

    async onItemDrop(event, wholeWindow = false) {
      event.stopPropagation();
      event.preventDefault();

      // return for non-allowed cases
      if (!(
        (this.lastDraggedElem && !wholeWindow) ||
        (event.dataTransfer.types.includes('Files') && this.rootId !== 'recycle') ||
        (event.dataTransfer.types.includes('text/uri-list') && this.rootId !== 'recycle')
      )) {
        event.dataTransfer.dropEffect = 'none';
        return;
      }

      // update GUI and calculate position
      let targetId;
      let targetIndex;
      if (!wholeWindow) {
        const wrapper = event.currentTarget;
        wrapper.classList.remove('dragover');
        wrapper.classList.remove('above');
        wrapper.classList.remove('below');
        wrapper.classList.remove('within');

        let cur = wrapper.parentNode;
        while (cur && cur.closest('#items')) {
          cur.classList.remove('dragover-within');
          cur = cur.parentNode.parentNode;
        }

        const wrapperRect = wrapper.getBoundingClientRect();
        const pos = (event.clientY - wrapperRect.top) / wrapperRect.height;
        const itemElem = wrapper.parentNode;

        if (pos < 1/3) {
          // above
          const parentItemElem = itemElem.parentNode.parentNode;
          const siblingItems = parentItemElem.container.children;
          const index = Array.prototype.indexOf.call(siblingItems, itemElem);
          targetId = parentItemElem.getAttribute('data-id');
          targetIndex = index;
        } else if (pos > 2/3) {
          // below
          const parentItemElem = itemElem.parentNode.parentNode;
          const siblingItems = parentItemElem.container.children;
          const index = Array.prototype.indexOf.call(siblingItems, itemElem);
          targetId = parentItemElem.getAttribute('data-id');
          targetIndex = index + 1;
        } else {
          // within
          targetId = itemElem.getAttribute('data-id');
          targetIndex = Infinity;
        }
      } else {
        targetId = this.rootId;
        targetIndex = Infinity;
      }
      if (!this.itemIsValidTarget(targetId)) { return; }

      // handle action
      if (this.lastDraggedElem && !wholeWindow) {
        const selectedItemElems = Array.prototype.map.call(
          document.querySelectorAll('#item-root .highlight'),
          x => x.parentNode
        );
        if (!selectedItemElems.length) {
          // this shouldn't happen as this.lastDraggedElem should be selected
          return;
        }

        this.enableUi(false);

        try {
          if (event.ctrlKey && this.rootId !== 'recycle') {
            await this.linkItems(selectedItemElems, targetId, targetIndex);
          } else {
            await this.moveItems(selectedItemElems, targetId, targetIndex);
          }
        } catch (ex) {
          console.error(ex);
          this.error(ex.message);
          // when any error happens, the UI is possibility in an inconsistent status.
          // lock the UI to avoid further manipulation and damage.
          return;
        }

        this.enableUi(true);
      } else if (event.dataTransfer.types.includes('Files') && this.rootId !== 'recycle') {
        this.enableUi(false);

        try {
          const entries = Array.prototype.map.call(
            event.dataTransfer.items,
            x => x.webkitGetAsEntry && x.webkitGetAsEntry()
          );

          const files = [];
          for (const entry of entries) {
            if (!entry.isFile) { continue; }
            try {
              const file = await new Promise((resolve, reject) => {
                entry.file(resolve, reject);
              });
              files.push(file);
            } catch (ex) {}
          }

          await this.uploadItems(files, targetId, targetIndex);
        } catch (ex) {
          console.error(ex);
          this.error(ex.message);
          // when any error happens, the UI is possibility in an inconsistent status.
          // lock the UI to avoid further manipulation and damage.
          return;
        }

        this.enableUi(true);
      } else if (event.dataTransfer.types.includes('text/uri-list') && this.rootId !== 'recycle') {
        this.enableUi(false);

        const mode = event.ctrlKey ? 'bookmark' : event.altKey ? '' : 'source';
        try {
          const tasks = event.dataTransfer.getData('text/uri-list')
            .split('\r\n')
            .filter(x => !x.startsWith('#') && x.trim())
            .map(url => ({
              url,
              mode,
              options: {
                "capture.saveTo": "server",
              },
            }));
          await scrapbook.invokeCaptureEx({
            tasks,
            parentId: targetId,
            index: targetIndex,
            waitForResponse: true,
          });
        } catch (ex) {
          console.error(ex);
          this.error(ex.message);
          // when any error happens, the UI is possibility in an inconsistent status.
          // lock the UI to avoid further manipulation and damage.
          return;
        }

        this.enableUi(true);
      }
    },

    onItemClick(event) {
      const itemElem = event.currentTarget.parentNode;
      const reselect = this.mode !== 'manage' && !event.ctrlKey && !event.shiftKey;
      this.highlightItem(itemElem, undefined, reselect, event.shiftKey);
    },

    onItemMiddleClick(event) {
      if (event.button !== 1) { return; }
      this.onItemClick(event);
    },

    onItemContextMenu(event) {
      const itemElem = event.currentTarget.parentNode;
      if (!this.getHighlightElem(itemElem).classList.contains("highlight")) {
        this.highlightItem(event.currentTarget.parentNode, true, true);
      }
    },

    onFolderClick(event) {
      event.preventDefault();
      const target = event.currentTarget.previousSibling;
      target.focus();
      target.click();
    },

    onToggleClick(event) {
      event.preventDefault();
      event.stopPropagation();
      const itemElem = event.currentTarget.parentNode.parentNode;
      const toggling = !event.ctrlKey && !event.shiftKey;
      if (toggling) {
        this.toggleItem(itemElem);
        this.saveViewStatus();
      } else {
        this.highlightItem(itemElem, undefined, false, event.shiftKey);
      }
    },

    async onClickAnchor(event) {
      const elem = event.target.closest('a[href]:not(.toggle)');
      if (!elem) {
        return;
      }

      if (this.mode !== 'manage') {
        if (event.ctrlKey || event.altKey || event.shiftKey || event.metaKey) {
          event.preventDefault();
        } else {
          if (browser.windows) {
            // for desktop browsers, open link in the same tab of the main window
            event.preventDefault();
            await this.openLink(elem.href);
          } else {
            // for Firefox Android (browser.windows not supported)
            // use default action to open in the "webscrapbook" tab
          }
        }
      } else {
        // do not open link on click in manage mode
        event.preventDefault();
      }
    },

    async onBookChange(event) {
      const bookId = event.target.value;
      await this.refresh(bookId);
    },

    onKeyDown(event) {
      if (!document.getElementById('command-popup-book').hidden) {
        if (event.code === "Escape") {
          event.preventDefault();
          this.showBookCommands(false);
          return;
        }

        if (event.code === "ArrowUp") {
          event.preventDefault();
          const buttons = Array.from(document.querySelectorAll('#command-popup-book button:enabled:not([hidden])'));
          let idx = buttons.indexOf(document.querySelector('#command-popup-book button:focus'));
          idx--;
          if (idx < 0) { idx = buttons.length - 1; }
          buttons[idx].focus();
          return;
        }

        if (event.code === "ArrowDown") {
          event.preventDefault();
          const buttons = Array.from(document.querySelectorAll('#command-popup-book button:enabled:not([hidden])'));
          let idx = buttons.indexOf(document.querySelector('#command-popup-book button:focus'));
          idx++;
          if (idx > buttons.length - 1) { idx = 0; }
          buttons[idx].focus();
          return;
        }

        return;
      }

      if (!document.getElementById('command-popup').hidden) {
        if (event.code === "Escape") {
          event.preventDefault();
          this.showCommands(false);
          return;
        }

        if (event.code === "ArrowUp") {
          event.preventDefault();
          const buttons = Array.from(document.querySelectorAll('#command-popup button:enabled:not([hidden])'));
          let idx = buttons.indexOf(document.querySelector('#command-popup button:focus'));
          idx--;
          if (idx < 0) { idx = buttons.length - 1; }
          buttons[idx].focus();
          return;
        }

        if (event.code === "ArrowDown") {
          event.preventDefault();
          const buttons = Array.from(document.querySelectorAll('#command-popup button:enabled:not([hidden])'));
          let idx = buttons.indexOf(document.querySelector('#command-popup button:focus'));
          idx++;
          if (idx > buttons.length - 1) { idx = 0; }
          buttons[idx].focus();
          return;
        }

        return;
      }

      {
        // skip if a modifier is pressed
        if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
          return;
        }

        // skip if command is diabled
        if (document.querySelector('#command:disabled')) {
          return;
        }

        // execute the corresponding command
        const command = {
          'F2': 'meta',
          'Delete': 'recycle',
        }[event.code];

        if (!command) {
          return;
        }

        // skip if command disabled
        if (document.querySelector(`#command-popup button[value="${command}"]:disabled`)) {
          return;
        }

        // execute command
        event.preventDefault();
        const evt = new CustomEvent("command", {
          detail: {
            command,
            itemElems: true,
          },
        });
        window.dispatchEvent(evt);
      }
    },

    onContextMenu(event) {
      // for mouse right click, skip if not in the tree area
      if (event.button === 2 && !event.target.closest('#items')) { return; }

      // disallow when commands disabled
      if (document.querySelector('#command:disabled')) {
        event.dataTransfer.dropEffect = 'none';
        return;
      }

      event.preventDefault();
      this.showCommands(true, event);
    },

    onSearchButtonClick(event) {
      event.preventDefault();
      const url = new URL(browser.runtime.getURL(`scrapbook/search.html`));
      url.searchParams.set('id', this.bookId);
      if (this.rootId !== 'root') { url.searchParams.set('root', this.rootId); }
      this.openLink(url.href, "search");
    },

    onRefreshButtonClick(event) {
      event.preventDefault();
      location.reload();
    },

    onCommandButtonClick(event) {
      event.preventDefault();
      let clientX = event.clientX;
      let clientY = event.clientY;
      if (clientX === 0 && clientY === 0) {
        // keybord or other device
        const rect = document.getElementById('command').getBoundingClientRect();
        clientX = rect.left;
        clientY = rect.top;
      }
      this.showBookCommands(true, {clientX, clientY});
    },

    async onBookCommandClick(event) {
      if (event.target.localName !== 'button') { return; }

      this.showBookCommands(false);

      const command = event.target.value;

      switch (command) {
        case 'upload': {
          const elem = document.getElementById('upload-file-selector');
          elem.removeAttribute('data-item-elems');
          elem.value = '';
          elem.click();
          break;
        }

        default: {
          const evt = new CustomEvent("command", {
            detail: {
              command,
              itemElems: [],
            },
          });
          window.dispatchEvent(evt);
        }
      }
    },

    async onBookCommandFocusOut(event) {
      // skip when focusing another descendant of the wrapper
      if (document.getElementById('command-popup-book').contains(event.relatedTarget)) {
        return;
      }

      this.showBookCommands(false);
    },

    async onCommandClick(event) {
      if (event.target.localName !== 'button') { return; }

      this.showCommands(false);

      const command = event.target.value;

      switch (command) {
        case 'upload': {
          const elem = document.getElementById('upload-file-selector');
          elem.setAttribute('data-item-elems', '');
          elem.value = '';
          elem.click();
          break;
        }

        default: {
          const evt = new CustomEvent("command", {
            detail: {
              command,
              itemElems: true,
            },
          });
          window.dispatchEvent(evt);
        }
      }
    },

    async onCommandFocusOut(event) {
      // skip when focusing another descendant of the wrapper
      if (document.getElementById('command-popup').contains(event.relatedTarget)) {
        return;
      }

      this.showCommands(false);
    },

    /***
     * @param {Object} event.detail
     * @param {string} event.detail.command - the command being run
     * @param {(HTMLElement|true)[]} [event.detail.itemElems] - selected item
     *     elements, or simply true to query from current document.
     * @param {File[]} [event.detail.files] - files being uploaded
     */
    async onCommandRun(event) {
      const detail = event.detail;
      if (detail.itemElems === true) {
        detail.itemElems = Array.prototype.map.call(
          document.querySelectorAll('#item-root .highlight'),
          x => x.parentNode
        );
      }

      this.enableUi(false);

      try {
        await this.commands[detail.command](detail);
      } catch (ex) {
        console.error(ex);
        this.error(ex.message);
        // when any error happens, the UI is possibility in an inconsistent status.
        // lock the UI to avoid further manipulation and damage.
        return;
      }

      this.enableUi(true);

      await this.saveViewStatus();
    },

    onClickFileSelector(event) {
      event.preventDefault();
      const evt = new CustomEvent("command", {
        detail: {
          command: 'upload',
          itemElems: event.target.hasAttribute('data-item-elems') || [],
          files: event.target.files,
        },
      });
      window.dispatchEvent(evt);
    },
  };

  scrapbook.addMessageListener((message, sender) => {
    if (!message.cmd.startsWith("tree.")) { return false; }
    if (message.id && message.id !== tree.sidebarWindowId) { return false; }
    return true;
  });

  // record current windowId for later validation if it's sidebar
  if (browser.sidebarAction && browser.windows) {
    (async () => {
      // Firefox has an issue that getViews({windowId}) does not contain sidebars.
      // https://bugzilla.mozilla.org/show_bug.cgi?id=1612390
      if ((await browser.extension.getViews({type: 'sidebar'})).some(v => v === window)) {
        tree.sidebarWindowId = (await browser.windows.getCurrent()).id;
      }
    })();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    scrapbook.loadLanguages(document);

    window.addEventListener('keydown', tree.onKeyDown.bind(tree));
    window.addEventListener('contextmenu', tree.onContextMenu.bind(tree));

    window.addEventListener('dragenter', tree.onWindowItemDragEnter.bind(tree));
    window.addEventListener('dragover', tree.onWindowItemDragOver.bind(tree));
    window.addEventListener('drop', tree.onWindowItemDrop.bind(tree));

    document.getElementById("book").addEventListener('change', tree.onBookChange.bind(tree));

    document.getElementById("search").addEventListener('click', tree.onSearchButtonClick.bind(tree));
    document.getElementById("refresh").addEventListener('click', tree.onRefreshButtonClick.bind(tree));
    document.getElementById("command").addEventListener('click', tree.onCommandButtonClick.bind(tree));

    document.getElementById("command-popup-book").addEventListener('click', tree.onBookCommandClick.bind(tree));
    document.getElementById("command-popup-book").addEventListener('focusout', tree.onBookCommandFocusOut.bind(tree));

    document.getElementById("command-popup").addEventListener('click', tree.onCommandClick.bind(tree));
    document.getElementById("command-popup").addEventListener('focusout', tree.onCommandFocusOut.bind(tree));

    // file selector
    document.getElementById('upload-file-selector').addEventListener('change', tree.onClickFileSelector.bind(tree));

    // command handler
    window.addEventListener('command', tree.onCommandRun.bind(tree));

    document.getElementById('item-root').addEventListener('click', tree.onClickAnchor.bind(tree));

    await tree.init();
  });


  return tree;

}));
