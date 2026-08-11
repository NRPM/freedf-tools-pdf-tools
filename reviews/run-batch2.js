/* Runner batch 2: convert + edit + security + intelligence */
(async () => {
  const spec = [
    { id: 'pdf-to-word', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }], segs: { ocr: 'off' } },
    { id: 'word-to-pdf', files: [{ name: 'test.docx', type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', path: '/test.docx' }] },
    { id: 'pdf-to-markdown', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }] },
    { id: 'summarizer', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }], segs: { sumLen: 'medium' } },
    { id: 'translate', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }], opts: { 'opt-tr-to': 'es' } },
    { id: 'redact', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }], opts: { 'opt-redact-text': 'fox' } },
    { id: 'crop', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }], segs: { cropScope: 'all' }, extra: async (ws) => {
      let img = null;
      for (let i = 0; i < 60; i++) {
        img = ws.querySelector('[data-cropstage] img');
        if (img && img.naturalWidth > 0) break;
        await new Promise(r => setTimeout(r, 500));
      }
      const stage = ws.querySelector('[data-cropstage]');
      if (!img || !stage) throw new Error('crop stage image not rendered');
      const rect = stage.getBoundingClientRect();
      if (rect.width === 0) throw new Error('crop stage has zero size');
      stage.dispatchEvent(new MouseEvent('mousedown', { clientX: rect.left + rect.width * 0.2, clientY: rect.top + rect.height * 0.2, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: rect.left + rect.width * 0.8, clientY: rect.top + rect.height * 0.8, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: rect.left + rect.width * 0.8, clientY: rect.top + rect.height * 0.8, bubbles: true }));
      await new Promise(r => setTimeout(r, 300));
    } },
    { id: 'compare', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }, { name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }], segs: { cmpMode: 'semantic' } },
    { id: 'sign', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }], segs: { signType: 'simple', signers: 'me' }, extra: async (ws) => {
      const cv = ws.querySelector('[data-signcanvas]');
      const ctx = cv.getContext('2d');
      ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(50, 100); ctx.lineTo(200, 100); ctx.stroke();
    } },
    { id: 'pdf-forms', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }] },
    { id: 'html-to-pdf', files: [], opts: { 'opt-html-text': '<h1>Hello</h1><p>This is a test of HTML to PDF conversion.</p>' } },
    { id: 'pdf-to-pdfa', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }], opts: { 'opt-pdfa-level': '2b' } },
    { id: 'repair', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }] },
    { id: 'scan-to-pdf', files: [{ name: 'test.png', type: 'image/png', path: '/test.png' }], segs: { orientation: 'auto', size: 'fit', margin: 'none' } },
    { id: 'edit', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }], extra: async (ws) => {
      for (let i = 0; i < 40; i++) { if (ws.querySelector('[data-editstage] canvas')) break; await new Promise(r => setTimeout(r, 500)); }
      const stage = ws.querySelector('[data-editstage]');
      const canvas = stage.querySelector('canvas');
      if (!canvas) throw new Error('edit stage canvas not rendered');
      const oldPrompt = window.prompt;
      window.prompt = () => 'Test annotation';
      const rect = canvas.getBoundingClientRect();
      stage.dispatchEvent(new MouseEvent('mousedown', { clientX: rect.left + 100, clientY: rect.top + 100, bubbles: true }));
      window.prompt = oldPrompt;
      await new Promise(r => setTimeout(r, 300));
    } },
    { id: 'pdf-to-excel', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }], segs: { layout: 'one', ocr: 'off' } },
    { id: 'pdf-to-powerpoint', files: [{ name: 'test.pdf', type: 'application/pdf', path: '/test.pdf' }], segs: { ocr: 'off' } },
    { id: 'powerpoint-to-pdf', files: [{ name: 'test.pptx', type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', path: '/test.pptx' }] },
    { id: 'excel-to-pdf', files: [{ name: 'test.xlsx', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', path: '/test.xlsx' }], segs: { orientation: 'portrait' } }
  ];
  return await window.__runTools(spec);
})()
