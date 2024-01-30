#!/usr/bin/env python3
import sys

sys.stdout.buffer.write("""Content-Type: text/html; charset=UTF-8
Content-Disposition: inline; filename*=UTF-8''a%E4%B8%ADb%23c.php

Subframe content.""".encode('UTF-8'))
