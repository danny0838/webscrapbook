#!/usr/bin/env python3
import html
import json
import mimetypes
import os
import tempfile
import time
from socketserver import ThreadingMixIn
from threading import RLock, Thread
from urllib.parse import quote
from urllib.request import url2pathname
from wsgiref.simple_server import WSGIServer, make_server


def patch_mimetypes():
    mimetypes.add_type('text/markdown', '.md')

    # On Linux it's default to 'image/x-ms-bmp'
    # see also: https://bugs.python.org/issue37529
    mimetypes.add_type('image/bmp', '.bmp')

    mimetypes.add_type('font/woff', '.woff')


class TestServer(ThreadingMixIn, WSGIServer):
    daemon_threads = True
    allow_reuse_address = True


class TestApp:
    def __init__(self, root, config):
        self.root = root
        self.config = config
        self.env = {
            'wsgi.multithread': True,
            'wsb.config': config,
        }
        self._modules = {}
        self._lock = RLock()

    def __call__(self, environ, start_response, exc_info=None):
        path = environ.get('PATH_INFO', '/').encode('ISO-8859-1').decode('UTF-8')
        localpath = os.path.join(self.root, url2pathname(path.lstrip('/')))

        response = self.handle_response(path, localpath, environ, start_response, exc_info)
        if environ['REQUEST_METHOD'] == 'HEAD':
            response = ()
        return response

    def handle_response(self, path, localpath, environ, start_response, exc_info):
        method = environ['REQUEST_METHOD']
        if method not in ('GET', 'HEAD'):
            start_response('405 Method Not Allowed', [
                ('Content-type', 'text/html; charset=utf-8'),
                ('Cache-Control', 'no-store'),
            ])
            return (f'Request method {method!r} is not supported.'.encode('utf-8'),)

        if os.path.isfile(localpath):
            _, ext = os.path.splitext(localpath)
            if ext.lower() == '.py':
                subapp = self.load_subapp(localpath)

                def sub_start_response(status, headers, exc_info=None):
                    if not any(name.lower() == 'content-type' for name, value in headers):
                        headers.append(('Content-Type', 'application/octet-stream'))
                    if not any(name.lower() == 'cache-control' for name, value in headers):
                        headers.append(('Cache-Control', 'no-store'))
                    return start_response(status, headers, exc_info)

                return subapp({**environ, **self.env}, sub_start_response)

            else:
                mimetype, encoding = mimetypes.guess_type(localpath)
                mimetype = mimetype or 'application/octet-stream'
                size = os.path.getsize(localpath)
                start_response('200 OK', [
                    ('Content-type', mimetype),
                    ('Content-Length', str(size)),
                ])
                return environ['wsgi.file_wrapper'](open(localpath, 'rb'))

        elif os.path.isdir(localpath):
            if not path.endswith('/'):
                start_response('301 Moved Permanently', [
                    ('Location', path + '/'),
                ])
                return ()

            start_response('200 OK', [
                ('Content-type', 'text/html; charset=utf-8'),
                ('Cache-Control', 'no-store'),
            ])
            return self.list_directory(path, localpath)

        else:
            start_response('404 Not Found', [
                ('Content-type', 'text/plain; charset=utf-8'),
                ('Cache-Control', 'no-store'),
            ])
            return ('File not found.'.encode('utf-8'),)

    def list_directory(self, path, localpath):
        for chunk in self._list_directory(path, localpath):
            yield chunk.encode('utf-8')

    def _list_directory(self, path, localpath):
        # ref: http.server.SimpleHTTPRequestHandler.list_directory
        yield f"""\
<!DOCTYPE html>
<head>
<meta charset="utf-8">
<title>Directory listing for {path}</title>
</head>
<body>
<h1>Directory listing for {path}</h1>
<hr>
<ul>
"""

        with os.scandir(localpath) as it:
            for entry in it:
                displayname = linkname = entry.name
                if entry.is_file():
                    pass
                elif entry.is_dir():
                    displayname += '/'
                    linkname += '/'
                else:
                    continue

                if entry.is_symlink():
                    displayname = entry.name + '@'

                yield f'<li><a href="{quote(linkname)}">{html.escape(displayname, quote=False)}</a></li>\n'

        yield """\
</ul>
<hr>
</body>
</html>
"""

    def load_subapp(self, localpath):
        import importlib

        package_root = os.path.dirname(self.root)
        rel_path = os.path.relpath(localpath, package_root)
        module_name = os.path.splitext(rel_path)[0].replace(os.sep, '.')

        # Load the module. Reload when the script file changes.
        # (Restarting the server is still required when an imported file is changed.)
        with self._lock:
            mtime = os.stat(localpath).st_mtime_ns
            cached = self._modules.get(module_name)
            if cached is None:
                module = importlib.import_module(module_name)
                self._modules[module_name] = (mtime, module)
            else:
                cached_mtime, module = cached
                if cached_mtime != mtime:
                    module = importlib.reload(module)
                    self._modules[module_name] = (mtime, module)

        app = getattr(module, 'application', None)

        if app is None:
            raise TypeError(f"{module_name} does not define 'application'")

        if not callable(app):
            raise TypeError(f'{module_name}.application is not callable')

        return app


