"""Streaming parser for the mislabeled '.xls' SpreadsheetML 2003 XML files
published by mr.gov.il (Israeli Government Procurement Administration).

Known quirks handled here:
- File is UTF-8 with a BOM, but the XML prolog falsely declares
  encoding="utf-16". We patch the prolog bytes before parsing rather than
  trusting the declared encoding.
- Rows/cells are sparse and addressed via ss:Index, not strictly
  sequential. A cell's real column is its own ss:Index if present,
  otherwise the previous column index + 1.
- The Exemptions file is ~478MB uncompressed; this uses lxml.etree.iterparse
  with element clearing so memory stays bounded regardless of file size.
"""
from __future__ import annotations

import io
from typing import Iterator

from lxml import etree

NS = "urn:schemas-microsoft-com:office:spreadsheet"
ROW_TAG = f"{{{NS}}}Row"
CELL_TAG = f"{{{NS}}}Cell"
DATA_TAG = f"{{{NS}}}Data"
INDEX_ATTR = f"{{{NS}}}Index"


class _PatchedDeclStream:
    """File-like wrapper that rewrites the (false) utf-16 XML prolog to utf-8
    before lxml sees any bytes, then streams the rest of the file unchanged."""

    def __init__(self, path: str):
        self._f = open(path, "rb")
        header = self._f.read(200)
        decl_end = header.find(b"?>")
        if decl_end == -1:
            # no XML declaration found; nothing to patch
            self._buf = header
            self._f.seek(0)
        else:
            decl_end += 2
            patched = header[:decl_end].replace(b'encoding="utf-16"', b'encoding="utf-8"')
            self._buf = patched + header[decl_end:]

    def read(self, size: int = -1) -> bytes:
        if self._buf:
            if size == -1:
                out = self._buf + self._f.read()
                self._buf = b""
                return out
            if size >= len(self._buf):
                need = size - len(self._buf)
                out = self._buf + (self._f.read(need) if need else b"")
                self._buf = b""
                return out
            out = self._buf[:size]

            self._buf = self._buf[size:]
            return out
        return self._f.read(size)

    def close(self):
        self._f.close()


def iter_raw_rows(path: str) -> Iterator[dict[int, str | None]]:
    """Yield each <Row> as {1-based column index: cell text or None}, in file order.
    First yielded row is normally the header row."""
    stream = _PatchedDeclStream(path)
    try:
        context = etree.iterparse(stream, events=("end",), tag=ROW_TAG)
        for _, row_elem in context:
            row_data: dict[int, str | None] = {}
            current_index = 0
            for cell in row_elem.iterchildren(CELL_TAG):
                idx_attr = cell.get(INDEX_ATTR)
                if idx_attr is not None:
                    current_index = int(idx_attr)
                else:
                    current_index += 1
                data_elem = cell.find(DATA_TAG)
                row_data[current_index] = data_elem.text if data_elem is not None else None
            yield row_data
            row_elem.clear()
            while row_elem.getprevious() is not None:
                del row_elem.getparent()[0]
    finally:
        stream.close()


def iter_records(path: str) -> Iterator[dict[str, str | None]]:
    """Yield data rows as {header_name: value}, using the first row as headers."""
    rows = iter_raw_rows(path)
    header_row = next(rows)
    max_col = max(header_row.keys())
    headers = [header_row.get(i) for i in range(1, max_col + 1)]
    for raw in rows:
        yield {headers[i - 1]: raw.get(i) for i in range(1, max_col + 1) if headers[i - 1]}


def get_headers(path: str) -> list[str]:
    row = next(iter_raw_rows(path))
    max_col = max(row.keys())
    return [row.get(i) for i in range(1, max_col + 1)]
