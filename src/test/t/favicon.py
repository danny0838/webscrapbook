#!/usr/bin/env python3
"""Create/delete site favicon
"""
import sys
import os
import base64
import urllib.parse

image = 'Qk08AAAAAAAAADYAAAAoAAAAAQAAAAEAAAABACAAAAAAAAYAAAASCwAAEgsAAAAAAAAAAAAAAP8AAAAA'
file = os.path.join(os.path.dirname(__file__), 'favicon.ico')


def main():
    args = urllib.parse.parse_qs(os.environ['QUERY_STRING'])
    action = args.get('a', [None])[-1]

    if action == 'create':
        with open(file, 'wb') as fh:
            fh.write(base64.b64decode(image))
        return

    if action == 'delete':
        os.remove(file)
        return


if __name__ == '__main__':
    main()
