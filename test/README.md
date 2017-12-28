Automated unit tests
--------------------

### System requirements

* Firefox ≥ 52, Chrome ≥ 55
* Python 3.* (≥ 3.6 is better)

### Usage

1. Install Web ScrapBook extension (as a standard install or as a temporary extension).

2. Copy `config.json` to `config.local.json` and edit it:
   * Make sure "wsb_extension_id" matches the extension ID of Web ScrapBook.
   * Make sure "server_port" is available (not used by other applications).

3. Run `server.py` to start the local hosting server.

4. Install `Web ScrapBook Test Suite` extension in this directory (as a temporary extension).

5. Click on the browser action of the test suite extension. A tab will be opened and the test will start automatically.


Manual unit tests
-----------------

Some unit tests are not yet automated and need to be done manually.

1. Go through `t/viewer-*/`, and follow the instruction of `README.md` to run the tests.
