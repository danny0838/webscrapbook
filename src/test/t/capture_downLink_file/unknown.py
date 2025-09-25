#!/usr/bin/env python3
import sys

sys.stdout.buffer.write(b"""\
Content-Type: application/wsb.unknown
Content-Disposition: inline; filename="unknown.bin"

""" + """Test file content.""".encode('UTF-8'))
