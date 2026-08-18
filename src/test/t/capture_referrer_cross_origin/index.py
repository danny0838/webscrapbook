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
<meta name="referrer" content="unsafe-url">
<title>Test referrer policy for CSS</title>
<link rel="stylesheet" href="//localhost{port}/capture_referrer_cross_origin/css_link.py">
<style>
@import "//localhost{port}/capture_referrer_cross_origin/css_style_import.py";
@font-face {{ font-family: "css-style-font"; src: url("//localhost{port}/capture_referrer_cross_origin/css_style_font.py"); }}
#css-style-bg {{ background-image: url("//localhost{port}/capture_referrer_cross_origin/css_style_bg.py"); }}
</style>
</head>
<body>
<blockquote style="background-image: url(&quot;//localhost{port}/capture_referrer_cross_origin/css_bg.py&quot;)"></blockquote>
<blockquote id="css-style-bg"></blockquote>
<blockquote id="css-link-bg"></blockquote>
</body>
</html>""".encode('UTF-8'))
