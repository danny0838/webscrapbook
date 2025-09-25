#!/usr/bin/env python3
import sys

sys.stdout.buffer.write(b"""Content-Type: application/octet-stream
Content-Disposition: inline; filename="noextoctet"

""")
