def application(environ, start_response, exc_info=None):
    start_response('200 OK', [
        ('Content-Type', 'text/html'),
        ('Link', '<header/header.css>; rel=stylesheet'),
    ])
    body = """\
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
</html>"""
    return (body.encode('UTF-8'),)
