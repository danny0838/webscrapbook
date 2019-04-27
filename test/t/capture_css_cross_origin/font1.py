#!/usr/bin/env python3
import sys, os

os.chdir(os.path.dirname(__file__))
sys.stdout.buffer.write("""Content-Type: font/woff
Content-Disposition: attachment; filename="font1.woff"
Access-Control-Allow-Origin: *

""".encode("ASCII"))
sys.stdout.buffer.write(open("font.woff", 'rb').read())
