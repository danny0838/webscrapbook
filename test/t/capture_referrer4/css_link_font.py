#!/usr/bin/env python3
import os
import sys

sys.stdout.buffer.write(f"""Content-Type: text/plain;charset=utf-8
Cache-Control: no-store

{os.environ['HTTP_REFERER']}""".encode('UTF-8'))
