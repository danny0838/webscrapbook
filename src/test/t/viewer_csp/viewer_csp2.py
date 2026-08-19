def application(environ, start_response, exc_info=None):
    import re

    from ..utils import send_archive

    port = environ['wsb.config']['server_port2']
    port = '' if port == 80 else f':{port}'
    yield from send_archive(
        environ, start_response,
        __file__, 'htz',
        filter=re.compile(r'index\.html'),
        formatter={'port': port},
    )
