#!/usr/bin/env python3
import json
import os
import sys

port = json.loads(os.environ['wsb.config'])['server_port2']
port = '' if port == 80 else f':{port}'
sys.stdout.buffer.write(f"""Content-Type: text/html

<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Test capture referrer</title>
</head>
<body>
<img src="referrer.py">
<img src="//localhost{port}/capture_referrer/referrer2.py">
</body>
</html>""".encode('UTF-8'))
