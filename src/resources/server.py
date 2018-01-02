#!/usr/bin/env python3
import os
import configparser
import webbrowser
import re
import zipfile
import time

import urllib.parse
from http import HTTPStatus
from http.server import HTTPServer, BaseHTTPRequestHandler, SimpleHTTPRequestHandler
import ssl

# init global variables
config = {
    "root": ".",
    "port": "8080",
    "bind": "127.0.0.1",
    "host": "localhost",
    "protocol": "HTTP/1.1",
    "ssl_on": "false",
    "ssl_key": "",
    "ssl_cert": "",
    "browse": "true",
    "entry": "tree/frame.html"
    }

class HTTPRequestHandler(SimpleHTTPRequestHandler):

    def parse_zip_time_tuple(self, tuple):
        date_time = '{}/{}/{} {}:{}:{}'.format(*tuple)
        pattern = '%Y/%m/%d %H:%M:%S'
        epoch = int(time.mktime(time.strptime(date_time, pattern)) + time.timezone)
        return self.date_time_string(epoch)

    def send_head(self):
        """Common code for GET and HEAD commands.
        This sends the response code and MIME headers.
        Return value is either a file object (which has to be copied
        to the outputfile by the caller unless the command was HEAD,
        and must be closed by the caller under all circumstances), or
        None, in which case the caller has nothing further to do.
        """
        path = self.translate_path(self.path)
        f = None
        if os.path.isdir(path):
            parts = urllib.parse.urlsplit(self.path)
            if not parts.path.endswith('/'):
                # redirect browser - doing basically what apache does
                self.send_response(HTTPStatus.MOVED_PERMANENTLY)
                new_parts = (parts[0], parts[1], parts[2] + '/',
                             parts[3], parts[4])
                new_url = urllib.parse.urlunsplit(new_parts)
                self.send_header("Location", new_url)
                self.end_headers()
                return None
            for index in "index.html", "index.htm":
                index = os.path.join(path, index)
                if os.path.exists(index):
                    path = index
                    break
            else:
                return self.list_directory(path)

        # hand sub-archive path
        for m in re.finditer(r'![/\\]', path, flags=re.I):
            p = path[:m.start(0)]
            if os.path.isfile(p):
                try:
                    with zipfile.ZipFile(p) as zip:
                        s = path[m.end(0):].replace('\\', '/')
                        info = zip.getinfo(s)

                        if info.is_dir():
                            raise ValueError("Item named '{}' in the archive is not a file.".format(s))

                        f = zip.open(s, 'r')
                        try:
                            self.send_response(HTTPStatus.OK)
                            self.send_header("Content-type", self.guess_type(s))
                            self.send_header("Content-Length", info.file_size)
                            self.send_header("Last-Modified", self.parse_zip_time_tuple(info.date_time))
                            self.end_headers()
                            return f
                        except:
                            f.close()
                            raise
                except (ValueError, KeyError):
                    self.send_error(HTTPStatus.NOT_FOUND, "File not found")
                    return None

        ctype = self.guess_type(path)

        # redirect if target file is an archive
        if ctype == "application/html+zip" or ctype == "application/x-maff":
            if ctype == "application/html+zip":
                subpath = "index.html"
            else:
                with zipfile.ZipFile(path) as zip:
                    for entry in zip.namelist():
                        if zip.getinfo(entry).is_dir():
                            subpath = entry + "index.html"
                            break;

            parts = urllib.parse.urlsplit(self.path)
            new_parts = (parts[0], parts[1], parts[2] + '!/' + subpath,
                         parts[3], parts[4])
            new_url = urllib.parse.urlunsplit(new_parts)

            self.send_response(HTTPStatus.FOUND)
            self.send_header("Location", new_url)
            self.end_headers()
            return None

        # read file normally
        try:
            f = open(path, 'rb')
        except OSError:
            self.send_error(HTTPStatus.NOT_FOUND, "File not found")
            return None
        try:
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-type", ctype)
            fs = os.fstat(f.fileno())
            self.send_header("Content-Length", str(fs[6]))
            self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
            self.end_headers()
            return f
        except:
            f.close()
            raise

    SimpleHTTPRequestHandler.extensions_map[".md"] = "text/markdown"
    SimpleHTTPRequestHandler.extensions_map[".htz"] = "application/html+zip"
    SimpleHTTPRequestHandler.extensions_map[".maff"] = "application/x-maff"

def load_server_config(path, encoding='UTF-8', **kwargs):
    if not os.path.isfile(path): return
    cp = configparser.ConfigParser()
    cp.read(path, encoding, **kwargs)
    c = cp['Server']
    for key in c:
        config[key] = c[key]

def start_server(HandlerClass=HTTPRequestHandler,
            ServerClass=HTTPServer,
            protocol="HTTP/1.0", host='localhost', port=8000, bind="",
            ssl_on=False, ssl_key=None, ssl_cert=None):
    HandlerClass.protocol_version = protocol

    httpd = ServerClass((bind, port), HandlerClass)

    if ssl_on:
        httpd.socket = ssl.wrap_socket(httpd.socket,
                ssl_key, ssl_cert, server_side=True)

    msg = "Serving {protocol} for {bind} at {scheme}://{host}:{port} ..."
    msg = msg.format(protocol=protocol,
            scheme='https' if ssl_on else 'http',
            host=host, port=port, bind=bind)
    print(msg)

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nKeyboard interrupt received, stopping server.")

def main():
    # load config
    load_server_config('config.ini')

    # switch to the specified directory
    os.chdir(config['root'])

    ssl_on = config['ssl_on'].lower() in ['1', 'on', 'yes', 'true']
    port = int(config['port'])

    # start the browser if "browse" is set to a string path
    if config['browse'].lower() in ['1', 'on', 'yes', 'true']:
        webbrowser.open('{scheme}://{host}{port}{path}'.format(
                scheme='https' if ssl_on else 'http',
                host=config['host'],
                port='' if (not ssl_on and port == 80) or (ssl_on and port == 443)
                        else ':' + str(port),
                path='/' + config['entry'] if config['entry'] else ''
                ))

    # start server
    start_server(protocol=config['protocol'],
            host=config['host'],
            port=port,
            bind=config['bind'],
            ssl_on=ssl_on,
            ssl_key=config['ssl_key'],
            ssl_cert=config['ssl_cert'])

if __name__ == '__main__':
    main()
