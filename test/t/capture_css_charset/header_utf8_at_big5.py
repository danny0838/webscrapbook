#!/usr/bin/env python3
import sys
sys.stdout.buffer.write(b"""Content-Type: text/css; charset=UTF-8

""" + """@charset "Big5";
#test6::after { content: "中文"; }""".encode("UTF-8"))
