def application(environ, start_response, exc_info=None):
    start_response('302 Found', [('Location', 'redirected1-2.xhtml')])
    return ()
