def application(environ, start_response, exc_info=None):
    start_response('200 OK', [('Content-Type', 'text/css; charset=UTF-8')])
    body = """\
@charset "Big5";
#test6::after { content: "中文"; }"""
    return (body.encode('UTF-8'),)
