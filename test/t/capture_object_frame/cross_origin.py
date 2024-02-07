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
<object data="//localhost{port}/capture_object_frame/frames/frame1.html" width="200" height="200">frame1.html</object>
<object data="//localhost{port}/capture_object_frame/frames/frame2.xhtml" width="200" height="200">frame2.xhtml</object>
<object data="//localhost{port}/capture_object_frame/frames/frame3.svg" width="200" height="200">frame3.svg</object>
<object data="//localhost{port}/capture_object_frame/frames/frame4.txt" width="200" height="200">frame4.txt</object>
</body>
</html>""".encode('UTF-8'))
