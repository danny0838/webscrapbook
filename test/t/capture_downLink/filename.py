#!/usr/bin/env python3
import sys
sys.stdout.buffer.write(b"""Content-Type: text/plain; charset=UTF-8
Content-Disposition: inline; filename="file2.txt"

""" + """Test file content.""".encode("UTF-8"))
