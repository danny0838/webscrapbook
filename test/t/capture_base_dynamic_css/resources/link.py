def application(environ, start_response, exc_info=None):
    start_response('200 OK', [('Content-Type', 'text/css')])
    body = f"""\
:root {{ --referrer: "{environ.get('HTTP_REFERER', '')}"; }}
@font-face {{ font-family: linkFont; src: url(./link_font.py); }}
#link-font {{ font-family: linkFont; }}
#link-bg {{ background-image: url(./link_bg.py); }}
"""
    return (body.encode('UTF-8'),)
