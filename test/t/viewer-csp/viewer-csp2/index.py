#!/usr/bin/env python3
import sys
import os
import json

port = json.loads(os.environ['wsb.config'])['server_port2']
port = '' if port == 80 else ':' + str(port)
sys.stdout.buffer.write("""Content-Type: text/html
Content-Disposition: inline; filename="inexe.html"

""".encode("ASCII"))
with open(os.path.join(os.path.dirname(__file__), "index.html"), "r") as fh:
    sys.stdout.buffer.write(fh.read().format(port=port).encode("UTF-8"))
