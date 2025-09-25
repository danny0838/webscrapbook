#!/usr/bin/env python3
import sys

sys.stdout.buffer.write("""Content-Type: text/css;charset=Big5

#test1::after { content: "中文"; }""".encode('Big5'))
