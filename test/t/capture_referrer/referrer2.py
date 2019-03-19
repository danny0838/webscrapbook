#!/usr/bin/env python3
import sys
import os
sys.stdout.buffer.write("""Content-Type: text/css;charset=UTF-8
Cache-Control: no-store

{}""".format(os.environ['HTTP_REFERER']).encode("UTF-8"))
