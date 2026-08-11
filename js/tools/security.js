/* ============================================================
   security.js — Sign PDF, Unlock, Protect, Compare, Redact
   ============================================================ */
(function () {
  'use strict';
  var C = window.PDFCore;
  var PDFLib = C.libs.PDFLib;

  /* ---------------- SIGN PDF ---------------- */
  var sign = {
    id: 'sign',
    title: 'Sign PDF',
    desc: 'Draw your signature and place it on the document.',
    category: 'security',
    icon: '✍️',
    color: '#7253e2',
    accept: '.pdf,application/pdf',
    multiple: false,
    needsSignStage: true,
    options: function () {
      return '' +
        '<div class="option-row"><span class="opt-label">Signature type</span>' +
        '<div class="seg" data-seg="signType">' +
        '<button type="button" data-val="simple" class="active">Simple signature</button>' +
        '<button type="button" data-val="digital">Digital signature</button>' +
        '</div></div>' +
        '<div class="option-row"><span class="opt-label">Signers</span>' +
        '<div class="seg" data-seg="signers">' +
        '<button type="button" data-val="me" class="active">Only me</button>' +
        '<button type="button" data-val="others">Others</button>' +
        '</div></div>' +
        '<div class="option-row"><span class="opt-label">Pen color</span><input type="color" class="opt-control" id="opt-sign-color" value="#161616" style="width:60px;height:34px;padding:2px"></div>' +
        '<div class="option-row"><span class="opt-label">Pen width</span><input type="range" class="opt-control" id="opt-sign-width" min="1" max="8" step="1" value="3"></div>' +
        '<div class="option-row"><button type="button" class="btn btn-ghost btn-sm" id="opt-sign-clear">Clear signature</button></div>';
    },
    actionLabel: 'Sign PDF',
    process: function (files, opts, ui) {
      var file = files[0];
      if (!opts.signatureDataUrl) throw new Error('Draw a signature first');
      return C.loadPdfDoc(file.bytes).then(function (doc) {
        return C.loadImage(opts.signatureDataUrl).then(function (img) {
          var canvas = document.createElement('canvas');
          canvas.width = img.width; canvas.height = img.height;
          var ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0);
          return C.canvasToPngBlob(canvas).then(function (blob) {
            return blob.arrayBuffer();
          }).then(function (buf) {
            return doc.embedPng(buf).then(function (sigImg) {
              var page = doc.getPage(0);
              var w = page.getWidth(), h = page.getHeight();
              var sw = w * 0.35;
              var sh = sw * sigImg.height / sigImg.width;
              page.drawImage(sigImg, { x: w - sw - 40, y: 40, width: sw, height: sh });
              if (opts.signType === 'digital') {
                return doc.embedFont(PDFLib.StandardFonts.Helvetica).then(function (font) {
                  page.drawText('Digitally signed (client-side demo)', {
                    x: w - sw - 40, y: 40 + sh + 6, size: 8, font: font, color: PDFLib.rgb(0.3, 0.3, 0.3)
                  });
                  return doc.save();
                });
              }
              return doc.save();
            });
          });
        });
      }).then(function (bytes) {
        return { bytes: bytes, name: C.baseName(file.name) + '_signed.pdf', mime: 'application/pdf' };
      });
    }
  };

  /* ---------------- UNLOCK ---------------- */
  var unlock = {
    id: 'unlock',
    title: 'Unlock PDF',
    desc: 'Remove password protection from your PDF.',
    category: 'security',
    icon: '🔓',
    color: '#4acd86',
    accept: '.pdf,application/pdf',
    multiple: true,
    options: function () {
      return '<div class="option-row"><span class="opt-label">Password</span><input type="password" class="opt-control" id="opt-unlock-pass" placeholder="Leave empty if unknown"></div>';
    },
    actionLabel: 'Unlock PDF',
    process: function (files, opts, ui) {
      var file = files[0];
      var pass = opts.password || '';
      // Try the real client-side R=2 decryptor first (pdf-lib 1.17.1 has
      // NO decryption support — its {password} option throws and the
      // ignoreEncryption+re-save fallback emits corrupt files).
      return PDFDecrypt.decryptPdf(file.bytes, pass).then(function (res) {
        return { bytes: res.bytes, name: C.baseName(file.name) + '_unlocked.pdf', mime: 'application/pdf' };
      }).catch(function (err) {
        // Not R=2 encrypted (or wrong password) — fall back to pdf-lib:
        // if the file loads without a password it was never encrypted.
        return PDFLib.PDFDocument.load(file.bytes, { ignoreEncryption: true, updateMetadata: false }).then(function (doc) {
          if (doc.isEncrypted) {
            throw new Error('Incorrect password — could not unlock this PDF');
          }
          return doc.save().then(function (bytes) {
            return { bytes: bytes, name: C.baseName(file.name) + '_unlocked.pdf', mime: 'application/pdf' };
          });
        });
      });
    }
  };

  /* ---------------- PROTECT ---------------- */
  var protect = {
    id: 'protect',
    title: 'Protect PDF',
    desc: 'Encrypt your PDF with a password and set permissions.',
    category: 'security',
    icon: '🔒',
    color: '#EE6C4D',
    accept: '.pdf,application/pdf',
    multiple: false,
    options: function () {
      return '' +
        '<div class="option-row"><span class="opt-label">Password</span><input type="password" class="opt-control" id="opt-protect-pass" placeholder="Minimum 8 characters"></div>' +
        '<div class="option-row"><span class="opt-label">Confirm</span><input type="password" class="opt-control" id="opt-protect-pass2" placeholder="Repeat password"></div>' +
        '<div class="option-row"><span class="opt-label">Permissions</span>' +
        '<div class="check-list opt-control">' +
        '<label><input type="checkbox" id="opt-protect-print" checked> Allow printing</label>' +
        '<label><input type="checkbox" id="opt-protect-modify" checked> Allow content modification</label>' +
        '<label><input type="checkbox" id="opt-protect-copy" checked> Allow copy / extraction</label>' +
        '<label><input type="checkbox" id="opt-protect-comments" checked> Allow comments</label>' +
        '<label><input type="checkbox" id="opt-protect-forms" checked> Allow form filling</label>' +
        '<label><input type="checkbox" id="opt-protect-access" checked> Allow accessibility extraction</label>' +
        '<label><input type="checkbox" id="opt-protect-assembly" checked> Allow document assembly</label>' +
        '</div></div>';
    },
    actionLabel: 'Protect PDF',
    process: function (files, opts, ui) {
      var file = files[0];
      var pass = opts.password || '';
      if (pass.length < 8) throw new Error('Password must be at least 8 characters');
      // Build the permission flags (bit 2 = 1 means "all operations permitted"
      // unless the specific bit is cleared; we clear bits for disabled ops).
      // PDF permission bits: 3=print, 4=modify, 5=copy, 6=annotate/comments,
      // 9=fill forms, 10=accessibility, 11=assemble.
      var P = 0xFFFFFFFC; // all allowed by default
      if (opts.print === false) P &= ~(1 << 2);      // bit 3
      if (opts.modify === false) P &= ~(1 << 3);     // bit 4
      if (opts.copy === false) P &= ~(1 << 4);       // bit 5
      if (opts.comments === false) P &= ~(1 << 5);   // bit 6
      if (opts.forms === false) P &= ~(1 << 8);      // bit 9
      if (opts.access === false) P &= ~(1 << 9);     // bit 10
      if (opts.assembly === false) P &= ~(1 << 10);  // bit 11
      return C.loadPdfDoc(file.bytes).then(function (doc) {
        // pdf-lib >= 1.17 cannot CREATE encrypted PDFs, so save the plain
        // document first (no object streams — the encryptor needs every
        // object directly addressable), then apply real RC4-40 encryption.
        return doc.save({ useObjectStreams: false }).then(function (plainBytes) {
          var encBytes = PDFEncrypt.encryptPdf(plainBytes, pass, pass, P);
          return { bytes: encBytes, name: C.baseName(file.name) + '_protected.pdf', mime: 'application/pdf' };
        });
      });
    }
  };

  /* ---------------- COMPARE ---------------- */
  var compare = {
    id: 'compare',
    title: 'Compare PDF',
    desc: 'Compare two PDFs side by side with scroll sync and text diff.',
    category: 'security',
    icon: '⚖️',
    color: '#008ee9',
    accept: '.pdf,application/pdf',
    multiple: true,
    needsCompare: true,
    options: function () {
      return '' +
        '<div class="option-row"><span class="opt-label">Mode</span>' +
        '<div class="seg" data-seg="cmpMode">' +
        '<button type="button" data-val="semantic" class="active">Semantic text</button>' +
        '<button type="button" data-val="overlay">Content overlay</button>' +
        '</div></div>' +
        '<div class="option-row"><span class="opt-label">Note</span><span class="opt-control" style="color:var(--muted);font-size:13px">Upload two PDFs. The first is the original, the second the modified version.</span></div>';
    },
    actionLabel: 'Compare PDFs',
    process: function (files, opts, ui) {
      if (files.length < 2) throw new Error('Upload two PDFs to compare');
      var a = files[0], b = files[1];
      var mode = opts.cmpMode || 'semantic';
      return Promise.all([C.loadPdfJs(a.bytes), C.loadPdfJs(b.bytes)]).then(function (docs) {
        return Promise.all([C.extractText(docs[0]), C.extractText(docs[1])]).then(function (texts) {
          var diff = C.diffLines(texts[0].join('\n'), texts[1].join('\n'));
          if (mode === 'overlay') {
            // Content overlay: render page 1 of both PDFs, compute pixel
            // differences, and return a highlighted overlay image.
            return C.renderOverlay(docs[0], docs[1]).then(function (overlay) {
              return { diff: diff, overlay: overlay, nameA: a.name, nameB: b.name };
            });
          }
          return { diff: diff, nameA: a.name, nameB: b.name };
        });
      });
    }
  };

  /* ---------------- REDACT ---------------- */
  var redact = {
    id: 'redact',
    title: 'Redact PDF',
    desc: 'Permanently black out sensitive content by text search.',
    category: 'security',
    icon: '🖍️',
    color: '#e5322d',
    accept: '.pdf,application/pdf',
    multiple: false,
    options: function () {
      return '' +
        '<div class="option-row"><span class="opt-label">Search text</span><input type="text" class="opt-control" id="opt-redact-text" placeholder="Text to redact (comma separated)"></div>' +
        '<div class="option-row"><span class="opt-label">Patterns</span>' +
        '<div class="check-list opt-control">' +
        '<label><input type="checkbox" id="opt-redact-email"> Email addresses</label>' +
        '<label><input type="checkbox" id="opt-redact-phone"> Phone numbers</label>' +
        '<label><input type="checkbox" id="opt-redact-cc"> Credit card numbers</label>' +
        '</div></div>' +
        '<div class="option-row"><span class="opt-label">Note</span><span class="opt-control" style="color:var(--muted);font-size:13px">Redaction draws black rectangles over matching text. For true security, re-render the PDF (see LIMITATIONS.md).</span></div>';
    },
    actionLabel: 'Redact PDF',
    process: function (files, opts, ui) {
      var file = files[0];
      var terms = (opts.text || '').split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
      var patterns = [];
      if (opts.email) patterns.push(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i);
      if (opts.phone) patterns.push(/\+?\d[\d\s().-]{7,}\d/);
      if (opts.cc) patterns.push(/\b(?:\d[ -]*?){13,16}\b/);
      if (!terms.length && !patterns.length) throw new Error('Enter text to redact or enable a pattern');

      return C.loadPdfJs(file.bytes).then(function (pdfJs) {
        return C.loadPdfDoc(file.bytes).then(function (doc) {
          var chain = Promise.resolve();
          var total = pdfJs.numPages;
          for (var i = 1; i <= total; i++) {
            (function (n) {
              chain = chain.then(function () {
                return pdfJs.getPage(n).then(function (page) {
                  return page.getTextContent().then(function (tc) {
                    var pageDoc = doc.getPage(n - 1);
                    var pw = pageDoc.getWidth(), ph = pageDoc.getHeight();
                    var vp = page.getViewport({ scale: 1 });
                    var sx = pw / vp.width, sy = ph / vp.height;
                    var rects = [];
                    tc.items.forEach(function (item) {
                      var str = item.str;
                      if (!str) return;
                      var lower = str.toLowerCase();
                      var hit = false;
                      terms.forEach(function (t) {
                        if (lower.indexOf(t) !== -1) hit = true;
                      });
                      patterns.forEach(function (re) {
                        if (re.test(str)) hit = true;
                      });
                      if (hit) {
                        var tx = item.transform[4], ty = item.transform[5];
                        var tw = item.width, th = item.height || 10;
                        rects.push({ x: tx * sx, y: (vp.height - ty - th) * sy, w: tw * sx, h: th * sy });
                      }
                    });
                    rects.forEach(function (r) {
                      pageDoc.drawRectangle({
                        x: r.x, y: r.y, width: r.w + 2, height: r.h + 2,
                        color: PDFLib.rgb(0, 0, 0)
                      });
                    });
                  });
                });
              });
            })(i);
          }
          return chain.then(function () {
            return doc.save().then(function (bytes) {
              return { bytes: bytes, name: C.baseName(file.name) + '_redacted.pdf', mime: 'application/pdf' };
            });
          });
        });
      });
    }
  };

  window.ToolSecurity = { sign: sign, unlock: unlock, protect: protect, compare: compare, redact: redact };
})();
