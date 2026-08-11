# CODE_REVIEW2.md — Code Quality & Bug Re-Review (post-fix)

Auditor: code-quality/bug critic subagent (re-review). Re-audited all 5 fix groups from `CODE_REVIEW.md` (VERDICT: FAIL — 2 P0s, 3 P1s, 2 P2s) independently against http://localhost:8123/ with fresh headless Edge + CDP profiles and real files built in-page with the app's own CDN pdf-lib (img.pdf with embedded PNG, jpeg.pdf with embedded JPEG, form.pdf with text/checkbox/dropdown/radio fields, text.pdf 3-page text doc, evil-form.pdf with `<img onerror>`/`<svg onload>` option values). Decryption outputs validated with pypdf 6.15.0.

---

## ISSUES

### Previous findings — fix verification

1. **P0 compress `xo.get is not a function` — FIXED.** `js/tools/optimize.js:55-62` now uses `xo.dict.get(...)`; `js/tools/pdf-core.js:703-708` uses `obj.dict.get(...)`. **Verified live**: Compress on img.pdf (embedded PNG, FlateDecode) and jpeg.pdf (DCTDecode) both succeed; output valid (pypdf: 2 pages, XObject present, no crash toast). **However** — see NEW P1-1 below: the same function's *extract* path is still broken, so the fix group's claim that `extractEmbeddedImages` was fixed is only half true.

2. **P0 unlock cannot decrypt R=2 — FIXED (user-password path).** New `js/tools/pdf-decrypt.js` implements Algorithm 2 key derivation, Algorithm 4 U verification, per-object RC4 (Algorithm 1), /Encrypt strip, xref rebuild. **Verified live**: protect text.pdf (secret123) → unlock with correct password → pypdf: `is_encrypted: False`, 3 pages, text extracts perfectly (`Test PDF Page 1 — the quick brown fox`). Wrong password → toast `Incorrect password — could not unlock this PDF`. Unencrypted passthrough works. **However** — see NEW P1-2 below: the owner-password branch is broken for distinct user/owner passwords.

3. **P1 pdf-forms constructor.name mangling — FIXED.** `js/app.js:1161-1186` (render) and `js/tools/edit.js:351-354` (fill) use `instanceof PDFLib.PDFCheckBox/PDFRadioGroup/PDFDropdown/PDFTextField`. **Verified live**: form.pdf renders 1 checkbox + 2 selects + 1 text input (correct types); fill persists values (pypdf: `name=Alice`, `agree=/Yes`, `color=Green`, `size=/1`).

4. **P1 dependent-row toggles — FIXED.** `js/app.js:326-331` honors `data-row-prefix`; watermark (`data-row-prefix="wm"`), split (`data-row-prefix="type"`), page-numbers (`data-row-prefix="pn"`) annotated. **Verified live**: watermark Image → image row visible / text row hidden; split Fixed N → pages-per-file row visible; page-numbers Exclude first/last N → N row shows, All pages → hides. (Cosmetic: the page-numbers N row has no initial `display:none` inline style, so it is visible on first load before any toggle — same as previous review, cosmetic only.)

5. **P2 hardening — FIXED.** Result names use full `esc()` (`js/app.js:587`, `538-539`); redact patterns dropped the `g` flag (`js/tools/security.js:233-235`); form options built with `textContent` (`js/app.js:1174-1176`). **Verified live**: filename `"><img src=x onerror=...>.pdf` renders escaped, no execution; redact email pattern runs twice with no lastIndex leak; evil-form.pdf option values `<img onerror=...>`/`<svg onload=...>` render as inert text, no execution.

### NEW findings (introduced or missed by the fix round)

- **P1 — js/tools/pdf-core.js:713 (extractEmbeddedImages) — `name.replace is not a function`.** The `xo.get`→`xo.dict.get` fix was applied, but `xo.keys()` returns `PDFName` objects, and line 713 calls `name.replace('/', '')` on one — a `PDFName` has no `.replace`. **Verified live (fresh profile)**: PDF→JPG "Extract images" mode on img.pdf fails instantly with toast `name.replace is not a function`, no output. The fix group's claim that extractEmbeddedImages was fixed is incorrect — only the `.get()` calls were patched; the crash moved one line down. **Fix**: `String(name).replace('/', '')` or `name.decodeText().replace(...)`.

- **P1 — js/tools/pdf-decrypt.js:286-290 (owner-password branch) — compares `decO` against the wrong padding.** After recovering the user password from O (`decO = RC4(MD5(ownerPadded)[0:5], O)`), the code compares `decO` against `padPass(password)` — but when the entered password IS the owner password, `padPass(password)` is the *owner* padding, not the recovered *user* padding, so the comparison only succeeds when user==owner. **Verified live**: encrypt with distinct user/owner (`PDFEncrypt.encryptPdf(bytes, 'userpass', 'ownerpass', ...)`) → decrypt with `'ownerpass'` throws `Incorrect password`; decrypt with `'userpass'` works. Owner-only PDFs (user='', owner='ownerpass' — the common real-world "permissions-only" case) fail with the owner password too. The app's own protect tool always sets user==owner, so the app's own roundtrip works — but any third-party R=2 PDF with distinct passwords cannot be unlocked with the owner password. **Fix**: compare `decO` against `padPass('')`-style recovery — i.e. check `decO` equals the *user* password padding; the correct check is `decO` vs `PADDING`-padded recovered user password, then re-derive the key from `decO` (the recovered user password) — the current code re-derives from `decO` correctly but gates on the wrong comparison.

