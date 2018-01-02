#!/usr/bin/env python3
import os
import json
import http.server

class HTTPRequestHandler(http.server.CGIHTTPRequestHandler):
    """
        Modified default CGIHTTPRequestHandler:
        - Any .py or .pyw file in any subdirectory is a CGI script.
        - Any non-CGI script path is handled by SimpleHTTPRequestHandler.
    """
    def is_cgi(self):
        path = self.translate_path(self.path)
        if os.path.isfile(path) and self.is_python(path):
            collapsed_path = http.server._url_collapse_path(self.path)
            dir_sep = collapsed_path.find('/', 1)
            head, tail = collapsed_path[:dir_sep], collapsed_path[dir_sep+1:]
            self.cgi_info = head, tail
            return True
        return False

    http.server.BaseHTTPRequestHandler.protocol_version = "HTTP/1.1"
    http.server.SimpleHTTPRequestHandler.extensions_map[".md"] = "text/markdown"

def main():
    # load config.json
    with open('config.json', 'r', encoding='UTF-8') as f:
        config = json.load(f)
        f.close()

    # load config.local.json if exist
    try:
        with open('config.local.json', 'r', encoding='UTF-8') as f:
            config_local = json.load(f)
            for key in config_local: config[key] = config_local[key]
            f.close()
    except:
        pass

    # start server
    os.chdir('t')
    http.server.test(HandlerClass=HTTPRequestHandler,
                     port=int(config['server_port']), bind='127.0.0.1')

if __name__ == '__main__':
    main()
