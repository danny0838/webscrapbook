#!/usr/bin/env python3
import os
import sys
import shutil

os.chdir(os.path.dirname(sys.argv[0]))
with open("image.bmp", "rb") as f:
    sys.stdout.buffer.write(b"""Content-Type: image/bmp
Content-Disposition: inline; filename="file.bmp"

""")
    shutil.copyfileobj(f, sys.stdout.buffer)
