#!/usr/bin/env python3
import sys

sys.stdout.buffer.write(b"""Content-Type: text/html
Content-Disposition: attachment; filename="favicon.html"

<!DOCTYPE html>
<p>test site favicon</p>
""")
