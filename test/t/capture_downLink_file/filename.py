#!/usr/bin/env python3
import sys

sys.stdout.buffer.write(b"""\
Content-Disposition: inline; filename="file3.txt"

""" + """Test file content.""".encode('UTF-8'))
