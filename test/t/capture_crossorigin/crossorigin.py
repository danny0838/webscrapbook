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
<link rel="stylesheet" href="//localhost{port}/capture_crossorigin/resource.py?res=style.css" crossorigin>
<link rel="shortcut icon" href="//localhost{port}/capture_crossorigin/resource.py?res=favicon.bmp" crossorigin>
<script src="//localhost{port}/capture_crossorigin/resource.py?res=script.js" crossorigin></script>
</head>
<body>
<blockquote>
<img src="//localhost{port}/capture_crossorigin/resource.py?res=green.bmp" crossorigin>
</blockquote>
<blockquote>
<audio controls src="//localhost{port}/capture_crossorigin/resource.py?res=horse.mp3" crossorigin></audio>
</blockquote>
<blockquote>
<video controls src="//localhost{port}/capture_crossorigin/resource.py?res=small.webm" crossorigin></video>
</blockquote>
</body>
</html>
""".format(port=port).encode("UTF-8"))
