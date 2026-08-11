/* ============================================================
   pdf-core.js — shared helpers for all tools
   - library accessors (pdf-lib, PDF.js, JSZip, Tesseract)
   - file reading, PDF loading, page rendering to canvas
   - text extraction, download helpers (single + ZIP)
   - minimal .docx / .xlsx / .pptx builders (ZIP + XML)
   ============================================================ */
(function () {
  'use strict';

  var PDFLib = window.PDFLib;
  var pdfjsLib = window.pdfjsLib;
  var JSZip = window.JSZip;
  var Tesseract = window.Tesseract;

  // PDF.js worker: use the CDN worker (same origin policy is fine for unpkg).
  if (pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  }

  var Core = {
    libs: { PDFLib: PDFLib, pdfjs: pdfjsLib, JSZip: JSZip, Tesseract: Tesseract },

    /* ---------- file helpers ---------- */
    readAsArrayBuffer: function (file) {
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.onerror = function () { reject(fr.error || new Error('Failed to read file')); };
        fr.readAsArrayBuffer(file);
      });
    },

    readAsDataURL: function (file) {
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.onerror = function () { reject(fr.error || new Error('Failed to read file')); };
        fr.readAsDataURL(file);
      });
    },

    readAsText: function (file) {
      return new Promise(function (resolve, reject) {
        var fr = new FileReader();
        fr.onload = function () { resolve(fr.result); };
        fr.onerror = function () { reject(fr.error || new Error('Failed to read file')); };
        fr.readAsText(file);
      });
    },

    formatBytes: function (bytes) {
      if (!bytes && bytes !== 0) return '';
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    },

    baseName: function (name) {
      return name.replace(/\.[^.]+$/, '');
    },

    /* ---------- PDF helpers ---------- */
    loadPdfDoc: function (bytes) {
      return PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    },

    loadPdfJs: function (bytes) {
      // Copy the buffer: PDF.js transfers it to its worker, which would
      // detach the original and break later pdf-lib usage of the same bytes.
      return pdfjsLib.getDocument({ data: bytes.slice(0) }).promise;
    },

    /** Render a PDF.js page to a canvas at given scale. */
    renderPageToCanvas: function (pdfJsDoc, pageNum, scale) {
      return pdfJsDoc.getPage(pageNum).then(function (page) {
        var viewport = page.getViewport({ scale: scale || 1.5 });
        var canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        return page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise.then(function () {
          return { canvas: canvas, page: page, viewport: viewport };
        });
      });
    },

    /** Content-overlay compare: render page 1 of both PDFs at the same
        scale, compute per-pixel differences, and return a data-URL image
        where changed regions are highlighted in red. */
    renderOverlay: function (pdfJsA, pdfJsB) {
      return Promise.all([
        C.renderPageToCanvas(pdfJsA, 1, 1.5),
        C.renderPageToCanvas(pdfJsB, 1, 1.5)
      ]).then(function (rs) {
        var ca = rs[0].canvas, cb = rs[1].canvas;
        var w = Math.max(ca.width, cb.width), h = Math.max(ca.height, cb.height);
        var out = document.createElement('canvas');
        out.width = w; out.height = h;
        var ctx = out.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(ca, 0, 0);
        var ia = ctx.getImageData(0, 0, w, h).data;
        // draw B on a scratch canvas, then diff
        var scratch = document.createElement('canvas');
        scratch.width = w; scratch.height = h;
        var sctx = scratch.getContext('2d');
        sctx.fillStyle = '#ffffff';
        sctx.fillRect(0, 0, w, h);
        sctx.drawImage(cb, 0, 0);
        var ib = sctx.getImageData(0, 0, w, h).data;
        var diff = ctx.createImageData(w, h);
        var changed = 0;
        for (var i = 0; i < ia.length; i += 4) {
          var dr = Math.abs(ia[i] - ib[i]);
          var dg = Math.abs(ia[i + 1] - ib[i + 1]);
          var db = Math.abs(ia[i + 2] - ib[i + 2]);
          if (dr + dg + db > 60) {
            // changed pixel — highlight red
            diff.data[i] = 255; diff.data[i + 1] = 60; diff.data[i + 2] = 60;
            diff.data[i + 3] = 200;
            changed++;
          } else {
            diff.data[i] = ia[i]; diff.data[i + 1] = ia[i + 1]; diff.data[i + 2] = ia[i + 2];
            diff.data[i + 3] = 255;
          }
        }
        ctx.putImageData(diff, 0, 0);
        return { dataUrl: out.toDataURL('image/png'), changedPixels: changed, width: w, height: h };
      });
    },

    /** Extract text from every page of a PDF.js doc. Returns array of page strings. */
    extractText: function (pdfJsDoc) {
      var out = [];
      var total = pdfJsDoc.numPages;
      var chain = Promise.resolve();
      for (var i = 1; i <= total; i++) {
        (function (n) {
          chain = chain.then(function () {
            return pdfJsDoc.getPage(n).then(function (page) {
              return page.getTextContent().then(function (tc) {
                var lines = [];
                var lastY = null;
                var line = [];
                tc.items.forEach(function (item) {
                  var y = item.transform ? item.transform[5] : 0;
                  if (lastY !== null && Math.abs(y - lastY) > 2) {
                    lines.push(line.join(' '));
                    line = [];
                  }
                  lastY = y;
                  line.push(item.str);
                });
                if (line.length) lines.push(line.join(' '));
                out.push(lines.join('\n'));
              });
            });
          });
        })(i);
      }
      return chain.then(function () { return out; });
    },

    /** Extract plain text (joined) from a PDF.js doc. */
    extractTextJoined: function (pdfJsDoc) {
      return Core.extractText(pdfJsDoc).then(function (pages) { return pages.join('\n\n'); });
    },

    /* ---------- download helpers ---------- */
    downloadBlob: function (blob, filename) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 400);
    },

    downloadBytes: function (bytes, filename, mime) {
      Core.downloadBlob(new Blob([bytes], { type: mime || 'application/octet-stream' }), filename);
    },

    /** Zip an array of {name, bytes|blob} and download. */
    downloadZip: function (files, zipName) {
      var zip = new JSZip();
      files.forEach(function (f) {
        zip.file(f.name, f.bytes);
      });
      return zip.generateAsync({ type: 'blob' }).then(function (blob) {
        Core.downloadBlob(blob, zipName || 'output.zip');
      });
    },

    /* ---------- image helpers ---------- */
    loadImage: function (src) {
      return new Promise(function (resolve, reject) {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error('Could not load image')); };
        img.src = src;
      });
    },

    canvasToJpegBlob: function (canvas, quality) {
      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) { resolve(blob); }, 'image/jpeg', quality || 0.85);
      });
    },

    canvasToPngBlob: function (canvas) {
      return new Promise(function (resolve) {
        canvas.toBlob(function (blob) { resolve(blob); }, 'image/png');
      });
    },

    /* ---------- minimal Office file builders (ZIP + XML) ---------- */

    /** Build a minimal valid .docx containing the given paragraphs. */
    buildDocx: function (paragraphs) {
      var zip = new JSZip();
      var body = paragraphs.map(function (p) {
        var runs = p.split(/\n/).map(function (line) {
          return '<w:r><w:t xml:space="preserve">' + Core.escXml(line) + '</w:t></w:r>';
        }).join('');
        return '<w:p>' + runs + '</w:p>';
      }).join('');

      zip.file('[Content_Types].xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
        '</Types>');
      zip.file('_rels/.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        '</Relationships>');
      zip.file('word/document.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
        '<w:body>' + body +
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>' +
        '</w:body></w:document>');
      return zip.generateAsync({ type: 'blob' });
    },

    /** Build a minimal valid .xlsx with one sheet of rows (arrays of cell strings). */
    buildXlsx: function (rows) {
      var zip = new JSZip();
      var sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<sheetData>' +
        rows.map(function (row) {
          var cells = row.map(function (cell, ci) {
            var ref = Core.colName(ci) + '1';
            var v = cell == null ? '' : String(cell);
            var isNum = /^-?\d+(\.\d+)?$/.test(v);
            return '<c r="' + ref + '"' + (isNum ? '' : ' t="inlineStr"') + '>' +
              (isNum ? '<v>' + v + '</v>' : '<is><t xml:space="preserve">' + Core.escXml(v) + '</t></is>') +
              '</c>';
          }).join('');
          return '<row>' + cells + '</row>';
        }).join('') +
        '</sheetData></worksheet>';

      zip.file('[Content_Types].xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '</Types>');
      zip.file('_rels/.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>');
      zip.file('xl/workbook.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>');
      zip.file('xl/_rels/workbook.xml.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '</Relationships>');
      zip.file('xl/worksheets/sheet1.xml', sheetXml);
      return zip.generateAsync({ type: 'blob' });
    },

    /** Build a minimal valid .pptx with one slide of text boxes. */
    buildPptx: function (paragraphs) {
      var zip = new JSZip();
      var shapes = paragraphs.map(function (p, i) {
        var y = 20 + i * 12;
        return '<p:sp>' +
          '<p:nvSpPr><p:cNvPr id="' + (i + 2) + '" name="TextBox ' + (i + 1) + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>' +
          '<p:spPr><a:xfrm><a:off x="457200" y="' + (y * 914400 / 100) + '"/><a:ext cx="8229600" cy="' + (10 * 914400 / 100) + '"/></a:xfrm>' +
          '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>' +
          '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US" sz="1400"/><a:t>' + Core.escXml(p) + '</a:t></a:r></a:p></p:txBody>' +
          '</p:sp>';
      }).join('');

      zip.file('[Content_Types].xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
        '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>' +
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
        '</Types>');
      zip.file('_rels/.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
        '</Relationships>');
      zip.file('ppt/presentation.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst>' +
        '<p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>' +
        '</p:presentation>');
      zip.file('ppt/_rels/presentation.xml.rels',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="slideLayouts/slideLayout1.xml"/>' +
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>' +
        '</Relationships>');
      zip.file('ppt/slides/slide1.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<p:cSld><p:spTree>' +
        '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
        '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
        shapes +
        '</p:spTree></p:cSld>' +
        '<p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>' +
        '</p:sld>');
      zip.file('ppt/slideLayouts/slideLayout1.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" type="blank" preserve="1">' +
        '<p:cSld name="Blank"><p:spTree>' +
        '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
        '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' +
        '</p:spTree></p:cSld>' +
        '<p:clrMapOvr><a:overrideClrMapping bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/></p:clrMapOvr>' +
        '</p:sldLayout>');
      zip.file('ppt/theme/theme1.xml',
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office">' +
        '<a:themeElements>' +
        '<a:clrScheme name="Office">' +
        '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1><a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
        '<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>' +
        '<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>' +
        '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>' +
        '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>' +
        '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink>' +
        '</a:clrScheme>' +
        '<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
        '<a:fmtScheme name="Office">' +
        '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
        '<a:lnStyleLst><a:ln w="6350"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
        '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
        '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>' +
        '</a:fmtScheme>' +
        '</a:themeElements></a:theme>');
      return zip.generateAsync({ type: 'blob' });
    },

    escXml: function (s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    },

    colName: function (i) {
      var s = '';
      i = i + 1;
      while (i > 0) {
        var m = (i - 1) % 26;
        s = String.fromCharCode(65 + m) + s;
        i = Math.floor((i - 1) / 26);
      }
      return s;
    },

    /** Simple line-based diff. Returns array of {text, type: same|added|removed|changed}. */
    diffLines: function (a, b) {
      var la = String(a).split('\n');
      var lb = String(b).split('\n');
      var out = [];
      var max = Math.max(la.length, lb.length);
      for (var i = 0; i < max; i++) {
        var ta = la[i] || '';
        var tb = lb[i] || '';
        if (ta === tb) out.push({ text: ta, type: 'same' });
        else if (!ta) out.push({ text: tb, type: 'added' });
        else if (!tb) out.push({ text: ta, type: 'removed' });
        else out.push({ text: tb, type: 'changed' });
      }
      return out;
    },

    /* ---------- misc ---------- */
    sleep: function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); },

    /* ---------- Office -> text / PDF helpers ---------- */

    /** Extract text from a .docx (ZIP + XML). */
    docxToText: function (file) {
      return C.readAsArrayBuffer(file).then(function (buf) {
        return JSZip.loadAsync(buf).then(function (zip) {
          var entry = zip.file('word/document.xml');
          if (!entry) throw new Error('Not a valid .docx file');
          return entry.async('string').then(function (xml) {
            var doc = new DOMParser().parseFromString(xml, 'application/xml');
            var paras = doc.getElementsByTagName('w:p');
            var out = [];
            for (var i = 0; i < paras.length; i++) {
              var texts = paras[i].getElementsByTagName('w:t');
              var line = '';
              for (var j = 0; j < texts.length; j++) line += texts[j].textContent;
              out.push(line);
            }
            return out.join('\n');
          });
        });
      });
    },

    /** Extract text from a .pptx (ZIP + XML). */
    pptxToText: function (file) {
      return C.readAsArrayBuffer(file).then(function (buf) {
        return JSZip.loadAsync(buf).then(function (zip) {
          var slideFiles = Object.keys(zip.files).filter(function (n) {
            return /^ppt\/slides\/slide\d+\.xml$/.test(n);
          }).sort(function (a, b) {
            return parseInt(a.match(/slide(\d+)/)[1], 10) - parseInt(b.match(/slide(\d+)/)[1], 10);
          });
          if (!slideFiles.length) throw new Error('Not a valid .pptx file');
          var chain = Promise.resolve();
          var out = [];
          slideFiles.forEach(function (name) {
            chain = chain.then(function () {
              return zip.file(name).async('string').then(function (xml) {
                var doc = new DOMParser().parseFromString(xml, 'application/xml');
                var texts = doc.getElementsByTagName('a:t');
                var lines = [];
                for (var i = 0; i < texts.length; i++) lines.push(texts[i].textContent);
                out.push(lines.join(' '));
              });
            });
          });
          return chain.then(function () { return out.join('\n\n'); });
        });
      });
    },

    /** Extract rows from a .xlsx (ZIP + XML). Returns array of arrays. */
    xlsxToRows: function (file) {
      return C.readAsArrayBuffer(file).then(function (buf) {
        return JSZip.loadAsync(buf).then(function (zip) {
          var sheetNames = Object.keys(zip.files).filter(function (n) {
            return /^xl\/worksheets\/sheet\d+\.xml$/.test(n);
          }).sort(function (a, b) {
            return parseInt(a.match(/sheet(\d+)/)[1], 10) - parseInt(b.match(/sheet(\d+)/)[1], 10);
          });
          if (!sheetNames.length) throw new Error('Not a valid .xlsx file');
          var shared = null;
          var sharedEntry = zip.file('xl/sharedStrings.xml');
          var chain = sharedEntry ? sharedEntry.async('string').then(function (xml) {
            var doc = new DOMParser().parseFromString(xml, 'application/xml');
            var sis = doc.getElementsByTagName('si');
            shared = [];
            for (var i = 0; i < sis.length; i++) {
              var t = sis[i].getElementsByTagName('t');
              var s = '';
              for (var j = 0; j < t.length; j++) s += t[j].textContent;
              shared.push(s);
            }
          }) : Promise.resolve();
          return chain.then(function () {
            var allRows = [];
            var chain2 = Promise.resolve();
            sheetNames.forEach(function (name) {
              chain2 = chain2.then(function () {
                return zip.file(name).async('string').then(function (xml) {
                  var doc = new DOMParser().parseFromString(xml, 'application/xml');
                  var rows = doc.getElementsByTagName('row');
                  for (var r = 0; r < rows.length; r++) {
                    var cells = rows[r].getElementsByTagName('c');
                    var row = [];
                    for (var c = 0; c < cells.length; c++) {
                      var cell = cells[c];
                      var tAttr = cell.getAttribute('t');
                      var v = cell.getElementsByTagName('v')[0];
                      var is = cell.getElementsByTagName('is')[0];
                      var val = '';
                      if (tAttr === 's' && v) val = shared[parseInt(v.textContent, 10)] || '';
                      else if (tAttr === 'inlineStr' && is) {
                        var ts = is.getElementsByTagName('t');
                        for (var k = 0; k < ts.length; k++) val += ts[k].textContent;
                      } else if (v) val = v.textContent;
                      row.push(val);
                    }
                    allRows.push(row);
                  }
                });
              });
            });
            return chain2.then(function () { return allRows; });
          });
        });
      });
    },

    /** Build a simple text-based PDF from plain text. */
    textToPdf: function (text, title) {
      return PDFLib.PDFDocument.create().then(function (doc) {
        return doc.embedFont(PDFLib.StandardFonts.Helvetica).then(function (font) {
          var fontSize = 11;
          var margin = 50;
          var pageW = 595.28, pageH = 841.89;
          var maxW = pageW - margin * 2;
          var lineH = fontSize * 1.45;
          var lines = String(text || '').split(/\r?\n/);
          var page = doc.addPage([pageW, pageH]);
          var y = pageH - margin;
          lines.forEach(function (line) {
            // Wrap long lines.
            var words = line.split(' ');
            var cur = '';
            var flush = function () {
              if (y < margin) {
                page = doc.addPage([pageW, pageH]);
                y = pageH - margin;
              }
              page.drawText(cur, { x: margin, y: y, size: fontSize, font: font, color: PDFLib.rgb(0, 0, 0) });
              y -= lineH;
            };
            words.forEach(function (w) {
              var test = cur ? cur + ' ' + w : w;
              if (font.widthOfTextAtSize(test, fontSize) > maxW && cur) {
                flush();
                cur = w;
              } else {
                cur = test;
              }
            });
            if (cur) flush();
            else { y -= lineH; if (y < margin) { page = doc.addPage([pageW, pageH]); y = pageH - margin; } }
          });
          return doc.save();
        });
      });
    },

    /** Build a table PDF from rows (for Excel -> PDF). */
    rowsToPdf: function (rows, orientation) {
      return PDFLib.PDFDocument.create().then(function (doc) {
        return doc.embedFont(PDFLib.StandardFonts.Helvetica).then(function (font) {
          var fontSize = 9;
          var margin = 40;
          var pageW = orientation === 'landscape' ? 841.89 : 595.28;
          var pageH = orientation === 'landscape' ? 595.28 : 841.89;
          var maxW = pageW - margin * 2;
          var lineH = fontSize * 1.5;
          var page = doc.addPage([pageW, pageH]);
          var y = pageH - margin;
          rows.forEach(function (row) {
            var line = row.map(function (c) { return c == null ? '' : String(c); }).join('  |  ');
            var words = line.split(' ');
            var cur = '';
            var flush = function () {
              if (y < margin) { page = doc.addPage([pageW, pageH]); y = pageH - margin; }
              page.drawText(cur, { x: margin, y: y, size: fontSize, font: font, color: PDFLib.rgb(0, 0, 0) });
              y -= lineH;
            };
            words.forEach(function (w) {
              var test = cur ? cur + ' ' + w : w;
              if (font.widthOfTextAtSize(test, fontSize) > maxW && cur) { flush(); cur = w; }
              else cur = test;
            });
            if (cur) flush();
            else { y -= lineH; if (y < margin) { page = doc.addPage([pageW, pageH]); y = pageH - margin; } }
          });
          return doc.save();
        });
      });
    },

    /** Render HTML string to PDF via hidden sandboxed iframe (text-based). */
    htmlToPdf: function (html) {
      return new Promise(function (resolve, reject) {
        var iframe = document.createElement('iframe');
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        // Sandbox WITHOUT allow-scripts: pasted HTML must not execute JS
        // (it would run same-origin and could touch the parent document).
        iframe.setAttribute('sandbox', 'allow-same-origin');
        document.body.appendChild(iframe);
        var doc = iframe.contentDocument;
        doc.open();
        doc.write('<!DOCTYPE html><html><head><style>body{font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;font-size:13px;line-height:1.5;color:#000;margin:32px}table{border-collapse:collapse}td,th{border:1px solid #999;padding:4px 8px}img{max-width:100%}pre{white-space:pre-wrap;font-family:monospace}</style></head><body>' + html + '</body></html>');
        doc.close();
        var done = false;
        var finish = function (blob) {
          if (done) return;
          done = true;
          document.body.removeChild(iframe);
          resolve(blob);
        };
        iframe.onload = function () {
          setTimeout(function () {
            try {
              // The browser print dialog cannot be intercepted from JS, so we
              // render the HTML in the sandboxed iframe and convert its text
              // content to a clean PDF (documented approximation).
              var text = (iframe.contentDocument.body ? iframe.contentDocument.body.innerText : '') || '';
              C.textToPdf(text, 'document.pdf').then(function (bytes) {
                // Return Uint8Array (not Blob) so the result pipeline can
                // handle it uniformly (Blob breaks the download path).
                finish(bytes);
              });
            } catch (e) {
              reject(e);
            }
          }, 300);
        };
      });
    },

    /** Convert extracted text to markdown (headings by line length heuristics). */
    textToMarkdown: function (text) {
      return String(text).split('\n').map(function (line) {
        var t = line.trim();
        if (!t) return '';
        if (t.length < 60 && /^[A-Z0-9][A-Za-z0-9 .,'&()\-]{2,}$/.test(t) && !/[.!?]$/.test(t)) {
          return '### ' + t;
        }
        if (/^[-•*]\s/.test(t)) return t;
        if (/^\d+[.)]\s/.test(t)) return t;
        return t;
      }).join('\n');
    },

    /** OCR pages that have little/no text (used by PDF->Office with OCR on). */
    ocrPages: function (pdfJs, pages, ui) {
      var T = C.libs.Tesseract;
      if (!T) throw new Error('Tesseract.js failed to load (check your connection)');
      var chain = Promise.resolve();
      for (var i = 0; i < pages.length; i++) {
        (function (idx) {
          chain = chain.then(function () {
            if (pages[idx] && pages[idx].trim().length > 40) return Promise.resolve();
            ui.progress('OCR page ' + (idx + 1) + ' of ' + pages.length + '…', idx / pages.length * 100);
            return C.renderPageToCanvas(pdfJs, idx + 1, 2).then(function (r) {
              return C.canvasToPngBlob(r.canvas).then(function (blob) {
                return T.recognize(blob, 'eng').then(function (res) {
                  pages[idx] = res.data.text;
                });
              });
            });
          });
        })(i);
      }
      return chain;
    },

    /** Extract embedded images from a PDF (for PDF->JPG extract mode). */
    extractEmbeddedImages: function (bytes) {
      return C.loadPdfDoc(bytes).then(function (doc) {
        var out = [];
        var chain = Promise.resolve();
        var total = doc.getPageCount();
        for (var p = 0; p < total; p++) {
          (function (pi) {
            chain = chain.then(function () {
              var page = doc.getPage(pi);
              var res = page.node.lookupMaybe(PDFLib.PDFName.of('Resources'), PDFLib.PDFDict);
              if (!res) return;
              var xo = res.lookupMaybe(PDFLib.PDFName.of('XObject'), PDFLib.PDFDict);
              if (!xo) return;
              var names = xo.keys();
              var jobs = [];
              names.forEach(function (name) {
                var obj = xo.lookup(name);
                if (!(obj instanceof PDFLib.PDFStream)) return;
                var subtype = obj.dict.get(PDFLib.PDFName.of('Subtype'));
                if (!subtype || subtype.toString() !== '/Image') return;
                var filter = obj.dict.get(PDFLib.PDFName.of('Filter'));
                var fstr = filter ? filter.toString() : '';
                var isJpeg = fstr.indexOf('DCTDecode') !== -1;
                var isPng = fstr.indexOf('FlateDecode') !== -1;
                if (!isJpeg && !isPng) return;
                var data = obj.getContents();
                if (isJpeg) {
                  // DCTDecode bytes ARE a JPEG — pass through.
                  out.push({ name: 'image_p' + (pi + 1) + '_' + String(name).replace('/', '') + '.jpg', bytes: data, mime: 'image/jpeg' });
                } else {
                  // FlateDecode: bytes are zlib-compressed raw pixel samples.
                  // Inflate and assemble a real PNG container (IHDR/IDAT/IEND).
                  jobs.push(C.flateToPng(data, obj.dict).then(function (png) {
                    out.push({ name: 'image_p' + (pi + 1) + '_' + String(name).replace('/', '') + '.png', bytes: png, mime: 'image/png' });
                  }));
                }
              });
              return Promise.all(jobs);
            });
          })(p);
        }
        return chain.then(function () { return out; });
      });
    },

    /** Inflate a FlateDecode image stream and wrap it in a valid PNG container. */
    flateToPng: function (zlibBytes, dict) {
      var w = dict.get(PDFLib.PDFName.of('Width'));
      var h = dict.get(PDFLib.PDFName.of('Height'));
      var bpc = dict.get(PDFLib.PDFName.of('BitsPerComponent'));
      var cs = dict.get(PDFLib.PDFName.of('ColorSpace'));
      var width = w ? w.asNumber() : 0;
      var height = h ? h.asNumber() : 0;
      var bits = bpc ? bpc.asNumber() : 8;
      var csName = cs ? String(cs) : '/DeviceRGB';
      var colorType = 2; // RGB
      if (csName.indexOf('DeviceGray') !== -1) colorType = 0;
      else if (csName.indexOf('DeviceCMYK') !== -1) colorType = 4;
      else if (csName.indexOf('Indexed') !== -1) colorType = 3;
      var channels = colorType === 0 ? 1 : (colorType === 4 ? 4 : 3);
      var rowBytes = Math.ceil((width * bits * channels) / 8);
      // PDF FlateDecode image streams may or may not carry per-row filter
      // bytes: if /DecodeParms declares a Predictor, the stream already has
      // them (PNG-style); otherwise the raw samples have NO filter bytes and
      // we must insert a 0x00 filter byte per row for the PNG container.
      var dp = dict.get(PDFLib.PDFName.of('DecodeParms'));
      var hasPredictor = false;
      if (dp) {
        var pred = dp.get ? dp.get(PDFLib.PDFName.of('Predictor')) : null;
        hasPredictor = pred ? pred.asNumber() >= 10 : false;
      }

      return C.inflateZlib(zlibBytes).then(function (raw) {
        // PNG spec: IDAT must contain ZLIB-COMPRESSED scanlines with a
        // filter byte per row. Insert 0x00 filter bytes if the PDF stream
        // didn't already include them (final-verification finding).
        var scanlines = raw;
        if (!hasPredictor) {
          var stride = rowBytes + 1;
          var expected = stride * height;
          if (raw.length === rowBytes * height) {
            scanlines = new Uint8Array(expected);
            for (var r = 0; r < height; r++) {
              scanlines[r * stride] = 0; // filter: None
              scanlines.set(raw.subarray(r * rowBytes, (r + 1) * rowBytes), r * stride + 1);
            }
          }
        }
        return C.deflateZlib(scanlines).then(function (idat) {
          return buildPng(idat);
        });
      });

      function buildPng(idat) {
        function crc32(buf) {
          var table = crc32.table;
          if (!table) {
            table = crc32.table = new Int32Array(256);
            for (var n = 0; n < 256; n++) {
              var c = n;
              for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
              table[n] = c;
            }
          }
          var crc = -1;
          for (var i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
          return (crc ^ -1) >>> 0;
        }
        function chunk(type, data) {
          var len = new Uint8Array(4);
          new DataView(len.buffer).setUint32(0, data.length);
          var typeBytes = new TextEncoder().encode(type);
          var crcBuf = new Uint8Array(typeBytes.length + data.length);
          crcBuf.set(typeBytes, 0);
          crcBuf.set(data, typeBytes.length);
          var crc = new Uint8Array(4);
          new DataView(crc.buffer).setUint32(0, crc32(crcBuf));
          var out = new Uint8Array(4 + typeBytes.length + data.length + 4);
          out.set(len, 0);
          out.set(typeBytes, 4);
          out.set(data, 8);
          out.set(crc, 8 + data.length);
          return out;
        }
        function be32(n) {
          var b = new Uint8Array(4);
          new DataView(b.buffer).setUint32(0, n);
          return b;
        }
        // IHDR
        var ihdr = new Uint8Array(13);
        ihdr.set(be32(width), 0);
        ihdr.set(be32(height), 4);
        ihdr[8] = bits;
        ihdr[9] = colorType;
        ihdr[10] = 0; // compression
        ihdr[11] = 0; // filter
        ihdr[12] = 0; // interlace
        // IDAT: zlib-compressed scanlines (already filter-byte prefixed per PDF spec)
        var png = new Uint8Array(8 + 12 + ihdr.length + 12 + idat.length + 12);
        png.set([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A], 0);
        var off = 8;
        var c1 = chunk('IHDR', ihdr);
        png.set(c1, off); off += c1.length;
        var c2 = chunk('IDAT', idat);
        png.set(c2, off); off += c2.length;
        var c3 = chunk('IEND', new Uint8Array(0));
        png.set(c3, off);
        return png;
      }
    },

    /** Inflate zlib-compressed bytes (DecompressionStream with fallback). */
    inflateZlib: function (bytes) {
      if (typeof DecompressionStream !== 'undefined') {
        try {
          var ds = new DecompressionStream('deflate');
          var stream = new Blob([bytes]).stream().pipeThrough(ds);
          return new Response(stream).arrayBuffer().then(function (buf) {
            return new Uint8Array(buf);
          });
        } catch (e) { /* fall through to manual inflate */ }
      }
      // Manual inflate fallback (pako-style minimal): use a tiny inflate via
      // the browser's built-in? Not available — throw a clear error instead.
      return Promise.reject(new Error('Your browser does not support DecompressionStream (needed to extract PNG images).'));
    },

    /** Deflate bytes into a zlib stream (CompressionStream with fallback). */
    deflateZlib: function (bytes) {
      if (typeof CompressionStream !== 'undefined') {
        try {
          var cs = new CompressionStream('deflate');
          var stream = new Blob([bytes]).stream().pipeThrough(cs);
          return new Response(stream).arrayBuffer().then(function (buf) {
            return new Uint8Array(buf);
          });
        } catch (e) { /* fall through */ }
      }
      return Promise.reject(new Error('Your browser does not support CompressionStream (needed to extract PNG images).'));
    },

    /** Parse "1-3, 5, 7-9" into 0-based page indices (clamped to total). */
    parseRanges: function (str, total) {
      var out = [];
      var parts = String(str || '').split(',');
      parts.forEach(function (part) {
        var m = part.trim().match(/^(\d+)\s*-\s*(\d+)$/);
        if (m) {
          var a = parseInt(m[1], 10), b = parseInt(m[2], 10);
          if (a > b) { var t = a; a = b; b = t; }
          for (var i = a; i <= b; i++) if (i >= 1 && i <= total) out.push(i - 1);
        } else if (/^\d+$/.test(part.trim())) {
          var n = parseInt(part.trim(), 10);
          if (n >= 1 && n <= total) out.push(n - 1);
        }
      });
      return out;
    },

    /** Dictionary-based client-side translation demo. */
    translateText: function (text, to) {
      var dict = {
        es: { 'the': 'el', 'and': 'y', 'of': 'de', 'to': 'a', 'in': 'en', 'is': 'es', 'for': 'para', 'with': 'con', 'on': 'en', 'this': 'este', 'that': 'ese', 'are': 'son', 'was': 'era', 'be': 'ser', 'as': 'como', 'by': 'por', 'from': 'de', 'or': 'o', 'an': 'un', 'we': 'nosotros', 'you': 'tú', 'your': 'tu', 'our': 'nuestro', 'it': 'lo', 'not': 'no', 'have': 'tener', 'has': 'tiene', 'will': 'será', 'can': 'puede', 'all': 'todo', 'more': 'más', 'most': 'más', 'other': 'otro', 'some': 'algunos', 'such': 'tal', 'only': 'solo', 'same': 'mismo', 'very': 'muy', 'just': 'solo', 'also': 'también', 'but': 'pero', 'if': 'si', 'then': 'entonces', 'when': 'cuando', 'where': 'donde', 'why': 'por qué', 'how': 'cómo', 'what': 'qué', 'who': 'quién', 'which': 'cuál', 'document': 'documento', 'pdf': 'PDF', 'file': 'archivo', 'page': 'página', 'pages': 'páginas', 'text': 'texto', 'word': 'palabra', 'free': 'gratis', 'tool': 'herramienta', 'tools': 'herramientas', 'merge': 'fusionar', 'split': 'dividir', 'compress': 'comprimir', 'convert': 'convertir', 'rotate': 'rotar', 'unlock': 'desbloquear', 'protect': 'proteger', 'watermark': 'marca de agua', 'sign': 'firmar', 'edit': 'editar', 'crop': 'recortar', 'redact': 'tachar', 'summary': 'resumen', 'translate': 'traducir', 'language': 'idioma', 'hello': 'hola', 'world': 'mundo', 'thank': 'gracias', 'please': 'por favor', 'yes': 'sí', 'no': 'no', 'information': 'información', 'important': 'importante', 'please note': 'tenga en cuenta' },
        fr: { 'the': 'le', 'and': 'et', 'of': 'de', 'to': 'à', 'in': 'dans', 'is': 'est', 'for': 'pour', 'with': 'avec', 'on': 'sur', 'this': 'ce', 'that': 'cela', 'are': 'sont', 'was': 'était', 'be': 'être', 'as': 'comme', 'by': 'par', 'from': 'de', 'or': 'ou', 'an': 'un', 'we': 'nous', 'you': 'vous', 'your': 'votre', 'our': 'notre', 'it': 'il', 'not': 'pas', 'have': 'avoir', 'has': 'a', 'will': 'sera', 'can': 'peut', 'all': 'tout', 'more': 'plus', 'most': 'plus', 'other': 'autre', 'some': 'certains', 'such': 'tel', 'only': 'seulement', 'same': 'même', 'very': 'très', 'just': 'juste', 'also': 'aussi', 'but': 'mais', 'if': 'si', 'then': 'alors', 'when': 'quand', 'where': 'où', 'why': 'pourquoi', 'how': 'comment', 'what': 'quoi', 'who': 'qui', 'which': 'quel', 'document': 'document', 'pdf': 'PDF', 'file': 'fichier', 'page': 'page', 'pages': 'pages', 'text': 'texte', 'word': 'mot', 'free': 'gratuit', 'tool': 'outil', 'tools': 'outils', 'merge': 'fusionner', 'split': 'diviser', 'compress': 'compresser', 'convert': 'convertir', 'rotate': 'pivoter', 'unlock': 'déverrouiller', 'protect': 'protéger', 'watermark': 'filigrane', 'sign': 'signer', 'edit': 'modifier', 'crop': 'recadrer', 'redact': 'masquer', 'summary': 'résumé', 'translate': 'traduire', 'language': 'langue', 'hello': 'bonjour', 'world': 'monde', 'thank': 'merci', 'please': 's\'il vous plaît', 'yes': 'oui', 'no': 'non', 'information': 'informations', 'important': 'important', 'please note': 'veuillez noter' },
        de: { 'the': 'der', 'and': 'und', 'of': 'von', 'to': 'zu', 'in': 'in', 'is': 'ist', 'for': 'für', 'with': 'mit', 'on': 'auf', 'this': 'dies', 'that': 'das', 'are': 'sind', 'was': 'war', 'be': 'sein', 'as': 'als', 'by': 'von', 'from': 'aus', 'or': 'oder', 'an': 'ein', 'we': 'wir', 'you': 'Sie', 'your': 'Ihr', 'our': 'unser', 'it': 'es', 'not': 'nicht', 'have': 'haben', 'has': 'hat', 'will': 'wird', 'can': 'kann', 'all': 'alle', 'more': 'mehr', 'most': 'meisten', 'other': 'andere', 'some': 'einige', 'such': 'solche', 'only': 'nur', 'same': 'gleich', 'very': 'sehr', 'just': 'gerade', 'also': 'auch', 'but': 'aber', 'if': 'wenn', 'then': 'dann', 'when': 'wann', 'where': 'wo', 'why': 'warum', 'how': 'wie', 'what': 'was', 'who': 'wer', 'which': 'welche', 'document': 'Dokument', 'pdf': 'PDF', 'file': 'Datei', 'page': 'Seite', 'pages': 'Seiten', 'text': 'Text', 'word': 'Wort', 'free': 'kostenlos', 'tool': 'Werkzeug', 'tools': 'Werkzeuge', 'merge': 'zusammenführen', 'split': 'teilen', 'compress': 'komprimieren', 'convert': 'konvertieren', 'rotate': 'drehen', 'unlock': 'entsperren', 'protect': 'schützen', 'watermark': 'Wasserzeichen', 'sign': 'unterschreiben', 'edit': 'bearbeiten', 'crop': 'zuschneiden', 'redact': 'schwärzen', 'summary': 'Zusammenfassung', 'translate': 'übersetzen', 'language': 'Sprache', 'hello': 'Hallo', 'world': 'Welt', 'thank': 'danke', 'please': 'bitte', 'yes': 'ja', 'no': 'nein', 'information': 'Information', 'important': 'wichtig', 'please note': 'bitte beachten' },
        it: { 'the': 'il', 'and': 'e', 'of': 'di', 'to': 'a', 'in': 'in', 'is': 'è', 'for': 'per', 'with': 'con', 'on': 'su', 'this': 'questo', 'that': 'quello', 'are': 'sono', 'was': 'era', 'be': 'essere', 'as': 'come', 'by': 'da', 'from': 'da', 'or': 'o', 'an': 'un', 'we': 'noi', 'you': 'tu', 'your': 'tuo', 'our': 'nostro', 'it': 'lo', 'not': 'non', 'have': 'avere', 'has': 'ha', 'will': 'sarà', 'can': 'può', 'all': 'tutto', 'more': 'più', 'most': 'più', 'other': 'altro', 'some': 'alcuni', 'such': 'tale', 'only': 'solo', 'same': 'stesso', 'very': 'molto', 'just': 'solo', 'also': 'anche', 'but': 'ma', 'if': 'se', 'then': 'allora', 'when': 'quando', 'where': 'dove', 'why': 'perché', 'how': 'come', 'what': 'cosa', 'who': 'chi', 'which': 'quale', 'document': 'documento', 'pdf': 'PDF', 'file': 'file', 'page': 'pagina', 'pages': 'pagine', 'text': 'testo', 'word': 'parola', 'free': 'gratis', 'tool': 'strumento', 'tools': 'strumenti', 'merge': 'unire', 'split': 'dividere', 'compress': 'comprimere', 'convert': 'convertire', 'rotate': 'ruotare', 'unlock': 'sbloccare', 'protect': 'proteggere', 'watermark': 'filigrana', 'sign': 'firmare', 'edit': 'modificare', 'crop': 'ritagliare', 'redact': 'oscurare', 'summary': 'riassunto', 'translate': 'tradurre', 'language': 'lingua', 'hello': 'ciao', 'world': 'mondo', 'thank': 'grazie', 'please': 'per favore', 'yes': 'sì', 'no': 'no', 'information': 'informazioni', 'important': 'importante', 'please note': 'si prega di notare' },
        pt: { 'the': 'o', 'and': 'e', 'of': 'de', 'to': 'para', 'in': 'em', 'is': 'é', 'for': 'para', 'with': 'com', 'on': 'em', 'this': 'este', 'that': 'esse', 'are': 'são', 'was': 'era', 'be': 'ser', 'as': 'como', 'by': 'por', 'from': 'de', 'or': 'ou', 'an': 'um', 'we': 'nós', 'you': 'você', 'your': 'seu', 'our': 'nosso', 'it': 'ele', 'not': 'não', 'have': 'ter', 'has': 'tem', 'will': 'será', 'can': 'pode', 'all': 'tudo', 'more': 'mais', 'most': 'mais', 'other': 'outro', 'some': 'alguns', 'such': 'tal', 'only': 'somente', 'same': 'mesmo', 'very': 'muito', 'just': 'apenas', 'also': 'também', 'but': 'mas', 'if': 'se', 'then': 'então', 'when': 'quando', 'where': 'onde', 'why': 'por que', 'how': 'como', 'what': 'o que', 'who': 'quem', 'which': 'qual', 'document': 'documento', 'pdf': 'PDF', 'file': 'arquivo', 'page': 'página', 'pages': 'páginas', 'text': 'texto', 'word': 'palavra', 'free': 'grátis', 'tool': 'ferramenta', 'tools': 'ferramentas', 'merge': 'mesclar', 'split': 'dividir', 'compress': 'comprimir', 'convert': 'converter', 'rotate': 'girar', 'unlock': 'desbloquear', 'protect': 'proteger', 'watermark': 'marca d\'água', 'sign': 'assinar', 'edit': 'editar', 'crop': 'recortar', 'redact': 'ocultar', 'summary': 'resumo', 'translate': 'traduzir', 'language': 'idioma', 'hello': 'olá', 'world': 'mundo', 'thank': 'obrigado', 'please': 'por favor', 'yes': 'sim', 'no': 'não', 'information': 'informações', 'important': 'importante', 'please note': 'observe' }
      };
      var d = dict[to] || dict.es;
      var words = String(text).split(/(\s+)/);
      return words.map(function (w) {
        var lower = w.toLowerCase().replace(/[^a-z']/g, '');
        if (d[lower]) {
          var punct = w.replace(/[a-zA-Z']/g, '');
          var cap = /^[A-Z]/.test(w);
          var t = d[lower];
          if (cap) t = t.charAt(0).toUpperCase() + t.slice(1);
          return t + punct;
        }
        return w;
      }).join('');
    },

    /** Simple frequency-based extractive summarizer. */
    summarize: function (text, ratio) {
      var sentences = text.split(/(?<=[.!?])\s+/).map(function (s) { return s.trim(); })
        .filter(function (s) { return s.length > 20; });
      if (sentences.length === 0) {
        var words = text.split(/\s+/).filter(Boolean);
        return words.slice(0, Math.max(10, Math.floor(words.length * ratio))).join(' ');
      }
      var stop = new Set('a an the and or but if then else for of to in on at by with from as is are was were be been being this that these those it its he she they we you i my your our their not no yes do does did have has had will would can could should may might must about into over under between through during before after above below up down out off again further once here there when where why how all any both each few more most other some such only own same so than too very just also'.split(' '));
      var freq = {};
      var words = text.toLowerCase().match(/[a-z0-9']+/g) || [];
      words.forEach(function (w) {
        if (!stop.has(w) && w.length > 2) freq[w] = (freq[w] || 0) + 1;
      });
      var maxF = 1;
      Object.keys(freq).forEach(function (k) { if (freq[k] > maxF) maxF = freq[k]; });
      var scored = sentences.map(function (s, i) {
        var sw = s.toLowerCase().match(/[a-z0-9']+/g) || [];
        var score = 0;
        sw.forEach(function (w) { if (freq[w]) score += freq[w] / maxF; });
        // Slight bias toward earlier sentences.
        score = score / Math.max(1, sw.length) + (1 - i / sentences.length) * 0.15;
        return { s: s, score: score, i: i };
      });
      var n = Math.max(1, Math.min(sentences.length, Math.round(sentences.length * ratio)));
      scored.sort(function (a, b) { return b.score - a.score; });
      var picked = scored.slice(0, n).sort(function (a, b) { return a.i - b.i; });
      return picked.map(function (p) { return p.s; }).join(' ');
    }
  };

  window.PDFCore = Core;
  // Internal alias so helper methods can reference the Core object (the
  // original code used `C.` inside these methods but never defined C).
  var C = Core;
})();
