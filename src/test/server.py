#!/usr/bin/env python3
import http.server
import json
import os
import shutil
import time
import tempfile
from threading import Thread


class HTTPRequestHandler(http.server.CGIHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        '.md': 'text/markdown',

        # On Linux it's default to 'image/x-ms-bmp'
        # see also: https://bugs.python.org/issue37529
        '.bmp': 'image/bmp',

        '.woff': 'font/woff',
    }
    index_pages = ()

    def end_headers(self):
        """Modified default BaseHTTPRequestHandler:

        - Add cache control.
        """
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def send_head(self):
        """Modified default CGIHTTPRequestHandler:

        - Output .pyr file as HTTP redirection.
        """
        if self.is_cgi():
            return self.run_cgi()

        path = self.translate_path(self.path)
        if os.path.isfile(path):
            head, tail = os.path.splitext(path)
            if tail.lower() in ('.pyr',):
                port = json.loads(os.environ['wsb.config'])['server_port2']
                port = '' if port == 80 else ':' + str(port)
                with open(path) as fh:
                    new_url = fh.read().format(port=port)

                self.send_response(302, 'Found')
                self.send_header('Location', new_url)
                self.end_headers()
                return

        return http.server.SimpleHTTPRequestHandler.send_head(self)

    def is_cgi(self):
        """Modified default CGIHTTPRequestHandler:

        - Any .py or .pyw file in any subdirectory is a CGI script.
        - Any non-CGI script path is handled by SimpleHTTPRequestHandler.
        """
        path = self.translate_path(self.path)
        if os.path.isfile(path) and self.is_python(path):
            collapsed_path = http.server._url_collapse_path(self.path)
            dir_sep = collapsed_path.find('/', 1)
            head, tail = collapsed_path[:dir_sep], collapsed_path[dir_sep + 1:]
            self.cgi_info = head, tail
            return True
        return False


def backend(port):
    try:
        from webscrapbook import WSB_DIR, WSB_CONFIG
        import webscrapbook.server
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

        webscrapbook.server.serve(root)


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

    # start server
    site_root = os.path.join(root, 't')
    os.chdir(site_root)
    os.environ['PYTHONPATH'] = site_root
    os.environ['wsb.config'] = json.dumps(config, ensure_ascii=False)

    thread = Thread(target=http.server.test, kwargs={
        'HandlerClass': HTTPRequestHandler,
        'port': int(config['server_port']),
        'bind': '127.0.0.1',
    })
    thread.daemon = True
    thread.start()

    thread = Thread(target=http.server.test, kwargs={
        'HandlerClass': HTTPRequestHandler,
        'port': int(config['server_port2']),
        'bind': '127.0.0.1',
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
