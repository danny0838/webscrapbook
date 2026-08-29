import os


def application(environ, start_response, exc_info=None):
    start_response('200 OK', [
        ('Content-Type', 'font/woff'),
        ('Content-Disposition', 'inline; filename="font2.woff"'),
        ('Access-Control-Allow-Origin', '*'),
    ])
    file = os.path.join(os.path.dirname(__file__), 'font.woff')
    return environ['wsgi.file_wrapper'](open(file, 'rb'))
