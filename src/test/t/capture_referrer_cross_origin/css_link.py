#!/usr/bin/env python3
import json
import os
import sys

port = json.loads(os.environ['wsb.config'])['server_port']
port = '' if port == 80 else f':{port}'

sys.stdout.buffer.write(f"""Content-Type: text/css
Cache-Control: no-store

@import "//localhost{port}/capture_referrer_cross_origin/css_link_import.py";
@font-face {{ font-family: "css-link-font"; src: url("//localhost{port}/capture_referrer_cross_origin/css_link_font.py"); }}
#css-link-bg {{ background-image: url("//localhost{port}/capture_referrer_cross_origin/css_link_bg.py"); }}
:root {{ --referrer: "{os.environ['HTTP_REFERER']}"; }}
""".encode('UTF-8'))
