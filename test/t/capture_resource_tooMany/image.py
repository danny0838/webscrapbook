from urllib.parse import parse_qs


def application(environ, start_response, exc_info=None):
    start_response('200 OK', [('Content-Type', 'image/svg+xml')])
    q = parse_qs(environ['QUERY_STRING'])
    res_id = next(iter(q.get('id')), None)
    body = f"""\
<svg version="1.1" xmlns="http://www.w3.org/2000/svg">
<rect width="100%" height="100%" fill="red" />
<!-- {res_id} -->
</svg>
"""
    return (body.encode('UTF-8'),)
