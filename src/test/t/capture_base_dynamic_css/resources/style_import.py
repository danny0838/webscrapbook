#!/usr/bin/env python3
import os
import sys

sys.stdout.buffer.write(f"""Content-Type: text/css
Cache-Control: no-store

:root {{ --referrer: "{os.environ['HTTP_REFERER']}"; }}
@font-face {{ font-family: styleImportFont; src: url(./style_import_font.py); }}
#style-import-font {{ font-family: styleImportFont; }}
#style-import-bg {{ background-image: url(./style_import_bg.py); }}
""".encode('UTF-8'))
