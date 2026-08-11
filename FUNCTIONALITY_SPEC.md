# FUNCTIONALITY_SPEC.md — Complete PDF Tool Catalog

Observed from the reference PDF-tool service (homepage grid + nav dropdown + per-tool pages), August 2026.

## Tool inventory (32 tools total)

### Homepage grid (31 cards) — categories: organize, optimize, convert, edit, security, intelligence

| # | Tool | Category | URL | What it does | Key options |
|---|------|----------|-----|--------------|-------------|
| 1 | Merge PDF | organize | /merge_pdf | Combine multiple PDFs into one, in user-chosen order | Drag-drop reorder; add more files; merge all into one PDF |
| 2 | Split PDF | organize | /split_pdf | Split one PDF into multiple | **Range mode**: Custom (add ranges), Fixed (split into ranges of N pages), Smart (AI presets); **Extract mode**: extract all pages, or select specific pages; merge extracted pages into one PDF or separate files |
| 3 | Compress PDF | optimize | /compress_pdf | Reduce PDF file size | Compression level: **Extreme** (less quality, high compression), **Recommended** (good quality/compression), **Less compression** (high quality) |
| 4 | PDF to Word | convert | /pdf_to_word | Convert PDF to editable .docx | OCR option (scanned pages); convert with selectable text |
| 5 | PDF to PowerPoint | convert | /pdf_to_powerpoint | Convert PDF to .pptx | OCR option for scanned pages |
| 6 | PDF to Excel | convert | /pdf_to_excel | Extract PDF tables to .xlsx | Layout: **One sheet** or **Multiple sheets**; OCR option |
| 7 | Word to PDF | convert | /word_to_pdf | Convert .doc/.docx to PDF | — |
| 8 | PowerPoint to PDF | convert | /powerpoint_to_pdf | Convert .ppt/.pptx to PDF | — |
| 9 | Excel to PDF | convert | /excel_to_pdf | Convert .xls/.xlsx to PDF | Page orientation option |
| 10 | Edit PDF | edit | /edit-pdf | Add text, shapes, comments, highlights; edit existing text | Toolbar: text, image, shapes, comments, highlights; reorder elements front/back; remove all |
| 11 | PDF to JPG | convert | /pdf_to_jpg | Convert each PDF page to JPG, or extract embedded images | Mode: **Page to JPG** or **Extract images**; quality: Normal / Recommended / High |
| 12 | JPG to PDF | convert | /jpg_to_pdf | Convert JPG images to PDF | Orientation: Portrait/Landscape; Page size: Fit / A4 / US Letter; Margin: No margin / Small; merge all images in one PDF |
| 13 | Sign PDF | security | /sign-pdf | Sign documents electronically | Signature type: Simple Signature / Digital Signature; signers (only me / others); fields: Signature, Initials, Name, Date, Text, Input, Company Stamp |
| 14 | Watermark | edit | /pdf_add_watermark | Stamp text or image over PDF | Text or image watermark; font (Arial, Impact, Verdana, Courier, Comic, Times New Roman...); font size; font/background color; shadow; opacity; position (mosaic or 9 positions); transparency; rotation (0/45/90) |
| 15 | Rotate PDF | edit | /rotate_pdf | Rotate pages | Per-file rotate left/right; select by orientation (Portrait/Landscape); reset all |
| 16 | HTML to PDF | convert | /html-to-pdf | Convert HTML files or pasted HTML to PDF | Upload .html files or paste HTML text |
| 17 | Unlock PDF | security | /unlock_pdf | Remove password protection | One click unlock |
| 18 | Protect PDF | security | /protect-pdf | Encrypt PDF with password | Basic/Advanced; password strength (lower+upper, number, special, ≥8 chars); permissions: disable printing, content modification, copy/extraction, comments, form filling, accessibility extraction, document assembly |
| 19 | Organize PDF | organize | /organize-pdf | Sort, add, remove, rotate pages visually | Page thumbnails; drag to reorder; delete pages; rotate; reset all |
| 20 | PDF to PDF/A | convert | /convert-pdf-to-pdfa | Convert to archival PDF/A | Conformance: PDF/A-1b, 1a, 2b, 2u, 2a, 3b, 3u, 3a; embed fonts, color management, metadata |
| 21 | Repair PDF | optimize | /repair-pdf | Fix corrupt/damaged PDFs | One click repair |
| 22 | Page numbers | edit | /add_pdf_page_number | Add page numbers to PDF | Page mode: Single page / Facing pages / First page is cover; position (9 positions); margin (Small/Recommended); first number; which pages (all, exclude first N, exclude last N); text format (just number, "Page {n}") |
| 23 | Scan to PDF | organize | /scan-pdf | Scan documents via phone → PDF | Orientation, page size, margin, merge images (same options as JPG to PDF) |
| 24 | OCR PDF | optimize | /ocr-pdf | Make scanned PDFs searchable/selectable | Document languages (100+ languages incl. English, Japanese, Chinese, Arabic...) |
| 25 | Compare PDF | security | /compare-pdf | Compare two PDFs | Modes: **Semantic Text** (change report) / **Content Overlay** (changes in separate color); scroll sync; side-by-side |
| 26 | Redact PDF | security | /redact-pdf | Permanently black out sensitive content | Redact by text search, credit card, phone number, email patterns; mark pages; clear all |
| 27 | Crop PDF | edit | /crop-pdf | Crop PDF pages | Click-drag crop area; apply to all pages or current page; reset all |
| 28 | PDF Forms | edit | /pdf-forms | Fill PDF forms or create fillable PDFs | Fill mode; detect fields automatically or add manually (text fields, checkboxes, radio buttons, lists) |
| 29 | ~~AI Summarizer~~ | ~~intelligence~~ | ~~/pdf-summarize~~ | **REMOVED per user request** | — |
| 30 | ~~Translate PDF~~ | ~~intelligence~~ | ~~/translate-pdf~~ | **REMOVED per user request** | — |
| 31 | PDF to Markdown | intelligence | /pdf-to-markdown | Convert PDF to .md | Preserves headings, tables, lists |

