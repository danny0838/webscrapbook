#!/usr/bin/env python3
import json
import os
import re

with open(os.path.join(__file__, '..', '..', 'utils.py')) as fh:
    exec(fh.read())

port = json.loads(os.environ['wsb.config'])['server_port2']
port = '' if port == 80 else f':{port}'

send_archive(
    'htz',
    filter=re.compile(r'index\.html'),
    formatter={
        'port': port,
    },
)
