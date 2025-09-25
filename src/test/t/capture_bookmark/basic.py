#!/usr/bin/env python3
import sys

sys.stdout.buffer.write("""Content-Type: text/html
Content-Disposition: attachment; filename="basic.html"

<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>ABC 中文 𠀀 にほんご</title>
<link rel="shortcut icon" href="red.bmp">
</head>
<body>
<p>ABC 中文 𠀀 にほんご</p>
</body>
</html>
""".encode('UTF-8'))
