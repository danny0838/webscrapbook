#!/usr/bin/env python3
"""Common utils for CGI scripts."""
import io
import os
import sys
import zipfile
from textwrap import dedent


def zip_folder(root_dir, formatter=None, filter=None):
    """Pack files and directories under the specified directory in to a ZIP.

    Args:
        root_dir: the directory to pack
        formatter: a dict to format the content
        filter: a compiled re to filter arcnames for the formatter
    """
    blob = io.BytesIO()
    root_dir = os.path.normpath(root_dir)
    base_len = len(root_dir + os.sep)
    with zipfile.ZipFile(blob, mode='w', compression=zipfile.ZIP_DEFLATED) as zh:
        for root, _, files in os.walk(root_dir):
            for file in files:
                file = os.path.join(root, file)
                arcname = file[base_len:].replace(os.sep, '/')
                if formatter and (filter is None or filter.match(arcname)):
                    with open(file, encoding='UTF-8') as fh:
                        zh.writestr(arcname, fh.read().format(**formatter))
                else:
                    zh.write(file, arcname)
        zh.close()
    return blob


ARCHIVE_TYPES_MAP = {
    'htz': 'application/html+zip',
    'maff': 'application/x-maff',
}


def send_archive(base_file, type='htz', dispos='inline', **kwargs):
    """Send a directory as an archive on the fly.

    Args:
        base_file: the directory to pack is base_file minus the extension
        type: 'htz' or 'maff'
        dispos: 'inline' or 'attachment'
        **kwargs: arguments to pass to zip_folder
    """
    dir, file = os.path.split(base_file)
    basename, _ = os.path.splitext(file)
    blob = zip_folder(os.path.join(dir, basename), **kwargs)
    mime = ARCHIVE_TYPES_MAP[type]

    sys.stdout.buffer.write(
        dedent(
            f"""\
            Content-Type: {mime}
            Content-Disposition: {dispos}; filename="{basename}.{type}"

            """
        ).encode('ASCII')
    )
    sys.stdout.buffer.write(blob.getvalue())
