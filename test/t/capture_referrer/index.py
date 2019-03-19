#!/usr/bin/env python3
import sys
import os
import json

port = json.loads(os.environ['wsb.config'])['server_port2']
port = '' if port == 80 else ':' + str(port)
sys.stdout.buffer.write("""Content-Type: text/html

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
</html>""".format(port=port).encode("UTF-8"))
