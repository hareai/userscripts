#!/usr/bin/env python3
"""Write tiny opaque PNG icons. No third-party deps."""

import struct
import zlib
from pathlib import Path


def chunk(tag: bytes, data: bytes) -> bytes:
    crc = zlib.crc32(tag + data)
    crc = crc % 4294967296
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", crc)


def png(size: int, rgba: bytes) -> bytes:
    rows = []
    row_len = size * 4
    for y in range(size):
        rows.append(b"\x00" + rgba[y * row_len : (y + 1) * row_len])
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(b"".join(rows), 9))
        + chunk(b"IEND", b"")
    )


def make(size: int) -> bytes:
    pix = bytearray(size * size * 4)
    m = max(2, size // 8)
    inner = max(2, size // 5)
    bar = max(2, size // 12)
    cx = cy = size / 2
    for y in range(size):
        for x in range(size):
            i = (y * size + x) * 4
            pix[i : i + 4] = b"\x14\x14\x14\xff"
            if m <= x < size - m and m <= y < size - m:
                pix[i : i + 4] = b"\x22\x22\x22\xff"
            dx = x + 0.5 - cx
            dy = y + 0.5 - cy
            if abs(dx) < inner and abs(dy) < bar:
                pix[i : i + 4] = b"\xcc\x33\x33\xff"
    return png(size, bytes(pix))


def main() -> None:
    root = Path(__file__).resolve().parents[1] / "extension" / "icons"
    root.mkdir(parents=True, exist_ok=True)
    for s in (16, 48, 128):
        path = root / f"{s}.png"
        path.write_bytes(make(s))
        print(path, path.stat().st_size)


if __name__ == "__main__":
    main()
