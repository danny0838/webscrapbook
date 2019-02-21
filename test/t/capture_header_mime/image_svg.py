#!/usr/bin/env python3
import os
import sys
import shutil

os.chdir(os.path.dirname(sys.argv[0]))
with open("image.svg", "rb") as f:
    sys.stdout.buffer.write(b"""Content-Type: image/svg+xml

""")
    shutil.copyfileobj(f, sys.stdout.buffer)
