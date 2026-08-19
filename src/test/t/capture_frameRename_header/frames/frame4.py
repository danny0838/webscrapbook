def application(environ, start_response, exc_info=None):
    start_response('200 OK', [
        ('Content-Type', 'text/html; charset=UTF-8'),
        ('Content-Disposition', "inline; filename*=UTF-8''a%E4%B8%ADb%23c.php"),
    ])
    body = """Subframe content."""
    return (body.encode('UTF-8'),)
