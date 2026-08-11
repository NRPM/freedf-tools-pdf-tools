/* Runner batch 1: organize + optimize + first converts */
(async () => {
  const spec = [
    { id: 'merge', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }, { name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }] },
    { id: 'split', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }], segs: { mode: 'range', splitType: 'custom' }, opts: { 'opt-split-ranges': '1-2, 3' } },
    { id: 'compress', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }], segs: { level: 'recommended' } },
    { id: 'rotate', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }], segs: { scope: 'all', direction: 'right' } },
    { id: 'jpg-to-pdf', files: [{ name: 'test.png', type: 'image/png', path: '/test.png' }], segs: { orientation: 'portrait', size: 'a4', margin: 'none' } },
    { id: 'pdf-to-jpg', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }], segs: { mode: 'page', quality: 'recommended' } },
    { id: 'watermark', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }], segs: { wmType: 'text', wmPos: 'center', wmRot: '45' }, opts: { 'opt-wm-text': 'CONFIDENTIAL' } },
    { id: 'page-numbers', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }], segs: { pnMode: 'single', pnPos: 'bottom-center', pnMargin: 'small', pnPages: 'all', pnFormat: 'number' }, opts: { 'opt-pn-first': '1' } },
    { id: 'protect', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }], opts: { 'opt-protect-pass': 'secret123', 'opt-protect-pass2': 'secret123' } },
    { id: 'unlock', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }], opts: { 'opt-unlock-pass': '' } },
    { id: 'organize', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }] },
    { id: 'remove-pages', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }], extra: async (ws) => {
      for (let i = 0; i < 40; i++) { if (ws.querySelectorAll('.thumb-item').length >= 3) break; await new Promise(r => setTimeout(r, 500)); }
      const items = ws.querySelectorAll('.thumb-item');
      if (items.length < 2) throw new Error('thumbs not rendered');
      items[0].click();
      items[2].click();
      await new Promise(r => setTimeout(r, 300));
    } }
  ];
  return await window.__runTools(spec);
})()
