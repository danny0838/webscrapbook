def application(environ, start_response, exc_info=None):
    start_response('200 OK', [('Content-Type', 'text/css; charset=Big5')])
    body = """#test1::after { content: "中文"; }"""
    return (body.encode('Big5'),)
