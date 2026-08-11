/* Tool E2E driver — defines window.__runTools(spec). */
window.__runTools = async function (spec) {
  const results = [];
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function makeFile(name, type, path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error('fetch ' + path + ' -> ' + r.status);
    const buf = await r.arrayBuffer();
    return new File([buf], name, { type });
  }

  async function setFiles(ws, files) {
    const input = ws.querySelector('input[data-input]');
    const dt = new DataTransfer();
    for (const fd of files) {
      const f = await makeFile(fd.name, fd.type, fd.path);
      dt.items.add(f);
    }
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await sleep(1500);
  }

  async function setOpts(ws, opts) {
    for (const [key, val] of Object.entries(opts || {})) {
      const el = ws.querySelector('#' + key);
      if (!el) continue;
      if (el.type === 'checkbox') { el.checked = !!val; el.dispatchEvent(new Event('change', { bubbles: true })); }
      else if (el.tagName === 'SELECT') { el.value = val; el.dispatchEvent(new Event('change', { bubbles: true })); }
      else { el.value = val; el.dispatchEvent(new Event('input', { bubbles: true })); }
    }
  }

  async function clickSeg(ws, segName, val) {
    const seg = ws.querySelector('.seg[data-seg="' + segName + '"]');
    if (!seg) return;
    const btn = seg.querySelector('button[data-val="' + val + '"]');
    if (btn) btn.click();
    await sleep(150);
  }

  async function runTool(t) {
    const r = { id: t.id, ok: false, error: null, result: null, downloaded: null };
    try {
      location.hash = '#tool-' + t.id;
      await sleep(500);
      const ws = document.getElementById('ws-' + t.id);
      if (!ws) throw new Error('workspace not found');
      if (t.files) await setFiles(ws, t.files);
      if (t.segs) for (const [s, v] of Object.entries(t.segs)) await clickSeg(ws, s, v);
      if (t.opts) await setOpts(ws, t.opts);
      if (t.extra) await t.extra(ws);
      const btn = ws.querySelector('[data-action]');
      btn.click();
      let done = false;
      for (let i = 0; i < 200 && !done; i++) {
        await sleep(500);
        const rw = ws.querySelector('[data-result]');
        if (rw && rw.classList.contains('show')) { done = true; r.result = rw.textContent.slice(0, 300); }
        const toast = document.getElementById('toast');
        if (toast && toast.classList.contains('show') && /failed|error|incorrect|select|draw|add|enter|upload|no valid|no text|could not|at least/i.test(toast.textContent)) {
          r.error = toast.textContent; done = true;
        }
      }
      if (!done) r.error = 'TIMEOUT (no result after 100s)';
      r.ok = !r.error;
      if (r.ok) {
        const dl = ws.querySelector('[data-result] [data-dl]');
        if (dl) { dl.click(); await sleep(2500); r.downloaded = 'clicked'; }
      }
    } catch (e) {
      r.error = e.message;
    }
    results.push(r);
    try { location.hash = '#home'; } catch (e) {}
    await sleep(300);
    return r;
  }

  const out = [];
  for (const t of spec) {
    out.push(await runTool(t));
  }
  return out;
};
