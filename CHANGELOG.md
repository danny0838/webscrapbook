# Changelog
* This project generally follows [semantic versioning](https://semver.org/). For a version `x.y.z`, `x` means a major (backward incompatible) change, `y` means a minor (backward compatible) change, and `z` means a patch (bug fix). Few versions may not strictly follow this rule due to historical reasons, though.
* Versions before 1.0 are in initial development. APIs are not stable for these versions, even a `y` version can involve a breaking change, and only partial notable changes are summarized in this document. See full commit history in the source repository for details.
* Backend server requirement in this document refers to the version of [`webscrapbook` Python package](https://github.com/danny0838/pywebscrapbook) (or PyWebScrapBook).

## [0.87.0] - 2020-10-27
* Bumped server requirement to >= 0.29.
* Added "sort" command to sidebar.
* Added "capture again" command to sidebar.

## [0.86.0] - 2020-10-26
* Fixed styling error for "site" and "combine" types.

## [0.85.0] - 2020-10-25
* Added "notify captured pages" and "view captured pages".

## [0.84.0] - 2020-10-22
* Reworked "batch capture" as "batch capture all tabs", and remove "capture all tabs".
* Fixed an issue that backup files are generated for auto fulltext cache.

## [0.83.0] - 2020-10-19
* Changed view status caching format for sidebar to avoid a comflict within different views.
* Added support of top-level null value for *.js tree files.

## [0.82.0] - 2020-10-17
* Added capture option to specify delay time before capturing an auto-launching tab.
* Added capture option to insert an infobar.
* Improved capture helpers:
  * Added "name" and "debug" properties.
  * Added "options" and "insert" commands.
  * Added support to debug a capture helper commands using "*" prefix.
  * Improved error reporting.
* Improved sidebar and manage dialog:
  * Adjusted command button to show scrapbook-related commands rather than echo the context menu.
  * Added "search within" command.
  * Added "recover" command for recycling bin.

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
  * Dropped support of site indexing through dragging and dropping local filesystem folders or ZIP files.
  * Dropped support of importing legacy ScrapBook data through site indexer. (Use `wsb convert sb2wsb` of PyWebScrapBook instead.)
* Added "disabled" capture helper property.

## [0.78.0] - 2020-09-20
* Added `Accept` header for requests to the backend server. This allows the reverse proxy server or upper server to response with a more appropriate format to the client.

## [0.76.0] - 2020-09-06
* Added support of self version checking. An error will now be thrown if the extension version is too old to work with the corresponding backend server.
* A request for acquiring an access token now uses a POST rather than GET method.

## [0.75.6] - 2020-09-05
* Bumped server requirement to >= 0.17.

## [0.75.0] - 2020-05-25
* Merged record related capture options.

## [0.73.0] - 2020-05-08
* Added support of GUI editor of annotated marker for page editor.

## [0.70.0] - 2020-04-27
* Added support of annotated marker for page editor.
* Added support of sticky note for page editor.

## [0.68.0] - 2020-04-17
* Dropped support of using filesystem API for viewing a page archive.

## [0.63.0] - 2020-04-04
* Added search and edit to the sidebar.

## [0.62.0] - 2020-03-22
* Added capture helper, in place of the preclude option.

## [0.60.0] - 2020-01-25
* Bumped server requirement to >= 0.12.
* Implemented new transferring protocol to improve the performance of indexing through the backend server.

## [0.59.0] - 2020-01-18
* Added support of context menu for the sidebar.

## [0.53.0] - 2019-09-27
* Added capture option to remove hidden elements.
* Added capture option to preclude elements.
* Added capture option to limit resource size to download.

## [0.52.0] - 2019-09-15
* Dropped support of `scripted single html` format for a page capture.

## [0.51.0] - 2019-09-13
* Added support to capture shadowRoot content.

## [0.50.0] - 2019-09-08
* Fixed an issue that page editor is loaded for every page if backend server URL is not set.

## [0.49.0] - 2019-09-07
* Added page editor.

## [0.48.0] - 2019-09-01
* Bumped server requirement to >= 0.8.
* Added support for `no_tree` scrapbooks.

## [0.46.0] - 2019-08-25
* Added support of drag and drop to manage scrapbook items.

## [0.45.0] - 2019-07-01
* Added support to capture dynamic CSS.

## [0.44.1] - 2019-05-30
* Fixed a packaging error for 0.44.0.

## [0.41.0] - 2019-04-15
* Bumped server requirement to >= 0.6.
* Now use `save` instead of `upload` action to upload a file.

## [0.39.2] - 2019-03-31
* Bumped server requirement to >= 0.3.

## [0.37.0] - 2019-03-18
* Bumped server requirement to >= 0.2.
* Added support of backend server version checking. An error will now be thrown if the backend server version is too old to work with this extension.

## [0.36.0] - 2019-03-14
* Added support for sidebar and backend server.

## [0.32.0] - 2019-02-23
* Dropped support of Firefox < 52 and Chromium < 55.
* Refactor the code to work with async function.

## [0.27.0] - 2018-08-25
* Dropped support of JavaScript when viewing a page archive, due to a security concern.

## [0.25.0] - 2017-12-29
* Added unit tests.

## [0.17.0] - 2017-11-15
* Added site indexer.

## [0.1.0] - 2017-07-11
* First public release.
