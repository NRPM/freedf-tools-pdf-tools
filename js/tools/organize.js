/* ============================================================
   organize.js — Merge, Split, Remove pages, Organize, Rotate
   ============================================================ */
(function () {
  'use strict';
  var C = window.PDFCore;
  var PDFLib = C.libs.PDFLib;

  /* ---------------- MERGE ---------------- */
  var merge = {
    id: 'merge',
    title: 'Merge PDF',
    desc: 'Combine multiple PDFs into one, in the order you choose.',
    category: 'organize',
    icon: '🧲',
    color: '#4A7AAB',
    accept: '.pdf,application/pdf',
    multiple: true,
    options: function () {
      return '<div class="option-row"><span class="opt-label">Files</span><span class="opt-control" style="color:var(--muted);font-size:13px">Drag rows to reorder. All files are merged into a single PDF.</span></div>';
    },
    actionLabel: 'Merge PDF',
    process: function (files, opts, ui) {
      var order = opts.order || files.map(function (_, i) { return i; });
      return C.loadPdfDoc(files[order[0]].bytes).then(function (out) {
        var chain = Promise.resolve();
        for (var i = 1; i < order.length; i++) {
          (function (idx) {
            chain = chain.then(function () {
              return C.loadPdfDoc(files[idx].bytes).then(function (doc) {
                var total = doc.getPageCount();
                var chain2 = Promise.resolve();
                for (var pi = 0; pi < total; pi++) {
                  (function (pageIdx) {
                    chain2 = chain2.then(function () {
                      return out.copyPages(doc, [pageIdx]).then(function (copies) {
                        copies.forEach(function (c) { out.addPage(c); });
                      });
                    });
                  })(pi);
                }
                return chain2;
              });
            });
          })(order[i]);
        }
        return chain.then(function () {
          return out.save().then(function (bytes) {
            return { bytes: bytes, name: 'merged.pdf', mime: 'application/pdf' };
          });
        });
      });
    }
  };

  /* ---------------- SPLIT ---------------- */
  var split = {
    id: 'split',
    title: 'Split PDF',
    desc: 'Split one PDF into multiple files. Range mode or extract specific pages.',
    category: 'organize',
    icon: '✂️',
    color: '#8FBC5D',
    accept: '.pdf,application/pdf',
    multiple: false,
    options: function () {
      return '' +
        '<div class="option-row"><span class="opt-label">Mode</span>' +
        '<div class="seg" data-seg="mode">' +
        '<button type="button" data-val="range" class="active">Range</button>' +
        '<button type="button" data-val="extract">Extract</button>' +
        '</div></div>' +
        '<div class="option-row" data-mode-row="range"><span class="opt-label">Split type</span>' +
        '<div class="seg" data-seg="splitType" data-row-prefix="type">' +
        '<button type="button" data-val="custom" class="active">Custom ranges</button>' +
        '<button type="button" data-val="fixed">Fixed N pages</button>' +
        '</div></div>' +
        '<div class="option-row" data-mode-row="range" data-type-row="custom"><span class="opt-label">Ranges</span>' +
        '<input type="text" class="opt-control" id="opt-split-ranges" placeholder="e.g. 1-3, 5, 7-9" value="1-3, 4-6">' +
        '</div>' +
        '<div class="option-row" data-mode-row="range" data-type-row="fixed" style="display:none"><span class="opt-label">Pages per file</span>' +
        '<input type="number" class="opt-control" id="opt-split-fixed" min="1" value="2" style="max-width:120px">' +
        '</div>' +
        '<div class="option-row" data-mode-row="extract" style="display:none"><span class="opt-label">Extract</span>' +
        '<div class="seg" data-seg="extractMode">' +
        '<button type="button" data-val="all" class="active">All pages</button>' +
        '<button type="button" data-val="select">Select pages</button>' +
        '</div></div>' +
        '<div class="option-row" data-mode-row="extract" data-extract-row="select" style="display:none"><span class="opt-label">Pages</span>' +
        '<input type="text" class="opt-control" id="opt-split-pages" placeholder="e.g. 1, 3, 5-7">' +
        '</div>' +
        '<div class="option-row"><span class="opt-label">Output</span>' +
        '<div class="seg" data-seg="output">' +
        '<button type="button" data-val="separate" class="active">Separate files</button>' +
        '<button type="button" data-val="merged">Merge into one</button>' +
        '</div></div>';
    },
    actionLabel: 'Split PDF',
    process: function (files, opts, ui) {
      var file = files[0];
      return C.loadPdfDoc(file.bytes).then(function (doc) {
        var total = doc.getPageCount();
        var groups = []; // arrays of page indices (0-based)

        if (opts.mode === 'extract') {
          if (opts.extractMode === 'all') {
            for (var i = 0; i < total; i++) groups.push([i]);
          } else {
            var sel = C.parseRanges(opts.pages, total);
            if (!sel.length) throw new Error('No valid pages selected');
            groups.push(sel);
          }
        } else if (opts.splitType === 'fixed') {
          var n = Math.max(1, parseInt(opts.fixed, 10) || 1);
          for (var j = 0; j < total; j += n) {
            var g = [];
            for (var k = j; k < Math.min(j + n, total); k++) g.push(k);
            groups.push(g);
          }
        } else {
          // Custom ranges: each comma-separated range becomes its own output group.
          var rawParts = String(opts.ranges || '').split(',');
          rawParts.forEach(function (part) {
            var m = part.trim().match(/^(\d+)\s*-\s*(\d+)$/);
            var g = [];
            if (m) {
              var a = parseInt(m[1], 10), b = parseInt(m[2], 10);
              if (a > b) { var t = a; a = b; b = t; }
              for (var k = a; k <= b; k++) if (k >= 1 && k <= total) g.push(k - 1);
            } else if (/^\d+$/.test(part.trim())) {
              var n = parseInt(part.trim(), 10);
              if (n >= 1 && n <= total) g.push(n - 1);
            }
            if (g.length) groups.push(g);
          });
          if (!groups.length) throw new Error('No valid ranges specified');
        }

        if (opts.output === 'merged') {
          return PDFLib.PDFDocument.create().then(function (out) {
            var chain = Promise.resolve();
            groups.forEach(function (g) {
              chain = chain.then(function () {
                var chain2 = Promise.resolve();
                g.forEach(function (pi) {
                  chain2 = chain2.then(function () {
                    return out.copyPages(doc, [pi]).then(function (copies) {
                      copies.forEach(function (c) { out.addPage(c); });
                    });
                  });
                });
                return chain2;
              });
            });
            return chain.then(function () {
              return out.save().then(function (bytes) {
                return { bytes: bytes, name: C.baseName(file.name) + '_extracted.pdf', mime: 'application/pdf' };
              });
            });
          });
        }

        // Separate files -> ZIP
        var parts = [];
        var chain2 = Promise.resolve();
        groups.forEach(function (g, gi) {
          chain2 = chain2.then(function () {
            return PDFLib.PDFDocument.create().then(function (out) {
              var chain3 = Promise.resolve();
              g.forEach(function (pi) {
                chain3 = chain3.then(function () {
                  return out.copyPages(doc, [pi]).then(function (copies) {
                    copies.forEach(function (c) { out.addPage(c); });
                  });
                });
              });
              return chain3.then(function () { return out.save(); }).then(function (bytes) {
                parts.push({ name: C.baseName(file.name) + '_part' + (gi + 1) + '.pdf', bytes: bytes });
              });
            });
          });
        });
        return chain2.then(function () {
          return { zip: parts, zipName: C.baseName(file.name) + '_split.zip' };
        });
      });
    }
  };

  /* ---------------- REMOVE PAGES ---------------- */
  var removePages = {
    id: 'remove-pages',
    title: 'Remove pages',
    desc: 'Delete selected pages from a PDF. Click to select, shift-click for ranges.',
    category: 'organize',
    icon: '🗑️',
    color: '#EE6C4D',
    accept: '.pdf,application/pdf',
    multiple: false,
    needsThumbs: true,
    options: function () {
      return '<div class="option-row"><span class="opt-label">Selection</span><span class="opt-control" id="opt-remove-info" style="color:var(--muted);font-size:13px">Click pages to remove. Shift-click selects a range.</span></div>';
    },
    actionLabel: 'Remove pages',
    process: function (files, opts, ui) {
      var file = files[0];
      var toRemove = (opts.removePages || []).slice().sort(function (a, b) { return b - a; });
      if (!toRemove.length) throw new Error('Select at least one page to remove');
      return C.loadPdfDoc(file.bytes).then(function (doc) {
        toRemove.forEach(function (pi) { doc.removePage(pi); });
        return doc.save().then(function (bytes) {
          return { bytes: bytes, name: C.baseName(file.name) + '_removed.pdf', mime: 'application/pdf' };
        });
      });
    }
  };

  /* ---------------- ORGANIZE ---------------- */
  var organize = {
    id: 'organize',
    title: 'Organize PDF',
    desc: 'Sort, remove and rotate pages visually with thumbnails.',
    category: 'organize',
    icon: '📑',
    color: '#AB6993',
    accept: '.pdf,application/pdf',
    multiple: false,
    needsThumbs: true,
    options: function () {
      return '<div class="option-row"><span class="opt-label">Hint</span><span class="opt-control" style="color:var(--muted);font-size:13px">Drag thumbnails to reorder. Use the buttons to rotate or delete pages.</span></div>';
    },
    actionLabel: 'Organize PDF',
    process: function (files, opts, ui) {
      var file = files[0];
      var order = opts.order; // array of {srcIndex, rotation}
      return C.loadPdfDoc(file.bytes).then(function (doc) {
        return PDFLib.PDFDocument.create().then(function (out) {
          var chain = Promise.resolve();
          order.forEach(function (item) {
            chain = chain.then(function () {
              return out.copyPages(doc, [item.srcIndex]).then(function (copies) {
                copies.forEach(function (c) { out.addPage(c); });
              });
            });
          });
          return chain.then(function () {
            // Apply rotations
            order.forEach(function (item, newIndex) {
              var page = out.getPage(newIndex);
              var cur = page.getRotation().angle;
              page.setRotation(PDFLib.degrees((cur + (item.rotation || 0)) % 360));
            });
            return out.save().then(function (bytes) {
              return { bytes: bytes, name: C.baseName(file.name) + '_organized.pdf', mime: 'application/pdf' };
            });
          });
        });
      });
    }
  };

  /* ---------------- ROTATE ---------------- */
  var rotate = {
    id: 'rotate',
    title: 'Rotate PDF',
    desc: 'Rotate all pages or individual pages left or right.',
    category: 'edit',
    icon: '🔄',
    color: '#008ee9',
    accept: '.pdf,application/pdf',
    multiple: true,
    needsThumbs: true,
    options: function () {
      return '' +
        '<div class="option-row"><span class="opt-label">Apply to</span>' +
        '<div class="seg" data-seg="scope">' +
        '<button type="button" data-val="all" class="active">All pages</button>' +
        '<button type="button" data-val="select">Selected pages</button>' +
        '</div></div>' +
        '<div class="option-row"><span class="opt-label">Direction</span>' +
        '<div class="seg" data-seg="direction">' +
        '<button type="button" data-val="right" class="active">Right 90°</button>' +
        '<button type="button" data-val="left">Left 90°</button>' +
        '<button type="button" data-val="180">180°</button>' +
        '</div></div>' +
        '<div class="option-row"><span class="opt-label">Select by orientation</span>' +
        '<div class="seg" data-seg="orientation">' +
        '<button type="button" data-val="none" class="active">No filter</button>' +
        '<button type="button" data-val="portrait">Portrait</button>' +
        '<button type="button" data-val="landscape">Landscape</button>' +
        '</div></div>' +
        '<div class="option-row"><button type="button" class="btn btn-ghost btn-sm" id="opt-rotate-reset">Reset all</button></div>';
    },
    actionLabel: 'Rotate PDF',
    process: function (files, opts, ui) {
      var file = files[0];
      var delta = opts.direction === 'left' ? -90 : (opts.direction === '180' ? 180 : 90);
      return C.loadPdfDoc(file.bytes).then(function (doc) {
        var total = doc.getPageCount();
        var targets = [];
        for (var i = 0; i < total; i++) {
          var page = doc.getPage(i);
          var w = page.getWidth(), h = page.getHeight();
          var isPortrait = h >= w;
          if (opts.scope === 'select' && opts.selectedPages && opts.selectedPages.indexOf(i) === -1) continue;
          if (opts.orientation === 'portrait' && !isPortrait) continue;
          if (opts.orientation === 'landscape' && isPortrait) continue;
          targets.push(i);
        }
        targets.forEach(function (pi) {
          var p = doc.getPage(pi);
          var cur = p.getRotation().angle;
          p.setRotation(PDFLib.degrees((cur + delta + 360) % 360));
        });
        return doc.save().then(function (bytes) {
          return { bytes: bytes, name: C.baseName(file.name) + '_rotated.pdf', mime: 'application/pdf' };
        });
      });
    }
  };

  window.ToolOrganize = { merge: merge, split: split, removePages: removePages, organize: organize, rotate: rotate };
})();