### P3 / notes (unchanged, non-blocking)

- `js/tools/pdf-encrypt.js` startxref pointer is off-by-something (pypdf logs `incorrect startxref pointer(1)` on the *encryptor's* output; it recovers and decrypts fine; the decryptor's output reads clean). Pre-existing, benign.
- Page-numbers N row initial visibility (cosmetic, see fix 4).

---

## CONSOLE+VERIFICATION

**What I ran** (all against http://localhost:8123/, headless Edge via CDP, fresh profiles):
- **Console**: full-page load + home + merge + rotate + watermark + compress + protect + unlock + pdf-forms + redact + pdf-to-jpg + extract repro: **0 exceptions, 0 app console errors**. Only benign Edge "Tracking Prevention blocked access to storage" warnings for the 4 unpkg CDN scripts (environmental) and one 404 from my own test harness fetching a not-yet-copied asset (test artifact, not app code).
- **Fix 1 (compress)**: img.pdf (embedded PNG) → compress OK, output valid (pypdf 2 pages, XObject present). jpeg.pdf (DCTDecode) → compress OK. No `xo.get is not a function` anywhere.
- **Fix 2 (unlock)**: protect text.pdf (secret123) → pypdf `is_encrypted: True`, wrong password rejected, correct password decrypts 3 pages with exact text. Unlock correct → pypdf `is_encrypted: False`, 3 pages, text extracts. Unlock wrong → toast `Incorrect password — could not unlock this PDF`. Unlock unencrypted → passthrough OK. Owner-password branch: FAILS for distinct user/owner (see ISSUES).
- **Fix 3 (forms)**: form.pdf renders `[INPUT:text, INPUT:checkbox, SELECT, SELECT]`; fill persists `name=Alice, agree=/Yes, color=Green, size=/1` (pypdf get_fields).
- **Fix 4 (rows)**: watermark Image→image row shown; split Fixed N→pages-per-file row shown; page-numbers exclude-first/last→N row shown, all→hidden.
- **Fix 5 (P2)**: XSS filename `"><img src=x onerror=...>.pdf` → escaped, no exec; redact email ×2 no lastIndex leak; evil-form.pdf options inert (textContent).
- **Theme (unchanged, re-verified)**: `data-theme="dark"` first paint, no `theme-anim` class on load (no flash); 18 `@property` registrations; `theme-to-light`/`theme-to-dark` keyframes both directions; `--theme-anim-dur: 250ms` (computed 0.25s); toggle restart semantics (remove→reflow→re-add) verified; localStorage `the reference service-theme` persists; under emulated `prefers-reduced-motion: reduce` the theme animation still runs at 0.25s while `.tool-card` animations are killed (0s).
- **Protect spec-correct (unchanged, re-verified)**: pypdf `is_encrypted: True`, wrong password rejected, correct password decrypts all 3 pages with exact text.
- **GH Pages hostable (unchanged)**: 0 absolute asset paths, 12 relative (`./`), no server-side code, works from static server.
- **No live XSS** anywhere (result names, form options, watermark/redact text).

**Could not verify live**: nothing material — all 5 fix groups exercised end-to-end with real files and pypdf-validated outputs.

---

## VERDICT: FAIL

All 5 fix groups were verified, and 4 of 5 are fully fixed (compress crash, forms instanceof+fill, dependent rows, P2 hardening). The unlock P0 is fixed for the user-password path and the app's own protect→unlock roundtrip is fully spec-validated. **But two P1 bugs remain, both live and reproduced:**

1. **PDF→JPG "Extract images" mode still crashes** (`name.replace is not a function`, js/tools/pdf-core.js:713) — the fix group claimed extractEmbeddedImages was fixed, but only the `.get()` calls were patched; the crash moved one line down. A broken tool mode.
2. **Unlock's owner-password branch is broken** for distinct user/owner passwords (js/tools/pdf-decrypt.js:286-290) — owner-only PDFs (the common real-world case) cannot be unlocked with the owner password.

PASS requires all previous P0/P1/P2 findings verified fixed **and zero new P0/P1 bugs**. Two new P1s → **FAIL**. Both are small, well-localized fixes (one `String()` wrap; one comparison against the recovered user padding instead of `padPass(password)`).

**What's excellent**: compress is genuinely fixed (PNG + JPEG), the R=2 decryptor is spec-correct for the user-password path (pypdf-validated roundtrip), forms render and fill correctly with persisted values, dependent rows all toggle, all P2 hardening is in place, zero console errors, theme matches the brief exactly, protect remains spec-correct, no live XSS, GH-Pages hostable.
