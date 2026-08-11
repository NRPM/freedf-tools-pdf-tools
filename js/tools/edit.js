/* ============================================================
   edit.js — Edit PDF, Watermark, Page numbers, Crop, PDF Forms
   ============================================================ */
(function () {
  'use strict';
  var C = window.PDFCore;
  var PDFLib = C.libs.PDFLib;

  /* ---------------- EDIT PDF ---------------- */
  var editPdf = {
    id: 'edit',
    title: 'Edit PDF',
    desc: 'Add text, shapes, highlights and comments to your PDF.',
    category: 'edit',
    icon: '✏️',
    color: '#EE6C4D',
    accept: '.pdf,application/pdf',
    multiple: false,
    needsEditStage: true,
    options: function () {
      return '' +
        '<div class="option-row"><span class="opt-label">Tool</span>' +
        '<div class="edit-toolbar" id="edit-toolbar">' +
        '<button type="button" class="icon-btn active" data-tool="text" title="Add text">T</button>' +
        '<button type="button" class="icon-btn" data-tool="highlight" title="Highlight">🖍️</button>' +
        '<button type="button" class="icon-btn" data-tool="rect" title="Rectangle">▭</button>' +
        '<button type="button" class="icon-btn" data-tool="line" title="Line">╱</button>' +
        '<button type="button" class="icon-btn" data-tool="comment" title="Comment">💬</button>' +
        '</div></div>' +
        '<div class="option-row"><span class="opt-label">Color</span><input type="color" class="opt-control" id="opt-edit-color" value="#e5322d" style="width:60px;height:34px;padding:2px"></div>' +
        '<div class="option-row"><span class="opt-label">Text size</span><input type="number" class="opt-control" id="opt-edit-size" value="18" min="6" max="120" style="max-width:100px"></div>' +
        '<div class="option-row"><button type="button" class="btn btn-ghost btn-sm" id="opt-edit-clear">Remove all annotations</button></div>';
    },
    actionLabel: 'Apply edits',
    process: function (files, opts, ui) {
      var file = files[0];
      var anns = opts.annotations || [];
      if (!anns.length) throw new Error('Add at least one annotation first');
      return C.loadPdfDoc(file.bytes).then(function (doc) {
        return doc.embedFont(PDFLib.StandardFonts.Helvetica).then(function (font) {
          anns.forEach(function (a) {
            var page = doc.getPage(a.page);
            var w = page.getWidth(), h = page.getHeight();
            var x = a.x / a.scale * w;
            var y = h - a.y / a.scale * h;
            var color = PDFLib.rgb(
              parseInt(a.color.slice(1, 3), 16) / 255,
              parseInt(a.color.slice(3, 5), 16) / 255,
              parseInt(a.color.slice(5, 7), 16) / 255
            );
            if (a.type === 'text') {
              page.drawText(a.text || 'Text', { x: x, y: y, size: a.size || 18, font: font, color: color });
            } else if (a.type === 'highlight') {
              page.drawRectangle({ x: x, y: y - (a.size || 18) * 0.8, width: (a.text || 'Text').length * (a.size || 18) * 0.55, height: (a.size || 18) * 1.1, color: PDFLib.rgb(1, 0.9, 0.2), opacity: 0.45 });
            } else if (a.type === 'rect') {
              page.drawRectangle({ x: x, y: y, width: a.w / a.scale * w, height: a.h / a.scale * h, borderColor: color, borderWidth: 2 });
            } else if (a.type === 'line') {
              page.drawLine({ start: { x: x, y: y }, end: { x: x + a.w / a.scale * w, y: y - a.h / a.scale * h }, thickness: 2, color: color });
            } else if (a.type === 'comment') {
              page.drawText('💬 ' + (a.text || 'Comment'), { x: x, y: y, size: 12, font: font, color: color });
            }
          });
          return doc.save().then(function (bytes) {
            return { bytes: bytes, name: C.baseName(file.name) + '_edited.pdf', mime: 'application/pdf' };
          });
        });
      });
    }
  };

  /* ---------------- WATERMARK ---------------- */
  var watermark = {
    id: 'watermark',
    title: 'Watermark',
    desc: 'Stamp text or an image over your PDF pages.',
    category: 'edit',
    icon: '💧',
    color: '#008ee9',
    accept: '.pdf,application/pdf',
    multiple: false,
    options: function () {
      return '' +
        '<div class="option-row"><span class="opt-label">Type</span>' +
        '<div class="seg" data-seg="wmType" data-row-prefix="wm">' +
        '<button type="button" data-val="text" class="active">Text</button>' +
        '<button type="button" data-val="image">Image</button>' +
        '</div></div>' +
        '<div class="option-row" data-wm-row="text"><span class="opt-label">Text</span><input type="text" class="opt-control" id="opt-wm-text" value="CONFIDENTIAL"></div>' +
        '<div class="option-row" data-wm-row="text"><span class="opt-label">Font</span>' +
        '<select class="opt-control" id="opt-wm-font">' +
        '<option value="Helvetica">Arial (Helvetica)</option>' +
        '<option value="Helvetica-Bold">Arial Bold</option>' +
        '<option value="Times-Roman">Times New Roman</option>' +
        '<option value="Courier">Courier</option>' +
        '<option value="ZapfDingbats">Comic (ZapfDingbats)</option>' +
        '</select></div>' +
        '<div class="option-row" data-wm-row="text"><span class="opt-label">Size</span><input type="number" class="opt-control" id="opt-wm-size" value="60" min="8" max="300" style="max-width:100px"></div>' +
        '<div class="option-row" data-wm-row="text"><span class="opt-label">Color</span><input type="color" class="opt-control" id="opt-wm-color" value="#e5322d" style="width:60px;height:34px;padding:2px"></div>' +
        '<div class="option-row" data-wm-row="image" style="display:none"><span class="opt-label">Image</span><input type="file" class="opt-control" id="opt-wm-image" accept="image/*"></div>' +
        '<div class="option-row"><span class="opt-label">Opacity</span><input type="range" class="opt-control" id="opt-wm-opacity" min="0.05" max="1" step="0.05" value="0.3"><span class="opt-control" id="opt-wm-opacity-val" style="min-width:40px;color:var(--muted);font-size:13px">0.30</span></div>' +
        '<div class="option-row"><span class="opt-label">Position</span>' +
        '<div class="seg" data-seg="wmPos">' +
        '<button type="button" data-val="mosaic" class="active">Mosaic</button>' +
        '<button type="button" data-val="center">Center</button>' +
        '<button type="button" data-val="top-left">Top left</button>' +
        '<button type="button" data-val="top-right">Top right</button>' +
        '<button type="button" data-val="bottom-left">Bottom left</button>' +
        '<button type="button" data-val="bottom-right">Bottom right</button>' +
        '</div></div>' +
        '<div class="option-row"><span class="opt-label">Rotation</span>' +
        '<div class="seg" data-seg="wmRot">' +
        '<button type="button" data-val="0" class="active">0°</button>' +
        '<button type="button" data-val="45">45°</button>' +
        '<button type="button" data-val="90">90°</button>' +
        '</div></div>';
    },
    actionLabel: 'Add watermark',
    process: function (files, opts, ui) {
      var file = files[0];
      return C.loadPdfDoc(file.bytes).then(function (doc) {
        var chain = Promise.resolve();
        var font = null;
        var img = null;
        if (opts.wmType === 'text') {
          chain = chain.then(function () {
            return doc.embedFont(opts.wmFont || PDFLib.StandardFonts.Helvetica).then(function (f) { font = f; });
          });
        } else {
          chain = chain.then(function () {
            return C.readAsArrayBuffer(opts.wmImageFile).then(function (buf) {
              var isPng = /\.png$/i.test(opts.wmImageFile.name);
              return (isPng ? doc.embedPng(buf) : doc.embedJpg(buf)).then(function (im) { img = im; });
            });
          });
        }
        return chain.then(function () {
          var total = doc.getPageCount();
          for (var i = 0; i < total; i++) {
            var page = doc.getPage(i);
            var w = page.getWidth(), h = page.getHeight();
            var opacity = parseFloat(opts.wmOpacity) || 0.3;
            var rot = parseInt(opts.wmRot, 10) || 0;
            var color = PDFLib.rgb(
              parseInt(opts.wmColor.slice(1, 3), 16) / 255,
              parseInt(opts.wmColor.slice(3, 5), 16) / 255,
              parseInt(opts.wmColor.slice(5, 7), 16) / 255
            );
            if (opts.wmType === 'text') {
              var size = parseInt(opts.wmSize, 10) || 60;
              var text = opts.wmText || 'WATERMARK';
              var tw = font.widthOfTextAtSize(text, size);
              var positions = [];
              if (opts.wmPos === 'mosaic') {
                for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) {
                  positions.push({ x: w * (0.2 + c * 0.3) - tw / 2, y: h * (0.2 + r * 0.3) });
                }
              } else {
                var px = w / 2 - tw / 2, py = h / 2;
                if (opts.wmPos === 'top-left') { px = 20; py = h - 20; }
                if (opts.wmPos === 'top-right') { px = w - tw - 20; py = h - 20; }
                if (opts.wmPos === 'bottom-left') { px = 20; py = 20 + size; }
                if (opts.wmPos === 'bottom-right') { px = w - tw - 20; py = 20 + size; }
                positions.push({ x: px, y: py });
              }
              positions.forEach(function (p) {
                page.drawText(text, {
                  x: p.x, y: p.y, size: size, font: font, color: color, opacity: opacity,
                  rotate: PDFLib.degrees(rot)
                });
              });
            } else if (img) {
              var iw = img.width, ih = img.height;
              var scale = Math.min(w * 0.4 / iw, h * 0.4 / ih);
              var dw = iw * scale, dh = ih * scale;
              var ix = (w - dw) / 2, iy = (h - dh) / 2;
              if (opts.wmPos === 'top-left') { ix = 20; iy = h - dh - 20; }
              if (opts.wmPos === 'top-right') { ix = w - dw - 20; iy = h - dh - 20; }
              if (opts.wmPos === 'bottom-left') { ix = 20; iy = 20; }
              if (opts.wmPos === 'bottom-right') { ix = w - dw - 20; iy = 20; }
              page.drawImage(img, { x: ix, y: iy, width: dw, height: dh, opacity: opacity, rotate: PDFLib.degrees(rot) });
            }
          }
          return doc.save().then(function (bytes) {
            return { bytes: bytes, name: C.baseName(file.name) + '_watermarked.pdf', mime: 'application/pdf' };
          });
        });
      });
    }
  };

  /* ---------------- PAGE NUMBERS ---------------- */
  var pageNumbers = {
    id: 'page-numbers',
    title: 'Page numbers',
    desc: 'Add page numbers to your PDF in any of 9 positions.',
    category: 'edit',
    icon: '🔢',
    color: '#7253e2',
    accept: '.pdf,application/pdf',
    multiple: false,
    options: function () {
      return '' +
        '<div class="option-row"><span class="opt-label">Page mode</span>' +
        '<div class="seg" data-seg="pnMode">' +
        '<button type="button" data-val="single" class="active">Single page</button>' +
        '<button type="button" data-val="facing">Facing pages</button>' +
        '<button type="button" data-val="cover">First page is cover</button>' +
        '</div></div>' +
        '<div class="option-row"><span class="opt-label">Position</span>' +
        '<div class="seg" data-seg="pnPos">' +
        '<button type="button" data-val="bottom-center" class="active">Bottom center</button>' +
        '<button type="button" data-val="bottom-left">Bottom left</button>' +
        '<button type="button" data-val="bottom-right">Bottom right</button>' +
        '<button type="button" data-val="top-center">Top center</button>' +
        '<button type="button" data-val="top-left">Top left</button>' +
        '<button type="button" data-val="top-right">Top right</button>' +
        '<button type="button" data-val="left-center">Left center</button>' +
        '<button type="button" data-val="right-center">Right center</button>' +
        '</div></div>' +
        '<div class="option-row"><span class="opt-label">Margin</span>' +
        '<div class="seg" data-seg="pnMargin">' +
        '<button type="button" data-val="small" class="active">Small</button>' +
        '<button type="button" data-val="recommended">Recommended</button>' +
        '</div></div>' +
        '<div class="option-row"><span class="opt-label">First number</span><input type="number" class="opt-control" id="opt-pn-first" value="1" min="0" max="999" style="max-width:100px"></div>' +
        '<div class="option-row"><span class="opt-label">Pages</span>' +
        '<div class="seg" data-seg="pnPages" data-row-prefix="pn">' +
        '<button type="button" data-val="all" class="active">All pages</button>' +
        '<button type="button" data-val="exclude-first">Exclude first N</button>' +
        '<button type="button" data-val="exclude-last">Exclude last N</button>' +
        '</div></div>' +
        '<div class="option-row" data-pn-row="exclude"><span class="opt-label">N</span><input type="number" class="opt-control" id="opt-pn-n" value="1" min="0" max="50" style="max-width:100px"></div>' +
        '<div class="option-row"><span class="opt-label">Format</span>' +
        '<div class="seg" data-seg="pnFormat">' +
        '<button type="button" data-val="number" class="active">Just number</button>' +
        '<button type="button" data-val="page">Page {n}</button>' +
        '</div></div>';
    },
    actionLabel: 'Add page numbers',
    process: function (files, opts, ui) {
      var file = files[0];
      return C.loadPdfDoc(file.bytes).then(function (doc) {
        return doc.embedFont(PDFLib.StandardFonts.Helvetica).then(function (font) {
          var total = doc.getPageCount();
          var first = parseInt(opts.pnFirst, 10) || 1;
          var n = parseInt(opts.pnN, 10) || 1;
          var margin = opts.pnMargin === 'recommended' ? 40 : 20;
          for (var i = 0; i < total; i++) {
            var skip = false;
            if (opts.pnPages === 'exclude-first' && i < n) skip = true;
            if (opts.pnPages === 'exclude-last' && i >= total - n) skip = true;
            if (opts.pnMode === 'cover' && i === 0) skip = true;
            if (skip) continue;
            var page = doc.getPage(i);
            var w = page.getWidth(), h = page.getHeight();
            var num = first + i;
            var text = opts.pnFormat === 'page' ? 'Page ' + num : String(num);
            var size = 11;
            var tw = font.widthOfTextAtSize(text, size);
            var x = w / 2 - tw / 2, y = margin;
            if (opts.pnPos === 'bottom-left') { x = margin; y = margin; }
            if (opts.pnPos === 'bottom-right') { x = w - tw - margin; y = margin; }
            if (opts.pnPos === 'top-center') { x = w / 2 - tw / 2; y = h - margin; }
            if (opts.pnPos === 'top-left') { x = margin; y = h - margin; }
            if (opts.pnPos === 'top-right') { x = w - tw - margin; y = h - margin; }
            if (opts.pnPos === 'left-center') { x = margin; y = h / 2; }
            if (opts.pnPos === 'right-center') { x = w - tw - margin; y = h / 2; }
            page.drawText(text, { x: x, y: y, size: size, font: font, color: PDFLib.rgb(0.2, 0.2, 0.2) });
          }
          return doc.save().then(function (bytes) {
            return { bytes: bytes, name: C.baseName(file.name) + '_numbered.pdf', mime: 'application/pdf' };
          });
        });
      });
    }
  };

  /* ---------------- CROP ---------------- */
  var crop = {
    id: 'crop',
    title: 'Crop PDF',
    desc: 'Crop PDF pages to remove unwanted margins or content.',
    category: 'edit',
    icon: '✂️',
    color: '#8FBC5D',
    accept: '.pdf,application/pdf',
    multiple: false,
    needsCropStage: true,
    options: function () {
      return '' +
        '<div class="option-row"><span class="opt-label">Apply to</span>' +
        '<div class="seg" data-seg="cropScope">' +
        '<button type="button" data-val="all" class="active">All pages</button>' +
        '<button type="button" data-val="current">Current page only</button>' +
        '</div></div>' +
        '<div class="option-row"><button type="button" class="btn btn-ghost btn-sm" id="opt-crop-reset">Reset crop</button></div>';
    },
    actionLabel: 'Crop PDF',
    process: function (files, opts, ui) {
      var file = files[0];
      var rect = opts.cropRect; // {x0,y0,x1,y1} in normalized [0..1] coords (y from top)
      if (!rect) throw new Error('Draw a crop area on the preview first');
      return C.loadPdfDoc(file.bytes).then(function (doc) {
        var total = doc.getPageCount();
        var targets = opts.cropScope === 'current' ? [opts.currentPage || 0] : (function () {
          var a = []; for (var i = 0; i < total; i++) a.push(i); return a;
        })();
        targets.forEach(function (pi) {
          var page = doc.getPage(pi);
          var w = page.getWidth(), h = page.getHeight();
          var x0 = rect.x0 * w, y0 = (1 - rect.y1) * h;
          var x1 = rect.x1 * w, y1 = (1 - rect.y0) * h;
          page.setCropBox(x0, y0, x1 - x0, y1 - y0);
        });
        return doc.save().then(function (bytes) {
          return { bytes: bytes, name: C.baseName(file.name) + '_cropped.pdf', mime: 'application/pdf' };
        });
      });
    }
  };

  /* ---------------- PDF FORMS ---------------- */
  var pdfForms = {
    id: 'pdf-forms',
    title: 'PDF Forms',
    desc: 'Fill PDF forms — fields are detected automatically.',
    category: 'edit',
    icon: '📋',
    color: '#4A7AAB',
    accept: '.pdf,application/pdf',
    multiple: false,
    needsFormFields: true,
    options: function () {
      return '<div class="option-row"><span class="opt-label">Note</span><span class="opt-control" style="color:var(--muted);font-size:13px">Fill the detected fields below, then download the completed form.</span></div>';
    },
    actionLabel: 'Fill form',
    process: function (files, opts, ui) {
      var file = files[0];
      var values = opts.formValues || {};
      return C.loadPdfDoc(file.bytes).then(function (doc) {
        var form = doc.getForm();
        var fields = form.getFields();
        fields.forEach(function (f) {
          var name = f.getName();
          var v = values[name];
          if (v === undefined || v === null) return;
          // instanceof, not constructor.name — pdf-lib 1.17.1 is minified
          // and class names are mangled (code-critic finding).
          var L = C.libs.PDFLib;
          try {
            if (f instanceof L.PDFTextField) f.setText(String(v));
            else if (f instanceof L.PDFCheckBox) { if (v === true || v === 'true' || v === 'on') f.check(); else f.uncheck(); }
            else if (f instanceof L.PDFRadioGroup) f.select(String(v));
            else if (f instanceof L.PDFDropdown) f.select(String(v));
          } catch (e) { /* skip un-fillable field */ }
        });
        return doc.save().then(function (bytes) {
          return { bytes: bytes, name: C.baseName(file.name) + '_filled.pdf', mime: 'application/pdf' };
        });
      });
    }
  };

  window.ToolEdit = { edit: editPdf, watermark: watermark, pageNumbers: pageNumbers, crop: crop, pdfForms: pdfForms };
})();
