#!/usr/bin/env python3
import os
import sys
import shutil

os.chdir(os.path.dirname(sys.argv[0]))
with open("image.bmp", "rb") as f:
    sys.stdout.buffer.write(b"""Content-Type: image/bmp
Content-Disposition: inline; filename*=UTF-8''%E4%B8%AD%E6%96%87%F0%A0%80%80.bmp

""")
    shutil.copyfileobj(f, sys.stdout.buffer)
