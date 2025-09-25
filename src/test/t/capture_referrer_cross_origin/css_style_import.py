#!/usr/bin/env python3
import os
import sys

sys.stdout.buffer.write(f"""Content-Type: text/css
Cache-Control: no-store

:root {{ --referrer: "{os.environ['HTTP_REFERER']}"; }}
""".encode('UTF-8'))
