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
<title>Test Capture Frame</title>
</head>
<body>
<object data="//localhost{port}/capture_frame/frames/frame1.html"></object>
<object data="//localhost{port}/capture_frame/frames/frame2.xhtml"></object>
<object data="//localhost{port}/capture_frame/frames/frame3.svg"></object>
<object data="//localhost{port}/capture_frame/frames/text.txt"></object>
</body>
</html>""".format(port=port).encode("UTF-8"))
