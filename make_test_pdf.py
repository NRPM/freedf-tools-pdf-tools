#!/usr/bin/env python3
"""Generate a valid 3-page test PDF with text (hand-crafted, Helvetica)."""
import zlib, struct

def esc(s):
    return s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)')

def make_page(num, text_lines, page_size=(612, 792)):
    w, h = page_size
    content = f"BT /F1 14 Tf 72 720 Td 14 TL\n"
    for line in text_lines:
        content += f"({esc(line)}) Tj T*\n"
    content += "ET"
    stream = zlib.compress(content.encode('latin-1'))
    objs = []
    objs.append(f"<< /Type /Page /Parent 1 0 R /MediaBox [0 0 {w} {h}] /Resources << /Font << /F1 3 0 R >> >> /Contents 4 0 R >>")
    objs.append(f"<< /Length {len(stream)} /Filter /FlateDecode >>\nstream\n{stream.decode('latin-1')}\nendstream")
    return objs

pages = []
for i in range(3):
    lines = [
        f"Test PDF Page {i+1}",
        f"This is page {i+1} of the test document.",
        "The quick brown fox jumps over the lazy dog.",
        "FreeDF Tools verification document.",
        f"Line number five on page {i+1}.",
    ]
    pages.append(make_page(i + 1, lines))

# Object 1: Pages, Object 2: Catalog, Object 3: Font, then page objects
objects = []
objects.append("<< /Type /Pages /Kids [2 0 R 3 0 R 4 0 R] /Count 3 >>")  # will fix refs below
# We'll build with explicit numbering: 1=Pages, 2=Catalog, 3=Font, 4..6=Pages, 7..9=Contents
kids = " ".join(f"{i} 0 R" for i in range(4, 7))
objs = {}
objs[1] = f"<< /Type /Pages /Kids [{kids}] /Count 3 >>"
objs[2] = "<< /Type /Catalog /Pages 1 0 R >>"
objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
for i, (page, content) in enumerate(zip(pages, [None, None, None])):
    pass

# Rebuild cleanly
page_objs = []
content_objs = []
for i in range(3):
    w, h = 612, 792
    content = f"BT /F1 14 Tf 72 720 Td 14 TL\n"
    for line in [
        f"Test PDF Page {i+1}",
        f"This is page {i+1} of the test document.",
        "The quick brown fox jumps over the lazy dog.",
        "FreeDF Tools verification document.",
        f"Line number five on page {i+1}.",
    ]:
        content += f"({esc(line)}) Tj T*\n"
    content += "ET"
    stream = zlib.compress(content.encode('latin-1'))
    page_objs.append(f"<< /Type /Page /Parent 1 0 R /MediaBox [0 0 {w} {h}] /Resources << /Font << /F1 3 0 R >> >> /Contents {7 + i} 0 R >>")
    content_objs.append(f"<< /Length {len(stream)} /Filter /FlateDecode >>\nstream\n{stream.decode('latin-1')}\nendstream")

all_objs = {1: objs[1], 2: objs[2], 3: objs[3]}
for i in range(3):
    all_objs[4 + i] = page_objs[i]
    all_objs[7 + i] = content_objs[i]

out = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
offsets = {}
for num in sorted(all_objs):
    offsets[num] = len(out)
    out += f"{num} 0 obj\n".encode()
    out += all_objs[num].encode('latin-1')
    out += b"\nendobj\n"
xref_pos = len(out)
out += f"xref\n0 {len(all_objs) + 1}\n".encode()
out += b"0000000000 65535 f \n"
for num in sorted(all_objs):
    out += f"{offsets[num]:010d} 00000 n \n".encode()
out += f"trailer\n<< /Size {len(all_objs) + 1} /Root 2 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode()

with open('test.pdf', 'wb') as f:
    f.write(out)
print(f"Wrote test.pdf: {len(out)} bytes, 3 pages")
