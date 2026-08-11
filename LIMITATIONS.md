# LIMITATIONS.md — FreeDF Tools

This clone runs **100% in your browser** (pure HTML/CSS/JS, no server). Everything is free and unlimited — no paywalls, no upsells, no artificial limits. The only practical limits are those of the browser itself (memory, file size).

Because the reference service processes files on powerful servers, a few tools here are **approximations** of the server-side behavior. This document is the honest list of what differs.

## Tools that are faithful client-side implementations

These work exactly as described, using pdf-lib / PDF.js / JSZip / Tesseract.js:

| Tool | Notes |
|------|-------|
| Merge PDF | Full fidelity. Drag-reorder supported. |
| Split PDF | Range mode (custom ranges, fixed N pages) + extract mode. Output as separate files (ZIP) or merged. |
| Compress PDF | Re-saves with object streams and re-encodes embedded JPEG/PNG images at a lower quality/scale. Text-only PDFs compress well; results vary by source. |
| Rotate PDF | Per-page or all-pages rotation, orientation filter. |
| Remove pages | Thumbnail selection, shift-click ranges. |
| Organize PDF | Thumbnail grid, drag reorder, per-page rotate/delete. |
| JPG to PDF | Orientation, page size (Fit/A4/Letter), margin, merged output. |
| PDF to JPG | Page-to-JPG rendering (quality levels) or embedded-image extraction. |
| Scan to PDF | Same pipeline as JPG to PDF (image → PDF). |
| Unlock PDF | Real client-side R=2 decryption (`js/tools/pdf-decrypt.js` — inverse of the encryptor: key derivation, U verification, per-object RC4 decrypt, /Encrypt strip, xref rebuild). Verified: correct password decrypts, wrong password rejected. |
| Protect PDF | Real RC4-40bit encryption (PDF Standard Security Handler, V=1/R=2) in pure client-side JS (`js/tools/pdf-encrypt.js`) with permission flags. Verified with pypdf: password required, correct password decrypts, wrong password rejected. |
| Sign PDF | Draw a signature on a canvas and embed it as an image. |
| Page numbers | 9 positions, margin, first number, page range, format. |
| Watermark | Text (font/size/color/opacity/position/rotation) or image watermark, mosaic or 9 positions. |
| Crop PDF | Click-drag crop rect applied via `setCropBox` (all pages or current page). |
| PDF Forms | Detects AcroForm fields (text, checkbox, radio, dropdown) and fills them. |
| Repair PDF | Reloads with pdf-lib's recovery and re-saves a normalized file. Works for many common corruptions; severely damaged files may still fail. |
| OCR PDF | Real OCR via Tesseract.js (client-side). First run downloads the language model (~10 MB). The OCR text layer is added as invisible text over the original page images. |
| Compare PDF | Side-by-side page previews with scroll sync + line-level text diff report. Content-overlay mode renders both pages and highlights changed pixels in red. |
| Redact PDF | Searches text (or email/phone/credit-card patterns) and draws black rectangles over matches. |
| HTML to PDF | Renders the HTML in a hidden iframe and triggers the browser print dialog; the captured result is a text-based PDF of the rendered content. |
| PDF to Markdown | Text extraction with heading/list heuristics. |
| ~~AI Summarizer~~ | **REMOVED per user request** (was client-side extractive summarization). |
| ~~Translate PDF~~ | **REMOVED per user request** (was client-side dictionary translation demo). |

## Tools that are best-effort approximations

| Tool | What the real site does | What this clone does | Difference |
|------|------------------------|----------------------|------------|
| PDF to Word | Full layout-preserving conversion with OCR | Extracts text and builds a **minimal valid .docx** (paragraphs only) | No images, tables, or styling. Text content is preserved. |
| PDF to PowerPoint | Layout-preserving slides | One text box per page in a **minimal valid .pptx** | No visuals/layout. |
| PDF to Excel | Real table extraction | Splits text lines into cells (tabs / 2+ spaces) into a **minimal valid .xlsx** | Table detection is heuristic; complex tables may be mis-split. |
| Word to PDF | Server-side rendering with full fidelity | Extracts text from the .docx XML and renders a **text-based PDF** | No images, fonts, or layout. |
| PowerPoint to PDF | Full slide rendering | Extracts slide text and renders a **text-based PDF** | No visuals. |
| Excel to PDF | Full spreadsheet rendering | Extracts cell values and renders a **table-style text PDF** | No styling, formulas evaluate to their cached values only. |
| PDF to PDF/A | True archival conversion with validation | Re-saves with embedded standard fonts + PDF/A metadata. **Not validated** against the PDF/A spec | A strict PDF/A validator may reject the output. |
| Edit PDF | Full text editing of existing content | Overlay annotations (text, highlight, rectangle, line, comment) drawn on top of pages | Existing text cannot be modified in place; annotations are flattened into the page. |
| Digital Signature (Sign PDF) | Cryptographic digital signatures | Draws a signature image + a "digitally signed" label | Not a cryptographic signature. |

## General notes

- **File size limits**: none enforced. Very large PDFs may exhaust browser memory; if a tool fails on a huge file, that is a browser limit, not a paywall.
- **Fonts**: PDFs using non-standard embedded fonts render with fallbacks in previews; text extraction still works.
- **Encrypted PDFs**: tools that need to modify an encrypted PDF require the password (except Unlock, which removes encryption).
- **OCR languages**: Tesseract.js supports 100+ languages; the UI exposes a common subset. The first OCR run downloads the traineddata for the chosen language.
- **Privacy**: because everything runs locally, files never leave your device — a privacy advantage over the real service.
- **Network**: the CDN libraries (pdf-lib, PDF.js, JSZip, Tesseract.js) are fetched from unpkg.com on first load. The app itself works offline once cached.
