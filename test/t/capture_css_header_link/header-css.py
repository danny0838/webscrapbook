"""A quick test for a CSS loaded via HTTP Link header.

- Supported in Firefox (76.*) but not accessible via CSSOM.
- Not supported in Chromium (80.*).
"""


def application(environ, start_response, exc_info=None):
    start_response('200 OK', [
        ('Content-Type', 'text/html'),
        ('Link', '<header.css>; rel="stylesheet"'),
    ])
    body = """\
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
</head>
<body>
<blockquote id="header">header background: yellow;</blockquote>
</body>
</html>
"""
    return (body.encode('UTF-8'),)
