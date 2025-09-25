#!/usr/bin/env python3
import sys
import time

sys.stdout.buffer.write("""Content-Type: text/html

<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
img { width: 60px; }
</style>
</head>
""".encode('UTF-8'))
sys.stdout.flush()

time.sleep(10)

sys.stdout.buffer.write("""<body>
<p>Frame content.</p>
<img src="red.py">
</body>
</html>
""".encode('UTF-8'))