def test_server(host, port, root, config):
    app = TestApp(root, config)
    httpd = make_server(host, port, app, server_class=TestServer)
    host, port = httpd.socket.getsockname()
    print(f'Serving HTTP on {host} port {port}...')
    httpd.serve_forever()


def backend(port):
    try:
        from webscrapbook import WSB_CONFIG, WSB_DIR, server
    except ImportError:
        print('WARNING: unable to import PyWebScrapBook')
        return

    with tempfile.TemporaryDirectory() as root:
        config_file = os.path.normpath(os.path.join(root, WSB_DIR, WSB_CONFIG))
        config = f"""\
[app]
name = WebScrapBook
theme = default
locale =
root = .
backup_dir = .wsb/backup

[book ""]
name = scrapbook
top_dir =
data_dir = data
tree_dir = tree
index = tree/map.html
no_tree = false
new_at_top = false
inclusive_frames = true
static_index = false
rss_root =
rss_item_count = 50

[server]
port = {port}
host = localhost
ssl_on = false
browse = false
"""
        os.makedirs(os.path.dirname(config_file))
        with open(config_file, 'w', encoding='UTF-8') as fh:
            fh.write(config)

        server.serve(root)


def main():
    root = os.path.abspath(os.path.dirname(__file__))

    # load config.json
    config_file = os.path.join(root, 'config.json')
    with open(config_file, encoding='UTF-8') as fh:
        config = json.load(fh)

    # load config.local.json if exist
    config_file = os.path.join(root, 'config.local.json')
    try:
        fh = open(config_file, encoding='UTF-8')
    except FileNotFoundError:
        pass
    else:
        with fh as fh:
            config.update(json.load(fh))

    # fix mimetypes
    patch_mimetypes()

    # start server
    site_root = os.path.join(root, 't')
    os.chdir(site_root)

    thread = Thread(target=test_server, kwargs={
        'host': '127.0.0.1',
        'port': int(config['server_port']),
        'root': site_root,
        'config': config,
    })
    thread.daemon = True
    thread.start()

    thread = Thread(target=test_server, kwargs={
        'host': '127.0.0.1',
        'port': int(config['server_port2']),
        'root': site_root,
        'config': config,
    })
    thread.daemon = True
    thread.start()

    thread = Thread(target=backend, kwargs={
        'port': int(config['backend_port']),
    })
    thread.daemon = True
    thread.start()

    try:
        while True:
            time.sleep(100)
    except KeyboardInterrupt:
        print('')
        print('Keyboard interrupt received, exiting.')


if __name__ == '__main__':
    main()
