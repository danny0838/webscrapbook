#!/usr/bin/env python3
import os
import json
import http.server
from threading import Thread
import time


http.server.SimpleHTTPRequestHandler.extensions_map.update({
    '.md': 'text/markdown',

    # On Linux it's default to 'image/x-ms-bmp'
    # see also: https://bugs.python.org/issue37529
    '.bmp': 'image/bmp',

    '.woff': 'font/woff',
    })


class HTTPRequestHandler(http.server.CGIHTTPRequestHandler):
    def send_head(self):
        """Modified default CGIHTTPRequestHandler:

        - Output .pyr file as HTTP redirection.
        """
        if self.is_cgi():
            return self.run_cgi()

        path = self.translate_path(self.path)
        if os.path.isfile(path):
            head, tail = os.path.splitext(path)
            if tail.lower() in (".pyr",):
                port = json.loads(os.environ['wsb.config'])['server_port2']
                port = '' if port == 80 else ':' + str(port)
                with open(path, "r") as fh:
                    new_url = fh.read().format(port=port)

                self.send_response(302, "Found")
                self.send_header("Location", new_url)
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
            head, tail = collapsed_path[:dir_sep], collapsed_path[dir_sep+1:]
            self.cgi_info = head, tail
            return True
        return False


def main():
    # load config.json
    config_file = os.path.join(os.path.dirname(__file__), 'config.json')
    with open(config_file, 'r', encoding='UTF-8') as fh:
        config = json.load(fh)

    # load config.local.json if exist
    config_file = os.path.join(os.path.dirname(__file__), 'config.local.json')
    try:
        fh = open(config_file, 'r', encoding='UTF-8')
    except FileNotFoundError:
        pass
    else:
        with fh as fh:
            config_local = json.load(fh)
            config = {**config, **config_local}

    # start server
    os.chdir(os.path.join(os.path.dirname(__file__), 't'))

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

    try:
        while True: time.sleep(100)
    except (KeyboardInterrupt, SystemExit):
        print('')
        print('Keyboard interrupt received, exiting.')

if __name__ == '__main__':
    main()
