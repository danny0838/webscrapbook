#!/usr/bin/env python3
import sys

sys.stdout.buffer.write(b"""Content-Type: text/html
Content-Disposition: attachment; filename="attachment.html"

<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Attachment</title>
</head>
<body>
<img src="./red.bmp">
</body>
</html>
""")
