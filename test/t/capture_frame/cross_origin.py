def application(environ, start_response, exc_info=None):
    port = environ['wsb.config']['server_port2']
    port = '' if port == 80 else f':{port}'
    start_response('200 OK', [('Content-Type', 'text/html')])
    body = f"""\
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Test Capture Frame</title>
</head>
<body>
<iframe src="//localhost{port}/capture_frame/frames/frame1.html"></iframe>
<iframe src="//localhost{port}/capture_frame/frames/frame2.xhtml"></iframe>
<iframe src="//localhost{port}/capture_frame/frames/frame3.svg"></iframe>
<iframe src="//localhost{port}/capture_frame/frames/text.txt"></iframe>
</body>
</html>"""
    return (body.encode('UTF-8'),)
