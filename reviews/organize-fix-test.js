/* Organize/thumbnail-UI fix verification — run via:
   node reviews/cdp.js "http://localhost:8123/" reviews/organize-fix-test.js --fresh-profile
   Returns JSON { checks: [{name, ok, detail}], timings: {...}, captures: {...} }.
   Verifies: cache-first sync renders (<50ms, no blanking, no re-rasterization),
   organize display-order grid + drag reorder (st.order + grid + output PDF),
   delete, remove-pages realtime selection + correct output, rotate tool output. */
(async () => {
  const out = { checks: [], timings: {}, captures: {} };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const check = (name, ok, detail) => out.checks.push({ name, ok: !!ok, detail: detail || '' });
  try {

  /* ---- instrument PDF.js page rendering with a counter (cache probe) ---- */
  let renderCount = 0;
  const origRender = PDFCore.renderPageToCanvas.bind(PDFCore);
  PDFCore.renderPageToCanvas = function () { renderCount++; return origRender.apply(PDFCore, arguments); };

  /* ---- capture opts + result bytes of each wrapped tool at UI-action time ---- */
  function wrapTool(id) {
    const orig = window.ToolOrganize[id].process;
    window.ToolOrganize[id].process = function (files, opts, ui) {
      out.captures[id] = { opts: JSON.parse(JSON.stringify(opts)) };
      return orig.call(this, files, opts, ui).then(res => {
        if (res && res.bytes) out.captures[id].bytes = Array.from(res.bytes);
        return res;
      });
    };
  }
  ['organize', 'removePages', 'rotate'].forEach(wrapTool);

  /* ---- helpers ---- */
  async function setFile(ws, name, path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error('fetch ' + path + ' -> ' + r.status);
    const buf = await r.arrayBuffer();
    const input = ws.querySelector('input[data-input]');
    const dt = new DataTransfer();
    dt.items.add(new File([buf], name, { type: 'application/pdf' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function waitThumbs(ws, n, timeoutMs) {
    const t0 = Date.now();
    for (;;) {
      const items = ws.querySelectorAll('.thumb-item');
      const imgs = ws.querySelectorAll('.thumb-item img');
      if (items.length >= n && imgs.length >= n) { await sleep(250); return true; }
      if (Date.now() - t0 > (timeoutMs || 20000)) return false;
      await sleep(200);
    }
  }

  function gridInfo(ws) {
    return Array.prototype.map.call(ws.querySelectorAll('.thumb-item'), it => ({
      idx: it.getAttribute('data-idx'),
      src: (it.querySelector('img') || {}).src || null,
      sel: it.classList.contains('selected'),
      transform: (it.querySelector('img') || {}).style ? it.querySelector('img').style.transform : ''
    }));
  }

  async function pdfTextPerPage(bytesArr) {
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytesArr).slice(0) }).promise;
    const texts = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent();
      texts.push((tc.items || []).map(i => i.str || '').join(' '));
    }
    return texts;
  }

  async function pdfRotationsPerPage(bytesArr) {
    const doc = await PDFLib.PDFDocument.load(new Uint8Array(bytesArr));
    const arr = [];
    for (let i = 0; i < doc.getPageCount(); i++) arr.push(doc.getPage(i).getRotation().angle);
    return arr;
  }

  async function runAction(ws) {
    ws.querySelector('[data-action]').click();
    for (let i = 0; i < 80; i++) {
      await sleep(250);
      const rw = ws.querySelector('[data-result]');
      if (rw && rw.classList.contains('show')) return true;
      const toast = document.getElementById('toast');
      if (toast && toast.classList.contains('show') && /failed|error|select|at least|no valid/i.test(toast.textContent)) {
        out.lastToast = toast.textContent;
        return false;
      }
    }
    return false;
  }

  function openTool(id) {
    location.hash = '#tool-' + id;
  }

  /* ================= T1: organize — first load + cache + sync rotate ================= */
  {
    openTool('organize');
    await sleep(500);
    const ws = document.getElementById('ws-organize');
    await setFile(ws, 'test.pdf', '/test.pdf');
    const okLoad = await waitThumbs(ws, 3);
    check('T1 organize: 3 thumbnails load', okLoad, 'grid items=' + ws.querySelectorAll('.thumb-item').length);
    const g0 = gridInfo(ws);
    const srcs0 = g0.map(g => g.src);
    check('T1 organize: data-idx 0,1,2 on first load', JSON.stringify(g0.map(g => g.idx)) === '["0","1","2"]', JSON.stringify(g0.map(g => g.idx)));

    const rcBefore = renderCount;
    const t0 = performance.now();
    ws.querySelector('.thumb-item [data-ta="rotr"]').click(); // must be fully synchronous
    const syncMs = performance.now() - t0;
    const rcAfter = renderCount;
    out.timings.organizeRotateMs = Math.round(syncMs * 100) / 100;

    const g1 = gridInfo(ws);
    check('T1 organize: rotate is synchronous (<50ms)', syncMs < 50, syncMs.toFixed(2) + 'ms');
    check('T1 organize: grid not blanked after rotate', g1.length === 3 && g1.every(g => g.src), 'items=' + g1.length);
    check('T1 organize: thumbnails reused from cache (no re-rasterize)', rcAfter === rcBefore, 'renderPageToCanvas calls ' + rcBefore + ' -> ' + rcAfter);
    check('T1 organize: rotation applied instantly', g1[0].transform === 'rotate(90deg)', 'transform=' + g1[0].transform);
    check('T1 organize: img srcs unchanged (cache hit)', JSON.stringify(g1.map(g => g.src)) === JSON.stringify(srcs0), 'all 3 srcs identical');

    // rotate back
    ws.querySelector('.thumb-item [data-ta="rotl"]').click();
    const g2 = gridInfo(ws);
    check('T1 organize: rotate left restores 0deg', g2[0].transform === '', 'transform=' + JSON.stringify(g2[0].transform));
  }

  /* ================= T2: organize — drag reorder (0 -> 2) ================= */
  {
    const ws = document.getElementById('ws-organize');
    let items = ws.querySelectorAll('.thumb-item');
    for (let i = 0; i < 100 && items.length < 3; i++) { await sleep(200); items = ws.querySelectorAll('.thumb-item'); }
    check('T2 organize: grid ready with 3 items', items.length === 3, 'items=' + items.length);
    if (items.length < 3) { /* skip rest of T2 */ } else {
    const srcsBefore = gridInfo(ws).map(g => g.src);
    const rcBefore = renderCount;
    const dt = new DataTransfer();
    items[0].dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt }));
    items[2].dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
    const rcAfter = renderCount;
    const g = gridInfo(ws);
    const srcsAfter = g.map(x => x.src);

    const orderOK = JSON.stringify(srcsAfter) === JSON.stringify([srcsBefore[1], srcsBefore[2], srcsBefore[0]]);
    check('T2 organize: drop reorders grid (src order [P2,P3,P1])', orderOK,
      'after=' + srcsAfter.map(s => s.slice(-14)).join('|'));
    check('T2 organize: data-idx stays contiguous display indices', JSON.stringify(g.map(x => x.idx)) === '["0","1","2"]', JSON.stringify(g.map(x => x.idx)));
    check('T2 organize: reorder render is sync from cache (no re-rasterize)', rcAfter === rcBefore, 'renderPageToCanvas ' + rcBefore + ' -> ' + rcAfter);

    // st.order ground truth via the wrapped process + output PDF
    const done = await runAction(ws);
    check('T2 organize: process ran (reordered 3 pages)', done, out.lastToast || '');
    const cap = out.captures.organize;
    if (cap) {
      const orderArr = (cap.opts.order || []).map(o => o.srcIndex);
      check('T2 organize: st.order srcIndex sequence [1,2,0]', JSON.stringify(orderArr) === '[1,2,0]', 'order=' + JSON.stringify(cap.opts.order));
      const texts = await pdfTextPerPage(cap.bytes);
      out.captures.organize.texts = texts;
      const t0 = texts[0] || '', t1 = texts[1] || '', t2 = texts[2] || '';
      check('T2 organize: output PDF page order [P2,P3,P1]', /Page 2/.test(t0) && /Page 3/.test(t1) && /Page 1/.test(t2),
        '[' + t0.slice(0, 20) + ' | ' + t1.slice(0, 20) + ' | ' + t2.slice(0, 20) + ']');
    } else {
      check('T2 organize: process captured', false, 'no capture');
    }
    }
  }

  /* ================= T3: organize — delete first displayed entry ================= */
  {
    const ws = document.getElementById('ws-organize');
    let items = ws.querySelectorAll('.thumb-item');
    for (let i = 0; i < 100 && items.length < 2; i++) { await sleep(200); items = ws.querySelectorAll('.thumb-item'); }
    check('T3 organize: grid ready', items.length >= 2, 'items=' + items.length);
    if (items.length < 2) { /* skip */ } else {
    const srcsBefore = gridInfo(ws).map(g => g.src); // current display order (after T2 reorder)
    const orderBefore = JSON.parse(JSON.stringify(__wsState.organize.order));
    const rcBefore = renderCount;
    const t0 = performance.now();
    items[0].querySelector('[data-ta="del"]').click(); // delete first displayed item
    const syncMs = performance.now() - t0;
    const rcAfter = renderCount;
    out.timings.organizeDeleteMs = Math.round(syncMs * 100) / 100;
    const g = gridInfo(ws);
    const srcsAfter = g.map(x => x.src);
    check('T3 organize: delete is synchronous (<50ms), grid intact', syncMs < 50 && g.length === srcsBefore.length - 1, syncMs.toFixed(2) + 'ms');
    check('T3 organize: remaining grid = display order minus first', JSON.stringify(srcsAfter) === JSON.stringify(srcsBefore.slice(1)),
      srcsAfter.map(s => s.slice(-14)).join('|'));
    check('T3 organize: delete render from cache (no re-rasterize)', rcAfter === rcBefore, 'renderPageToCanvas ' + rcBefore + ' -> ' + rcAfter);
    const orderAfter = JSON.parse(JSON.stringify(__wsState.organize.order));
    const keptSrcs = orderAfter.map(o => o.srcIndex);
    const expectedKept = orderBefore.slice(1).map(o => o.srcIndex);
    check('T3 organize: st.order srcIndex set preserved (no remap to contiguous)', JSON.stringify(keptSrcs) === JSON.stringify(expectedKept),
      'srcIndexes=' + JSON.stringify(keptSrcs));

    const done = await runAction(ws);
    check('T3 organize: process ran after delete', done, out.lastToast || '');
    const cap = out.captures.organize;
    if (cap) {
      const orderArr = (cap.opts.order || []).map(o => o.srcIndex);
      check('T3 organize: st.order in capture matches UI state', JSON.stringify(orderArr) === JSON.stringify(keptSrcs), 'order=' + JSON.stringify(cap.opts.order));
      const texts = await pdfTextPerPage(cap.bytes);
      const firstText = (texts[0] || '').slice(0, 30);
      const pageN = (firstText.match(/Page (\d)/) || [])[1];
      check('T3 organize: output PDF first page matches first kept srcIndex', pageN === String(keptSrcs[0] + 1),
        'output first page text: ' + firstText + ' | expected srcIndex ' + keptSrcs[0] + ' (Page ' + (keptSrcs[0] + 1) + ')');
      check('T3 organize: output PDF page count = ' + (srcsBefore.length - 1), texts.length === srcsBefore.length - 1, texts.length + ' pages');
    }
    }
  }

  /* ================= T4: remove-pages — realtime selection + output ================= */
  {
    openTool('remove-pages');
    await sleep(500);
    const ws = document.getElementById('ws-remove-pages');
    await setFile(ws, 'test.pdf', '/test.pdf');
    const okLoad = await waitThumbs(ws, 3);
    check('T4 remove-pages: 3 thumbnails load', okLoad, 'items=' + ws.querySelectorAll('.thumb-item').length);

    const rcBefore = renderCount;
    const t0 = performance.now();
    ws.querySelectorAll('.thumb-item')[0].click(); // select page 1
    const syncMs = performance.now() - t0;
    const rcAfter = renderCount;
    out.timings.removePagesSelectMs = Math.round(syncMs * 100) / 100;

    const g1 = gridInfo(ws);
    check('T4 remove-pages: selection toggles synchronously (<50ms)', syncMs < 50, syncMs.toFixed(2) + 'ms');
    check('T4 remove-pages: selected class applied, grid intact', g1.length === 3 && g1[0].sel && !g1[1].sel && !g1[2].sel,
      'sel=[' + g1.map(g => g.sel) + ']');
    check('T4 remove-pages: no re-rasterize on select', rcAfter === rcBefore, 'renderPageToCanvas ' + rcBefore + ' -> ' + rcAfter);

    ws.querySelectorAll('.thumb-item')[2].click(); // select page 3 too
    const g2 = gridInfo(ws);
    const info = document.getElementById('opt-remove-info');
    check('T4 remove-pages: second select instant + info line updated', g2[0].sel && g2[2].sel && /2 of 3/.test(info.textContent),
      'sel=[' + g2.map(g => g.sel) + '] info="' + info.textContent + '"');

    const done = await runAction(ws);
    check('T4 remove-pages: process ran', done, out.lastToast || '');
    const cap = out.captures.removePages;
    if (cap) {
      check('T4 remove-pages: opts.removePages [0,2]', JSON.stringify(cap.opts.removePages) === '[0,2]', 'removePages=' + JSON.stringify(cap.opts.removePages));
      const texts = await pdfTextPerPage(cap.bytes);
      check('T4 remove-pages: output = page 2 only', texts.length === 1 && /Page 2/.test(texts[0] || ''), texts.length + ' page(s): ' + (texts[0] || '').slice(0, 30));
    }
  }

  /* ================= T5: rotate tool — select + rotate a page ================= */
  {
    openTool('rotate');
    await sleep(500);
    const ws = document.getElementById('ws-rotate');
    await setFile(ws, 'test.pdf', '/test.pdf');
    const okLoad = await waitThumbs(ws, 3);
    check('T5 rotate: 3 thumbnails load', okLoad, 'items=' + ws.querySelectorAll('.thumb-item').length);

    const rcBefore = renderCount;
    const t0 = performance.now();
    ws.querySelectorAll('.thumb-item')[0].click(); // select page 1
    const syncMs = performance.now() - t0;
    const rcAfter = renderCount;
    out.timings.rotateSelectMs = Math.round(syncMs * 100) / 100;
    check('T5 rotate: selection sync (<50ms), grid intact', syncMs < 50 && ws.querySelectorAll('.thumb-item').length === 3, syncMs.toFixed(2) + 'ms');
    check('T5 rotate: no re-rasterize on select', rcAfter === rcBefore, 'renderPageToCanvas ' + rcBefore + ' -> ' + rcAfter);

    const rcb = renderCount;
    ws.querySelector('.thumb-item [data-ta="rotr"]').click(); // per-thumb rotate button (UI only)
    check('T5 rotate: per-thumb rotate instant from cache', renderCount === rcb && gridInfo(ws)[0].transform === 'rotate(90deg)',
      'transform=' + gridInfo(ws)[0].transform);

    // scope=select, direction=right (default) -> only selected page 0 rotates
    ws.querySelector('.seg[data-seg="scope"] button[data-val="select"]').click();
    const done = await runAction(ws);
    check('T5 rotate: process ran (scope=select, page 0)', done, out.lastToast || '');
    const cap = out.captures.rotate;
    if (cap) {
      check('T5 rotate: opts.selectedPages [0]', JSON.stringify(cap.opts.selectedPages) === '[0]', 'selectedPages=' + JSON.stringify(cap.opts.selectedPages));
      const rots = await pdfRotationsPerPage(cap.bytes);
      check('T5 rotate: output rotation [90,0,0]', JSON.stringify(rots) === '[90,0,0]', 'rotations=' + JSON.stringify(rots));
    }
  }

  /* ================= T6: cache exists + end-state ================= */
  {
    const ws = document.getElementById('ws-organize');
    const items = ws.querySelectorAll('.thumb-item');
    check('T6: cache-first renders leave no placeholder in DOM', Array.prototype.every.call(items, it => it.querySelector('img')), 'items=' + items.length);
    check('T6: thumbCache keyed by original page index, one entry per page',
      !!__wsState.organize.thumbCache && Object.keys(__wsState.organize.thumbCache).length >= 3 &&
      [0, 1, 2].every(k => __wsState.organize.thumbCache[k] && __wsState.organize.thumbCache[k].dataUrl),
      'cache keys=' + JSON.stringify(Object.keys(__wsState.organize.thumbCache || {})) + ' w=' + (__wsState.organize.thumbCache[0] || {}).w + ' h=' + (__wsState.organize.thumbCache[0] || {}).h);
  }

  out.renderPageToCanvasCalls = renderCount;
  return out;
  } catch (e) {
    out.fatalError = String(e && e.stack || e);
    out.checks.push({ name: 'SCRIPT COMPLETED WITHOUT FATAL ERROR', ok: false, detail: String(e && e.message || e) });
    return out;
  }
})()
