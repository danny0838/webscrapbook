def application(environ, start_response, exc_info=None):
    port = environ['wsb.config']['server_port']
    port = '' if port == 80 else f':{port}'
    start_response('200 OK', [('Content-Type', 'text/css')])
    body = f"""\
@import "//localhost{port}/capture_referrer_cross_origin/css_link_import.py";
@font-face {{ font-family: "css-link-font"; src: url("//localhost{port}/capture_referrer_cross_origin/css_link_font.py"); }}
#css-link-bg {{ background-image: url("//localhost{port}/capture_referrer_cross_origin/css_link_bg.py"); }}
:root {{ --referrer: "{environ.get('HTTP_REFERER', '')}"; }}
"""
    return (body.encode('UTF-8'),)
