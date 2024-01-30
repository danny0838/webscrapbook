#!/usr/bin/env python3
import os
import sys
from urllib.parse import parse_qs

q = parse_qs(os.environ['QUERY_STRING'])
res_id = next(iter(q.get('id')), None)

sys.stdout.buffer.write(f"""Content-Type: image/svg+xml

<svg version="1.1" xmlns="http://www.w3.org/2000/svg">
<rect width="100%" height="100%" fill="red" />
<!-- {res_id} -->
</svg>
""".encode('ASCII'))
