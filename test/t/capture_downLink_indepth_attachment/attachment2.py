#!/usr/bin/env python3
import sys

sys.stdout.buffer.write(b"""Content-Type: text/html
Content-Disposition: attachment; filename="attachment2.html"

<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
</head>
<body>
<p>Attachment page 2.</p>
<img src="./red.bmp">
</body>
</html>
""")