### Nav-dropdown-only tool (32nd)

| # | Tool | Category | URL | What it does | Key options |
|---|------|----------|-----|--------------|-------------|
| 32 | Remove pages | organize | /remove-pages | Delete selected pages from a PDF | Click pages to remove; shift-click for ranges; shows total pages + pages to remove |

## Free vs Premium (the reference service's model — NOTE: our app is 100% free, see DESIGN_BRIEF.md)

The reference service's free tier: limited document processing, ads, file size limits (e.g. Merge/Split 100 MB, Compress 200 MB, Office→PDF 15 MB, PDF→Office 15 MB, Image→PDF 100 MB, Watermark 100 MB, Rotate 100 MB, Unlock 100 MB, Protect 100 MB, Organize 100 MB, PDF/A 100 MB, Repair 100 MB, Page numbers 100 MB, OCR 100 MB, Compare 100 MB, Redact 100 MB, Crop 100 MB, Forms 100 MB, Sign 100 MB, HTML→PDF 100 MB, PDF→Markdown 100 MB, AI tools 1 file); file count limits (Merge 25, Compress 2, Office→PDF 1, etc.); daily limits; premium-only: batch processing, unlimited processing, ad-free, larger limits (4 GB), AI tools (Summarizer/Translate), OCR in PDF→Office, Digital Signature, Smart Split, PDF/A.

**Our clone: ALL of these are free and unlimited. No paywalls, no upsells, no limits (except browser-memory practical limits).**

## Shared UI patterns (all tools)

1. Tool page: title + description → dropzone ("Select PDF files" / "Upload from computer" / "or drop PDFs here") → file list with thumbnails → options panel → action button ("Merge PDF", "Split PDF", "COMPRESS PDF", "CONVERT", "ROTATE PDF", "UNLOCK PDF", "PROTECT PDF", "ORGANIZE PDF", "REPAIR PDF", "REDACT", "CROP PDF", "SIGN PDF", "SUMMARIZE", "TRANSLATE", etc.) → progress ("Uploading file... Time left - seconds", "Merging PDFs...", "Compressing PDF...") → result page with download button + "Start over" / back to tools.
2. Multiple file selection supported where relevant (Merge, Compress, JPG→PDF, Rotate, Unlock, Word→PDF, PPT→PDF, Excel→PDF).
3. Drag & drop + click-to-browse both supported.
4. After processing: download button (single file or ZIP for multi-file outputs), option to start over.
