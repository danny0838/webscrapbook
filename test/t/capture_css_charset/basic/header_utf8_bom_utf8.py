def application(environ, start_response, exc_info=None):
    start_response('200 OK', [('Content-Type', 'text/css; charset=UTF-8')])
    body = """#test5::after { content: "中文"; }"""
    return (b'\xEF\xBB\xBF' + body.encode('UTF-8'),)
