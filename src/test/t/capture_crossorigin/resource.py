#!/usr/bin/env python3
import mimetypes
import os
import sys
from urllib.parse import parse_qs
from urllib.request import url2pathname

script = os.environ['PATH_TRANSLATED'] + url2pathname(os.environ['SCRIPT_NAME'])
q = parse_qs(os.environ['QUERY_STRING'])
res = next(iter(q.get('res')), None)
file = os.path.join(os.path.dirname(script), 'resource', res)
mime, _ = mimetypes.guess_type(file)
mime = mime or 'application/octet-stream'

sys.stdout.buffer.write(f"""Content-Type: {mime}
Access-Control-Allow-Origin: *

""".encode('ASCII'))

with open(file, 'rb') as fh:
    sys.stdout.buffer.write(fh.read())
