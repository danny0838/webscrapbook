import time


def application(environ, start_response, exc_info=None):
    start_response('200 OK', [('Content-Type', 'text/html')])
    yield """\
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
img { width: 60px; }
</style>
</head>""".encode('UTF-8')

    time.sleep(10)

    yield """\
<body>
<p>Frame content.</p>
<img src="red.py">
</body>
</html>
""".encode('UTF-8')
