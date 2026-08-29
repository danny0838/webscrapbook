def application(environ, start_response, exc_info=None):
    start_response('200 OK', [
        ('Content-Type', 'text/html; charset=UTF-8'),
    ])
    body = """Subframe content."""
    return (body.encode('UTF-8'),)
