def application(environ, start_response, exc_info=None):
    start_response('200 OK', [('Content-Type', 'text/css')])
    body = f"""\
:root {{ --referrer: "{environ.get('HTTP_REFERER', '')}"; }}
@font-face {{ font-family: styleImportFont; src: url(./style_import_font.py); }}
#style-import-font {{ font-family: styleImportFont; }}
#style-import-bg {{ background-image: url(./style_import_bg.py); }}
"""
    return (body.encode('UTF-8'),)
