#!/usr/bin/env python3
import json
import os
import sys
import time

port = json.loads(os.environ['wsb.config'])['server_port2']
port = '' if port == 80 else f':{port}'
sys.stdout.buffer.write("""Content-Type: text/html

<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Test Capture Incomplete</title>
<style>
img { width: 60px; }
</style>
</head>
""".encode('UTF-8'))
sys.stdout.flush()

time.sleep(5)

sys.stdout.buffer.write(f"""<body>
<p>Page content.</p>
<img src="red.py">
<iframe src="//localhost{port}/capture_incomplete/frame.py"></iframe>
</body>
</html>""".encode('UTF-8'))
