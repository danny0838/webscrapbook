#!/usr/bin/env python3
import sys

sys.stdout.buffer.write("""Content-Type: text/html; charset=UTF-8
Content-Disposition: inline; filename="frame1.html"

Subframe content.""".encode('UTF-8'))
