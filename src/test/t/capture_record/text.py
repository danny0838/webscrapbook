def application(environ, start_response, exc_info=None):
    start_response('200 OK', [('Content-Type', 'text/plain; charset=Big5')])
    body = """Big5 中文內容"""
    return (body.encode('Big5'),)
