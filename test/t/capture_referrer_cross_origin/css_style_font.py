def application(environ, start_response, exc_info=None):
    start_response('200 OK', [('Content-Type', 'text/plain; charset=utf-8')])
    body = environ.get('HTTP_REFERER', '')
    return (body.encode('UTF-8'),)
