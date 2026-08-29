def application(environ, start_response, exc_info=None):
    from ..utils import send_archive
    yield from send_archive(environ, start_response, __file__, 'maff')
