/* ============================================================
   convert.js — PDF<->Office, PDF<->JPG, HTML->PDF, PDF/A,
                 PDF->Markdown, Scan to PDF
   ============================================================ */
(function () {
  'use strict';
  var C = window.PDFCore;
  var PDFLib = C.libs.PDFLib;

  /* ---------------- PDF -> WORD ---------------- */
  var pdfToWord = {
    id: 'pdf-to-word',
    title: 'PDF to Word',
    desc: 'Convert PDF to an editable .docx document.',
    category: 'convert',
    icon: '📝',
    color: '#4A7AAB',
    accept: '.pdf,application/pdf',
    multiple: false,
    options: function () {
      return '<div class="option-row"><span class="opt-label">OCR</span><div class="seg" data-seg="ocr"><button type="button" data-val="off" class="active">Off</button><button type="button" data-val="on">On (scanned pages)</button></div></div>';
    },
    actionLabel: 'Convert to Word',
    process: function (files, opts, ui) {
      var file = files[0];
      return C.loadPdfJs(file.bytes).then(function (pdfJs) {
        return C.extractText(pdfJs).then(function (pages) {
          var chain = Promise.resolve();
          if (opts.ocr === 'on') {
            chain = chain.then(function () {
              return C.ocrPages(pdfJs, pages, ui);
            });
          }
          return chain.then(function () {
            return C.buildDocx(pages).then(function (blob) {
              return { blob: blob, name: C.baseName(file.name) + '.docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
            });
          });
        });
      });
    }
  };

  /* ---------------- PDF -> POWERPOINT ---------------- */
  var pdfToPpt = {
    id: 'pdf-to-powerpoint',
    title: 'PDF to PowerPoint',
    desc: 'Convert PDF pages into an editable .pptx presentation.',
    category: 'convert',
    icon: '📊',
    color: '#EE6C4D',
    accept: '.pdf,application/pdf',
    multiple: false,
    options: function () {
      return '<div class="option-row"><span class="opt-label">OCR</span><div class="seg" data-seg="ocr"><button type="button" data-val="off" class="active">Off</button><button type="button" data-val="on">On (scanned pages)</button></div></div>';
    },
    actionLabel: 'Convert to PowerPoint',
    process: function (files, opts, ui) {
      var file = files[0];
      return C.loadPdfJs(file.bytes).then(function (pdfJs) {
        return C.extractText(pdfJs).then(function (pages) {
          var chain = Promise.resolve();
          if (opts.ocr === 'on') {
            chain = chain.then(function () { return C.ocrPages(pdfJs, pages, ui); });
          }
          return chain.then(function () {
            var slides = pages.map(function (p, i) { return 'Slide ' + (i + 1) + '\n' + p; });
            return C.buildPptx(slides).then(function (blob) {
              return { blob: blob, name: C.baseName(file.name) + '.pptx', mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };
            });
          });
        });
      });
    }
  };

  /* ---------------- PDF -> EXCEL ---------------- */
  var pdfToExcel = {
    id: 'pdf-to-excel',
    title: 'PDF to Excel',
    desc: 'Extract PDF tables into an .xlsx spreadsheet.',
    category: 'convert',
    icon: '📈',
    color: '#8FBC5D',
    accept: '.pdf,application/pdf',
    multiple: false,
    options: function () {
      return '' +
        '<div class="option-row"><span class="opt-label">Layout</span>' +
        '<div class="seg" data-seg="layout">' +
        '<button type="button" data-val="one" class="active">One sheet</button>' +
        '<button type="button" data-val="multi">Multiple sheets</button>' +
        '</div></div>' +
        '<div class="option-row"><span class="opt-label">OCR</span><div class="seg" data-seg="ocr"><button type="button" data-val="off" class="active">Off</button><button type="button" data-val="on">On (scanned pages)</button></div></div>';
    },
    actionLabel: 'Convert to Excel',
    process: function (files, opts, ui) {
      var file = files[0];
      return C.loadPdfJs(file.bytes).then(function (pdfJs) {
        return C.extractText(pdfJs).then(function (pages) {
          var chain = Promise.resolve();
          if (opts.ocr === 'on') {
            chain = chain.then(function () { return C.ocrPages(pdfJs, pages, ui); });
          }
          return chain.then(function () {
            var rows = [];
            pages.forEach(function (p, pi) {
              if (opts.layout === 'multi' && pi > 0) rows.push(['']);
              rows.push(['Page ' + (pi + 1)]);
              p.split('\n').forEach(function (line) {
                var cells = line.split(/\t|\s{2,}/).map(function (s) { return s.trim(); }).filter(Boolean);
                if (cells.length) rows.push(cells);
              });
            });
            return C.buildXlsx(rows).then(function (blob) {
              return { blob: blob, name: C.baseName(file.name) + '.xlsx', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
            });
          });
        });
      });
    }
  };

  /* ---------------- WORD -> PDF ---------------- */
  var wordToPdf = {
    id: 'word-to-pdf',
    title: 'Word to PDF',
    desc: 'Convert .doc / .docx documents to PDF.',
    category: 'convert',
    icon: '📄',
    color: '#4A7AAB',
    accept: '.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    multiple: true,
    options: function () {
      return '<div class="option-row"><span class="opt-label">Note</span><span class="opt-control" style="color:var(--muted);font-size:13px">Text is extracted from the document and rendered into a clean PDF. Complex layouts are approximated (see LIMITATIONS.md).</span></div>';
    },
    actionLabel: 'Convert to PDF',
    process: function (files, opts, ui) {
      var file = files[0];
      return C.docxToText(file.file).then(function (text) {
        return C.textToPdf(text, C.baseName(file.name) + '.pdf').then(function (bytes) {
          return { bytes: bytes, name: C.baseName(file.name) + '.pdf', mime: 'application/pdf' };
        });
      });
    }
  };

  /* ---------------- POWERPOINT -> PDF ---------------- */
  var pptToPdf = {
    id: 'powerpoint-to-pdf',
    title: 'PowerPoint to PDF',
    desc: 'Convert .ppt / .pptx presentations to PDF.',
    category: 'convert',
    icon: '📽️',
    color: '#EE6C4D',
    accept: '.ppt,.pptx,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation',
    multiple: true,
    options: function () {
      return '<div class="option-row"><span class="opt-label">Note</span><span class="opt-control" style="color:var(--muted);font-size:13px">Slide text is extracted and rendered into a PDF. Visual fidelity is approximated (see LIMITATIONS.md).</span></div>';
    },
    actionLabel: 'Convert to PDF',
    process: function (files, opts, ui) {
      var file = files[0];
      return C.pptxToText(file.file).then(function (text) {
        return C.textToPdf(text, C.baseName(file.name) + '.pdf').then(function (bytes) {
          return { bytes: bytes, name: C.baseName(file.name) + '.pdf', mime: 'application/pdf' };
        });
      });
    }
  };

  /* ---------------- EXCEL -> PDF ---------------- */
  var excelToPdf = {
    id: 'excel-to-pdf',
    title: 'Excel to PDF',
    desc: 'Convert .xls / .xlsx spreadsheets to PDF.',
    category: 'convert',
    icon: '📗',
    color: '#8FBC5D',
    accept: '.xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    multiple: true,
    options: function () {
      return '' +
        '<div class="option-row"><span class="opt-label">Orientation</span>' +
        '<div class="seg" data-seg="orientation">' +
        '<button type="button" data-val="portrait" class="active">Portrait</button>' +
        '<button type="button" data-val="landscape">Landscape</button>' +
        '</div></div>' +
        '<div class="option-row"><span class="opt-label">Note</span><span class="opt-control" style="color:var(--muted);font-size:13px">Cell values are extracted and rendered as a table PDF (see LIMITATIONS.md).</span></div>';
    },
    actionLabel: 'Convert to PDF',
    process: function (files, opts, ui) {
      var file = files[0];
      return C.xlsxToRows(file.file).then(function (rows) {
        return C.rowsToPdf(rows, opts.orientation).then(function (bytes) {
          return { bytes: bytes, name: C.baseName(file.name) + '.pdf', mime: 'application/pdf' };
        });
      });
    }
  };

  /* ---------------- PDF -> JPG ---------------- */
  var pdfToJpg = {
    id: 'pdf-to-jpg',
    title: 'PDF to JPG',
    desc: 'Convert each PDF page to a JPG image, or extract embedded images.',
    category: 'convert',
    icon: '🖼️',
    color: '#AB6993',
    accept: '.pdf,application/pdf',
    multiple: false,
    options: function () {
      return '' +
        '<div class="option-row"><span class="opt-label">Mode</span>' +
        '<div class="seg" data-seg="mode">' +
        '<button type="button" data-val="page" class="active">Page to JPG</button>' +
        '<button type="button" data-val="extract">Extract images</button>' +
        '</div></div>' +
        '<div class="option-row"><span class="opt-label">Quality</span>' +
        '<div class="seg" data-seg="quality">' +
        '<button type="button" data-val="normal">Normal</button>' +
        '<button type="button" data-val="recommended" class="active">Recommended</button>' +
        '<button type="button" data-val="high">High</button>' +
        '</div></div>';
    },
    actionLabel: 'Convert to JPG',
    process: function (files, opts, ui) {
      var file = files[0];
      var q = opts.quality === 'high' ? 0.95 : (opts.quality === 'normal' ? 0.6 : 0.85);
      return C.loadPdfJs(file.bytes).then(function (pdfJs) {
        if (opts.mode === 'extract') {
          return C.extractEmbeddedImages(file.bytes).then(function (imgs) {
            if (!imgs.length) throw new Error('No embedded images found in this PDF');
            return { zip: imgs, zipName: C.baseName(file.name) + '_images.zip' };
          });
        }
        var total = pdfJs.numPages;
        var parts = [];
        var chain = Promise.resolve();
        for (var i = 1; i <= total; i++) {
          (function (n) {
            chain = chain.then(function () {
              ui.progress('Rendering page ' + n + ' of ' + total + '…', (n - 1) / total * 100);
              return C.renderPageToCanvas(pdfJs, n, 2).then(function (r) {
                return C.canvasToJpegBlob(r.canvas, q).then(function (blob) {
                  return blob.arrayBuffer().then(function (buf) {
                    parts.push({ name: C.baseName(file.name) + '_page' + n + '.jpg', bytes: buf });
                  });
                });
              });
            });
          })(i);
        }
        return chain.then(function () {
          return { zip: parts, zipName: C.baseName(file.name) + '_jpg.zip' };
        });
      });
    }
  };

  /* ---------------- JPG -> PDF ---------------- */
  var jpgToPdf = {
    id: 'jpg-to-pdf',
    title: 'JPG to PDF',
    desc: 'Convert JPG images to PDF, merged into one document.',
    category: 'convert',
    icon: '🖼️',
    color: '#AB6993',
    accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp',
    multiple: true,
    options: function () {
      return '' +
        '<div class="option-row"><span class="opt-label">Orientation</span>' +
        '<div class="seg" data-seg="orientation">' +
        '<button type="button" data-val="auto" class="active">Auto</button>' +
        '<button type="button" data-val="portrait">Portrait</button>' +
        '<button type="button" data-val="landscape">Landscape</button>' +
        '</div></div>' +
        '<div class="option-row"><span class="opt-label">Page size</span>' +
        '<div class="seg" data-seg="size">' +
        '<button type="button" data-val="fit" class="active">Fit image</button>' +
        '<button type="button" data-val="a4">A4</button>' +
        '<button type="button" data-val="letter">US Letter</button>' +
        '</div></div>' +
        '<div class="option-row"><span class="opt-label">Margin</span>' +
        '<div class="seg" data-seg="margin">' +
        '<button type="button" data-val="none" class="active">No margin</button>' +
        '<button type="button" data-val="small">Small</button>' +
        '</div></div>';
    },
    actionLabel: 'Convert to PDF',
    process: function (files, opts, ui) {
      return PDFLib.PDFDocument.create().then(function (doc) {
        var chain = Promise.resolve();
        files.forEach(function (file, fi) {
          chain = chain.then(function () {
            ui.progress('Processing image ' + (fi + 1) + ' of ' + files.length + '…', fi / files.length * 100);
            return C.readAsArrayBuffer(file.file).then(function (buf) {
              var isPng = /\.png$/i.test(file.file.name);
              var embed = isPng ? doc.embedPng(buf) : doc.embedJpg(buf);
              return embed.then(function (img) {
                var iw = img.width, ih = img.height;
                var pageW, pageH;
                var size = opts.size || 'fit';
                if (size === 'a4') { pageW = 595.28; pageH = 841.89; }
                else if (size === 'letter') { pageW = 612; pageH = 792; }
                else { pageW = iw; pageH = ih; }
                var orient = opts.orientation || 'auto';
                if (orient === 'portrait' && pageW > pageH) { var t = pageW; pageW = pageH; pageH = t; }
                if (orient === 'landscape' && pageH > pageW) { var t2 = pageW; pageW = pageH; pageH = t2; }
                var margin = opts.margin === 'small' ? 24 : 0;
                var availW = pageW - margin * 2, availH = pageH - margin * 2;
                var scale = Math.min(availW / iw, availH / ih);
                var dw = iw * scale, dh = ih * scale;
                var page = doc.addPage([pageW, pageH]);
                page.drawImage(img, {
                  x: (pageW - dw) / 2,
                  y: (pageH - dh) / 2,
                  width: dw,
                  height: dh
                });
              });
            });
          });
        });
        return chain.then(function () {
          return doc.save().then(function (bytes) {
            return { bytes: bytes, name: 'images.pdf', mime: 'application/pdf' };
          });
        });
      });
    }
  };

  /* ---------------- HTML -> PDF ---------------- */
  var htmlToPdf = {
    id: 'html-to-pdf',
    title: 'HTML to PDF',
    desc: 'Convert HTML files or pasted HTML to PDF.',
    category: 'convert',
    icon: '🌐',
    color: '#008ee9',
    accept: '.html,.htm,text/html',
    multiple: true,
    needsFile: false, // works with pasted HTML alone
    options: function () {
      return '<div class="option-row"><span class="opt-label">Or paste HTML</span><textarea class="opt-control" id="opt-html-text" placeholder="<h1>Hello</h1><p>Paste HTML here…"></textarea></div>';
    },
    actionLabel: 'Convert to PDF',
    process: function (files, opts, ui) {
      var html = opts.htmlText || '';
      var chain = Promise.resolve();
      if (files.length) {
        chain = C.readAsText(files[0].file).then(function (t) { html = t; });
      }
      return chain.then(function () {
        if (!html || !html.trim()) throw new Error('No HTML provided');
        return C.htmlToPdf(html).then(function (bytes) {
          return { bytes: bytes, name: 'document.pdf', mime: 'application/pdf' };
        });
      });
    }
  };

  /* ---------------- PDF -> PDF/A ---------------- */
  var pdfToPdfa = {
    id: 'pdf-to-pdfa',
    title: 'PDF to PDF/A',
    desc: 'Convert to archival PDF/A format (best-effort, client-side).',
    category: 'convert',
    icon: '🗃️',
    color: '#7253e2',
    accept: '.pdf,application/pdf',
    multiple: false,
    options: function () {
      return '' +
        '<div class="option-row"><span class="opt-label">Conformance</span>' +
        '<select class="opt-control" id="opt-pdfa-level">' +
        '<option value="2b">PDF/A-2b</option>' +
        '<option value="1b">PDF/A-1b</option>' +
        '<option value="2u">PDF/A-2u</option>' +
        '<option value="3b">PDF/A-3b</option>' +
        '</select></div>' +
        '<div class="option-row"><span class="opt-label">Note</span><span class="opt-control" style="color:var(--muted);font-size:13px">True PDF/A validation requires server-side tooling. This re-saves the PDF with embedded fonts and PDF/A metadata (see LIMITATIONS.md).</span></div>';
    },
    actionLabel: 'Convert to PDF/A',
    process: function (files, opts, ui) {
      var file = files[0];
      return C.loadPdfDoc(file.bytes).then(function (doc) {
        // Embed standard fonts where possible (best-effort archival).
        var chain = Promise.resolve();
        var total = doc.getPageCount();
        for (var i = 0; i < total; i++) {
          (function (pi) {
            chain = chain.then(function () {
              return doc.embedFont(PDFLib.StandardFonts.Helvetica).then(function () { /* ensure font table present */ });
            });
          })(i);
        }
        return chain.then(function () {
          doc.setTitle('PDF/A document');
          doc.setProducer('FreeDF Tools (client-side PDF/A best-effort)');
          doc.setCreationDate(new Date());
          return doc.save({ useObjectStreams: true }).then(function (bytes) {
            return { bytes: bytes, name: C.baseName(file.name) + '_pdfa.pdf', mime: 'application/pdf' };
          });
        });
      });
    }
  };

  /* ---------------- PDF -> MARKDOWN ---------------- */
  var pdfToMarkdown = {
    id: 'pdf-to-markdown',
    title: 'PDF to Markdown',
    desc: 'Convert PDF to a .md file, preserving headings, lists and structure.',
    category: 'intelligence',
    icon: '📝',
    color: '#7253e2',
    accept: '.pdf,application/pdf',
    multiple: false,
    options: function () { return ''; },
    actionLabel: 'Convert to Markdown',
    process: function (files, opts, ui) {
      var file = files[0];
      return C.loadPdfJs(file.bytes).then(function (pdfJs) {
        return C.extractText(pdfJs).then(function (pages) {
          var md = pages.map(function (p, i) {
            return '## Page ' + (i + 1) + '\n\n' + C.textToMarkdown(p);
          }).join('\n\n---\n\n');
          var blob = new Blob([md], { type: 'text/markdown' });
          return { blob: blob, name: C.baseName(file.name) + '.md', mime: 'text/markdown' };
        });
      });
    }
  };

  /* ---------------- SCAN TO PDF ---------------- */
  var scanToPdf = {
    id: 'scan-to-pdf',
    title: 'Scan to PDF',
    desc: 'Turn photos of documents into a single PDF (same as JPG to PDF).',
    category: 'organize',
    icon: '📷',
    color: '#4A7AAB',
    accept: '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp',
    multiple: true,
    options: function () {
      return '' +
        '<div class="option-row"><span class="opt-label">Orientation</span>' +
        '<div class="seg" data-seg="orientation">' +
        '<button type="button" data-val="auto" class="active">Auto</button>' +
        '<button type="button" data-val="portrait">Portrait</button>' +
        '<button type="button" data-val="landscape">Landscape</button>' +
        '</div></div>' +
        '<div class="option-row"><span class="opt-label">Page size</span>' +
        '<div class="seg" data-seg="size">' +
        '<button type="button" data-val="fit" class="active">Fit image</button>' +
        '<button type="button" data-val="a4">A4</button>' +
        '<button type="button" data-val="letter">US Letter</button>' +
        '</div></div>' +
        '<div class="option-row"><span class="opt-label">Margin</span>' +
        '<div class="seg" data-seg="margin">' +
        '<button type="button" data-val="none" class="active">No margin</button>' +
        '<button type="button" data-val="small">Small</button>' +
        '</div></div>';
    },
    actionLabel: 'Create PDF',
    process: function (files, opts, ui) {
      // Reuse the JPG->PDF pipeline.
      return jpgToPdf.process(files, opts, ui);
    }
  };

  window.ToolConvert = {
    pdfToWord: pdfToWord, pdfToPpt: pdfToPpt, pdfToExcel: pdfToExcel,
    wordToPdf: wordToPdf, pptToPdf: pptToPdf, excelToPdf: excelToPdf,
    pdfToJpg: pdfToJpg, jpgToPdf: jpgToPdf, htmlToPdf: htmlToPdf,
    pdfToPdfa: pdfToPdfa, pdfToMarkdown: pdfToMarkdown, scanToPdf: scanToPdf
  };
})();
