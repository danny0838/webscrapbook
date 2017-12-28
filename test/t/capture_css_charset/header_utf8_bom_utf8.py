#!/usr/bin/env python3
import sys
sys.stdout.buffer.write(b"""Content-Type: text/css; charset=UTF-8

\xEF\xBB\xBF""" + """#test5::after { content: "中文"; }""".encode("UTF-8"))
