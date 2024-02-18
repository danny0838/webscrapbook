#!/usr/bin/env python3
import os
import sys

sys.stdout.buffer.write(f"""Content-Type: image/svg+xml
Cache-Control: no-store

<!-- referrer: {os.environ['HTTP_REFERER']} -->
<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">
  <rect width="60" height="60" fill="lime" />
</svg>""".encode('UTF-8'))
