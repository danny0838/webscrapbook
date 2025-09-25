#!/usr/bin/env python3
import sys

sys.stdout.buffer.write(b"""Content-Type: text/html
Content-Disposition: INLINE; filename="attachment1.html"

<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
</head>
<body>
<p>Attachment page 1.</p>
<img src="./red.bmp">
</body>
</html>
""")
