#!/usr/bin/env python3
import sys
import os
import time

file = os.path.join(os.path.dirname(__file__), "red.bmp")
with open(file, 'rb') as f:
    blob = f.read()
    f.close()

time.sleep(10)

sys.stdout.buffer.write("""Content-Type: image/bmp
Content-Disposition: inline; filename="red.bmp"

""".encode("ASCII"))
sys.stdout.buffer.write(blob)
