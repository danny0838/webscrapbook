import os
import time


def application(environ, start_response, exc_info=None):
    file = os.path.join(os.path.dirname(__file__), 'red.bmp')

    time.sleep(10)

    start_response('200 OK', [('Content-Type', 'text/html')])
    return environ['wsgi.file_wrapper'](open(file, 'rb'))
