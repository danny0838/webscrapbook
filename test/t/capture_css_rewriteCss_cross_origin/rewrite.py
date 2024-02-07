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
<link rel="stylesheet" href="//localhost{port}/capture_css_rewriteCss_cross_origin/ref/linked.css">
</head>
<body>
<blockquote id="linked">linked</blockquote>
<blockquote id="imported">imported</blockquote>
</body>
</html>""".encode('UTF-8'))
