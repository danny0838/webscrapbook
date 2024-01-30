#!/usr/bin/env python3
import os
import shutil
import sys

os.chdir(os.path.dirname(sys.argv[0]))
with open('image.svg', 'rb') as fh:
    sys.stdout.buffer.write(b"""Content-Type: image/svg+xml

""")
    shutil.copyfileobj(fh, sys.stdout.buffer)
