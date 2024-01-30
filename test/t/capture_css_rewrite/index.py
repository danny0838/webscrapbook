#!/usr/bin/env python3
import sys

sys.stdout.buffer.write("""Content-Type: text/html
Link: <header/header.css>; rel=stylesheet

<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="link/link.css">
<style>
@import "import/import.css";
</style>
</head>
<body>
<blockquote id="header">header</blockquote>
<blockquote id="link">link</blockquote>
<blockquote id="import">import</blockquote>
</body>
</html>""".encode('UTF-8'))
