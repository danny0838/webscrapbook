#!/usr/bin/env python3
import os
import sys

sys.stdout.buffer.write(f"""Content-Type: text/css
Cache-Control: no-store

:root {{ --referrer: "{os.environ['HTTP_REFERER']}"; }}
@font-face {{ font-family: linkFont; src: url(./link_font.py); }}
#link-font {{ font-family: linkFont; }}
#link-bg {{ background-image: url(./link_bg.py); }}
""".encode('UTF-8'))
