#!/usr/bin/env python3
import sys
import os
import json

port = json.loads(os.environ['wsb.config'])['server_port2']
port = '' if port == 80 else ':' + str(port)
sys.stdout.buffer.write("""Content-Type: text/html
Content-Disposition: inline; filename="inexe.html"

""".encode("ASCII"))
sys.stdout.buffer.write(open(os.path.join(os.path.dirname(__file__), "index.html"), "r").read().format(port=port).encode("UTF-8"))
