#!/usr/bin/env python3
import os

with open(os.path.join(__file__, '..', '..', 'utils.py')) as fh:
    exec(fh.read())

send_archive('maff')
