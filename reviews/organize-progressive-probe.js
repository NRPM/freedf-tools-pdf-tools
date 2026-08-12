/* Progressive first-load probe on a 12-page PDF: grid is non-empty immediately
   after the file is added (per-page items appear progressively, never blank),
   cache is populated once, order initialized to [0..11]. */
(async () => {
  const out = {};
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  location.hash = '#tool-organize';
  await sleep(400);
  const ws = document.getElementById('ws-organize');
  const r = await fetch('/test12.pdf');
  const buf = await r.arrayBuffer();
  const input = ws.querySelector('input[data-input]');
  const dt = new DataTransfer();
  dt.items.add(new File([buf], 'test12.pdf', { type: 'application/pdf' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));

  // Sample right after the file read resolves (poll until items appear), then
  // track how many images are filled at increasing times.
  let items = 0, imgs = 0;
  for (let i = 0; i < 250 && items === 0; i++) {
    await sleep(20);
    items = ws.querySelectorAll('.thumb-item').length;
    imgs = ws.querySelectorAll('.thumb-item img').length;
  }
  out.t0_items = items; out.t0_imgs = imgs; out.t0_cacheKeys = Object.keys(__wsState.organize.thumbCache || {}).length;

  await sleep(300); out.t300_items = ws.querySelectorAll('.thumb-item').length; out.t300_imgs = ws.querySelectorAll('.thumb-item img').length; out.t300_cache = Object.keys(__wsState.organize.thumbCache).length;
  await sleep(600); out.t900_items = ws.querySelectorAll('.thumb-item').length; out.t900_imgs = ws.querySelectorAll('.thumb-item img').length; out.t900_cache = Object.keys(__wsState.organize.thumbCache).length;
  await sleep(1500); out.final_items = ws.querySelectorAll('.thumb-item').length; out.final_imgs = ws.querySelectorAll('.thumb-item img').length; out.final_cache = Object.keys(__wsState.organize.thumbCache).length;
  out.final_orderLen = (__wsState.organize.order || []).length;
  out.final_orderFirstLast = JSON.stringify([(__wsState.organize.order || [])[0], (__wsState.organize.order || [])[11]]);
  out.done = true;
  return out;
})()
