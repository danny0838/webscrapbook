import time


def application(environ, start_response, exc_info=None):
    start_response('200 OK', [('Content-Type', 'text/html')])
    port = environ['wsb.config']['server_port2']
    port = '' if port == 80 else f':{port}'
    yield """\
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Test Capture Incomplete</title>
<style>
img { width: 60px; }
</style>
</head>""".encode('UTF-8')

    time.sleep(5)

    yield f"""\
<body>
<p>Page content.</p>
<img src="red.py">
<iframe src="//localhost{port}/capture_incomplete/frame.py"></iframe>
</body>
</html>
""".encode('UTF-8')
