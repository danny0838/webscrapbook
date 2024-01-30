#!/usr/bin/env python3
import sys

sys.stdout.buffer.write("""Content-Type: text/html;charset=Big5

<!DOCTYPE html>
<html>
<head>
<title>ABC 中文</title>
<style>img { width: 60px; }</style>
</head>
<body>
<p>ABC 中文</p>
<img src="圖片.bmp">
<img src="%E5%9C%96%E7%89%87.bmp">
</body>
</html>""".encode('Big5'))
