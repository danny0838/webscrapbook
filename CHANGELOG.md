# Changelog
* This project generally follows [semantic versioning](https://semver.org/). For a version `x.y.z`, `x` means a major (backward incompatible) change, `y` means a minor (backward compatible) change, and `z` means a patch (bug fix). Few versions may not strictly follow this rule due to historical reasons, though.
* Versions before 1.0 are in initial development. APIs are not stable for these versions, even a `y` version can involve a breaking change, and only partial notable changes are summarized in this document. See full commit history in the source repository for details.
* Backend server requirement in this document refers to the version of [`webscrapbook` Python package](https://github.com/danny0838/pywebscrapbook) (or PyWebScrapBook).

## [2.24.3] - 2025-10-13
* Fixed incorrect log URL when capturing a frame.
* Fixed several missing warning messages during a capture.
* Fixed several potential errors for some modules.
* Miscellaneous improvements to the internal code, test suite, and development tools.

## [2.24.2] - 2025-09-21
* Fixed script error in Firefox for Android.
* Improved help about host permissions.
* Miscellaneous improvements to the internal code and test suite.

## [2.24.1] - 2025-09-15
* Dropped support for Firefox < 79 and Google Chrome < 102.
* Migrated to Manifest V3 for Google Chrome releases.
* Added support for native sidebar for Google Chrome.
* Added support for dynamic extension URLs in web-accessible resources for Google Chrome.
* Miscellaneous improvements to the internal code and test suite.

## [2.23.5] - 2025-09-13
* Fixed script error in some old browsers.

## [2.23.4] - 2025-09-07
* Fixed an issue where sidebar messages are sometimes obscured.
* Fixed an issue where sidebars aren't refreshed when saving an editing note or postit.
* Fixed an issue where the item title isn't updated when saving content with `title-src` scrapbook element.

## [2.23.3] - 2025-08-25
* Improved debug parameter handling for scrapbook tools.
* Miscellaneous improvements to the internal code and build scripts.

## [2.23.2] - 2025-08-17
* Miscellaneous improvements to the package, internal code, and test suite.

## [2.23.1] - 2025-08-09
* Fixed a script error on `HTMLSlotElement.assign` in Chromium < 92.
* Fixed a script error on `document.adoptedStyleSheets.push` in Chromium < 99.
* Miscellaneous improvements to the test suite.

## [2.23.0] - 2025-07-21
* Added support for rewriting the `formaction` attribute on related elements.
* Fixed an issue where `javascript:` URLs were not cleared according to the `capture.script` option on `action` and frame `src` attributes, and in certain edge cases on anchor `href` attributes.
* Fixed a script error on `input[type="image"]` without a `src` attribute.
* Fixed incorrect base URL resolution for `form[action]` in certain spec-violating cases.
* Fixed incorrect escaping of HTML comments in certain edge cases.
* Miscellaneous improvements to the internal code.

## [2.22.1] - 2025-07-14
* Item picker now allows specifying a relative position.

## [2.22.0] - 2025-07-13
* Added item picker for Move and Copy commands in the scrapbook sidebar.
* Miscellaneous improvements to the internal code.

## [2.21.0] - 2025-06-03
* Fixed an issue where the `Sync` command did not work in a Chromium-based mobile browser.
* Added option `scrapbook.useBrowserSidebars` to control use of the native browser sidebar.
* Miscellaneous improvements to the internal code.

## [2.20.0] - 2025-05-20
* Bumped server requirement to >= 2.6.0.
* Reworked scrapbook search to support the new `default:` command, which allows searching across multiple fields.
* Improved the editor:
  * Added `Annotation tool > View all annotations` to view and locate annotations.
  * Reworked `HTML editor > Insert HTML` tool to support in-place HTML code editing.
  * Reworked `HTML editor > Edit color` tool to support interactive color selection.
  * Added support for keyboard navigation of context menus via arrow keys.
* Fixed an issue where the `Edit tab` command wouldn't work on a page with an active editor after extension reload.
* Fixed bidirectional text support in some modal dialog windows.

## [2.19.1] - 2025-05-16
* Fixed an issue where editing a marker could not be undone.
* Fixed a packging issue that left unexpected files in the extension package.

## [2.19.0] - 2025-05-15
* Improved dialog prompts for editing multiline text or selecting items.
* Enhanced icon semantics and visual quality.
* Miscellaneous improvements and bug fixes to the UI, internal code, builder scripts, documentation, and test suite.

## [2.18.8] - 2025-05-11
* Fixed an issue where editor commands did not work in frames.
* Fixed content direction of sticky notes for RTL user agents.

## [2.18.7] - 2025-05-11
* Fixed an issue where `Undo` sometimes reactivated an already saved edit.
* Fixed an issue where buttons in a marker's editing box were clipped.

## [2.18.6] - 2025-05-10
* Fixed an issue where `Undo` didn't work properly with sticky notes.
* Miscellaneous improvements to the internal code and test suite.

## [2.18.5] - 2025-04-22
* Fixed script error affecting the `notify captured pages` and `auto capture` features.

## [2.18.4] - 2025-04-18
* Fixed an error with `Shift-←` and `Shift-→` in the sidebar.
* Improved localization for zh_TW.
* Miscellaneous improvements and bug fixes to the internal code and test suite.
* Added a code linting tool for development.

## [2.18.3] - 2025-03-29
* Fixed a view status persistence issue for a large tree in a manage window.
* Miscellaneous improvements to the internal code and test suite.

## [2.18.2] - 2025-03-24
* Added support for shortcut customization for action and sidebar toggling.
* Miscellaneous refactoring and improvements to the internal code.

## [2.18.1] - 2025-03-23
* Fixed an issue where auto-capture and page capture notifications sometimes did not work correctly after backend data changes.
* Miscellaneous improvements and bug fixes to the internal code.

## [2.18.0] - 2025-03-20
* Changed the default file extension for the `image/jpeg` MIME type from `jpeg` to `jpg`.
* Miscellaneous improvements and bug fixes to the internal code.

## [2.17.2] - 2025-03-19
* Fixed unexpected `undefined` values when migrating synced options from older versions in Firefox.
* Miscellaneous improvements and bug fixes to the internal code.

## [2.17.1] - 2025-03-17
* Fixed an issue where referrer rewriting did not work in Firefox.
* Miscellaneous improvements to the internal code.

## [2.17.0] - 2025-03-14
* Improved sidebar window positioning on multi-monitor setups for Chromium.
* Fixed an issue where large size options were not correctly saved and read.
  * Options are now stored locally.
  * Saved options from previous versions will be automatically migrated.
  * Added a sync manager that allows options to be manually stored to and retrieved from the sync area.
* Resolved a security vulnerability that could allow websites or other extensions to forge requests.
* Miscellaneous improvements and bug fixes to the internal code and test suite.

## [2.16.1] - 2024-10-30
* Removed support for switching the container during a capture, as it required a permission that forces Firefox to enable containers.

## [2.16.0] - 2024-10-27
* Tab title is now taken when capturing a tab with `source` or `bookmark` mode.
* Added support for switching container for a capture in Firefox.
* Capturing a tab in a different container in Firefox is now disallowed to prevent an inconsistency.
* Miscellaneous improvements and fixes to the UI, internal code, and test suite.

## [2.15.1] - 2024-10-12
* Fixed inconsistencies in recapture or merge-capture results when using certain capture helper options.
* Miscellaneous improvements to the internal code and test suite.

## [2.15.0] - 2024-10-10
* Added the `options` capture helper property, enabling more reliable overwriting of options (replaces the `options` command).
* Enabled comment and merge-capture configuration in the capture details dialog for multi-page captures.
* Linked files are no longer downloaded if the HTTP request fails when `capture.downLink.file.mode` is set to `header`.
* Favicon and title are no longer fetched for an attachment file when capturing a bookmark.
* The main document of a merge capture is now always captured and updated, even if a previous version exists.
* A redirect page is no longer generated when performing a merge capture on a file.
* Fixed an issue where the `index.html` page was incorrectly overwritten when capturing deep XHTML/SVG pages.
* Fixed an issue where an extra `index.json` was saved when capturing a file with depth set.
* Fixed incorrect favicon path when a page meta-refreshes to another page when capturing a bookmark.
* Fixed incorrect saving path when the item directory path contains "%" for a merge capture.
* Fixed an issue where a link resolving to a page that redirects to another page with a captured version was not rewritten in the newly captured page for a merge capture.
* Fixed an issue where `capture.downLink.urlExtra` was applied to a merge capture without depth set.
* Fixed file renaming for the `application/ogg` MIME type in some older browsers.
* Miscellaneous improvements to the UI, internal code, and test suite.

## [2.14.0] - 2024-09-14
* The expanded/collapsed status of option groups in the capture detail dialog now persists.
* Fixed a CSS handling error for certain `url()` values when capturing a page.
* Fixed an error caused by invalid custom element names when capturing a page.

## [2.13.1] - 2024-08-15
* Fixed a script error that occurred during a merge capture on a file.
* Miscellaneous improvements to the UI and test suite.

## [2.13.0] - 2024-08-02
* Added support for preserving manually assigned slots.
* Fixed an issue where capture selection does not work when the current selection is in a shadow DOM in Chromium.
* Fixed an issue where the current presentation of a canvas with non-2D context cannot be captured correctly.
* Fixed an issue where `Revert all erases` may cause a page crash.
* Fixed an issue where some annotation tools do not work correctly inside a shadow DOM.
* Fixed an issue where the status of certain form elements in erased content is not appropriately reverted when the page is resaved and reopened.
* Fixed an issue where shadow DOMs and constructed stylesheets in erased content cannot be reverted when the page is resaved and reopened.
* Miscellaneous improvements and fixes to the UI, internal code, and test suite.

## [2.12.6] - 2024-07-29
* Improved handling of the `checked` or `selected` attributes when capturing a page.
* No longer record the original null value of special attributes generated by WebScrapBook when capturing a page.
* Fixed an issue where the selected status of option elements was not preserved after a page resave.

## [2.12.5] - 2024-07-28
* Fixed an issue where the `capture.rewriteCss` option was not applied to constructed stylesheets during a capture.
* Fixed an issue where the recorded value of `shadowRoot.slotAssignment` was incorrect when the browser does not support it.
* Fixed missing constructed stylesheets after a page resave.

## [2.12.4] - 2024-07-28
* Fixed error when capturing a clonable shadow DOM.
* Reworked handling of advanced shadow DOM options.

## [2.12.3] - 2024-07-25
* Adjusted the marking of closed shadow DOM contents.

## [2.12.2] - 2024-07-25
* Added support for capturing closed shadow DOM contents.
* Miscellaneous improvements to the test suite.

## [2.12.1] - 2024-07-25
* Fixed a script error that occurred during a page resave in Firefox.
* No longer refresh constructed stylesheets data if the browser does not support it during a page resave.
* Miscellaneous improvements to the UI.

## [2.12.0] - 2024-07-21
* Improved the data scheme for constructed stylesheets to prevent excessive volume/memory usage when shared across multiple DOMs.
* Added the `capture.adoptedStyleSheet` option to control whether constructed stylesheets should be recorded.
* Miscellaneous improvements and fixes to the UI.

## [2.11.1] - 2024-07-20
* Improved mobile navigation for scrapbooks.
* Miscellaneous improvements and fixes to the UI and internal code.

## [2.11.0] - 2024-07-19
* The toolbar dialog now automatically closes when a command is invoked, with a new option `ui.autoCloseBrowserAction` to configure the behavior.
* Removed the restriction that only one indexer or checker can run at a time.
* Miscellaneous improvements and fixes to the UI and internal code.

## [2.10.1] - 2024-07-08
* Fixed a packaging error.

## [2.10.0] - 2024-07-08
* Added support for capturing the site favicon.
* Improved `capture.prettyPrint` for some elements inserted during a capture.
* The `capture.favicon` option is now honored when capturing a bookmark to a file.
* Miscellaneous improvements and fixes to the internal code and test suite.

## [2.9.1] - 2024-04-05
* Fixed an issue where the `@charset` rule in a CSS file was not correctly handled.
* Fixed an issue where BOM in a CSS file was not taking as highest precedence for charset detection.
* Fixed an issue where the document charset and the `charset` attribute of a `link` element were not honored when determining the encoding of a CSS file.
* Miscellaneous improvements and fixes to the internal code and test suite.

## [2.9.0] - 2024-03-30
* Fixed and improved capture helpers:
  * Fixed an issue where many commands did not expand parameters whose value was a command correctly.
  * A selector can now reset its reference node using `base` property.
  * Added "equal" command.
  * "get_html" and "html" commands now support an additional `isOuter` parameter for getting and setting outer HTML.
  * "match" command now supports getting named capture groups.
  * "insert" command can now move nodes by specifying a selector as nodeData.
  * "insert" command now supports "replace" mode.
  * "insert" command now automatically escapes the content of the generated comment nodes.
  * "decode_uri" command now returns the original string if the input string is malformed.
* Improved localization for zh_CN.
* Improved CSS code for several internal pages.

## [2.8.2] - 2024-03-13
* Fixed fatal error when a link with an invalid URL is encountered during an in-depth capture.
* Fixed bad tidying of a CSS containing a URL with escaped newlines.
* Fixed bad tidying of a CSS containing a URL with certain escaped chars.
* Fixed bad tidying of a CSS containing a bad URL token.
* Fixed a potential error for the editor and sidebar when dealing with certain special chars.

## [2.8.1] - 2024-03-10
* Fixed bad tidying of a CSS rule having an attribute selector with a `|=` operator.
* Use `text/javascript` as the default MIME type of `js` files.
* Miscellaneous improvements to the internal code and test suite.

## [2.8.0] - 2024-03-02
* Fixed rewriting of srcset attribute that are separated by alternative spaces.
* Fixed bad URL rewriting in some complicated CSS.
* Fixed bad tidying of a CSS rule containing `:host` or `:host-context`.
* Fixed bad tidying of a CSS rule with a namespaced attribute selector.
* Fixed bad tidying of a nested CSS rule with a selector list.
* Fixed bad tidying of a resource of a font or keyframe referenced by a rule inside a shadow DOM.
* Fixed bad URL rewriting for links in an srcdoc iframe to the main page.
* Fixed bad URL hash rewriting when rebuilding links for an in-depth capture.
* Adjusted parameters handling of a content-type and content-disposition header in some rare cases.
* Miscellaneous improvements to the internal code and test suite.
* Added many tests for the internal API and failure tests for known issues.

## [2.7.0] - 2024-02-24
* Fixed bad referrer when capturing `iframe[srcdoc]` headlessly.
* Fixed possible random errors when capturing an inaccessible `iframe[srcdoc]`.
* No more save `about:` pages for headless frames.
* No more save resources whose URL uses an unsupported protocol.
* Miscellaneous improvements to the internal code and test suite.
* Rewrite the test suite with mocha.js.

## [2.6.5] - 2024-02-17
* Fixed style images in a nested CSS rule in a shadow DOM be emptied when `Style images` is `Save used` for a capture.
* Fixed style images that apppear before the first base element be emptied when `Style images` is `Save used` for a capture.
* Fixed incorrect referrer for CSS resources for a document with customized base URL for a capture.
* Miscellaneous improvements to the internal code and test suite.

## [2.6.4] - 2024-02-13
* Fixed an issue where downloading linked files and in-depth capture for a blob URL did not work.
* Fixed an issue where geolocation could not be obtained from the sidebar in Firefox. (For Firefox < 101 a one-time grant in a non-sidebar window is required. For some old Firefox versions reloading the extension (by disabling and enabling, restarting the browser, etc.) after the grant is required.)
* Fixed an issue where clearing geolocation was not corretly saved.

## [2.6.3] - 2024-02-11
* Fixed an issue where a blob URL could not be captured in Firefox.
* Fixed an issue where MIME type was not detected for a blob URL for a capture in Chromium.
* Miscellaneous improvements to the internal code and test suite.

## [2.6.2] - 2024-02-09
* Fixed an issue where meta and favicon data in a shadow root were incorrectly taken for a capture.
* Fixed charset and content disposition parsing and meta charset rewriting in some special cases for a capture.
* Fixed meta refresh parsing in some special cases for a capture.
* Miscellaneous optimization to the internal code and test suite.

## [2.6.1] - 2024-02-06
* Fixed CSS images for the root element be emptied when `Style images` is `Save used`.
* Fixed referrer policy related attributes for some elements.
* Fixed referrer policy handling for a document with multiple document referrer policy definition for a capture.
* Fixed base URL resolution for some spec-violating cases for a capture.
* Fixed meta element handling for some spec-violating cases for a capture.
* Miscellaneous optimization to the internal code and test suite.

## [2.6.0] - 2024-02-04
* Added support for nesting CSS for a capture.
* Added support for referrer policy related attributes when performing a capture.
* Reworked `capture.referrerPolicy` to provide default referrer policy, or provide dominant referrer policy by prepending "+".
* Fixed some bad referrer handling cases for downgrading requests for a capture.
* Fixed script error when `Rewrite styles` is `(Advanced) tidy` for an external or imported CSS for a headless capture.
* Fixed missing resources inside an at-rule like `@layer` when `Style images` is `Save used` for a capture.
* Fixed `:root` and `:scope` CSS rules not correctly handled when `Rewrite styles` is `Tidy` for a capture.
* Fixed an issue where constructed stylesheets were not captured in Firefox.
* Fixed downloading linked files and in-depth capture of hyperlink elements in an SVG or MathML for a capture.
* Fixed broken version 3 sitemap.
* Fixed missing links in an embedded SVG or MathML for sitemap.
* Fixed misleading links of `a[download], area[download], iframe[srcdoc]` elements for sitemap.
* Miscellaneous optimization to the internal code and test suite.

## [2.5.0] - 2024-01-24
* Added auto-fixing of item create/modify time when the input value is too short or too long, and auto-fill current time if empty.
* Fixed bad handling of ID-Date conversion for some rare cases.

## [2.4.0] - 2024-01-21
* Fixed an issue where a cross-origin imported CSS was captured empty in Chromium >= 120.
* Added support for viewing HTZ/MAFF in a frame directly for Chromium >= 119.
* Fixed minimal compatible Chromium version to >= 73.
* Optimized code by removing compatibility code for old browsers.
* Improved test suite to support customizing tests.

## [2.3.1] - 2024-01-16
* Fix compatibility issues to support Firefox Desktop and Android >= 68.2.

## [2.3.0] - 2024-01-14
* Added Android support for the new policy of Firefox Add-on Site.
* Dropped support for Firefox Desktop < 69 and Firefox for Android < 113.

## [2.2.1] - 2023-09-17
* Added a limit on concurrent download workers, with a new option `capture.downloadWorkers` to configure the behavior.

## [2.1.0] - 2023-08-15
* Bumped version of the `index.json` file generated by in-depth capture to 3.
* Fixed bad path case of the `index.json`, which may cause invalid rebuilt links after a merge capture on a case-sensitive filesystem.
* Added support for uploading/importing through copy and paste (for supported browsers).

## [2.0.4] - 2023-06-21
* Fixed an issue where `Capture tabs` like actions in the context menu of a tab did not apply to all selected tabs.
* Fixed an issue where item locating did not work in Firefox < 59.

## [2.0.3] - 2023-06-18
* Remove obsolete debug code.

## [2.0.2] - 2023-06-18
* Fixed script error in Chromium < 80 and Firefox < 74.

## [2.0.1] - 2023-06-17
* Bumped server requirement to >= 2.0.1.
* Reworked scrapbook search as server sided.
* Optimized several scrapbook operations using new server-sided API.
* Added support for recent picked items for the item picker of the details dialog.
* Added support for erasing elements with XPath.
* Added support for permanently deleting item(s) by holding shift when performing a `Remove`.
* Added `Empty recycle bin` command.
* Added support for item exporting/importing.
* Added new options `scrapbook.autoCache.fulltextCache` and `scrapbook.autoCache.createStaticSite` for automatic cache update.
* Fulltext cache is now updated automatically when creating a new note or uploading files.
* Adjusted DnD effect for the sidebar tree.
* Improved UI for modal dialogs.

## [1.14.7] - 2023-06-11
* Fixed an issue where erasing by selector might remove the custom elements loader.

## [1.14.6] - 2023-06-04
* Fixed misbehaving tree scrollbar for the item picker dialog.

## [1.14.5] - 2023-06-03
* Fixed some GUI issues of the target item selector for `Capture as` dialog when loaded with a non-root value.
* Improved the title for `Capture as` dialog when no task is loaded.
* Improved the GUI for the sidebar tree to make the dropping demarcation more clear.

## [1.14.4] - 2023-05-29
* Fixed incorrectly escaped style/script contents in the captured page in some rare cases.
* Fixed broken `:defined` CSS rules in the captured page when scripts are not saved.

## [1.14.3] - 2023-05-21
* Fixed server-related API error for some older browsers.

## [1.14.2] - 2023-05-17
* Fixed an issue where a long word in a message was not wrapped somewhere.

## [1.14.1] - 2023-05-14
* Fixed script error when copying info from a non-root scrapbook tree with folder-related formatters.

## [1.14.0] - 2023-05-07
* Adjusted key order for the initlal JSON data of the advanced capture dialog.
* A title is now auto-generated when capturing a note through dragging a piece of rich text content.
* Added a tooltip for the title of the postit editor frame.

## [1.13.1] - 2023-05-05
* Fixed an issue where a long postit title was not truncated.

## [1.13.0] - 2023-05-04
* No more save a postit automatically if its content is not changed.
* Fixed an issue where the postit was poorly sized and could hardly be resized when the sidebar tree was large.
* Fixed an issue where an item without title showed marked alternative title in the search result.

## [1.12.0] - 2023-04-29
* Small text files are now compressed when added to an archive.

## [1.11.0] - 2023-04-25
* Added support for multiple include and exclude patterns for auto-capture.
* Fixed an issue where no-tree books were shown in `Capture as` dialog.
* Fixed an issue of showing items unrelated to the current selected parent book in `Capture as` dialog.
* Fixed an issue where item locking did not prevent a recapture or merge-capture.
* Fixed an issue where copying an item across scrapbooks could generate two transaction backups.
* Miscellaneous code optimization and refactoring.

## [1.10.2] - 2023-04-18
* Fixed an issue where removing an item may got an error when the recycle bin was empty.

## [1.10.1] - 2023-04-13
* Improved UI for `View captured pages` page.

## [1.10.0] - 2023-04-12
* Improved UI for search results.
  * Long lines are now wrapped.
  * Adjusted indentation of results.
  * Adjusted mouse hover effects.

## [1.9.0] - 2023-04-10
* Improved the search page:
  * `create:` and `modify:` conditions are now "or"-connected.
  * `book:` conditions are now matched by book ID.
  * Search results are now shown in the order of provided `book:` conditions.
  * A bad input for `sort:` and `limit:` is now forbidden.
  * Fixed an issue where the results of an interrupted search were intermingled with the current search.

## [1.8.1] - 2023-03-18
* Fixed an issue where a sticky note could not be dragged in Chromium >= 109.

## [1.8.0] - 2023-02-10
* Fixed several possible errors for concurrent captures that saves as a folder to the default download directory.
* Adjusted the default retry times for saving a file to the backend server.

## [1.7.1] - 2023-01-29
* Fixed a possible script error during handling `<noscript>` elements.

## [1.7.0] - 2023-01-25
* Added `Capture mode` option for `Capture as` dialog.
* Improved UI for the sidebar:
  * Whole title is now selected when entering the `Properties` dialog.
  * Added support for renaming during folder or note creation.
  * Improved automatic scrolling for keyboard navigation and item locating.
  * Improved displaying effect when dragging an internal link or image of an item.
  * Prevent some link-like elements from being opened unexpectedly.

## [1.6.0] - 2023-01-14
* Adjusted filename tidying strategy:
  * Spaces, tabs, and linefeeds are now collapsed into a space.
  * "~", "<", and ">" are now translated into "_".
  * Fixed an error when downloading a file like " .ext".
  * Fixed an error when downloading a file with certain Unicode chars like U+00A0 or U+00AD in some browsers.
  * Fixed an error when downloading a file with Windows preserved filename like "CON" and "NUL.txt".
* Added support for pinning editor toolbar to the top (through a command in the `Save` dropdown).

## [1.5.4] - 2023-01-04
* Fixed encoding error when viewing a MAFF/HTZ document with non-UTF-8 encoding.

## [1.5.3] - 2022-12-26
* Fixed a potential error that a capture hangs during downloading.
* Improved some tooltips.

## [1.5.2] - 2022-12-12
* Fixed an error when the downloaded folder name happens to contain bad ending chars after cropping.
* Fixed infinite loop when the downloaded folder cannot be generated.
* Fixed missing error message when an error occurs during folder name determination.

## [1.5.1] - 2022-11-23
* Fixed an issue where the "attrs" property was ignored when the "value" property was set for the "insert" command of a capture helper.

## [1.5.0] - 2022-11-03
* Added support for more URL placeholders for `capture.saveFilename` option.
* Improved some tooltips.

## [1.4.3] - 2022-06-03
* Fixed an error of iterating document.adoptedStyleSheets during a capture for Firefox since 101.0b8.

## [1.4.2] - 2022-05-05
* Fixed an error of undefined document.adoptedStyleSheets during a capture for Firefox < 101.

## [1.4.1] - 2022-05-05
* Fixed an error of accessing document.adoptedStyleSheets during a capture for Firefox 101.

## [1.4.0] - 2022-03-12
* Added GUI for `NOSCRIPTs` capture option.
* Minor option groups in the options page are now collapsed by default.
* Fixed an issue where `on*` attributes were not correctly handled if `capture.styleInline` was `remove`.
* Fixed an issue where a unicode surrogate pair was not correctly handled during text cropping in certain cases.
* Fixed tooltips about filename length restriction.
* Fixed some issues of test code.
* Upgraded 3rd party libraries.

## [1.3.1] - 2022-02-19
* Fixed an issue where an item moved into another item through drag-and-drop was placed at top rather than the bottem.

## [1.3.0] - 2022-02-16
* Fixed an error when a capture was invoked from the context menu in a Firefox private window.
* Fixed an error when a capture was invoked from a private tab in Firefox for Android.
* Fixed an issue where the archive viewer did not open additional tabs for a MAFF with multiple web pages in a Firefox private window.
* Adjusted sidebar updating mechanism as a tentative fix for an issue where items get disappeared or misplaced after several move/link/copy operations.

## [1.2.0] - 2022-01-21
* Fixed an issue where some control characters in a filename cause a downloading error.
* Fixed the bad path rule filler for in-depth capture.
* Fixed an inaccurate error log message for a link with an invalid URL.
* Intermediate data is now cached using indexedDB when available in Firefox.

## [1.1.0] - 2022-01-06
* Fixed an issue where all tabs were treated as selected when performing a capture or so in a Chromium-based mobile browser.
* Disable drag-and-drop in a Chromium-based mobile browser to prevent an unfixed bug.
* Internal code optimization.

## [1.0.1] - 2021-12-22
* Fixed an issue where the sidebar scrolling point was reset when the tree refreshes.

## [1.0.0] - 2021-12-07
* Dropped support for legacy ScrapBook objects. (Use `wsb convert sb2wsb` and `wsb convert migrate` command of PyWebScrapBook to convert pages captured using legacy ScrapBook to WebScrapBook format.)

## [0.144.0] - 2021-11-21
* Added support for rewriting the `cite` attribute for several elements.
* Added support for handling the `ping` attribute for anchor elements, with a new option `capture.ping` to configure the behavior.
* Resources used only by inline styles are no more counted as used when `Style images` is `Save used`.
* Added support for `%folder%` and `%path%` formatters for `Copy info` command of the sidebar.

## [0.143.0] - 2021-11-18
* Added support for capturing the source document embedded through an `<embed>` tag.
* Added support for handling legacy HTML attributes for a capture: `embed[pluginspage]`, `object[codebase]`, `object[archive]`, `object[classid]`, `applet[codebase]`, `applet[classid]`.
* Fixed an issue of message length error for Chromium if a page to be captured or saved exceeds around 50MB.
* Fixed an issue where `View source` in the current tab did not create new tabs when multiple items were selected.
* Fixed an issue where a link like "foo.html#?bar" was not shown in the sitemap.
* Fixed an issue where a frame page embedded through `<embed>` was not shown in the sitemap.
* Fixed an issue where a resource embedded through `<embed>`, `<object>`, or `<applet>` might not be blocked correctly in the viewer for Chromium.

## [0.142.0] - 2021-11-14
* Fixed an issue where a line of a rule for downloading links that is prefixed with spaces was not treated as a comment.
* No more take the link text as title (but available in the dropdown) when capturing a link for `Capture as` dialog.
* Allow the rule filler for in-depth capture be used for a capture with multiple tasks.
* Added `Same domain`, `Include with filter`, and `Exclude with filter` rule helpers for the `Capture as` dialog.
* Fixed an issue where links covered by multiple selection ranges were duplicately included in a batch capture dialog.
* Fixed an issue where a failure to save the index file when saving as folder was not treated as a capture failure.
* Fixed an issue where a failure to save the file when saving as file was not treated as a capture failure.

## [0.141.0] - 2021-11-13
* Fixed an issue where an incorret option value was sometimes retrieved when the options change.
* Added `Delay for capturing linked pages` option to the `Capture as` dialog.
* Added support for single-click invocation of the toolbar button when only one command is shown.
* No more force all resources be data URLs when an iframe with a data URL source is saved as srcdoc.
* Fixed an issue where the `srcdoc` attribute of a frame element was removed whan `Frames` option was `Blank`.
* Fixed an issue where the URL of a meta refresh was not correctly resolved when the page had a base element.
* Fixed incorrect source URL in the log message when there's an error during capturing a frame.
* The editor toolbar now appears at the top.
* Sticky notes now appear at the top, except for being under the editor toolbar.
* Implemented a more accurate server tree change detection algorithm to cover more possible cases.

## [0.140.0] - 2021-11-11
* Added modifiers support for toolbar commands.
* Added multi-tab support for `Batch capture selected links` toolbar command.
* Added drag-and-drop support for `Batch capture all tabs` and `Batch capture selected links` toolbar commands.
* Fixed an issue where the sidebar failed to reload when data changed rapidly within a second.
* Fixed a siderbar styling issue for older Firefox.

## [0.139.0] - 2021-11-10
* Fixed an error of editing a created postit in Firefox.
* Fixed several UI issues for the sidebar.
* Adjusted scrollings for the item picker dialog.

## [0.138.0] - 2021-11-09
* Fixed an issue where a capture might be interrupted occasionally when saved to folder as folder.
* Minor UI improvements.

## [0.137.0] - 2021-11-07
* Added a capture helper command: `isolate`.
* Fixed incorrect title for `Capture frame as`.
* Improved the GUI of the target item selector for `Capture as` dialog.
* Added a rule filler for in-depth capture for `Capture as` dialog.
* No more include URLs with non-http(s) protocol for batch capture.
* Fixed an issue where the item picker for `Capture as` dialog incorrectly allowed multi-selection through holding Shift.
* Various minor bug fixes and UI improvements.

## [0.136.0] - 2021-11-05
* Fixed several GUI issues for the `Capture as` dialog for a multi-item capture.

## [0.135.0] - 2021-11-04
* Fixed an issue where `Capture again` did not work correctly if `Save captured data to` was not `Backend server`.
* Added a link for the backuped page for re-capture if available. (Requires server >= 0.46)

## [0.134.0] - 2021-11-02
* Added support for `mime:` prefix to filter linked files by MIME type.
* Fixed an issue where a linked file with no Content-Type header was not correctly handled by the file type filter.
* Fixed an issue where a reloaded iframe had inconsistent editor status with the main frame.

## [0.133.0] - 2021-10-31
* A linked web page is no more downloaded as a resource file if `Depth to capture linked pages` is set.
* A linked attachment web page is now correctly treated as a resource file.
* Added `Extra URLs` option for the capture dialog.
* Fixed an issue where size limit did not work for a linked page with depth 1.
* Fixed an issue of capturing unexpected linked pages in a frame whose source is data protocol.
* Fixed an issue where a link in an extension tab could not be opened in some browsers.

## [0.132.0] - 2021-10-29
* Improved GUI for the `Capture as` dialog.
* A configured option whose value is same as default now updates with the app.

## [0.131.0] - 2021-10-28
* Implemented new GUI for the `Capture as` dialog.
* Various bug fixes and minor UI improvements.

## [0.130.0] - 2021-10-23
* Fixed an issue where some resource files such as SVG were incorrectly included for links rebuilding.
* An error during links rebulding for a document no more terminates the capture task.
* Fixed missing meta attributes for the index.html when capturing a XHTML or SVG file.
* Pages other than index.html now records only source URL in meta attributes.
* Header content type now takes higher priority than filename when checking links for downloading.
* Added a new `capture.downLink.doc.mode` option for capturing linked pages using tab mode.
* Added `View sitemap` editor tool.
* Improved UI and tooltips for edit and postit dialog pages.

## [0.129.0] - 2021-10-22
* Added support for saving meta refreshed pages for in-depth capture.
* An automatically opened remote tab is now closed on error.
* An error on capturing a linked page no more terminates the capture task.
* Improved internal processing and log messages for remote tab and in-depth capture.
* `ui.notifyPageCaptured` now defaults to true.
* Require server address field be filled when a backend server related option is used.
* Improved UI and tooltips for the options dialog.

## [0.128.0] - 2021-10-19
* Added capture helper commands: `concat`, `slice`, `upper`, `lower`, `encode_uri`, `decode_uri`, `add`, `subtract`, `multiply`, `divide`, `mod`, and `power`.
* Reworked capture helper commands `attr`, `css`, and `options` to support the parameter pattern `[[name1, value1], [name2, value2], ...]`.
* Renamed capture helper commands `has_elem` to `has_node`.
* Reworked capture helper command `insert` to take JSON node data.
* Reworked capture helper commands `match` and `replace` to always return a string value.
* Reworked UI for the `Capture as` dialog as `Batch capture` and `Advanced capture` dialogs.
* Break words for option textareas.
* Improved some option tooltips.

## [0.127.0] - 2021-10-17
* Improved UI for the `Capture as` dialog.
* Improved some option tooltips.

## [0.126.0] - 2021-10-11
* Added a new `capture.faviconAttrs` option for saving favicon-like resources.
* Adjusted UI for the `Capture as` dialog.
* Added support for sidebar auto-rebuilding after a capture, with a new option `scrapbook.autoRebuildSidebars` to configure the behavior.

## [0.125.7] - 2021-10-10
* Fixed an issue where downloading links did not work in the archive page viewer.

## [0.125.6] - 2021-09-22
* Fixed a packing error.

## [0.125.5] - 2021-09-22
* Fixed capture error for a page with a link element without href attribute.

## [0.125.4] - 2021-09-21
* Fixed an issue where noscript content was not correctly saved when captured using Firefox.
* Fixed an issue where noscript content was not correctly saved when capturing source.
* Fixed an issue where noscript content became escaped after saved by the editor.

## [0.125.3] - 2021-09-21
* Fixed a compatibility issue for saved tree data with old browsers not supporting ES2019.

## [0.125.0] - 2021-06-29
* Added a new `viewer.viewAttachments` option to force opening attachments using the archive page viewer.

## [0.124.0] - 2021-06-09
* Added hotkeys for batch capture page.
* Fixed an issue where clicked links with specified target or base URL did not work in the archive page viewer.

## [0.123.0] - 2021-06-06
* Fixed an issue where modified options were not taken when invoking a capture in some ways.
* Imported options without saving are no more applied.
* Support auto-updating options for sidebar and more scrapbook-related pages.

## [0.122.0] - 2021-05-30
* Bumped version of the `index.json` file generated by in-depth capture to 2.
* Added support for depth > 0 for merge capture.
* Added `View source page` editor tool.
* Fixed an issue where the URL of a redirected or meta refreshed page was not correctly rewritten for in-depth capture.
* Fixed an issue where resources under file: protocol could not be captured.
* Fixed an issue where some context menu commands did not work.

## [0.121.0] - 2021-05-26
* Added `Find previous/next annotation` editor tool.

## [0.120.0] - 2021-05-21
* Optimized code for internal cache for better performance.
* Adjusted schema for IndexedDB-related internal cache for better performance.

## [0.119.0] - 2021-05-14
* Added and adjusted several default highlighter style options.
* Added support for the `imagesrcset` attribute on `<link>` tags.
* Added support for `rel` value `modulepreload`, `prerender`, `dns-prefetch`, or `preconnect` for `<link>` tags.
* Added a new `capture.prefetch` option to configure handling of prefetch-like `<link>` tags.
* Added `capture.contentSecurityPolicy` option to configure handling of `content-security-policy` meta tag and `nonce` attribute.
* Removed `capture.removeIntegrity` option.
* `crossorigin` attribute is now removed only when a resource is saved.
* `integrity` attribute is now removed only for related tags.

## [0.118.0] - 2021-05-08
* Added support for capturing the source document embedded through an `<object>` tag.
* No more save XHTML or SVG files as srcdoc when saving as single HTML.

## [0.117.0] - 2021-05-05
* Improved config checking of capture helpers and auto-capture to prevent more possible bad input.
* Fixed an issue where unfetchable resources were not skipped during internalization.
* Fixed an error when internalizaing a single HTML item. Internalized resources are now saved as data URLs in such case.

## [0.116.0] - 2021-05-03
* Capture the original page rather than the meta refreshed target page if the meta refresh time is non-zero.
* Improved the tooltips about auto-capture.
* Adjusted handling of some HTTP headers and HTML attributes to conform with the spec better.
* Fixed some potential errors for ASCII whitespace handling.
* Fixed a potential error handling for nested svg and math elements.

## [0.115.0] - 2021-05-01
* Preloads and prefetches are now removed by default, with a new option `capture.preload` to configure the behavior.
* Shadow DOMs are saved as `data-scrapbook-shadowdom` attribute in place of `data-scrapbook-shadowroot`, with simplified data structure and smaller size.

## [0.114.0] - 2021-04-27
* Hash part of source URL is now considered when viewing an item.
* Fixed an issue where URL hash was not included in the source URL for the captured item.
* Fixed several issues on handling an item whose index file is an archive.

## [0.113.0] - 2021-04-24
* Added support for more modes for `Form status` capture option.
* Added a default option for the backend server URL option.
* Added support for enabling/disabling undo feature from its context menu.
* Added support for `Home` and `End` for sidebar key navigation.
* Added a message for a scrapbook configured as `no_tree` in the sidebar.
* Added support for `limit:` command for search.
* Fixed an issue where certain interactive properties, such as form status, canvas, and shadow DOM, were lost after an unerase in a re-loaded document.
* Fixed an issue where unrelated content in the document was refreshed after an undo.
* Fixed an issue where certain interactive properties, such as canvas and shadow DOM, were lost after an undo.
* Fixed missing support for opening in new tab for `View index page` sidebar command.
* Fixed an issue where the opened postit was not saved when switching scrapbook.
* Fixed an issue where switching scrapbook after a change of server config could load incorrect tree data.
* Fixed an error causing the copy item dialog in a manage dialog not working.
* Fixed an error causing unit tests not working.

## [0.112.0] - 2021-04-19
* Added options for whether to open in new tab for sidebar operations. Most operations now defaults to open in the active tab.
* Added support for opening in new tab by holding Ctrl or Shift for sidebar operations.
* Added support for adding as child item by holding Alt when creating a new item in the sidebar.
* Added support for recursive copy info by holding Ctrl or Shift.
* Allow opening multiple search tabs from the sidebar.
* Fixed an issue of missing `index` key when invoking `capture as` through dragging and dropping.
* Fixed an error when invoking copy info with an item having a malformed source URL.

## [0.111.0] - 2021-04-17
* Improved GUI for batch capture dialog.
* Added support for captured pages notification for captures during the same browser session.
* Moved option `scrapbook.notifyPageCaptured` to `ui.notifyPageCaptured`.
* Notification of captured pages now updates when a capture succeeds.
* Reworked duplicates detection for auto-capture to check for captures during the same browser session and items in the backend server.
* Fixed an issue of script error for Firefox for Android < 55.

## [0.110.0] - 2021-04-14
* Fixed a regression that saved filename for a capture does not have `/`s generated by a placeholder tidied.

## [0.109.0] - 2021-04-11
* Added support for context displaying for the search page.
* No more save a file named `history.rdf`, which is preserved by MAFF format, when capturing a page.
* Fixed an issue of occasional unexpected extending of highlight range for the page editor.
* Fixed an issue where a text crop might cut between a unicode surrogate pair.

## [0.108.0] - 2021-04-05
* Improved GUI for options verification.
* Reworked the syntax of `capture.saveFilename` option.
* Added support for auto-capture in the options.
* Added `copyinfo` command to sidebar.

## [0.107.0] - 2021-04-03
* Added support for viewing folder items.
* Added support for editing a postit in the sidebar.
* Added support for `tc:`, `charset:`, and `location:` search commands.
* Improved GUI for note and postit editors.
* Fixed several compatibility issues in Firefox 52.

## [0.106.0] - 2021-04-01
* Bumped server requirement to >= 0.36.
* Added support for note for a backup.
* Automatically create a tree backup for each transaction to prevent an accidental file corruption, with a new option `scrapbook.transactionAutoBackup` to configure the behavior.

## [0.105.0] - 2021-03-28
* Fixed an issue where nothing was captured when selecting exactly a single node.
* Fixed an issue where nodes outside the html node were not captured.
* Improved capture selection to support more special cases, such as a selection outside of the body node.
* No more generate linefeeds for the capture/save content by default, with a new option `capture.preffyPrint` to configure the behavior.
* Added `attach link` to the editor tools.

## [0.104.1] - 2021-03-27
* Fixed an issue where special chars (e.g. `<`, `&`, and `>`) in a postit item were not loaded correctly.

## [0.104.0] - 2021-03-27
* WebScrapBook loaders are now injected as last elements in `<body>` rather than after `<body>`.
* No more create loaders for non-annotated highlights.

## [0.102.0] - 2021-03-16
* Added support for copying item IDs of the tree selection via Ctrl+C.
* Fulltext cache is now updated automatically only when `Generate fulltext cache` option is checked.

## [0.101.0] - 2021-03-08
* Added support for capturing via dragging a browser action command into the sidebar.

## [0.100.0] - 2021-03-01
* Added support for geolocation metadata.

## [0.98.0] - 2021-01-24
* Reworked option `capture.requestReferrer` as `capture.referrerPolicy`, which supports options as the `Referrer-Policy` HTTP header.
* Added option `capture.referrerSpoofSource`.

## [0.97.0] - 2021-01-03
* Added support for post-it items.

## [0.95.0] - 2020-11-18
* Changed internal identifier for auto-close dialog option.
* Added support for `Capture as`.

## [0.93.0] - 2020-11-13
* Added a capture option `Save resources sequentially`.
* Reworked auto-close dialog option to support more modes.

## [0.92.0] - 2020-11-11
* Added support for in-depth capture.
* Changed internal identifier for some capture links (download linked files) related options.

## [0.89.0] - 2020-10-31
* Added `Copy` command to sidebar.
* Added support for cross-scrapbook drag-and-drop.
* The descendant items are now automatically deselected when an item is toggled collapsed.
* Fixed an issue where the sidebar was unlocked when a dialog was dismissed, even though the command was still running.

## [0.88.0] - 2020-10-29
* Added support for editing created and modified time in the sidebar.
* Added support for `index:` command for the search page.

## [0.87.0] - 2020-10-27
* Bumped server requirement to >= 0.29.
* Added `Sort` command to sidebar.
* Added `Capture again` command to sidebar.

## [0.86.0] - 2020-10-26
* Fixed styling error for `site` and `combine` types.

## [0.85.0] - 2020-10-25
* Added an option `Show hint when browsing a page having been captured` and a toolbar command `View captured pages`.

## [0.84.0] - 2020-10-22
* Reworked `Batch capture` as `Batch capture all tabs`, and remove `Capture all tabs`.
* Fixed an issue where backup files are generated for auto fulltext cache.

## [0.83.0] - 2020-10-19
* Changed view status caching format for sidebar to avoid a comflict within different views.
* Added support for top-level null value for *.js tree files.

## [0.82.0] - 2020-10-17
* Added a capture option to specify delay time before capturing an auto-launching tab.
* Added a capture option to insert an infobar.
* Improved capture helpers:
  * Added `name` and `debug` properties.
  * Added `options` and `insert` commands.
  * Added support for debugging a capture helper commands using `*` prefix.
  * Improved error reporting.
* Improved sidebar and manage dialog:
  * Adjusted command button to show scrapbook-related commands rather than echo the context menu.
  * Added `Search within` command to sidebar.
  * Added `Recover` command for a recycle bin to sidebar.

## [0.81.0] - 2020-10-14
* Reworked editor toolbar:
  * Added context menu in place of sub-menu buttons. This prevents toolbar overflow on mobile browsers.
  * Enlarged toolbar and buttons.

## [0.79.0] - 2020-10-06
* Bumped server requirement to >= 0.23.
* Reworked site indexer:
  * Moved site indexer button from browser action to options page.
  * Shifted site indexer to server-side, with greatly improved performance, and minor format change. (Consider recreate fulltext cache.)
  * Automatically update fulltext cache when a web page or note is captured or edited.
  * Added data checker. Moved the feature of importing non-indexed web page files through site indexer to data checker.
  * Dropped support for site indexing through dragging and dropping local filesystem folders or ZIP files.
  * Dropped support for importing legacy ScrapBook data through site indexer. (Use `wsb convert sb2wsb` of PyWebScrapBook instead.)
* Added `disabled` capture helper property.

## [0.78.0] - 2020-09-20
* Added `Accept` header for requests to the backend server. This allows the reverse proxy server or upper server to response with a more appropriate format to the client.

## [0.76.0] - 2020-09-06
* Added support for self version checking. An error will now be thrown if the extension version is too old to work with the corresponding backend server.
* A request for acquiring an access token now uses a POST rather than GET method.

## [0.75.6] - 2020-09-05
* Bumped server requirement to >= 0.17.

## [0.75.0] - 2020-05-25
* Merged record related capture options.

## [0.73.0] - 2020-05-08
* Added support for GUI editor of annotated marker for page editor.

## [0.70.0] - 2020-04-27
* Added support for annotated marker for page editor.
* Added support for sticky note for page editor.

## [0.68.0] - 2020-04-17
* Dropped support for using filesystem API for viewing a page archive.

## [0.63.0] - 2020-04-04
* Added search and edit to the sidebar.

## [0.62.0] - 2020-03-22
* Added capture helper, in place of the preclude option.

## [0.60.0] - 2020-01-25
* Bumped server requirement to >= 0.12.
* Implemented new transferring protocol to improve the performance of indexing through the backend server.

## [0.59.0] - 2020-01-18
* Added support for context menu for the sidebar.

## [0.53.0] - 2019-09-27
* Added a capture option to remove hidden elements.
* Added a capture option to preclude elements.
* Added a capture option to limit resource size to download.

## [0.52.0] - 2019-09-15
* Dropped support for `Scripted single HTML` format for a page capture.

## [0.51.0] - 2019-09-13
* Added support for capturing shadowRoot content.

## [0.50.0] - 2019-09-08
* Fixed an issue where page editor was loaded for every page if backend server URL was not set.

## [0.49.0] - 2019-09-07
* Added page editor.

## [0.48.0] - 2019-09-01
* Bumped server requirement to >= 0.8.
* Added support for `no_tree` scrapbooks.

## [0.46.0] - 2019-08-25
* Added support for drag and drop to manage scrapbook items.

## [0.45.0] - 2019-07-01
* Added support for capturing dynamic CSS.

## [0.44.1] - 2019-05-30
* Fixed a packaging error for 0.44.0.

## [0.41.0] - 2019-04-15
* Bumped server requirement to >= 0.6.
* Now use `save` instead of `upload` action to upload a file.

## [0.39.2] - 2019-03-31
* Bumped server requirement to >= 0.3.

## [0.37.0] - 2019-03-18
* Bumped server requirement to >= 0.2.
* Added support for backend server version checking. An error will now be thrown if the backend server version is too old to work with this extension.

## [0.36.0] - 2019-03-14
* Added support for sidebar and backend server.

## [0.32.0] - 2019-02-23
* Dropped support for Firefox < 52 and Chromium < 55.
* Refactor the code to work with async function.

## [0.27.0] - 2018-08-25
* Dropped support for JavaScript when viewing a page archive, due to a security concern.

## [0.25.0] - 2017-12-29
* Added unit tests.

## [0.17.0] - 2017-11-15
* Added site indexer.

## [0.1.0] - 2017-07-11
* First public release.
