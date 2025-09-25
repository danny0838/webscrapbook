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
<title>Test Capture Frame</title>
</head>
<body>
<iframe src="//localhost{port}/capture_frame/frames/frame1.html"></iframe>
<iframe src="//localhost{port}/capture_frame/frames/frame2.xhtml"></iframe>
<iframe src="//localhost{port}/capture_frame/frames/frame3.svg"></iframe>
<iframe src="//localhost{port}/capture_frame/frames/text.txt"></iframe>
</body>
</html>""".encode('UTF-8'))
