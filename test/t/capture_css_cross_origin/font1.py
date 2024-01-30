#!/usr/bin/env python3
import os
import sys

os.chdir(os.path.dirname(__file__))
sys.stdout.buffer.write("""Content-Type: font/woff
Content-Disposition: inline; filename="font1.woff"
Access-Control-Allow-Origin: *

""".encode('ASCII'))
with open('font.woff', 'rb') as fh:
    sys.stdout.buffer.write(fh.read())
