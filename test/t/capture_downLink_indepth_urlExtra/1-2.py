#!/usr/bin/env python3
import sys

sys.stdout.buffer.write(b"""Content-Type: text/html
Content-Disposition: attachment; filename="1-2.html"

<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
</head>
<body>
<p>Page 1-2.</p>
<img src="./1-2.bmp">
</body>
</html>
""")
