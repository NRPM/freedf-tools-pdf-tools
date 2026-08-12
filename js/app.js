/* ============================================================
   app.js — tool registry, view routing, dropzone handling,
   file list management, options collection, special stages,
   progress UI, result/download handling.
   ============================================================ */
(function () {
  'use strict';
  var C = window.PDFCore;

  /* ---------------- Tool registry ---------------- */
  var TOOLS = {};
  var CATEGORY_LABELS = {
    convert: 'Convert', organize: 'Organize', optimize: 'Optimize',
    edit: 'Edit', security: 'Security', intelligence: 'Intelligence'
  };

  function register(group) {
    Object.keys(group).forEach(function (k) {
      var t = group[k];
      TOOLS[t.id] = t;
    });
  }
  register(window.ToolOrganize || {});
  register(window.ToolOptimize || {});
  register(window.ToolConvert || {});
  register(window.ToolEdit || {});
  register(window.ToolSecurity || {});
  register(window.ToolIntelligence || {});

  /* ---------------- DOM helpers ---------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  function toast(msg, isError) {
    var t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    if (isError) t.style.borderColor = 'var(--accent)';
    else t.style.borderColor = '';
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  /** Escape user-controlled strings before injecting into innerHTML. */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ---------------- Build tool grid + nav ---------------- */
  function buildGrid() {
    var grid = $('#tool-grid');
    grid.innerHTML = '';
    Object.keys(TOOLS).forEach(function (id) {
      var t = TOOLS[id];
      var card = el('a', 'tool-card');
      card.href = '#tool-' + id;
      card.setAttribute('data-category', t.category);
      card.innerHTML =
        '<span class="tool-icon" style="background:' + t.color + '1a;color:' + t.color + '">' + t.icon + '</span>' +
        '<h3>' + t.title + '</h3>' +
        '<p>' + t.desc + '</p>';
      grid.appendChild(card);
    });
  }

  function buildNav() {
    var ddConvert = $('#dd-convert');
    var ddAll = $('#dd-all');
    ddConvert.innerHTML = '';
    ddAll.innerHTML = '';
    Object.keys(TOOLS).forEach(function (id) {
      var t = TOOLS[id];
      var a = el('a', null, t.title);
      a.href = '#tool-' + id;
      if (t.category === 'convert') ddConvert.appendChild(a.cloneNode(true));
      ddAll.appendChild(a);
    });
  }

  /* ---------------- Category filter ---------------- */
  function initTabs() {
    var tabs = $('#category-tabs');
    tabs.addEventListener('click', function (e) {
      var btn = e.target.closest('.tab');
      if (!btn) return;
      $all('.tab', tabs).forEach(function (b) {
        b.classList.toggle('active', b === btn);
        b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
      });
      var cat = btn.getAttribute('data-cat');
      $all('.tool-card').forEach(function (card) {
        var show = cat === 'all' || card.getAttribute('data-category') === cat;
        card.classList.toggle('hidden', !show);
      });
    });
  }

  /* ---------------- Workspace construction ---------------- */
  var wsState = {}; // id -> { files: [], order: [], selected: {}, rotations: {}, thumbCache: {}, annotations: [], ... }
  // Debug/testing hook (read-only by convention): lets verification harnesses
  // inspect per-tool workspace state. No behavior change.
  window.__wsState = wsState;

  function buildWorkspace(t) {
    var ws = el('div', 'workspace');
    ws.id = 'ws-' + t.id;
    ws.innerHTML =
      '<div class="workspace-head">' +
      '<a href="#home" class="back-link" style="display:inline-block;margin-bottom:12px;font-size:13.5px;color:var(--muted)">← All tools</a>' +
      '<h1>' + t.title + '</h1>' +
      '<p>' + t.desc + '</p>' +
      '</div>' +
      '<div class="dropzone" data-dropzone>' +
      '<div class="dz-icon">' + t.icon + '</div>' +
      '<button class="btn btn-primary" type="button" data-browse>Select ' + (t.multiple ? 'files' : 'file') + '</button>' +
      '<p>Upload from computer. <span>or drop ' + (t.multiple ? 'files' : 'file') + ' here</span></p>' +
      '<p class="dz-accept">Accepted: ' + t.accept.replace(/,/g, ', ') + '</p>' +
      '<input type="file" data-input accept="' + t.accept + '"' + (t.multiple ? ' multiple' : '') + ' hidden>' +
      '</div>' +
      '<div class="file-list" data-filelist></div>' +
      (t.needsThumbs ? '<div class="thumb-grid" data-thumbs></div>' : '') +
      (t.needsCompare ? '<div class="compare-wrap" data-compare></div>' : '') +
      (t.needsSignStage ? '<div class="option-row" style="margin-top:16px"><span class="opt-label">Signature</span><div class="opt-control"><canvas class="sign-canvas" data-signcanvas width="520" height="200"></canvas></div></div>' : '') +
      (t.needsCropStage ? '<div class="crop-stage" data-cropstage style="display:none"></div>' : '') +
      (t.needsEditStage ? '<div class="edit-stage" data-editstage style="display:none"></div>' : '') +
      (t.needsFormFields ? '<div class="form-field-list" data-formfields></div>' : '') +
      '<div class="options-panel" data-options>' + (t.options ? t.options() : '') + '</div>' +
      '<div class="action-bar"><button class="btn btn-primary btn-lg" type="button" data-action>' + t.actionLabel + '</button></div>' +
      '<div class="progress-wrap" data-progress>' +
      '<div class="progress-status" data-status></div>' +
      '<div class="progress-bar"><div class="progress-fill" data-fill></div></div>' +
      '</div>' +
      '<div class="result-wrap" data-result></div>';

    $('#workspaces').appendChild(ws);
    wsState[t.id] = { files: [], selected: {}, order: [], rotations: {}, thumbCache: {}, _pdfJsPromise: null, annotations: [], currentPage: 0, cropRect: null, signatureDataUrl: null, formValues: {} };

    initDropzone(ws, t);
    initFileList(ws, t);
    initOptions(ws, t);
    initAction(ws, t);
    if (t.needsThumbs) initThumbs(ws, t);
    if (t.needsCompare) initCompare(ws, t);
    if (t.needsSignStage) initSignStage(ws, t);
    if (t.needsCropStage) initCropStage(ws, t);
    if (t.needsEditStage) initEditStage(ws, t);
    if (t.needsFormFields) initFormFields(ws, t);
  }

  /* ---------------- Dropzone ---------------- */
  function initDropzone(ws, t) {
    var dz = $('[data-dropzone]', ws);
    var input = $('[data-input]', ws);
    $('[data-browse]', ws).addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      addFiles(ws, t, input.files);
      input.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('dragover'); });
    });
    dz.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files) addFiles(ws, t, e.dataTransfer.files);
    });
  }

  function addFiles(ws, t, fileList) {
    var st = wsState[t.id];
    var arr = Array.prototype.slice.call(fileList);
    if (!t.multiple && st.files.length + arr.length > 1) {
      st.files = [];
      st.selected = {};
      st.order = [];
      st.rotations = {};
      st.thumbCache = {};
      st._pdfJsPromise = null;
      st.annotations = [];
      st.currentPage = 0;
      st.cropRect = null;
      st.signatureDataUrl = null;
      st.formValues = {};
    }
    var chain = Promise.resolve();
    arr.forEach(function (f) {
      chain = chain.then(function () {
        return C.readAsArrayBuffer(f).then(function (buf) {
          st.files.push({ file: f, name: f.name, size: f.size, bytes: buf, thumb: null });
        });
      });
    });
    chain.then(function () {
      hideResult(ws);
      renderFileList(ws, t);
      if (t.needsThumbs) renderThumbs(ws, t);
      if (t.needsCompare) renderCompare(ws, t);
      if (t.needsFormFields) renderFormFields(ws, t);
      if (t.needsCropStage) renderCropStage(ws, t);
      if (t.needsEditStage) renderEditStage(ws, t);
      if (t.needsSignStage) { /* canvas stays */ }
    }).catch(function (err) {
      toast('Could not read file: ' + err.message, true);
    });
  }

  /* ---------------- File list ---------------- */
  function initFileList(ws, t) {
    var list = $('[data-filelist]', ws);
    list.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-fa]');
      if (!btn) return;
      var idx = parseInt(btn.getAttribute('data-idx'), 10);
      var st = wsState[t.id];
      var act = btn.getAttribute('data-fa');
      if (act === 'remove') {
        st.files.splice(idx, 1);
        st.selected = {};
        st.order = [];
        st.rotations = {};
        st.thumbCache = {};
        st._pdfJsPromise = null;
        st.annotations = [];
        st.currentPage = 0;
        st.cropRect = null;
        st.signatureDataUrl = null;
        st.formValues = {};
        renderFileList(ws, t);
        if (t.needsThumbs) renderThumbs(ws, t);
        if (t.needsCompare) renderCompare(ws, t);
        if (t.needsFormFields) renderFormFields(ws, t);
        if (t.needsCropStage) renderCropStage(ws, t);
        if (t.needsEditStage) renderEditStage(ws, t);
      } else if (act === 'up' && idx > 0) {
        var tmp = st.files[idx - 1]; st.files[idx - 1] = st.files[idx]; st.files[idx] = tmp;
        renderFileList(ws, t);
      } else if (act === 'down' && idx < st.files.length - 1) {
        var tmp2 = st.files[idx + 1]; st.files[idx + 1] = st.files[idx]; st.files[idx] = tmp2;
        renderFileList(ws, t);
      }
    });
  }

  function renderFileList(ws, t) {
    var st = wsState[t.id];
    var list = $('[data-filelist]', ws);
    list.innerHTML = '';
    if (!st.files.length) return;
    st.files.forEach(function (f, i) {
      var row = el('div', 'file-row');
      row.draggable = t.multiple;
      row.innerHTML =
        '<div class="file-thumb" data-thumb></div>' +
        '<div class="file-meta">' +
        '<div class="file-name">' + esc(f.name) + '</div>' +
        '<div class="file-info">' + C.formatBytes(f.size) + (f.bytes ? ' · ' + (f.bytes.byteLength ? 'loaded' : '') : '') + '</div>' +
        '</div>' +
        '<div class="file-actions">' +
        (t.multiple ? '<button class="icon-btn" data-fa="up" data-idx="' + i + '" title="Move up">↑</button>' +
          '<button class="icon-btn" data-fa="down" data-idx="' + i + '" title="Move down">↓</button>' : '') +
        '<button class="icon-btn danger" data-fa="remove" data-idx="' + i + '" title="Remove">✕</button>' +
        '</div>';
      list.appendChild(row);
      // Thumbnail
      var thumb = $('[data-thumb]', row);
      if (/\.(png|jpe?g|webp|gif)$/i.test(f.name)) {
        var url = URL.createObjectURL(f.file);
        var img = new Image();
        img.onload = function () { thumb.appendChild(img); URL.revokeObjectURL(url); };
        img.src = url;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover';
      } else if (C.libs.pdfjs) {
        C.loadPdfJs(f.bytes).then(function (pdfJs) {
          return C.renderPageToCanvas(pdfJs, 1, 0.25).then(function (r) {
            var img = el('img');
            img.src = r.canvas.toDataURL('image/jpeg', 0.6);
            thumb.appendChild(img);
          });
        }).catch(function () { thumb.textContent = '📄'; });
      } else {
        thumb.textContent = '📄';
      }
      // Drag reorder
      if (t.multiple) {
        row.addEventListener('dragstart', function (e) {
          e.dataTransfer.setData('text/plain', String(i));
          row.classList.add('dragging');
        });
        row.addEventListener('dragend', function () { row.classList.remove('dragging'); });
        row.addEventListener('dragover', function (e) { e.preventDefault(); });
        row.addEventListener('drop', function (e) {
          e.preventDefault();
          var from = parseInt(e.dataTransfer.getData('text/plain'), 10);
          if (isNaN(from)) return;
          var to = i;
          var item = st.files.splice(from, 1)[0];
          st.files.splice(to, 0, item);
          renderFileList(ws, t);
        });
      }
    });
  }

  /* ---------------- Options: segs, inputs, dependent rows ---------------- */
  function initOptions(ws, t) {
    var panel = $('[data-options]', ws);
    if (!panel) return;

    // Segmented controls
    $all('.seg', panel).forEach(function (seg) {
      seg.addEventListener('click', function (e) {
        var btn = e.target.closest('button');
        if (!btn) return;
        $all('button', seg).forEach(function (b) { b.classList.toggle('active', b === btn); });
        var name = seg.getAttribute('data-seg');
        var val = btn.getAttribute('data-val');
        // Dependent rows: data-<name>-row="<val>" (or a custom prefix via
        // data-row-prefix when the seg name doesn't match the row prefix —
        // e.g. wmType seg → data-wm-row, splitType seg → data-type-row).
        var prefix = seg.getAttribute('data-row-prefix') || name;
        $all('[data-' + prefix + '-row]', panel).forEach(function (row) {
          var rv = row.getAttribute('data-' + prefix + '-row');
          var show = rv === val || (rv === 'exclude' && val.indexOf('exclude') === 0);
          row.style.display = show ? '' : 'none';
        });
        // Extra hooks
        if (name === 'mode' && t.id === 'split') {
          var extractSel = $('[data-extract-row="select"]', panel);
          if (extractSel) extractSel.style.display = (val === 'extract' && $('[data-seg="extractMode"] .active', panel) && $('[data-seg="extractMode"] .active', panel).getAttribute('data-val') === 'select') ? '' : 'none';
        }
        if (name === 'extractMode' && t.id === 'split') {
          var selRow = $('[data-extract-row="select"]', panel);
          if (selRow) selRow.style.display = val === 'select' ? '' : 'none';
        }
        if (name === 'scope' && t.id === 'rotate') {
          // selection only matters in select mode
        }
      });
    });

    // Range inputs with live value labels
    $all('input[type="range"]', panel).forEach(function (r) {
      var label = panel.querySelector('#opt-' + r.id.replace('opt-', '') + '-val');
      if (label) {
        r.addEventListener('input', function () { label.textContent = parseFloat(r.value).toFixed(2); });
      }
    });

    // Reset buttons
    var reset = panel.querySelector('#opt-rotate-reset');
    if (reset) reset.addEventListener('click', function () {
      var st = wsState[t.id];
      st.rotations = {};
      st.selected = {};
      renderThumbs(ws, t);
    });
    var cropReset = panel.querySelector('#opt-crop-reset');
    if (cropReset) cropReset.addEventListener('click', function () {
      var st = wsState[t.id];
      st.cropRect = null;
      renderCropStage(ws, t);
    });
    var signClear = panel.querySelector('#opt-sign-clear');
    if (signClear) signClear.addEventListener('click', function () {
      var st = wsState[t.id];
      st.signatureDataUrl = null;
      var cv = $('[data-signcanvas]', ws);
      if (cv) {
        var ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, cv.width, cv.height);
      }
    });
    var editClear = panel.querySelector('#opt-edit-clear');
    if (editClear) editClear.addEventListener('click', function () {
      var st = wsState[t.id];
      st.annotations = [];
      renderEditStage(ws, t);
    });
  }

  /** Collect options from the panel + stage state. */
  function collectOptions(ws, t) {
    var panel = $('[data-options]', ws);
    var opts = {};
    // Map input id -> option key. IDs are kebab-case; tools read camelCase keys.
    // Some IDs carry a tool-specific prefix that tools do NOT expect (e.g.
    // opt-split-ranges -> opts.ranges), so alias them explicitly.
    var ALIAS = {
      splitRanges: 'ranges', splitFixed: 'fixed', splitPages: 'pages',
      compressQuality: 'quality',
      wmImage: 'wmImageFile',
      protectPass: 'password', protectPrint: 'print', protectModify: 'modify',
      protectCopy: 'copy', protectComments: 'comments', protectForms: 'forms',
      protectAccess: 'access', protectAssembly: 'assembly',
      unlockPass: 'password',
      ocrLang: 'lang',
      redactText: 'text', redactEmail: 'email', redactPhone: 'phone', redactCc: 'cc',
      trTo: 'to', trFrom: 'from'
    };
    function optKey(id) {
      var kebab = id.slice(4);
      var camel = kebab.replace(/-([a-z0-9])/g, function (m, c) { return c.toUpperCase(); });
      return ALIAS[camel] || camel;
    }
    if (panel) {
      $all('.seg', panel).forEach(function (seg) {
        var active = $('.active', seg);
        if (active) opts[seg.getAttribute('data-seg')] = active.getAttribute('data-val');
      });
      $all('input,select,textarea', panel).forEach(function (inp) {
        var id = inp.id;
        if (!id || id.indexOf('opt-') !== 0) return;
        var key = optKey(id);
        if (inp.type === 'checkbox') opts[key] = inp.checked;
        else if (inp.type === 'file') opts[key] = inp.files && inp.files[0] ? inp.files[0] : null;
        else opts[key] = inp.value;
      });
    }
    var st = wsState[t.id];
    if (t.id === 'merge') opts.order = st.files.map(function (_, i) { return i; });
    if (t.id === 'organize') {
      if (!st.order || !st.order.length) {
        // Prefer per-page init from the known page count; fall back to the
        // (pre-existing) per-file shape only when the page count is unknown.
        if (st.totalPages) {
          st.order = [];
          for (var oi2 = 0; oi2 < st.totalPages; oi2++) st.order.push({ srcIndex: oi2, rotation: 0 });
        } else {
          st.order = st.files.map(function (_, i) { return { srcIndex: i, rotation: 0 }; });
        }
      }
      opts.order = st.order;
    }
    if (t.id === 'remove-pages') {
      opts.removePages = Object.keys(st.selected).map(Number).sort(function (a, b) { return a - b; });
    }
    if (t.id === 'rotate') {
      opts.selectedPages = Object.keys(st.selected).map(Number);
    }
    if (t.id === 'split') {
      opts.selectedPages = Object.keys(st.selected).map(Number);
    }
    if (t.id === 'crop') { opts.cropRect = st.cropRect; opts.currentPage = st.currentPage; }
    if (t.id === 'edit') { opts.annotations = st.annotations; }
    if (t.id === 'sign') {
      // Capture the signature from the canvas at action time (the canvas may
      // have been drawn after the stage was initialized).
      var cv = $('[data-signcanvas]', ws);
      if (cv) {
        var ctx2 = cv.getContext('2d');
        var hasInk = false;
        try {
          var data = ctx2.getImageData(0, 0, cv.width, cv.height).data;
          for (var i = 3; i < data.length; i += 4) {
            if (data[i] > 0) { hasInk = true; break; }
          }
        } catch (e) { /* canvas tainted — treat as no signature */ }
        opts.signatureDataUrl = hasInk ? cv.toDataURL('image/png') : null;
      }
    }
    if (t.id === 'pdf-forms') { opts.formValues = st.formValues; }
    if (t.id === 'watermark') { opts.wmImageFile = opts.wmImageFile || null; }
    return opts;
  }

  /* ---------------- Action button ---------------- */
  function initAction(ws, t) {
    var btn = $('[data-action]', ws);
    btn.addEventListener('click', function () {
      var st = wsState[t.id];
      if (!st.files.length && t.needsFile !== false) { toast('Add at least one file first', true); return; }
      var opts;
      try { opts = collectOptions(ws, t); } catch (e) { toast(e.message, true); return; }
      var ui = {
        progress: function (msg, pct) {
          var pw = $('[data-progress]', ws);
          pw.classList.add('show');
          $('[data-status]', ws).textContent = msg || '';
          var fill = $('[data-fill]', ws);
          if (pct === undefined || pct === null) {
            fill.style.width = '40%';
            fill.classList.add('indeterminate');
          } else {
            fill.classList.remove('indeterminate');
            fill.style.width = Math.max(4, Math.min(100, pct)) + '%';
          }
        }
      };
      btn.disabled = true;
      ui.progress('Processing…', null);
      Promise.resolve()
        .then(function () { return t.process(st.files, opts, ui); })
        .then(function (res) { showResult(ws, t, res); })
        .catch(function (err) {
          var pw = $('[data-progress]', ws);
          pw.classList.remove('show');
          toast(err && err.message ? err.message : 'Processing failed', true);
        })
        .then(function () { btn.disabled = false; });
    });
  }

  /* ---------------- Progress / Result ---------------- */
  function hideResult(ws) {
    var rw = $('[data-result]', ws);
    rw.classList.remove('show');
    rw.innerHTML = '';
    var pw = $('[data-progress]', ws);
    pw.classList.remove('show');
  }

  function showResult(ws, t, res) {
    var pw = $('[data-progress]', ws);
    pw.classList.remove('show');
    var rw = $('[data-result]', ws);
    rw.classList.add('show');
    rw.innerHTML = '';

    if (res && res.text !== undefined) {
      rw.innerHTML =
        '<div class="result-icon">🤖</div>' +
        '<h3>Done!</h3>' +
        '<p>Your result is ready below.</p>' +
        '<div class="ai-output">' + esc(res.text) + '</div>' +
        '<div class="result-actions" style="margin-top:16px">' +
        '<button class="btn btn-primary" data-dl>Download .txt</button>' +
        '<button class="btn btn-ghost" data-copy>Copy to clipboard</button>' +
        '<button class="btn btn-ghost" data-restart>Start over</button>' +
        '</div>';
      $('[data-dl]', rw).addEventListener('click', function () {
        C.downloadBlob(new Blob([res.text], { type: 'text/plain' }), res.name || 'output.txt');
      });
      $('[data-copy]', rw).addEventListener('click', function () {
        navigator.clipboard.writeText(res.text).then(function () { toast('Copied to clipboard'); });
      });
      $('[data-restart]', rw).addEventListener('click', function () { resetWorkspace(ws, t); });
      return;
    }

    if (res && res.diff) {
      var escNameA = esc(String(res.nameA || ''));
      var escNameB = esc(String(res.nameB || ''));
      var overlayHtml = '';
      if (res.overlay) {
        overlayHtml =
          '<div class="overlay-result">' +
          '<p style="color:var(--muted);font-size:13px;margin:12px 0 8px">Content overlay — changed pixels highlighted in red (' + res.overlay.changedPixels + ' changed)</p>' +
          '<img src="' + res.overlay.dataUrl + '" alt="Content overlay diff" style="max-width:100%;border:1px solid var(--border);border-radius:8px">' +
          '</div>';
      }
      rw.innerHTML =
        '<div class="result-icon">⚖️</div>' +
        '<h3>Comparison complete</h3>' +
        '<p>' + escNameA + ' vs ' + escNameB + '</p>' +
        overlayHtml +
        '<div class="result-files">' +
        res.diff.map(function (d) {
          return '<div class="diff-line ' + d.type + '">' + esc(d.text || ' ') + '</div>';
        }).join('') +
        '</div>' +
        '<div class="result-actions">' +
        '<button class="btn btn-primary" data-dl>Download report</button>' +
        '<button class="btn btn-ghost" data-restart>Start over</button>' +
        '</div>';
      $('[data-dl]', rw).addEventListener('click', function () {
        var report = res.diff.map(function (d) { return '[' + d.type.toUpperCase() + '] ' + d.text; }).join('\n');
        C.downloadBlob(new Blob([report], { type: 'text/plain' }), 'comparison_report.txt');
      });
      $('[data-restart]', rw).addEventListener('click', function () { resetWorkspace(ws, t); });
      return;
    }

    if (res && res.zip) {
      rw.innerHTML =
        '<div class="result-icon">📦</div>' +
        '<h3>Done! ' + res.zip.length + ' file' + (res.zip.length > 1 ? 's' : '') + ' ready</h3>' +
        '<p>Your files are packed in a ZIP archive.</p>' +
        '<div class="result-actions">' +
        '<button class="btn btn-primary" data-dl>Download ZIP</button>' +
        '<button class="btn btn-ghost" data-restart>Start over</button>' +
        '</div>';
      $('[data-dl]', rw).addEventListener('click', function () {
        C.downloadZip(res.zip, res.zipName).catch(function (e) { toast('ZIP failed: ' + e.message, true); });
      });
      $('[data-restart]', rw).addEventListener('click', function () { resetWorkspace(ws, t); });
      return;
    }

    if (res && (res.bytes || res.blob)) {
      var name = esc(String(res.name || 'output.pdf'));
      var mime = res.mime || 'application/octet-stream';
      rw.innerHTML =
        '<div class="result-icon">✅</div>' +
        '<h3>Done!</h3>' +
        '<p>' + name + ' · ' + C.formatBytes(res.bytes ? res.bytes.byteLength : (res.blob ? res.blob.size : 0)) + '</p>' +
        '<div class="result-actions">' +
        '<button class="btn btn-primary" data-dl>Download ' + name + '</button>' +
        '<button class="btn btn-ghost" data-restart>Start over</button>' +
        '</div>';
      $('[data-dl]', rw).addEventListener('click', function () {
        if (res.bytes) C.downloadBytes(res.bytes, res.name, mime);
        else C.downloadBlob(res.blob, res.name);
      });
      $('[data-restart]', rw).addEventListener('click', function () { resetWorkspace(ws, t); });
      return;
    }

    rw.innerHTML = '<h3>Done!</h3><p>Processing complete.</p>';
  }

  function resetWorkspace(ws, t) {
    var st = wsState[t.id];
    st.files = []; st.selected = {}; st.order = []; st.rotations = {}; st.thumbCache = {};
    st._pdfJsPromise = null;
    st.annotations = []; st.currentPage = 0; st.cropRect = null;
    st.signatureDataUrl = null; st.formValues = {};
    hideResult(ws);
    renderFileList(ws, t);
    if (t.needsThumbs) renderThumbs(ws, t);
    if (t.needsCompare) renderCompare(ws, t);
    if (t.needsFormFields) renderFormFields(ws, t);
    if (t.needsCropStage) renderCropStage(ws, t);
    if (t.needsEditStage) renderEditStage(ws, t);
    var cv = $('[data-signcanvas]', ws);
    if (cv) {
      var ctx = cv.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, cv.width, cv.height);
    }
  }

  /* ---------------- Thumbnail stages (organize/remove/rotate/split) ---------------- */
  function initThumbs(ws, t) {
    var grid = $('[data-thumbs]', ws);
    grid.addEventListener('click', function (e) {
      var st = wsState[t.id];
      var item = e.target.closest('.thumb-item');
      if (!item) return;
      var idx = parseInt(item.getAttribute('data-idx'), 10);
      var btn = e.target.closest('button');
      if (btn) {
        var act = btn.getAttribute('data-ta');
        if (act === 'rotl' || act === 'rotr') {
          var delta = act === 'rotr' ? 90 : -90;
          if (t.id === 'organize') {
            var entry = st.order[idx] || { srcIndex: idx, rotation: 0 };
            entry.rotation = ((entry.rotation || 0) + delta + 360) % 360;
            st.order[idx] = entry;
          } else {
            st.rotations[idx] = ((st.rotations[idx] || 0) + delta + 360) % 360;
          }
          renderThumbs(ws, t);
          return;
        }
        if (act === 'del') {
          if (t.id === 'organize') {
            // Remove the display entry at the display index. srcIndex values are
            // ORIGINAL page indices and MUST be preserved: organize.js process
            // does out.copyPages(doc, [srcIndex]) against the untouched source
            // doc, and thumbCache is keyed by original index. Remapping them to
            // a contiguous 0..n-1 range would re-import deleted pages and show
            // the wrong thumbnails.
            st.order.splice(idx, 1);
          } else {
            st.selected[idx] = !st.selected[idx];
          }
          renderThumbs(ws, t);
          return;
        }
      }
      // Selection toggle
      if (t.id === 'organize') return; // organize uses drag, not click-select
      if (e.shiftKey && st._lastSel !== undefined) {
        var a = Math.min(st._lastSel, idx), b = Math.max(st._lastSel, idx);
        for (var i = a; i <= b; i++) st.selected[i] = true;
      } else {
        st.selected[idx] = !st.selected[idx];
        st._lastSel = idx;
      }
      renderThumbs(ws, t);
      updateThumbInfo(ws, t);
    });

    // Drag reorder for organize
    grid.addEventListener('dragstart', function (e) {
      var item = e.target.closest('.thumb-item');
      if (!item || t.id !== 'organize') { e.preventDefault(); return; }
      e.dataTransfer.setData('text/plain', item.getAttribute('data-idx'));
      item.classList.add('dragging');
    });
    grid.addEventListener('dragend', function (e) {
      var item = e.target.closest('.thumb-item');
      if (item) item.classList.remove('dragging');
      $all('.drop-target', grid).forEach(function (d) { d.classList.remove('drop-target'); });
    });
    grid.addEventListener('dragover', function (e) {
      if (t.id !== 'organize') return;
      e.preventDefault();
      var item = e.target.closest('.thumb-item');
      if (item) item.classList.add('drop-target');
    });
    grid.addEventListener('dragleave', function (e) {
      var item = e.target.closest('.thumb-item');
      if (item) item.classList.remove('drop-target');
    });
    grid.addEventListener('drop', function (e) {
      if (t.id !== 'organize') return;
      e.preventDefault();
      var from = parseInt(e.dataTransfer.getData('text/plain'), 10);
      var item = e.target.closest('.thumb-item');
      if (isNaN(from) || !item) return;
      var to = parseInt(item.getAttribute('data-idx'), 10);
      var st = wsState[t.id];
      if (!st.order || !st.order.length) {
        if (st.totalPages) {
          st.order = [];
          for (var oi3 = 0; oi3 < st.totalPages; oi3++) st.order.push({ srcIndex: oi3, rotation: 0 });
        } else {
          st.order = st.files.map(function (_, i) { return { srcIndex: i, rotation: 0 }; });
        }
      }
      var arr = st.order;
      var moved = arr.splice(from, 1)[0];
      arr.splice(to, 0, moved);
      st.order = arr;
      renderThumbs(ws, t);
    });
  }

  function updateThumbInfo(ws, t) {
    if (t.id === 'remove-pages') {
      var st = wsState[t.id];
      var info = $('#opt-remove-info');
      if (info) {
        var n = Object.keys(st.selected).length;
        info.textContent = n + ' of ' + (st.totalPages || '?') + ' pages selected to remove. Click pages to select, shift-click for ranges.';
      }
    }
  }

  /* Build a single thumbnail DOM node. srcIdx = ORIGINAL page index (thumbCache
     key), dispIdx = display index (data-idx). Thumbnails come from the cache;
     the grid is rebuilt synchronously so interactions never blank the grid or
     re-rasterize pages. */
  function buildThumbItem(st, t, srcIdx, dispIdx, thumb) {
    var item = el('div', 'thumb-item');
    item.setAttribute('data-idx', String(dispIdx));
    item.draggable = t.id === 'organize';
    var rot = 0;
    if (t.id === 'organize') {
      var entry = st.order[dispIdx] || { srcIndex: srcIdx, rotation: 0 };
      rot = entry.rotation || 0;
    } else {
      rot = st.rotations[srcIdx] || 0;
    }
    if (thumb && thumb.dataUrl) {
      var img = el('img');
      img.src = thumb.dataUrl;
      if (rot) img.style.transform = 'rotate(' + rot + 'deg)';
      item.appendChild(img);
    } else {
      // Placeholder while the async first-load fill-in is still rendering.
      var ph = el('span', 'thumb-ph');
      ph.textContent = '📄';
      ph.style.cssText = 'width:100%;padding:28px 0;text-align:center;font-size:30px;background:var(--surface-2);display:block';
      item.appendChild(ph);
    }
    item.appendChild(el('span', 'thumb-num', String(dispIdx + 1)));
    if (t.id === 'organize') {
      var acts = el('div', 'thumb-actions');
      acts.innerHTML =
        '<button class="icon-btn" data-ta="rotl" title="Rotate left">↺</button>' +
        '<button class="icon-btn" data-ta="rotr" title="Rotate right">↻</button>' +
        '<button class="icon-btn" data-ta="del" title="Delete">✕</button>';
      item.appendChild(acts);
    } else if (t.id === 'rotate' || t.id === 'remove-pages' || t.id === 'split') {
      if (st.selected[srcIdx]) item.classList.add('selected');
      if (t.id === 'rotate') {
        var acts2 = el('div', 'thumb-actions');
        acts2.innerHTML =
          '<button class="icon-btn" data-ta="rotl" title="Rotate left">↺</button>' +
          '<button class="icon-btn" data-ta="rotr" title="Rotate right">↻</button>';
        item.appendChild(acts2);
      }
    }
    return item;
  }

  function renderThumbs(ws, t) {
    var st = wsState[t.id];
    var grid = $('[data-thumbs]', ws);
    grid.innerHTML = '';
    if (!st.files.length) return;
    var file = st.files[0];
    if (!C.libs.pdfjs) {
      grid.innerHTML = '<p style="color:var(--muted);font-size:13px">Could not render page previews.</p>';
      return;
    }
    if (!st.thumbCache) st.thumbCache = {};

    /* ---- Phase 1: synchronous DOM rebuild from the thumbnail cache ----
       Runs on EVERY interaction. No PDF.js, no toDataURL, no async chain. */
    var total = st.totalPages || 0;
    if (total) {
      // Initialize display order once for organize. Entries are PER PAGE
      // ({ srcIndex: original page index, rotation }), so build from totalPages,
      // not from the (1-file) st.files list.
      if (t.id === 'organize' && (!st.order || !st.order.length)) {
        st.order = [];
        for (var oi = 0; oi < total; oi++) st.order.push({ srcIndex: oi, rotation: 0 });
      }
      var frag = document.createDocumentFragment();
      if (t.id === 'organize') {
        st.order.forEach(function (entry, disp) {
          frag.appendChild(buildThumbItem(st, t, entry.srcIndex, disp, st.thumbCache[entry.srcIndex]));
        });
      } else {
        for (var i = 0; i < total; i++) {
          frag.appendChild(buildThumbItem(st, t, i, i, st.thumbCache[i]));
        }
      }
      grid.appendChild(frag);
    }
    updateThumbInfo(ws, t);

    /* ---- Phase 2: first-load fill-in ----
       Renders each page ONCE into st.thumbCache (keyed by ORIGINAL page index),
       progressively re-rendering the grid from the cache as pages finish so the
       first load shows pages appearing one by one instead of blanking. If a page
       render fails, a text placeholder goes into the cache and rendering continues. */
    if (st._pdfJsPromise && st._thumbsFile === file) return; // fill-in already in flight (or completed)
    st._pdfJsPromise = null; // stale promise for a different file — refill
    st._thumbsFile = file;
    st.thumbCache = {};
    st._pdfJsPromise = C.loadPdfJs(file.bytes).then(function (pdfJs) {
      st.totalPages = pdfJs.numPages;
      var chain = Promise.resolve();
      for (var p = 1; p <= pdfJs.numPages; p++) {
        (function (pn) {
          var key = pn - 1;
          chain = chain.then(function () {
            if (st.thumbCache[key]) return;
            return C.renderPageToCanvas(pdfJs, pn, 0.35).then(function (r) {
              // Guard: if the file was replaced while rendering, drop stale fills.
              if (st._thumbsFile !== file) return;
              st.thumbCache[key] = { dataUrl: r.canvas.toDataURL('image/jpeg', 0.6), w: r.canvas.width, h: r.canvas.height };
            }).catch(function () {
              if (st._thumbsFile === file) st.thumbCache[key] = { dataUrl: null, w: 0, h: 0 };
            }).then(function () {
              // Rebuild from cache so the freshly rendered page appears (and any
              // later interaction state is preserved). Sync + cache = no flash.
              if (st._thumbsFile === file) renderThumbs(ws, t);
            });
          });
        })(p);
      }
      return chain;
    }).catch(function () {
      if (!st.totalPages) {
        grid.innerHTML = '<p style="color:var(--muted);font-size:13px">Could not render page previews.</p>';
      }
    });
  }

  /* ---------------- Compare stage ---------------- */
  function initCompare(ws, t) {
    var wrap = $('[data-compare]', ws);
    wrap.addEventListener('scroll', function (e) {
      var other = e.target === wrap.children[0] ? wrap.children[1] : wrap.children[0];
      if (other) other.scrollTop = e.target.scrollTop;
    }, true);
  }

  function renderCompare(ws, t) {
    var st = wsState[t.id];
    var wrap = $('[data-compare]', ws);
    wrap.innerHTML = '';
    if (st.files.length < 2) {
      wrap.innerHTML = '<p style="color:var(--muted);font-size:13px;width:100%">Add two PDFs to compare them side by side.</p>';
      return;
    }
    if (!C.libs.pdfjs) return;
    var panes = [st.files[0], st.files[1]].map(function (f, i) {
      var pane = el('div', 'compare-pane');
      pane.innerHTML = '<h4>' + (i === 0 ? 'Original' : 'Modified') + ': ' + esc(f.name) + '</h4>';
      wrap.appendChild(pane);
      return pane;
    });
    var chain = Promise.resolve();
    [0, 1].forEach(function (i) {
      chain = chain.then(function () {
        return C.loadPdfJs(st.files[i].bytes).then(function (pdfJs) {
          return C.renderPageToCanvas(pdfJs, 1, 0.8).then(function (r) {
            var img = el('img');
            img.src = r.canvas.toDataURL('image/jpeg', 0.7);
            img.className = 'compare-canvas';
            panes[i].appendChild(img);
          });
        });
      });
    });
    chain.then(function () {
      // Live text diff
      return Promise.all([C.loadPdfJs(st.files[0].bytes), C.loadPdfJs(st.files[1].bytes)]).then(function (docs) {
        return Promise.all([C.extractTextJoined(docs[0]), C.extractTextJoined(docs[1])]);
      }).then(function (texts) {
        var diff = C.diffLines(texts[0], texts[1]);
        var box = el('div', 'result-files');
        box.style.cssText = 'width:100%;margin-top:12px;max-height:260px;overflow-y:auto';
        box.innerHTML = diff.slice(0, 400).map(function (d) {
          return '<div class="diff-line ' + d.type + '">' + esc(d.text || ' ') + '</div>';
        }).join('');
        wrap.appendChild(box);
      });
    }).catch(function () { /* previews optional */ });
  }

  /* ---------------- Sign stage ---------------- */
  function initSignStage(ws, t) {
    var cv = $('[data-signcanvas]', ws);
    if (!cv) return;
    var ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cv.width, cv.height);
    var drawing = false;
    var lastX = 0, lastY = 0;
    function pos(e) {
      var rect = cv.getBoundingClientRect();
      var scaleX = cv.width / rect.width, scaleY = cv.height / rect.height;
      var p = e.touches ? e.touches[0] : e;
      return { x: (p.clientX - rect.left) * scaleX, y: (p.clientY - rect.top) * scaleY };
    }
    function start(e) {
      e.preventDefault();
      drawing = true;
      var p = pos(e);
      lastX = p.x; lastY = p.y;
    }
    function move(e) {
      if (!drawing) return;
      e.preventDefault();
      var p = pos(e);
      var color = $('#opt-sign-color') ? $('#opt-sign-color').value : '#161616';
      var width = $('#opt-sign-width') ? parseInt($('#opt-sign-width').value, 10) : 3;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastX = p.x; lastY = p.y;
    }
    function end() { drawing = false; }
    cv.addEventListener('mousedown', start);
    cv.addEventListener('mousemove', move);
    cv.addEventListener('mouseup', end);
    cv.addEventListener('mouseleave', end);
    cv.addEventListener('touchstart', start, { passive: false });
    cv.addEventListener('touchmove', move, { passive: false });
    cv.addEventListener('touchend', end);
    // Save on action click
    var btn = $('[data-action]', ws);
    btn.addEventListener('click', function () {
      var st = wsState[t.id];
      var hasInk = false;
      var data = ctx.getImageData(0, 0, cv.width, cv.height).data;
      for (var i = 3; i < data.length; i += 4) {
        if (data[i] > 0) { hasInk = true; break; }
      }
      st.signatureDataUrl = hasInk ? cv.toDataURL('image/png') : null;
    });
  }

  /* ---------------- Crop stage ---------------- */
  function initCropStage(ws, t) {
    var stage = $('[data-cropstage]', ws);
    stage.addEventListener('mousedown', function (e) {
      var rect = stage.getBoundingClientRect();
      var x = e.clientX - rect.left, y = e.clientY - rect.top;
      var cr = el('div', 'crop-rect');
      cr.style.left = x + 'px';
      cr.style.top = y + 'px';
      cr.style.width = '0px';
      cr.style.height = '0px';
      stage.appendChild(cr);
      var dragging = true;
      function onMove(ev) {
        if (!dragging) return;
        var nx = ev.clientX - rect.left, ny = ev.clientY - rect.top;
        var w = Math.abs(nx - x), h = Math.abs(ny - y);
        cr.style.left = Math.min(x, nx) + 'px';
        cr.style.top = Math.min(y, ny) + 'px';
        cr.style.width = w + 'px';
        cr.style.height = h + 'px';
      }
      function onUp() {
        dragging = false;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        var st = wsState[t.id];
        var img = $('img', stage);
        if (!img) return;
        var iw = img.naturalWidth, ih = img.naturalHeight;
        var dispW = img.getBoundingClientRect().width, dispH = img.getBoundingClientRect().height;
        var sx = iw / dispW, sy = ih / dispH;
        var r = cr.getBoundingClientRect();
        var sRect = stage.getBoundingClientRect();
        var x0 = (r.left - sRect.left) * sx / iw;
        var y0 = (r.top - sRect.top) * sy / ih;
        var x1 = (r.right - sRect.left) * sx / iw;
        var y1 = (r.bottom - sRect.top) * sy / ih;
        if (x1 - x0 > 0.02 && y1 - y0 > 0.02) {
          st.cropRect = { x0: x0, y0: y0, x1: x1, y1: y1 };
        }
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function renderCropStage(ws, t) {
    var st = wsState[t.id];
    var stage = $('[data-cropstage]', ws);
    stage.innerHTML = '';
    if (!st.files.length) { stage.style.display = 'none'; return; }
    if (!C.libs.pdfjs) return;
    stage.style.display = 'inline-block';
    var file = st.files[0];
    C.loadPdfJs(file.bytes).then(function (pdfJs) {
      var total = pdfJs.numPages;
      var nav = el('div');
      nav.style.cssText = 'margin-bottom:8px;display:flex;gap:8px;align-items:center';
      nav.innerHTML =
        '<button class="btn btn-ghost btn-sm" data-cp="prev">‹ Prev</button>' +
        '<span style="font-size:13px;color:var(--muted)">Page <span data-cpnum>' + (st.currentPage + 1) + '</span> / ' + total + '</span>' +
        '<button class="btn btn-ghost btn-sm" data-cp="next">Next ›</button>';
      stage.appendChild(nav);
      function draw() {
        var img = $('img', stage);
        if (img) img.remove();
        var cr = $('.crop-rect', stage);
        if (cr) cr.remove();
        C.renderPageToCanvas(pdfJs, st.currentPage + 1, 1.2).then(function (r) {
          var img = el('img');
          img.src = r.canvas.toDataURL('image/jpeg', 0.85);
          stage.appendChild(img);
          if (st.cropRect) {
            var cr = el('div', 'crop-rect');
            cr.style.left = (st.cropRect.x0 * 100) + '%';
            cr.style.top = (st.cropRect.y0 * 100) + '%';
            cr.style.width = ((st.cropRect.x1 - st.cropRect.x0) * 100) + '%';
            cr.style.height = ((st.cropRect.y1 - st.cropRect.y0) * 100) + '%';
            stage.appendChild(cr);
          }
        });
      }
      nav.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-cp]');
        if (!b) return;
        if (b.getAttribute('data-cp') === 'prev' && st.currentPage > 0) st.currentPage--;
        if (b.getAttribute('data-cp') === 'next' && st.currentPage < total - 1) st.currentPage++;
        $('[data-cpnum]', nav).textContent = st.currentPage + 1;
        draw();
      });
      draw();
    }).catch(function () { stage.style.display = 'none'; });
  }

  /* ---------------- Edit stage ---------------- */
  function initEditStage(ws, t) {
    var stage = $('[data-editstage]', ws);
    var toolbar = $('#edit-toolbar');
    if (toolbar) {
      toolbar.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-tool]');
        if (!b) return;
        $all('button', toolbar).forEach(function (x) { x.classList.toggle('active', x === b); });
      });
    }
    stage.addEventListener('mousedown', function (e) {
      var tool = toolbar ? ($('.active', toolbar) ? $('.active', toolbar).getAttribute('data-tool') : 'text') : 'text';
      var canvas = $('canvas[data-editcanvas]', stage);
      if (!canvas) return;
      var rect = canvas.getBoundingClientRect();
      var sx = canvas.width / rect.width, sy = canvas.height / rect.height;
      var x = (e.clientX - rect.left) * sx, y = (e.clientY - rect.top) * sy;
      var st = wsState[t.id];
      var color = $('#opt-edit-color') ? $('#opt-edit-color').value : '#e5322d';
      var size = parseInt($('#opt-edit-size') ? $('#opt-edit-size').value : '18', 10) || 18;
      var scale = 1.5;
      if (tool === 'text' || tool === 'comment') {
        var txt = window.prompt(tool === 'text' ? 'Enter text:' : 'Enter comment:');
        if (txt === null) return;
        st.annotations.push({ type: tool, text: txt, x: x, y: y, page: st.currentPage, scale: scale, color: color, size: size });
        redrawEditOverlay(ws, t);
      } else {
        var startX = x, startY = y;
        var ghost = el('div');
        ghost.style.cssText = 'position:absolute;border:1.5px dashed var(--accent);pointer-events:none;z-index:5';
        stage.appendChild(ghost);
        function onMove(ev) {
          var nx = (ev.clientX - rect.left) * sx, ny = (ev.clientY - rect.top) * sy;
          ghost.style.left = Math.min(startX, nx) / sx + 'px';
          ghost.style.top = Math.min(startY, ny) / sy + 'px';
          ghost.style.width = Math.abs(nx - startX) / sx + 'px';
          ghost.style.height = Math.abs(ny - startY) / sy + 'px';
        }
        function onUp(ev) {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          ghost.remove();
          var nx = (ev.clientX - rect.left) * sx, ny = (ev.clientY - rect.top) * sy;
          var w = Math.abs(nx - startX), h = Math.abs(ny - startY);
          if (w < 4 && h < 4) return;
          st.annotations.push({
            type: tool, x: Math.min(startX, nx), y: Math.min(startY, ny),
            w: w, h: h, page: st.currentPage, scale: scale, color: color, size: size
          });
          redrawEditOverlay(ws, t);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      }
    });
  }

  function redrawEditOverlay(ws, t) {
    var stage = $('[data-editstage]', ws);
    var canvas = $('canvas[data-editcanvas]', stage);
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var st = wsState[t.id];
    st.annotations.filter(function (a) { return a.page === st.currentPage; }).forEach(function (a) {
      ctx.strokeStyle = a.color;
      ctx.fillStyle = a.color;
      ctx.lineWidth = 2;
      if (a.type === 'text') {
        ctx.font = (a.size || 18) + 'px sans-serif';
        ctx.fillText(a.text, a.x, a.y);
      } else if (a.type === 'comment') {
        ctx.font = '12px sans-serif';
        ctx.fillText('💬 ' + a.text, a.x, a.y);
      } else if (a.type === 'highlight') {
        ctx.fillStyle = 'rgba(255, 230, 60, 0.45)';
        ctx.fillRect(a.x, a.y - (a.size || 18) * 0.8, (a.text || 'Text').length * (a.size || 18) * 0.55, (a.size || 18) * 1.1);
      } else if (a.type === 'rect') {
        ctx.strokeRect(a.x, a.y, a.w, a.h);
      } else if (a.type === 'line') {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(a.x + a.w, a.y + a.h);
        ctx.stroke();
      }
    });
  }

  function renderEditStage(ws, t) {
    var st = wsState[t.id];
    var stage = $('[data-editstage]', ws);
    stage.innerHTML = '';
    if (!st.files.length) { stage.style.display = 'none'; return; }
    if (!C.libs.pdfjs) return;
    stage.style.display = 'inline-block';
    var file = st.files[0];
    C.loadPdfJs(file.bytes).then(function (pdfJs) {
      var total = pdfJs.numPages;
      var nav = el('div');
      nav.style.cssText = 'margin-bottom:8px;display:flex;gap:8px;align-items:center';
      nav.innerHTML =
        '<button class="btn btn-ghost btn-sm" data-ep="prev">‹ Prev</button>' +
        '<span style="font-size:13px;color:var(--muted)">Page <span data-epnum>' + (st.currentPage + 1) + '</span> / ' + total + '</span>' +
        '<button class="btn btn-ghost btn-sm" data-ep="next">Next ›</button>';
      stage.appendChild(nav);
      function draw() {
        var old = $('canvas[data-editcanvas]', stage);
        if (old) old.remove();
        C.renderPageToCanvas(pdfJs, st.currentPage + 1, 1.5).then(function (r) {
          var canvas = r.canvas;
          canvas.setAttribute('data-editcanvas', '');
          canvas.style.maxWidth = '100%';
          stage.appendChild(canvas);
          redrawEditOverlay(ws, t);
        });
      }
      nav.addEventListener('click', function (e) {
        var b = e.target.closest('button[data-ep]');
        if (!b) return;
        if (b.getAttribute('data-ep') === 'prev' && st.currentPage > 0) st.currentPage--;
        if (b.getAttribute('data-ep') === 'next' && st.currentPage < total - 1) st.currentPage++;
        $('[data-epnum]', nav).textContent = st.currentPage + 1;
        draw();
      });
      draw();
    }).catch(function () { stage.style.display = 'none'; });
  }

  /* ---------------- Form fields stage ---------------- */
  function initFormFields(ws, t) {
    var box = $('[data-formfields]', ws);
    box.addEventListener('input', function (e) {
      var st = wsState[t.id];
      var inp = e.target;
      var name = inp.getAttribute('data-fname');
      if (!name) return;
      if (inp.type === 'checkbox') st.formValues[name] = inp.checked;
      else st.formValues[name] = inp.value;
    });
  }

  function renderFormFields(ws, t) {
    var st = wsState[t.id];
    var box = $('[data-formfields]', ws);
    box.innerHTML = '';
    if (!st.files.length) return;
    if (!C.libs.PDFLib) return;
    C.loadPdfDoc(st.files[0].bytes).then(function (doc) {
      var fields;
      try { fields = doc.getForm().getFields(); } catch (e) { fields = []; }
      if (!fields.length) {
        box.innerHTML = '<p style="color:var(--muted);font-size:13px">No fillable form fields detected in this PDF.</p>';
        return;
      }
      fields.forEach(function (f) {
        var name = f.getName();
        var row = el('div', 'form-field-row');
        var label = el('label', 'opt-label', esc(name));
        label.style.minWidth = '150px';
        row.appendChild(label);
        // pdf-lib 1.17.1 is minified — constructor.name is mangled, so use
        // instanceof (code-critic finding: PDFCheckBox/PDFDropdown/PDFRadioGroup
        // never matched, rendering every field as a text input).
        var L = C.libs.PDFLib;
        if (f instanceof L.PDFCheckBox) {
          var cb = el('input');
          cb.type = 'checkbox';
          cb.setAttribute('data-fname', name);
          row.appendChild(cb);
        } else if (f instanceof L.PDFRadioGroup || f instanceof L.PDFDropdown) {
          var sel = el('select');
          sel.setAttribute('data-fname', name);
          var options = [];
          try { options = f.getOptions(); } catch (e) { options = []; }
          options.forEach(function (o) {
            // Build options safely (textContent, not innerHTML) — a malicious
            // PDF could embed <img onerror> in an option value (P2 finding).
            var opt = document.createElement('option');
            opt.value = o;
            opt.textContent = o;
            sel.appendChild(opt);
          });
          row.appendChild(sel);
        } else {
          var inp = el('input');
          inp.type = 'text';
          inp.placeholder = 'Enter value…';
          inp.setAttribute('data-fname', name);
          row.appendChild(inp);
        }
        box.appendChild(row);
      });
    }).catch(function () {
      box.innerHTML = '<p style="color:var(--muted);font-size:13px">Could not read form fields.</p>';
    });
  }

  /* ---------------- Routing ---------------- */
  function showHome() {
    $all('.view').forEach(function (v) { v.classList.remove('active'); });
    $all('.workspace').forEach(function (w) { w.classList.remove('active'); });
    $('#view-home').classList.add('active');
    window.scrollTo(0, 0);
  }

  function openTool(id) {
    var t = TOOLS[id];
    if (!t) { showHome(); return; }
    $all('.view').forEach(function (v) { v.classList.remove('active'); });
    $all('.workspace').forEach(function (w) { w.classList.remove('active'); });
    var ws = $('#ws-' + id);
    if (!ws) { showHome(); return; }
    ws.classList.add('active');
    window.scrollTo(0, 0);
  }

  function route() {
    var hash = location.hash || '';
    var m = hash.match(/^#tool-(.+)$/);
    if (m && TOOLS[m[1]]) openTool(m[1]);
    else showHome();
  }

  /* ---------------- Hero dropzone + tool chooser ---------------- */
  function initHero() {
    var dz = $('#hero-dropzone');
    var input = $('#hero-file');
    $('#hero-select').addEventListener('click', function () { input.click(); });
    input.addEventListener('change', function () {
      if (input.files.length) {
        // Snapshot the FileList BEFORE clearing the input — the chooser's
        // click handler runs later, and input.value='' would empty the
        // live FileList, losing the files (completeness-critic finding).
        var snapshot = Array.prototype.slice.call(input.files);
        chooseToolForFiles(snapshot);
      }
      input.value = '';
    });
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('dragover'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('dragover'); });
    });
    dz.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files.length) chooseToolForFiles(e.dataTransfer.files);
    });
  }

  function chooseToolForFiles(fileList) {
    var pdfTools = Object.keys(TOOLS).filter(function (id) {
      return TOOLS[id].accept.indexOf('pdf') !== -1;
    });
    var overlay = el('div', 'chooser-overlay');
    var box = el('div', 'chooser');
    box.innerHTML =
      '<h3>Choose a tool</h3>' +
      '<p style="color:var(--muted);font-size:13.5px;margin-bottom:16px">' + fileList.length + ' file(s) selected. Pick what you want to do:</p>' +
      '<div class="chooser-grid"></div>' +
      '<button class="btn btn-ghost btn-sm" data-close style="margin-top:16px">Cancel</button>';
    var grid = $('.chooser-grid', box);
    pdfTools.forEach(function (id) {
      var t = TOOLS[id];
      var b = el('button', 'chooser-item');
      b.innerHTML = '<span class="tool-icon" style="background:' + t.color + '1a;color:' + t.color + '">' + t.icon + '</span><span>' + t.title + '</span>';
      b.addEventListener('click', function () {
        document.body.removeChild(overlay);
        location.hash = '#tool-' + id;
        openTool(id);
        var ws = $('#ws-' + id);
        if (ws) addFiles(ws, TOOLS[id], fileList);
      });
      grid.appendChild(b);
    });
    $('[data-close]', box).addEventListener('click', function () { document.body.removeChild(overlay); });
    overlay.appendChild(box);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) document.body.removeChild(overlay);
    });
    document.body.appendChild(overlay);
  }

  /* ---------------- Legal modal (Privacy / Terms) ---------------- */
  var LEGAL_CONTENT = {
    privacy: {
      title: 'Privacy Policy',
      body:
        '<p>This application ("FreeDF Tools") is a free, open, client-side PDF tool. This policy explains what happens to your data when you use it.</p>' +
        '<h3>Your files stay on your device</h3>' +
        '<p>All document processing — merging, splitting, compressing, converting, encrypting, OCR and every other tool — runs entirely in your browser using JavaScript. <strong>Your files are never uploaded to any server.</strong> There is no backend, no cloud storage, and no third party ever receives your documents.</p>' +
        '<h3>What we do not collect</h3>' +
        '<ul>' +
        '<li>No account, email, or personal information is required or collected.</li>' +
        '<li>No analytics, tracking cookies, or fingerprinting scripts are used.</li>' +
        '<li>No document content, file names, or metadata leaves your device.</li>' +
        '</ul>' +
        '<h3>Local storage</h3>' +
        '<p>The only thing stored on your device is a single preference — your light/dark theme choice — saved in your browser\'s localStorage. It never leaves your browser and can be cleared at any time.</p>' +
        '<h3>Third-party libraries</h3>' +
        '<p>The app loads open-source libraries (pdf-lib, PDF.js, JSZip, Tesseract.js) from a public CDN. Loading these scripts may reveal your IP address to the CDN provider, as with any website. No document data is involved in these requests.</p>' +
        '<h3>Your control</h3>' +
        '<p>Because nothing is stored or transmitted, there is nothing to delete or export. Close the tab and your session is gone. For OCR, the language model is downloaded to your browser cache on first use.</p>'
    },
    terms: {
      title: 'Terms of Service',
      body:
        '<p>By using this application ("FreeDF Tools") you agree to the following terms.</p>' +
        '<h3>1. Free, client-side service</h3>' +
        '<p>This app is provided free of charge. All processing happens locally in your browser; no files are uploaded, stored, or processed on any server.</p>' +
        '<h3>2. No warranty</h3>' +
        '<p>The app is provided "as is" without warranty of any kind, express or implied. We do not guarantee that outputs are error-free, that every PDF will process correctly, or that results are suitable for any particular purpose. You use the tools at your own discretion.</p>' +
        '<h3>3. Your responsibility</h3>' +
        '<p>You are responsible for the files you process and for verifying outputs before relying on them. Do not use this app for documents where an error could cause harm (legal, medical, financial, or otherwise) without independent verification. Redaction and encryption are provided as tools — you are responsible for confirming they meet your security needs.</p>' +
        '<h3>4. Acceptable use</h3>' +
        '<p>You agree not to use the app to process unlawful content or to attempt to compromise the app, its libraries, or other users.</p>' +
        '<h3>5. Intellectual property</h3>' +
        '<p>The app is a free, non-commercial PDF tool, independent and unaffiliated with any other PDF service or software company.</p>' +
        '<h3>6. Changes</h3>' +
        '<p>These terms may be updated at any time. Continued use of the app after changes constitutes acceptance of the revised terms.</p>'
    }
  };

  function initLegalModal() {
    var overlay = $('#legal-modal');
    if (!overlay) return;
    var title = $('#modal-title');
    var body = $('#modal-body');
    var closeBtn = $('.modal-close', overlay);

    function openModal(key) {
      var c = LEGAL_CONTENT[key];
      if (!c) return;
      title.textContent = c.title;
      body.innerHTML = c.body;
      overlay.hidden = false;
      closeBtn.focus();
      document.body.style.overflow = 'hidden';
    }
    function closeModal() {
      overlay.hidden = true;
      document.body.style.overflow = '';
    }

    $all('[data-modal]').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault();
        openModal(link.getAttribute('data-modal'));
      });
    });
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) closeModal();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !overlay.hidden) closeModal();
    });
  }

  /* ---------------- Header / nav / misc ---------------- */
  function initHeader() {
    // Dropdowns
    $all('.dropdown-toggle').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var dd = btn.parentElement;
        var open = dd.classList.contains('open');
        $all('.dropdown.open').forEach(function (d) { d.classList.remove('open'); });
        if (!open) dd.classList.add('open');
        btn.setAttribute('aria-expanded', String(!open));
      });
    });
    document.addEventListener('click', function () {
      $all('.dropdown.open').forEach(function (d) { d.classList.remove('open'); });
    });
    // Hamburger
    var ham = $('#hamburger');
    ham.addEventListener('click', function () {
      var nav = $('#main-nav');
      var open = nav.classList.toggle('open');
      ham.setAttribute('aria-expanded', String(open));
    });
    // Demo buttons
    $all('[data-demo]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        toast('Demo — this clone is 100% free, no account needed');
      });
    });
    // data-goto links
    $all('[data-goto]').forEach(function (a) {
      a.addEventListener('click', function () {
        var id = a.getAttribute('data-goto');
        if (TOOLS[id]) {
          location.hash = '#tool-' + id;
          openTool(id);
        }
      });
    });
    // data-nav home
    $all('[data-nav]').forEach(function (a) {
      a.addEventListener('click', function () {
        location.hash = '#home';
        showHome();
      });
    });
  }

  /* ---------------- Init ---------------- */
  function init() {
    buildGrid();
    buildNav();
    initTabs();
    initHeader();
    initLegalModal();
    initHero();
    Object.keys(TOOLS).forEach(function (id) { buildWorkspace(TOOLS[id]); });
    window.addEventListener('hashchange', route);
    route();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
