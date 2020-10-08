## General notes
* This project generally follows [semantic versioning](https://semver.org/). For a version `x.y.z`, `x` means a major (backward incompatible) change, `y` means a minor (backward compatible) change, and `z` means a patch (bug fix). Few versions may not strictly follow this rule due to historical reasons, though.
* Versions before 1.0 are in initial development. APIs are not stable for these versions, even a `y` version can involve a breaking change, and only partial significant changes are summarized in this document. See full commit history in the source repository for details.
* Backend server requirement in this document refers to the version of [`webscrapbook` Python package](https://github.com/danny0838/pywebscrapbook) (or PyWebScrapBook).

## Version 0.79.0
* Bumped server requirement to >= 0.23.
* Reworked site indexer:
  * Moved site indexer button from browser action to options page.
  * Added data checker.
  * Dropped support of site indexing through dragging and dropping folders.

## Version 0.78.0
* Added `Accept` header for requests to the backend server. This allows the reverse proxy server or upper server to response with a more appropriate format to the client.

## Version 0.76.0
* Added support of self version checking. An error will now be thrown if the extension version is too old to work with the corresponding backend server.

## Version 0.76.0
* A request for acquiring an access token now uses a POST rather than GET method.

## Version 0.75.6
* Bumped server requirement to >= 0.17.

## Version 0.68.0
* Dropped support of using filesystem API for viewing a page archive.

## Version 0.60.0
* Bumped server requirement to >= 0.12.
* Implemented new transferring protocol to improve the performance of indexing through the backend server.

## Version 0.52.0
* Dropped support of `scripted single html` format for a page capture.

## Version 0.41.0
* Bumped server requirement to >= 0.8.
* Added support for `no_tree` scrapbooks.

## Version 0.41.0
* Bumped server requirement to >= 0.6.
* Now use `save` instead of `upload` action to upload a file.

## Version 0.39.2
* Bumped server requirement to >= 0.3.

## Version 0.37.0
* Bumped server requirement to >= 0.2.
* Added support of backend server version checking. An error will now be thrown if the backend server version is too old to work with this extension.

## Version 0.36.0
* Added support for sidebar and backend server.

## Version 0.27.0
* Dropped support of JavaScript when viewing a page archive, due to a security concern.

## Version 0.25.0
* Added unit tests.

## Version 0.17.0
* Added site indexer.
