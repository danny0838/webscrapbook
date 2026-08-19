def application(environ, start_response, exc_info=None):
    start_response('200 OK', [('Content-Type', 'image/svg+xml')])
    body = f"""\
<!-- referrer: {environ.get('HTTP_REFERER', '')} -->
<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60">
  <rect width="60" height="60" fill="lime" />
</svg>"""
    return (body.encode('UTF-8'),)
