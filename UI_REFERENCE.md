# UI_REFERENCE.md — Reference Service Visual & Structural Reference

Observed from the reference PDF-tool service homepage HTML + CSS, August 2026.

## Brand colors (from the live CSS)

- **Primary brand red: `#e5322d`** (buttons, links, accents) — dark red variant `#bd060a`, light red bg `#fde4df`
- Text: `#161616` (near-black headings), `#33333b` (body), `#707078` (muted)
- Backgrounds: `#fff` (light), `#f5f5fa` (light gray sections)
- Dark theme: `#292931` / `#161616` surfaces, `#47474f` borders
- Success green: `#7ac142` / `#4acd86`; blue: `#008ee9`; purple: `#7253e2`
- Tool icon colors vary per tool (blue `#4A7AAB`, green `#8FBC5D`, purple `#AB6993`, orange `#EE6C4D`)

## Layout structure

### Header
- Left: service logo (SVG, red heart + wordmark)
- Center/right nav: **Merge PDF**, **Split PDF**, **Compress PDF** links, then dropdowns: **Convert PDF** (Convert to PDF: JPG→PDF, WORD→PDF, POWERPOINT→PDF, EXCEL→PDF, HTML→PDF; Convert from PDF: PDF→JPG, PDF→WORD, PDF→POWERPOINT, PDF→EXCEL, PDF→PDF/A), **All PDF tools** (full list incl. Remove pages, Organize PDF, Scan to PDF, Repair PDF, OCR PDF, Rotate PDF, Page numbers, Watermark, Crop PDF, Edit PDF, PDF Forms, Unlock PDF, Protect PDF, Sign PDF, Redact PDF, AI Summarizer, Translate PDF, PDF to Markdown)
- Right: **Login** (secondary button) + **Sign up** (primary red button)
- Language selector (30+ languages: ES, FR, DE, IT, PT, JA, RU, KO, ZH-CN, ZH-TW, AR, BG, CA, NL, EL, HI, ID, MS, PL, SV, TH, TR, UK, VI, SW...)
- Mobile: hamburger menu

### Hero
- Pattern background (subtle geometric pattern)
- H1: "Every tool you need to work with PDFs in one place"
- Subtitle: "Every tool you need to use PDFs, at your fingertips. All are 100% FREE and easy to use! Merge, split, compress, convert, rotate, unlock and watermark PDFs with just a few clicks."
- Big dropzone: "Select PDF files" (red button) + "Upload from computer." / "or drop PDFs here"

### Tool grid ("Every tool you need" section)
- Category tabs/filter: All, Convert, Organize, Optimize, Edit, Security, Intelligence (data-category attributes: convert, organize, optimize, edit, security, intelligence, workflows)
- Grid of tool cards: each card = icon (48×48px, colored per tool) + title (h3, 20px, weight 500) + short description (13px, muted)
- Cards are links to tool pages; hover states; "New!" badges on some

### Tool page
- Same header
- Tool title (h1) + description
- Dropzone card: "Select PDF file(s)" button + "Upload from computer." / "or drop PDF here"
- File list with thumbnails, file names, sizes; drag to reorder where applicable
- Options panel (per-tool, see FUNCTIONALITY_SPEC.md)
- Primary action button (red, e.g. "MERGE PDF", "COMPRESS PDF")
- Progress: "Uploading file... Time left - seconds / Upload speed - MB/S / Uploaded" then "Merging PDFs..." etc.
- Result: download button + "Start over"
- Footer: product links, company links, social (Facebook, LinkedIn, Instagram, TikTok), language selector, copyright line

### Footer
- Multi-column: Product (Merge PDF, Split PDF, Compress PDF, ...), Company (About, Pricing, Blog, Business, Education, Desktop app, Contact), Help (FAQ, Support), Legal, social icons, language selector, copyright line

## Typography
- System font stack (the site uses a custom font but system fallbacks are fine); headings weight 500-700; body 13-16px; muted descriptions 13px #707078

## Interaction pattern
1. Click tool card → tool page
2. Drop or select files → file list appears with thumbnails
3. Configure options
4. Click action button → progress animation
5. Result page: download file(s) + start over
