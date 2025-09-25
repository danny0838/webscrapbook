#!/usr/bin/env python3
import json
import os
import re

import utils

port = json.loads(os.environ['wsb.config'])['server_port2']
port = '' if port == 80 else f':{port}'

utils.send_archive(
    __file__,
    'htz',
    filter=re.compile(r'index\.html'),
    formatter={
        'port': port,
    },
)
