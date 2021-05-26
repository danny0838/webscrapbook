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
<link rel="stylesheet" href="//localhost{port}/capture_css_rewriteCss3/ref/linked.css">
</head>
<body>
<blockquote id="linked">linked</blockquote>
<blockquote id="imported">imported</blockquote>
</body>
</html>""".format(port=port).encode("UTF-8"))
