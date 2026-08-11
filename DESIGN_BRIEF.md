# DESIGN_BRIEF.md — FreeDF Tools

Authoritative spec for the writer, debugger, and all critics. Read this FIRST.

## Product

A free, private, client-side PDF tool suite built with **pure HTML, CSS, and JavaScript** (no build step, no backend, no frameworks). Must be **hostable on GitHub Pages** as-is: relative asset paths, no server-side code, works from `file://` and any static host.

## Hard requirements (from the user — non-negotiable)

1. **Dark mode is the DEFAULT** (first paint, fresh profile, no flash of light).
2. **Light mode toggle** exists; switching is **smooth, exactly 250ms**, and implemented with **@keyframes** (not just transitions) for the theme color cross-fade, in BOTH directions.
3. The 250ms cross-fade must run **even when the OS has `prefers-reduced-motion: reduce`** (user's explicit preference — the theme switch is exempt from the reduced-motion kill block; the kill block zeroes all OTHER animations).
4. Pure HTML/CSS/JS. GitHub Pages hostable.
5. **Every functionality in FUNCTIONALITY_SPEC.md** must be implemented (per the tool catalog).
6. **COMPLETELY FREE — nothing behind paywalls.** The app has NO premium tier, NO locked features, NO upsell badges, NO "upgrade to premium" prompts, NO daily usage caps, NO artificial file-count limits. Every tool is fully functional for every user. File size limits may exist only where the browser/technology physically cannot handle them (e.g. memory), and should be generous.

## Theme switch implementation (proven pattern — follow exactly)

- Register every color token with `@property { syntax: '<color>'; inherits: true; initial-value: <dark value>; }` — unregistered custom properties SNAP at 50% inside keyframes.
- Keyframes animate the tokens (e.g. `--bg`, `--surface`, `--text`, `--accent`, `--border`, etc.) from light values to dark values and vice versa.
- **Load-flash gate**: the keyframe animation must NOT run on initial page load. Gate it under a class like `html.theme-anim[data-theme=...]` that is added ONLY in the toggle click handler. Initial loads never animate; real toggles do.
- **Restart semantics**: re-adding the class is idempotent and does NOT restart the animation. To get a fresh run per flip: remove class → force reflow (`void document.documentElement.offsetWidth`) → re-add → apply theme.
- Hovers and micro-interactions stay per-element **transitions** (not keyframes).
- Tokenize the duration: `--theme-anim-dur: 250ms`.
- Wrap non-theme animations in `@media (prefers-reduced-motion: no-preference)`; keep a kill block for them. The THEME keyframes are NOT inside the no-preference wrapper (user wants them always).
- Persist choice in `localStorage`; default = dark.

## Architecture

- `index.html` — single page, all tools reachable from it (tool grid + tool workspace views).
- `css/style.css` — all styles, design tokens in `:root` / `[data-theme=dark]` / `[data-theme=light]`.
- `js/` — modular vanilla JS:
  - `theme.js` — theme toggle + keyframe switch logic
  - `app.js` — routing between tool views, tool registry
  - `tools/*.js` — one module per tool (or grouped by category)
- PDF manipulation: use **pdf-lib** (https://unpkg.com/pdf-lib/dist/pdf-lib.min.js) via CDN `<script>` tag — it's a client-side library, still pure HTML/CSS/JS, works on GitHub Pages. For rendering previews: PDF.js (https://unpkg.com/pdfjs-dist) if needed. For image conversion: canvas API. For DOCX/XLSX/PPTX → PDF: client-side conversion is not feasible without heavy libs — implement what's feasible client-side (e.g. use pdf-lib for PDF→image, canvas for image→PDF, and for Office→PDF provide the same UX flow with a clear client-side implementation where possible; the completeness critic will judge against the spec — implement the maximum feasible set client-side and document any tool that requires server-side processing in a `LIMITATIONS.md`).

## UI (per UI_REFERENCE.md from the observer)

- Header: logo, nav, language selector (decorative or functional), login (decorative).
- Hero section with headline + upload dropzone.
- Tool grid: cards with icon + name, grouped by category (Merge PDF, Split PDF, Compress PDF, Convert PDF, All tools…).
- Tool workspace: dropzone → file list → options → process → download.
- **No premium/upsell UI anywhere.** No "Go Premium" buttons, no locked tool badges, no upgrade modals. Free-tier limits from the spec are NOT enforced as paywalls — everything is available to everyone.
- Brand colors: red/orange primary (approx #FF4B4B / #FF6B35 family) — adapt to the theme system.
- Dark theme: deep, comfortable dark surfaces; light theme: clean white/light gray. Both must pass WCAG AA contrast for text.

## File conventions

- All paths relative (`./css/style.css`, `./js/app.js`).
- No external fonts required (system font stack) — or a Google Fonts link is acceptable (works on GH Pages).
- No build step. No npm. No node_modules.

## Critic contracts

- UI critic: `SCORE / TELLS FIRED / ISSUES / VERDICT: PASS|FAIL` — PASS only if every criterion holds.
- Code-audit critic: `ISSUES (file:line, what, why, fix) / CONSOLE+VERIFICATION / VERDICT: PASS|FAIL`.
- Completeness critic: checklist of every tool in FUNCTIONALITY_SPEC.md → `IMPLEMENTED / MISSING / PARTIAL` per tool + `VERDICT: PASS|FAIL`.

## Verification

- Serve with `python -m http.server` and verify no console errors.
- Verify theme switch: 250ms, keyframes, both directions, works under emulated reduced-motion, no load flash.
- Verify each tool end-to-end with a real PDF (generate test PDFs with pdf-lib or a script).
