#!/usr/bin/env python3
import os
import sys
import time

file = os.path.join(os.path.dirname(__file__), 'red.bmp')
with open(file, 'rb') as fh:
    blob = fh.read()

time.sleep(10)

sys.stdout.buffer.write("""Content-Type: image/bmp
Content-Disposition: inline; filename="red.bmp"

""".encode('ASCII'))
sys.stdout.buffer.write(blob)
