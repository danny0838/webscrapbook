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
<title>Test cross-origin resources</title>
<link rel="stylesheet" href="style.css">
<link rel="stylesheet" href="//localhost{port}/capture_css_cross_origin/style2.css">
</head>
<body>
<p id="bg1">link background: url("bg1.bmp");</p>
<p id="bg2">link background: url("bg2.bmp");</p>
<p style="font-family: bgFont1">bgFont1</p>
<p style="font-family: bgFont2">bgFont2</p>
</body>
</html>""".encode('UTF-8'))
