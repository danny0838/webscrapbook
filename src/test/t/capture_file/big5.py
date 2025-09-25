#!/usr/bin/env python3
import sys

sys.stdout.buffer.write("""Content-Type: text/plain;charset=Big5

Big5 中文內容""".encode('Big5'))
