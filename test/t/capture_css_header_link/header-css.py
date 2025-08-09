#!/usr/bin/env python3
"""A quick test for a CSS loaded via HTTP Link header.

- Supported in Firefox (76.*) but not accessible via CSSOM.
- Not supported in Chromium (80.*).
"""
import sys

sys.stdout.buffer.write("""Content-Type: text/html
Link: <header.css>; rel="stylesheet"

<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
</head>
<body>
<blockquote id="header">header background: yellow;</blockquote>
</body>
</html>
""".encode('UTF-8'))
