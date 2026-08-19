def application(environ, start_response, exc_info=None):
    start_response('200 OK', [('Content-Type', 'text/css')])
    body = f""":root {{ --referrer: "{environ.get('HTTP_REFERER', '')}"; }}"""
    return (body.encode('UTF-8'),)
