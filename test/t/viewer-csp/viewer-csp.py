#!/usr/bin/env python3
import sys
import os
import zipfile
import io
import json

port = json.loads(os.environ['wsb.config'])['server_port2']
port = '' if port == 80 else ':' + str(port)

def zip_folder(dir):
    blob = io.BytesIO()
    with zipfile.ZipFile(blob, mode='w', compression=zipfile.ZIP_DEFLATED) as zip:
        for root, folders, files in os.walk(dir):
            for file in files:
                arcname = root.replace('\\', '/').partition('/')[2]
                arcname = (arcname + '/' + file) if arcname else file
                file = os.path.join(root, file)
                zip.write(file, arcname)
        zip.writestr('index.html', open(os.path.join(dir, "index.htm"), "r").read().format(port=port))
        zip.close()
    return blob

basename, _ = os.path.splitext(os.path.basename(__file__))
os.chdir(os.path.dirname(__file__))
blob = zip_folder(basename)

sys.stdout.buffer.write("""Content-Type: application/html+zip
Content-Disposition: attachment; filename="{}.htz"

""".format(basename).encode("ASCII"))
sys.stdout.buffer.write(blob.getvalue())
