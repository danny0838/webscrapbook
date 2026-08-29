def application(environ, start_response, exc_info=None):
    port = environ['wsb.config']['server_port2']
    port = '' if port == 80 else f':{port}'
    start_response('200 OK', [('Content-Type', 'text/html')])
    body = f"""\
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="//localhost{port}/capture_css_rewriteCss_cross_origin/ref/linked.css">
</head>
<body>
<blockquote id="linked">linked</blockquote>
<blockquote id="imported">imported</blockquote>
</body>
</html>"""
    return (body.encode('UTF-8'),)
