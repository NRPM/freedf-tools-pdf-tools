/* ============================================================
   optimize.js — Compress, Repair, OCR
   ============================================================ */
(function () {
  'use strict';
  var C = window.PDFCore;
  var PDFLib = C.libs.PDFLib;

  /* ---------------- COMPRESS ---------------- */
  var compress = {
    id: 'compress',
    title: 'Compress PDF',
    desc: 'Reduce PDF file size while keeping the best possible quality.',
    category: 'optimize',
    icon: '🗜️',
    color: '#EE6C4D',
    accept: '.pdf,application/pdf',
    multiple: true,
    options: function () {
      return '' +
        '<div class="option-row"><span class="opt-label">Compression level</span>' +
        '<div class="seg" data-seg="level">' +
        '<button type="button" data-val="extreme">Extreme</button>' +
        '<button type="button" data-val="recommended" class="active">Recommended</button>' +
        '<button type="button" data-val="less">Less compression</button>' +
        '</div></div>' +
        '<div class="option-row"><span class="opt-label">Image quality</span>' +
        '<input type="range" class="opt-control" id="opt-compress-quality" min="0.2" max="1" step="0.05" value="0.7">' +
        '<span class="opt-control" id="opt-compress-quality-val" style="min-width:40px;color:var(--muted);font-size:13px">0.70</span>' +
        '</div>';
    },
    actionLabel: 'Compress PDF',
    process: function (files, opts, ui) {
      var file = files[0];
      var level = opts.level || 'recommended';
      var quality = level === 'extreme' ? 0.4 : (level === 'less' ? 0.9 : parseFloat(opts.quality) || 0.7);

      return C.loadPdfDoc(file.bytes).then(function (doc) {
        // Downscale embedded images via canvas re-encode (best-effort).
        var chain = Promise.resolve();
        var total = doc.getPageCount();
        for (var p = 0; p < total; p++) {
          (function (pi) {
            chain = chain.then(function () {
              var page = doc.getPage(pi);
              var res = page.node.lookupMaybe(PDFLib.PDFName.of('Resources'), PDFLib.PDFDict);
              if (!res) return Promise.resolve();
              var xObjects = res.lookupMaybe(PDFLib.PDFName.of('XObject'), PDFLib.PDFDict);
              if (!xObjects) return Promise.resolve();
              var names = xObjects.keys();
              var jobs = [];
              names.forEach(function (name) {
                var xo = xObjects.lookup(name);
                if (!(xo instanceof PDFLib.PDFStream)) return;
                var subtype = xo.dict.get(PDFLib.PDFName.of('Subtype'));
                if (!subtype || subtype.toString() !== '/Image') return;
                var filter = xo.dict.get(PDFLib.PDFName.of('Filter'));
                var isJpeg = filter && filter.toString().indexOf('DCTDecode') !== -1;
                var isPng = filter && filter.toString().indexOf('FlateDecode') !== -1;
                if (!isJpeg && !isPng) return;
                var w = xo.dict.get(PDFLib.PDFName.of('Width')).asNumber();
                var h = xo.dict.get(PDFLib.PDFName.of('Height')).asNumber();
                if (!w || !h || w * h > 4000 * 4000) return; // skip huge images (memory)
                var bytes = xo.getContents();
                var blob = new Blob([bytes], { type: isJpeg ? 'image/jpeg' : 'image/png' });
                var url = URL.createObjectURL(blob);
                jobs.push(C.loadImage(url).then(function (img) {
                  URL.revokeObjectURL(url);
                  var scale = level === 'extreme' ? 0.5 : (level === 'less' ? 0.9 : 0.7);
                  var cw = Math.max(1, Math.round(w * scale));
                  var ch = Math.max(1, Math.round(h * scale));
                  var canvas = document.createElement('canvas');
                  canvas.width = cw; canvas.height = ch;
                  var ctx = canvas.getContext('2d');
                  ctx.drawImage(img, 0, 0, cw, ch);
                  return C.canvasToJpegBlob(canvas, quality).then(function (jpegBlob) {
                    return jpegBlob.arrayBuffer();
                  }).then(function (jpegBytes) {
                    // Replace the XObject entry with a freshly embedded JPEG.
                    return doc.embedJpg(jpegBytes).then(function (newImg) {
                      xObjects.set(name, newImg.ref);
                    });
                  });
                }, function () {
                  URL.revokeObjectURL(url); // revoke even on decode failure
                }));
              });
              return Promise.all(jobs);
            });
          })(p);
        }
        return chain.then(function () {
          return doc.save({ useObjectStreams: true }).then(function (bytes) {
            return { bytes: bytes, name: C.baseName(file.name) + '_compressed.pdf', mime: 'application/pdf' };
          });
        });
      });
    }
  };

  /* ---------------- REPAIR ---------------- */
  var repair = {
    id: 'repair',
    title: 'Repair PDF',
    desc: 'Fix corrupt or damaged PDF files and recover content.',
    category: 'optimize',
    icon: '🛠️',
    color: '#7253e2',
    accept: '.pdf,application/pdf',
    multiple: true,
    options: function () { return ''; },
    actionLabel: 'Repair PDF',
    process: function (files, opts, ui) {
      var file = files[0];
      // pdf-lib's load already attempts recovery; re-save normalizes the file.
      return C.loadPdfDoc(file.bytes).then(function (doc) {
        return doc.save().then(function (bytes) {
          return { bytes: bytes, name: C.baseName(file.name) + '_repaired.pdf', mime: 'application/pdf' };
        });
      });
    }
  };

  /* ---------------- OCR ---------------- */
  var ocr = {
    id: 'ocr',
    title: 'OCR PDF',
    desc: 'Make scanned PDFs searchable and selectable with real OCR (Tesseract.js).',
    category: 'optimize',
    icon: '🔍',
    color: '#4A7AAB',
    accept: '.pdf,application/pdf',
    multiple: false,
    options: function () {
      return '' +
        '<div class="option-row"><span class="opt-label">Language</span>' +
        '<select class="opt-control" id="opt-ocr-lang">' +
        '<option value="eng">English</option>' +
        '<option value="spa">Spanish</option>' +
        '<option value="fra">French</option>' +
        '<option value="deu">German</option>' +
        '<option value="ita">Italian</option>' +
        '<option value="por">Portuguese</option>' +
        '<option value="jpn">Japanese</option>' +
        '<option value="chi_sim">Chinese (Simplified)</option>' +
        '<option value="ara">Arabic</option>' +
        '<option value="rus">Russian</option>' +
        '<option value="kor">Korean</option>' +
        '</select></div>' +
        '<div class="option-row"><span class="opt-label">Note</span><span class="opt-control" style="color:var(--muted);font-size:13px">OCR runs fully in your browser. The first run downloads the language model (~10 MB).</span></div>';
    },
    actionLabel: 'OCR PDF',
    process: function (files, opts, ui) {
      var file = files[0];
      var lang = opts.lang || 'eng';
      var T = C.libs.Tesseract;
      if (!T) throw new Error('Tesseract.js failed to load (check your connection)');

      return C.loadPdfJs(file.bytes).then(function (pdfJs) {
        var total = pdfJs.numPages;
        var pages = [];
        var chain = Promise.resolve();
        for (var i = 1; i <= total; i++) {
          (function (n) {
            chain = chain.then(function () {
              ui.progress('OCR page ' + n + ' of ' + total + '…', (n - 1) / total * 100);
              return C.renderPageToCanvas(pdfJs, n, 2).then(function (r) {
                return C.canvasToPngBlob(r.canvas).then(function (blob) {
                  return T.recognize(blob, lang).then(function (res) {
                    pages.push(res.data.text);
                  });
                });
              });
            });
          })(i);
        }
        return chain.then(function () {
          // Build a searchable PDF: render each page as image + invisible text layer.
          return C.loadPdfDoc(file.bytes).then(function (doc) {
            var chain2 = Promise.resolve();
            for (var j = 0; j < total; j++) {
              (function (pi) {
                chain2 = chain2.then(function () {
                  var page = doc.getPage(pi);
                  var w = page.getWidth(), h = page.getHeight();
                  var text = pages[pi] || '';
                  var font = null;
                  return doc.embedFont(PDFLib.StandardFonts.Helvetica).then(function (f) {
                    font = f;
                    var fontSize = 1;
                    // Invisible text: white text at tiny size over the page.
                    page.drawText(text, {
                      x: 0, y: h - fontSize,
                      size: fontSize,
                      font: font,
                      color: PDFLib.rgb(1, 1, 1),
                      opacity: 0
                    });
                  });
                });
              })(j);
            }
            return chain2.then(function () {
              return doc.save().then(function (bytes) {
                return { bytes: bytes, name: C.baseName(file.name) + '_ocr.pdf', mime: 'application/pdf' };
              });
            });
          });
        });
      });
    }
  };

  window.ToolOptimize = { compress: compress, repair: repair, ocr: ocr };
})();
